from decimal import Decimal, InvalidOperation

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from apps.core.timezone_utils import to_outlet_business_date
from apps.organizations.permissions import require_permission
from apps.purchases.models import PurchaseBill

from .models import (
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
    bill.save(update_fields=['amount_paid', 'outstanding_amount', 'updated_at'])
    return bill


def generate_payment_number(outlet, year):
    sequence, _ = SupplierPaymentSequence.objects.select_for_update().get_or_create(
        outlet=outlet, year=year, defaults={'last_sequence': 0}
    )
    sequence.last_sequence += 1
    sequence.save(update_fields=['last_sequence'])
    return f"PAY-{outlet.code.upper()}-{year}-{sequence.last_sequence:05d}"


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
        SupplierPaymentAllocation.objects.create(
            payment=payment, purchase_bill=bill, amount=allocated_amount, created_by=user
        )
        recalculate_purchase_bill_payment_projection(bill)

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
            'reversal_of': original,
            'description': f'Reversal of {payment.payment_number}',
            'created_by': user,
        },
    )
    for allocation in allocations:
        recalculate_purchase_bill_payment_projection(allocation.purchase_bill)
    SupplierPaymentAuditLog.objects.create(
        payment=payment, event_type='voided', actor=user, reason=reason,
        metadata={'restored_bills': [str(a.purchase_bill_id) for a in allocations]},
    )
    return payment
