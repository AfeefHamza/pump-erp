from decimal import Decimal, InvalidOperation

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from apps.core.timezone_utils import to_outlet_business_date
from apps.organizations.permissions import require_permission
from apps.purchases.models import PurchaseBill
from apps.shifts.models import EmployeeShiftCollection

from .models import (
    CashBankTransfer,
    CashBankTransferSequence,
    DigitalSettlement,
    DigitalSettlementAllocation,
    DigitalSettlementSequence,
    Expense,
    ExpenseCategory,
    ExpenseSequence,
    PaymentAccount,
    PaymentAccountMovement,
    SupplierPayment,
    SupplierPaymentAllocation,
    SupplierPaymentAuditLog,
    SupplierPaymentSequence,
)

MONEY = Decimal('0.01')


def _money(value, field='amount'):
    try:
        return Decimal(str(value)).quantize(MONEY)
    except (InvalidOperation, TypeError, ValueError):
        raise ValidationError({field: 'Enter a valid amount.'})


def recalculate_purchase_bill_payment_projection(bill):
    paid = SupplierPaymentAllocation.objects.filter(
        purchase_bill=bill,
        payment__status=SupplierPayment.STATUS_ACTIVE,
    ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
    paid = paid.quantize(MONEY)
    if paid > bill.grand_total:
        raise ValidationError('Active payment allocations exceed the purchase bill total.')
    bill.amount_paid = paid
    bill.outstanding_amount = (bill.grand_total - paid).quantize(MONEY)
    bill._allow_settlement_transition = True
    bill.save(update_fields=['amount_paid', 'outstanding_amount', 'updated_at'])
    return bill


def generate_payment_number(outlet, year):
    sequence, _ = SupplierPaymentSequence.objects.select_for_update().get_or_create(
        outlet=outlet, year=year, defaults={'last_sequence': 0}
    )
    sequence.last_sequence += 1
    sequence.save(update_fields=['last_sequence'])
    return f"PAY-{outlet.code.upper()}-{year}-{sequence.last_sequence:05d}"


def _next_number(sequence_model, outlet, year, prefix):
    sequence, _ = sequence_model.objects.select_for_update().get_or_create(
        outlet=outlet, year=year, defaults={'last_sequence': 0}
    )
    sequence.last_sequence += 1
    sequence.save(update_fields=['last_sequence'])
    return f'{prefix}-{outlet.code.upper()}-{year}-{sequence.last_sequence:05d}'


def _validate_account(account, organisation, outlet, field):
    if account.organisation_id != organisation.id or not account.is_active:
        raise ValidationError({field: 'Select an active account from this organisation.'})
    if account.outlet_id and account.outlet_id != outlet.id:
        raise ValidationError({field: 'This account belongs to another outlet.'})


@transaction.atomic
def create_expense_category(*, organisation, user, code, name, ledger_account, **data):
    require_permission(user, organisation, 'expense_category.create')
    category = ExpenseCategory(
        organisation=organisation, code=code, name=name, ledger_account=ledger_account,
        created_by=user, updated_by=user, **data,
    )
    category.save()
    return category


@transaction.atomic
def update_expense_category(category, user, **data):
    category = ExpenseCategory.objects.select_for_update().get(pk=category.pk)
    require_permission(user, category.organisation, 'expense_category.update')
    for field, value in data.items():
        if field not in {'organisation', 'organisation_id', 'created_by', 'created_at'} and hasattr(category, field):
            setattr(category, field, value)
    category.updated_by = user
    category.save()
    return category


@transaction.atomic
def deactivate_expense_category(category, user):
    category = ExpenseCategory.objects.select_for_update().get(pk=category.pk)
    require_permission(user, category.organisation, 'expense_category.deactivate')
    category.is_active = False
    category.updated_by = user
    category.save(update_fields=['is_active', 'updated_by', 'updated_at'])
    return category


@transaction.atomic
def create_expense(*, organisation, outlet, category, payment_account, expense_date, amount,
                   user, payee=None, reference_number=None, notes=None, attachment=None,
                   client_request_id=None):
    require_permission(user, organisation, 'expense.create', outlet=outlet)
    if client_request_id:
        existing = Expense.objects.select_for_update().filter(
            organisation=organisation, outlet=outlet, client_request_id=client_request_id,
        ).first()
        if existing:
            return existing
    amount = _money(amount)
    if amount <= 0:
        raise ValidationError({'amount': 'Expense amount must be greater than zero.'})
    if category.organisation_id != organisation.id or not category.is_active:
        raise ValidationError({'category': 'Select an active expense category from this organisation.'})
    _validate_account(payment_account, organisation, outlet, 'payment_account')
    number = _next_number(ExpenseSequence, outlet, expense_date.year, 'EXP')
    expense = Expense(
        organisation=organisation, outlet=outlet, expense_number=number,
        client_request_id=client_request_id, expense_date=expense_date, category=category,
        category_code_snapshot=category.code, category_name_snapshot=category.name,
        ledger_account=category.ledger_account, ledger_code_snapshot=category.ledger_account.code,
        ledger_name_snapshot=category.ledger_account.name, payment_account=payment_account,
        payee=payee, amount=amount, reference_number=reference_number, notes=notes,
        attachment=attachment, created_by=user,
    )
    expense.save()
    PaymentAccountMovement.objects.create(
        organisation=organisation, outlet=outlet, account=payment_account,
        effective_date=expense_date, signed_amount=-amount,
        movement_type=PaymentAccountMovement.TYPE_EXPENSE, source_type='expense', source_id=expense.id,
        idempotency_key=f'expense:{expense.id}', description=f'{number} · {category.name}', created_by=user,
    )
    from apps.accounting.posting import post_expense
    post_expense(expense, user)
    return expense


@transaction.atomic
def void_expense(expense, reason, user):
    expense = Expense.objects.select_for_update().select_related(
        'organisation', 'outlet', 'payment_account', 'category', 'ledger_account'
    ).get(pk=expense.pk)
    require_permission(user, expense.organisation, 'expense.void', outlet=expense.outlet)
    if expense.status == Expense.STATUS_VOIDED:
        return expense
    reason = (reason or '').strip()
    if len(reason) < 5:
        raise ValidationError({'void_reason': 'Provide a meaningful reason of at least 5 characters.'})
    original = PaymentAccountMovement.objects.select_for_update().get(
        source_type='expense', source_id=expense.id, movement_type=PaymentAccountMovement.TYPE_EXPENSE,
    )
    expense.status = Expense.STATUS_VOIDED
    expense.void_reason = reason
    expense.voided_by = user
    expense.voided_at = timezone.now()
    expense._allow_void_transition = True
    expense.save(update_fields=['status', 'void_reason', 'voided_by', 'voided_at'])
    PaymentAccountMovement.objects.create(
        organisation=expense.organisation, outlet=expense.outlet, account=expense.payment_account,
        effective_date=to_outlet_business_date(timezone.now(), outlet=expense.outlet, organisation=expense.organisation),
        signed_amount=-original.signed_amount, movement_type=PaymentAccountMovement.TYPE_EXPENSE_REVERSAL,
        source_type='expense', source_id=expense.id, reversal_of=original,
        idempotency_key=f'expense-reversal:{expense.id}', description=f'Reversal of {expense.expense_number}', created_by=user,
    )
    from apps.accounting.posting import reverse_source_journal
    reverse_source_journal(
        organisation=expense.organisation, outlet=expense.outlet, source_type='expense', source_id=expense.id,
        reason=reason, user=user,
    )
    return expense


@transaction.atomic
def create_cash_bank_transfer(*, organisation, outlet, from_account, to_account, transfer_date,
                              amount, user, reference_number=None, notes=None, client_request_id=None):
    require_permission(user, organisation, 'cash_bank_transfer.create', outlet=outlet)
    if client_request_id:
        existing = CashBankTransfer.objects.select_for_update().filter(
            organisation=organisation, outlet=outlet, client_request_id=client_request_id,
        ).first()
        if existing:
            return existing
    amount = _money(amount)
    if amount <= 0:
        raise ValidationError({'amount': 'Transfer amount must be greater than zero.'})
    _validate_account(from_account, organisation, outlet, 'from_account')
    _validate_account(to_account, organisation, outlet, 'to_account')
    if from_account.id == to_account.id:
        raise ValidationError({'to_account': 'Source and destination accounts must be different.'})
    number = _next_number(CashBankTransferSequence, outlet, transfer_date.year, 'TRF')
    transfer = CashBankTransfer.objects.create(
        organisation=organisation, outlet=outlet, transfer_number=number,
        client_request_id=client_request_id, transfer_date=transfer_date,
        from_account=from_account, to_account=to_account, amount=amount,
        reference_number=reference_number, notes=notes, created_by=user,
    )
    common = dict(
        organisation=organisation, outlet=outlet, effective_date=transfer_date,
        source_type='cash_bank_transfer', source_id=transfer.id, created_by=user,
    )
    PaymentAccountMovement.objects.create(
        **common, account=from_account, signed_amount=-amount,
        movement_type=PaymentAccountMovement.TYPE_TRANSFER_OUT,
        idempotency_key=f'cash-bank-transfer:{transfer.id}:out', description=f'{number} · Transfer to {to_account.name}',
    )
    PaymentAccountMovement.objects.create(
        **common, account=to_account, signed_amount=amount,
        movement_type=PaymentAccountMovement.TYPE_TRANSFER_IN,
        idempotency_key=f'cash-bank-transfer:{transfer.id}:in', description=f'{number} · Transfer from {from_account.name}',
    )
    from apps.accounting.posting import post_cash_bank_transfer
    post_cash_bank_transfer(transfer, user)
    return transfer


@transaction.atomic
def void_cash_bank_transfer(transfer, reason, user):
    transfer = CashBankTransfer.objects.select_for_update().select_related(
        'organisation', 'outlet', 'from_account', 'to_account'
    ).get(pk=transfer.pk)
    require_permission(user, transfer.organisation, 'cash_bank_transfer.void', outlet=transfer.outlet)
    if transfer.status == CashBankTransfer.STATUS_VOIDED:
        return transfer
    reason = (reason or '').strip()
    if len(reason) < 5:
        raise ValidationError({'void_reason': 'Provide a meaningful reason of at least 5 characters.'})
    originals = list(PaymentAccountMovement.objects.select_for_update().filter(
        source_type='cash_bank_transfer', source_id=transfer.id,
        movement_type__in=[PaymentAccountMovement.TYPE_TRANSFER_OUT, PaymentAccountMovement.TYPE_TRANSFER_IN],
    ))
    if len(originals) != 2:
        raise ValidationError('Transfer account movements are incomplete.')
    transfer.status = CashBankTransfer.STATUS_VOIDED
    transfer.void_reason = reason
    transfer.voided_by = user
    transfer.voided_at = timezone.now()
    transfer._allow_void_transition = True
    transfer.save(update_fields=['status', 'void_reason', 'voided_by', 'voided_at'])
    reversal_date = to_outlet_business_date(timezone.now(), outlet=transfer.outlet, organisation=transfer.organisation)
    for original in originals:
        is_out = original.movement_type == PaymentAccountMovement.TYPE_TRANSFER_OUT
        PaymentAccountMovement.objects.create(
            organisation=transfer.organisation, outlet=transfer.outlet, account=original.account,
            effective_date=reversal_date, signed_amount=-original.signed_amount,
            movement_type=(PaymentAccountMovement.TYPE_TRANSFER_OUT_REVERSAL if is_out else PaymentAccountMovement.TYPE_TRANSFER_IN_REVERSAL),
            source_type='cash_bank_transfer', source_id=transfer.id, reversal_of=original,
            idempotency_key=f'cash-bank-transfer-reversal:{transfer.id}:{"out" if is_out else "in"}',
            description=f'Reversal of {transfer.transfer_number}', created_by=user,
        )
    from apps.accounting.posting import reverse_source_journal
    reverse_source_journal(
        organisation=transfer.organisation, outlet=transfer.outlet, source_type='cash_bank_transfer',
        source_id=transfer.id, reason=reason, user=user,
    )
    return transfer


@transaction.atomic
def create_digital_settlement(*, organisation, outlet, payment_account, settlement_date,
                              collection_ids, charges_amount, tds_amount, bank_reference,
                              user, batch_reference=None, notes=None, client_request_id=None):
    require_permission(user, organisation, 'digital_settlement.create', outlet=outlet)
    if client_request_id:
        existing = DigitalSettlement.objects.select_for_update().filter(
            organisation=organisation, outlet=outlet, client_request_id=client_request_id,
        ).first()
        if existing:
            return existing
    _validate_account(payment_account, organisation, outlet, 'payment_account')
    if payment_account.account_type != PaymentAccount.TYPE_BANK:
        raise ValidationError({'payment_account': 'Digital settlements require a bank account.'})
    ids = list(dict.fromkeys(collection_ids or []))
    if not ids:
        raise ValidationError({'collection_ids': 'Select at least one pending digital collection.'})
    collections = list(EmployeeShiftCollection.objects.select_for_update().select_related(
        'employee', 'shift_card', 'operational_shift',
    ).filter(id__in=ids))
    if len(collections) != len(ids):
        raise ValidationError({'collection_ids': 'One or more selected collections were not found.'})
    allowed_methods = {DigitalSettlement.METHOD_CARD, DigitalSettlement.METHOD_UPI, DigitalSettlement.METHOD_FLEET_CARD}
    methods = {row.collection_method for row in collections}
    providers = {(row.provider_name or 'Unspecified').strip().casefold() for row in collections}
    if len(methods) != 1 or not methods.issubset(allowed_methods):
        raise ValidationError({'collection_ids': 'A settlement batch must contain one digital payment method.'})
    if len(providers) != 1:
        raise ValidationError({'collection_ids': 'A settlement batch must contain collections from one provider.'})
    for row in collections:
        if row.organisation_id != organisation.id or row.outlet_id != outlet.id or row.status != EmployeeShiftCollection.STATUS_ACTIVE:
            raise ValidationError({'collection_ids': 'Select active collections from this organisation and outlet.'})
        if row.shift_card_id and row.shift_card.status != row.shift_card.STATUS_ACTIVE:
            raise ValidationError({'collection_ids': 'Voided Shift Card collections cannot be settled.'})
    already_settled = DigitalSettlementAllocation.objects.filter(
        collection_id__in=ids, settlement__status=DigitalSettlement.STATUS_ACTIVE,
    ).exists()
    if already_settled:
        raise ValidationError({'collection_ids': 'One or more selected collections are already settled.'})
    gross = sum((row.amount for row in collections), Decimal('0.00')).quantize(MONEY)
    charges = _money(charges_amount, 'charges_amount')
    tds = _money(tds_amount, 'tds_amount')
    if charges < 0 or tds < 0:
        raise ValidationError({'charges_amount': 'Charges and TDS cannot be negative.'})
    net = (gross - charges - tds).quantize(MONEY)
    if net <= 0:
        raise ValidationError({'net_amount': 'Net bank credit must be greater than zero.'})
    number = _next_number(DigitalSettlementSequence, outlet, settlement_date.year, 'SET')
    first = collections[0]
    settlement = DigitalSettlement.objects.create(
        organisation=organisation, outlet=outlet, settlement_number=number,
        client_request_id=client_request_id, settlement_date=settlement_date,
        collection_method=first.collection_method,
        provider_name=(first.provider_name or 'Unspecified').strip() or 'Unspecified',
        batch_reference=batch_reference, payment_account=payment_account,
        gross_amount=gross, charges_amount=charges, tds_amount=tds, net_amount=net,
        bank_reference=bank_reference, notes=notes, created_by=user,
    )
    DigitalSettlementAllocation.objects.bulk_create([
        DigitalSettlementAllocation(
            settlement=settlement, collection=row, amount=row.amount,
            employee_name_snapshot=row.employee.display_name,
            collection_reference_snapshot=row.reference_number,
            occurred_at_snapshot=row.occurred_at,
        ) for row in collections
    ])
    PaymentAccountMovement.objects.create(
        organisation=organisation, outlet=outlet, account=payment_account,
        effective_date=settlement_date, signed_amount=net,
        movement_type=PaymentAccountMovement.TYPE_DIGITAL_SETTLEMENT,
        source_type='digital_settlement', source_id=settlement.id,
        idempotency_key=f'digital-settlement:{settlement.id}',
        description=f'{number} · {settlement.provider_name}', created_by=user,
    )
    from apps.accounting.posting import post_digital_settlement
    post_digital_settlement(settlement, user)
    return settlement


@transaction.atomic
def void_digital_settlement(settlement, reason, user):
    settlement = DigitalSettlement.objects.select_for_update().select_related(
        'organisation', 'outlet', 'payment_account',
    ).get(pk=settlement.pk)
    require_permission(user, settlement.organisation, 'digital_settlement.void', outlet=settlement.outlet)
    if settlement.status == DigitalSettlement.STATUS_VOIDED:
        return settlement
    reason = (reason or '').strip()
    if len(reason) < 5:
        raise ValidationError({'void_reason': 'Provide a meaningful reason of at least 5 characters.'})
    original = PaymentAccountMovement.objects.select_for_update().get(
        source_type='digital_settlement', source_id=settlement.id,
        movement_type=PaymentAccountMovement.TYPE_DIGITAL_SETTLEMENT,
    )
    settlement.status = DigitalSettlement.STATUS_VOIDED
    settlement.void_reason = reason
    settlement.voided_by = user
    settlement.voided_at = timezone.now()
    settlement._allow_void_transition = True
    settlement.save(update_fields=['status', 'void_reason', 'voided_by', 'voided_at'])
    PaymentAccountMovement.objects.create(
        organisation=settlement.organisation, outlet=settlement.outlet, account=settlement.payment_account,
        effective_date=to_outlet_business_date(timezone.now(), outlet=settlement.outlet, organisation=settlement.organisation),
        signed_amount=-original.signed_amount,
        movement_type=PaymentAccountMovement.TYPE_DIGITAL_SETTLEMENT_REVERSAL,
        source_type='digital_settlement', source_id=settlement.id, reversal_of=original,
        idempotency_key=f'digital-settlement-reversal:{settlement.id}',
        description=f'Reversal of {settlement.settlement_number}', created_by=user,
    )
    from apps.accounting.posting import reverse_source_journal
    reverse_source_journal(
        organisation=settlement.organisation, outlet=settlement.outlet,
        source_type='digital_settlement', source_id=settlement.id,
        reason=reason, user=user,
    )
    return settlement


@transaction.atomic
def create_payment_account(*, organisation, user, code, name, account_type, outlet=None, **data):
    require_permission(user, organisation, 'payment_account.create', outlet=outlet)
    account = PaymentAccount(
        organisation=organisation,
        outlet=outlet,
        code=code,
        name=name,
        account_type=account_type,
        created_by=user,
        updated_by=user,
        **data,
    )
    account.save()
    from apps.accounting.posting import ensure_payment_account_ledger
    ensure_payment_account_ledger(account, user)
    return account


@transaction.atomic
def update_payment_account(account, user, **data):
    account = PaymentAccount.objects.select_for_update().get(pk=account.pk)
    require_permission(user, account.organisation, 'payment_account.update', outlet=account.outlet)
    protected = {'organisation', 'organisation_id', 'created_by', 'created_at'}
    for field, value in data.items():
        if field not in protected and hasattr(account, field):
            setattr(account, field, value)
    account.updated_by = user
    account.save()
    return account


@transaction.atomic
def deactivate_payment_account(account, user):
    account = PaymentAccount.objects.select_for_update().get(pk=account.pk)
    require_permission(user, account.organisation, 'payment_account.deactivate', outlet=account.outlet)
    account.is_active = False
    account.updated_by = user
    account.save(update_fields=['is_active', 'updated_by', 'updated_at'])
    return account


def _validate_and_lock_bills(organisation, outlet, supplier, allocations):
    normalized = []
    seen = set()
    for row in allocations or []:
        bill_id = row.get('purchase_bill_id') or row.get('purchase_bill')
        amount = _money(row.get('amount'), 'allocations')
        if not bill_id or amount <= 0:
            raise ValidationError({'allocations': 'Each allocation requires a bill and a positive amount.'})
        if str(bill_id) in seen:
            raise ValidationError({'allocations': 'A bill may appear only once in a payment.'})
        seen.add(str(bill_id))
        try:
            bill = PurchaseBill.objects.select_for_update().get(pk=bill_id)
        except PurchaseBill.DoesNotExist:
            raise ValidationError({'allocations': f"Purchase bill '{bill_id}' was not found."})
        if bill.organisation_id != organisation.id or bill.outlet_id != outlet.id or bill.supplier_id != supplier.id:
            raise ValidationError({'allocations': 'Allocated bills must belong to the same organisation, outlet and supplier.'})
        if bill.status != PurchaseBill.STATUS_ACTIVE:
            raise ValidationError({'allocations': f'{bill.bill_number} is voided and cannot receive a payment.'})
        if amount > bill.outstanding_amount:
            raise ValidationError({'allocations': f'Allocation exceeds the outstanding amount for {bill.bill_number}.'})
        normalized.append((bill, amount))
    return normalized


@transaction.atomic
def create_supplier_payment(*, organisation, outlet, supplier, payment_account, payment_date, amount,
                            payment_method, allocations, user, reference_number=None,
                            cheque_number=None, cheque_date=None, notes=None, client_request_id=None):
    require_permission(user, organisation, 'supplier_payment.create', outlet=outlet)
    if client_request_id:
        existing = SupplierPayment.objects.select_for_update().filter(
            organisation=organisation, outlet=outlet, client_request_id=client_request_id
        ).first()
        if existing:
            return existing
    amount = _money(amount)
    if amount <= 0:
        raise ValidationError({'amount': 'Payment amount must be greater than zero.'})
    if supplier.organisation_id != organisation.id or outlet.organisation_id != organisation.id:
        raise ValidationError('Supplier and outlet must belong to the organisation.')
    if payment_account.organisation_id != organisation.id or not payment_account.is_active:
        raise ValidationError({'payment_account': 'Select an active payment account from this organisation.'})

    locked_allocations = _validate_and_lock_bills(organisation, outlet, supplier, allocations)
    allocated_total = sum((row[1] for row in locked_allocations), Decimal('0.00')).quantize(MONEY)
    if allocated_total > amount:
        raise ValidationError({'allocations': 'Total allocations cannot exceed the payment amount.'})

    number = generate_payment_number(outlet, payment_date.year)
    payment = SupplierPayment(
        organisation=organisation,
        outlet=outlet,
        supplier=supplier,
        supplier_name_snapshot=supplier.name,
        supplier_code_snapshot=supplier.code,
        payment_number=number,
        client_request_id=client_request_id,
        payment_date=payment_date,
        amount=amount,
        payment_account=payment_account,
        payment_method=payment_method,
        reference_number=reference_number,
        cheque_number=cheque_number,
        cheque_date=cheque_date,
        notes=notes,
        unallocated_amount=(amount - allocated_total).quantize(MONEY),
        created_by=user,
    )
    payment.save()

    for bill, allocated_amount in locked_allocations:
        SupplierPaymentAllocation.objects.create(
            payment=payment, purchase_bill=bill, amount=allocated_amount, created_by=user
        )

    movement = PaymentAccountMovement.objects.create(
        organisation=organisation,
        outlet=outlet,
        account=payment_account,
        effective_date=payment_date,
        signed_amount=-amount,
        movement_type=PaymentAccountMovement.TYPE_SUPPLIER_PAYMENT,
        payment=payment,
        source_type='supplier_payment',
        source_id=payment.id,
        idempotency_key=f'supplier-payment:{payment.id}',
        description=f'{number} · {supplier.name}',
        created_by=user,
    )

    for bill, _ in locked_allocations:
        recalculate_purchase_bill_payment_projection(bill)

    SupplierPaymentAuditLog.objects.create(
        payment=payment,
        event_type='created',
        actor=user,
        metadata={
            'amount': str(amount),
            'allocated_amount': str(allocated_total),
            'unallocated_amount': str(payment.unallocated_amount),
            'movement_id': str(movement.id),
            'bills': [{'id': str(b.id), 'number': b.bill_number, 'amount': str(a)} for b, a in locked_allocations],
        },
    )
    from apps.accounting.posting import post_supplier_payment
    post_supplier_payment(payment, user)
    return payment


@transaction.atomic
def allocate_supplier_payment(payment, allocations, user):
    payment = SupplierPayment.objects.select_for_update().select_related('organisation', 'outlet', 'supplier').get(pk=payment.pk)
    require_permission(user, payment.organisation, 'supplier_payment.allocate', outlet=payment.outlet)
    if payment.status != SupplierPayment.STATUS_ACTIVE:
        raise ValidationError('Voided payments cannot be allocated.')

    locked_allocations = _validate_and_lock_bills(
        payment.organisation, payment.outlet, payment.supplier, allocations
    )
    existing_bill_ids = set(payment.allocations.values_list('purchase_bill_id', flat=True))
    if any(bill.id in existing_bill_ids for bill, _ in locked_allocations):
        raise ValidationError({'allocations': 'Existing allocations are immutable. A bill cannot be allocated twice by the same payment.'})
    new_total = sum((row[1] for row in locked_allocations), Decimal('0.00')).quantize(MONEY)
    if new_total > payment.unallocated_amount:
        raise ValidationError({'allocations': 'Allocations exceed the remaining unallocated payment amount.'})

    for bill, allocated_amount in locked_allocations:
        allocation = SupplierPaymentAllocation.objects.create(
            payment=payment, purchase_bill=bill, amount=allocated_amount, created_by=user,
            is_advance_application=True,
        )
        recalculate_purchase_bill_payment_projection(bill)
        from apps.accounting.posting import post_supplier_payment_allocation
        post_supplier_payment_allocation(allocation, user)

    previous = payment.unallocated_amount
    payment.unallocated_amount = (payment.unallocated_amount - new_total).quantize(MONEY)
    payment._allow_allocation_update = True
    payment.save(update_fields=['unallocated_amount'])
    SupplierPaymentAuditLog.objects.create(
        payment=payment,
        event_type='allocated',
        actor=user,
        metadata={
            'previous_unallocated_amount': str(previous),
            'new_unallocated_amount': str(payment.unallocated_amount),
            'bills': [{'id': str(b.id), 'number': b.bill_number, 'amount': str(a)} for b, a in locked_allocations],
        },
    )
    return payment


@transaction.atomic
def void_supplier_payment(payment, reason, user):
    payment = SupplierPayment.objects.select_for_update().select_related('organisation', 'outlet', 'payment_account').get(pk=payment.pk)
    require_permission(user, payment.organisation, 'supplier_payment.void', outlet=payment.outlet)
    if payment.status == SupplierPayment.STATUS_VOIDED:
        return payment
    reason = (reason or '').strip()
    if len(reason) < 5:
        raise ValidationError({'void_reason': 'Provide a meaningful reason of at least 5 characters.'})

    allocations = list(payment.allocations.select_related('purchase_bill').select_for_update())
    original = PaymentAccountMovement.objects.select_for_update().get(
        payment=payment, movement_type=PaymentAccountMovement.TYPE_SUPPLIER_PAYMENT
    )
    payment.status = SupplierPayment.STATUS_VOIDED
    payment.void_reason = reason
    payment.voided_by = user
    payment.voided_at = timezone.now()
    payment._allow_void_transition = True
    payment.save(update_fields=['status', 'void_reason', 'voided_by', 'voided_at'])

    PaymentAccountMovement.objects.get_or_create(
        idempotency_key=f'supplier-payment-reversal:{payment.id}',
        defaults={
            'organisation': payment.organisation,
            'outlet': payment.outlet,
            'account': payment.payment_account,
            'effective_date': to_outlet_business_date(timezone.now(), outlet=payment.outlet, organisation=payment.organisation),
            'signed_amount': payment.amount,
            'movement_type': PaymentAccountMovement.TYPE_SUPPLIER_PAYMENT_REVERSAL,
            'payment': payment,
            'source_type': 'supplier_payment',
            'source_id': payment.id,
            'reversal_of': original,
            'description': f'Reversal of {payment.payment_number}',
            'created_by': user,
        },
    )
    from apps.accounting.posting import reverse_source_journal
    reverse_source_journal(
        organisation=payment.organisation, outlet=payment.outlet,
        source_type='supplier_payment', source_id=payment.id,
        reason=reason, user=user,
    )
    for allocation in allocations:
        reverse_source_journal(
            organisation=payment.organisation, outlet=payment.outlet,
            source_type='supplier_payment_allocation', source_id=allocation.id,
            reason=reason, user=user,
        )
    for allocation in allocations:
        recalculate_purchase_bill_payment_projection(allocation.purchase_bill)
    SupplierPaymentAuditLog.objects.create(
        payment=payment, event_type='voided', actor=user, reason=reason,
        metadata={'restored_bills': [str(a.purchase_bill_id) for a in allocations]},
    )
    return payment
