from collections import defaultdict
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import models, transaction
from django.utils import timezone

from apps.core.timezone_utils import to_outlet_business_date

from .models import ChartOfAccount, JournalEntry, ShiftAccountingPosting
from .services import ensure_standard_chart, post_journal, reverse_journal

MONEY = Decimal('0.01')
ELIGIBLE_ITC = {'eligible_inputs', 'eligible_capital_goods', 'eligible_input_services'}


def _amount(value):
    return Decimal(str(value or '0')).quantize(MONEY)


def _accounts(organisation):
    ensure_standard_chart(organisation)
    return {
        row.system_key: row
        for row in ChartOfAccount.objects.filter(organisation=organisation, system_key__isnull=False)
    }


def _source_journal(organisation, outlet, source_type, source_id):
    return JournalEntry.objects.filter(
        organisation=organisation, outlet=outlet, source_type=source_type, source_id=source_id,
        reversal_of__isnull=True,
    ).first()


@transaction.atomic
def ensure_payment_account_ledger(payment_account, user=None):
    """Create one stable Asset ledger for a Cash/Bank operational account."""
    payment_account = payment_account.__class__.objects.select_for_update().get(pk=payment_account.pk)
    if payment_account.ledger_account_id:
        return payment_account.ledger_account
    accounts = _accounts(payment_account.organisation)
    base_code = f'PA-{payment_account.code}'.strip().upper()[:30]
    code = base_code
    if ChartOfAccount.objects.filter(organisation=payment_account.organisation, code__iexact=code).exists():
        suffix = str(payment_account.id).split('-')[0].upper()
        code = f'{base_code[:21]}-{suffix}'
    ledger = ChartOfAccount.objects.create(
        organisation=payment_account.organisation,
        parent=accounts['cash_bank_group'],
        code=code,
        name=payment_account.name,
        account_type=ChartOfAccount.TYPE_ASSET,
        is_group=False,
        allow_manual_posting=True,
        system_key=f'payment_account:{payment_account.id}',
        description='Automatically mapped from Cash & Banking.',
        created_by=user,
    )
    payment_account.ledger_account = ledger
    payment_account.save(update_fields=['ledger_account', 'updated_at'])
    return ledger


def _post(*, organisation, outlet, source_type, source_id, entry_date, reference, narration, lines, user):
    existing = _source_journal(organisation, outlet, source_type, source_id)
    if existing:
        return existing
    return post_journal(
        organisation=organisation,
        outlet=outlet,
        source_type=source_type,
        source_id=source_id,
        entry_date=entry_date,
        reference=reference,
        narration=narration,
        lines=[line for line in lines if _amount(line.get('debit')) > 0 or _amount(line.get('credit')) > 0],
        user=user,
        enforce_permission=False,
    )


@transaction.atomic
def post_sales_invoice(invoice, user=None):
    if invoice.status != invoice.STATUS_ACTIVE or invoice.grand_total <= 0:
        return None
    accounts = _accounts(invoice.organisation)
    debit_account = (
        ensure_payment_account_ledger(invoice.payment_account, user)
        if invoice.invoice_type == invoice.TYPE_CASH
        else accounts['accounts_receivable']
    )
    revenue = defaultdict(lambda: Decimal('0.00'))
    posting_total = Decimal('0.00')
    posting_tax = Decimal('0.00')
    for line in invoice.lines.all():
        # A fuel credit slip is revenue already recognised by the locked Shift Card.
        # Its later invoice is a customer document and receivable allocation, not a second sale.
        if line.source_type == line.SOURCE_CREDIT_SLIP:
            continue
        if line.item_type_snapshot == 'fuel':
            key = 'fuel_sales'
        elif line.item_type_snapshot == 'service':
            key = 'service_income'
        else:
            key = 'product_sales'
        revenue[key] += _amount(line.line_total - line.tax_amount)
        posting_total += _amount(line.line_total)
        posting_tax += _amount(line.tax_amount)
    posting_total = _amount(posting_total)
    tax = _amount(posting_tax)
    if posting_total <= 0:
        return None
    expected_revenue = _amount(posting_total - tax)
    difference = expected_revenue - sum(revenue.values(), Decimal('0.00'))
    if difference:
        revenue[next(iter(revenue), 'product_sales')] += difference
    lines = [{'account_id': debit_account.id, 'debit': posting_total, 'credit': 0, 'description': invoice.customer_name_snapshot}]
    lines.extend({'account_id': accounts[key].id, 'debit': 0, 'credit': value, 'description': invoice.invoice_number} for key, value in revenue.items())
    if tax:
        lines.append({'account_id': accounts['output_tax'].id, 'debit': 0, 'credit': tax, 'description': 'Output tax'})
    return _post(
        organisation=invoice.organisation, outlet=invoice.outlet, source_type='sales_invoice', source_id=invoice.id,
        entry_date=invoice.invoice_date, reference=invoice.invoice_number,
        narration=f'Sales Invoice {invoice.invoice_number} · {invoice.customer_name_snapshot}', lines=lines, user=user,
    )


@transaction.atomic
def post_purchase_bill(bill, user=None):
    if bill.status != bill.STATUS_ACTIVE or bill.grand_total <= 0:
        return None
    accounts = _accounts(bill.organisation)
    recoverable_tax = Decimal('0.00')
    for line in bill.lines.all():
        if line.itc_classification in ELIGIBLE_ITC:
            recoverable_tax += _amount(line.cgst_amount + line.sgst_amount + line.igst_amount + line.cess_amount)
    recoverable_tax = min(_amount(recoverable_tax), _amount(bill.grand_total))
    purchase_cost = _amount(bill.grand_total - recoverable_tax)
    lines = [
        {'account_id': accounts['purchases'].id, 'debit': purchase_cost, 'credit': 0, 'description': bill.supplier_name_snapshot},
        {'account_id': accounts['accounts_payable'].id, 'debit': 0, 'credit': bill.grand_total, 'description': bill.supplier_name_snapshot},
    ]
    if recoverable_tax:
        lines.insert(1, {'account_id': accounts['input_tax'].id, 'debit': recoverable_tax, 'credit': 0, 'description': 'Eligible input tax'})
    return _post(
        organisation=bill.organisation, outlet=bill.outlet, source_type='purchase_bill', source_id=bill.id,
        entry_date=bill.invoice_date, reference=bill.bill_number,
        narration=f'Purchase Bill {bill.bill_number} · {bill.supplier_name_snapshot}', lines=lines, user=user,
    )


@transaction.atomic
def post_customer_receipt(receipt, user=None):
    if receipt.status != receipt.STATUS_ACTIVE:
        return None
    accounts = _accounts(receipt.organisation)
    bank = ensure_payment_account_ledger(receipt.payment_account, user)
    allocated = _amount(receipt.amount - receipt.unallocated_amount)
    return _post(
        organisation=receipt.organisation, outlet=receipt.outlet, source_type='customer_receipt', source_id=receipt.id,
        entry_date=receipt.receipt_date, reference=receipt.receipt_number,
        narration=f'Customer Receipt {receipt.receipt_number} · {receipt.customer_name_snapshot}', user=user,
        lines=[
            {'account_id': bank.id, 'debit': receipt.amount, 'credit': 0, 'description': receipt.customer_name_snapshot},
            {'account_id': accounts['accounts_receivable'].id, 'debit': 0, 'credit': allocated, 'description': 'Invoice allocation'},
            {'account_id': accounts['customer_advances'].id, 'debit': 0, 'credit': receipt.unallocated_amount, 'description': 'Unallocated customer advance'},
        ],
    )


@transaction.atomic
def post_supplier_payment(payment, user=None):
    if payment.status != payment.STATUS_ACTIVE:
        return None
    accounts = _accounts(payment.organisation)
    bank = ensure_payment_account_ledger(payment.payment_account, user)
    allocated = _amount(payment.amount - payment.unallocated_amount)
    return _post(
        organisation=payment.organisation, outlet=payment.outlet, source_type='supplier_payment', source_id=payment.id,
        entry_date=payment.payment_date, reference=payment.payment_number,
        narration=f'Supplier Payment {payment.payment_number} · {payment.supplier_name_snapshot}', user=user,
        lines=[
            {'account_id': accounts['accounts_payable'].id, 'debit': allocated, 'credit': 0, 'description': 'Bill allocation'},
            {'account_id': accounts['supplier_advances'].id, 'debit': payment.unallocated_amount, 'credit': 0, 'description': 'Unallocated supplier advance'},
            {'account_id': bank.id, 'debit': 0, 'credit': payment.amount, 'description': payment.supplier_name_snapshot},
        ],
    )


@transaction.atomic
def post_supplier_payment_allocation(allocation, user=None):
    payment = allocation.payment
    accounts = _accounts(payment.organisation)
    return _post(
        organisation=payment.organisation, outlet=payment.outlet, source_type='supplier_payment_allocation', source_id=allocation.id,
        entry_date=to_outlet_business_date(
            timezone.now(), outlet=payment.outlet, organisation=payment.organisation,
        ), reference=payment.payment_number,
        narration=f'Allocate supplier advance from {payment.payment_number} to {allocation.purchase_bill.bill_number}', user=user,
        lines=[
            {'account_id': accounts['accounts_payable'].id, 'debit': allocation.amount, 'credit': 0, 'description': allocation.purchase_bill.bill_number},
            {'account_id': accounts['supplier_advances'].id, 'debit': 0, 'credit': allocation.amount, 'description': payment.payment_number},
        ],
    )


@transaction.atomic
def post_expense(expense, user=None):
    if expense.status != expense.STATUS_ACTIVE:
        return None
    bank = ensure_payment_account_ledger(expense.payment_account, user)
    return _post(
        organisation=expense.organisation, outlet=expense.outlet,
        source_type='expense', source_id=expense.id, entry_date=expense.expense_date,
        reference=expense.expense_number,
        narration=f'Expense {expense.expense_number} · {expense.category_name_snapshot}', user=user,
        lines=[
            {'account_id': expense.ledger_account_id, 'debit': expense.amount, 'credit': 0,
             'description': expense.payee or expense.category_name_snapshot},
            {'account_id': bank.id, 'debit': 0, 'credit': expense.amount,
             'description': expense.payment_account.name},
        ],
    )


@transaction.atomic
def post_cash_bank_transfer(transfer, user=None):
    if transfer.status != transfer.STATUS_ACTIVE:
        return None
    source = ensure_payment_account_ledger(transfer.from_account, user)
    destination = ensure_payment_account_ledger(transfer.to_account, user)
    return _post(
        organisation=transfer.organisation, outlet=transfer.outlet,
        source_type='cash_bank_transfer', source_id=transfer.id, entry_date=transfer.transfer_date,
        reference=transfer.transfer_number,
        narration=f'Cash/Bank Transfer {transfer.transfer_number} · {transfer.from_account.name} to {transfer.to_account.name}',
        user=user,
        lines=[
            {'account_id': destination.id, 'debit': transfer.amount, 'credit': 0,
             'description': transfer.to_account.name},
            {'account_id': source.id, 'debit': 0, 'credit': transfer.amount,
             'description': transfer.from_account.name},
        ],
    )


@transaction.atomic
def post_digital_settlement(settlement, user=None):
    if settlement.status != settlement.STATUS_ACTIVE:
        return None
    accounts = _accounts(settlement.organisation)
    bank = ensure_payment_account_ledger(settlement.payment_account, user)
    return _post(
        organisation=settlement.organisation, outlet=settlement.outlet,
        source_type='digital_settlement', source_id=settlement.id,
        entry_date=settlement.settlement_date, reference=settlement.settlement_number,
        narration=f'Digital Settlement {settlement.settlement_number} · {settlement.provider_name}', user=user,
        lines=[
            {'account_id': bank.id, 'debit': settlement.net_amount, 'credit': 0,
             'description': settlement.bank_reference},
            {'account_id': accounts['payment_gateway_charges'].id, 'debit': settlement.charges_amount, 'credit': 0,
             'description': 'Provider charges'},
            {'account_id': accounts['tds_receivable'].id, 'debit': settlement.tds_amount, 'credit': 0,
             'description': 'TDS deducted'},
            {'account_id': accounts[
                'fuel_sales' if settlement.accounting_basis == settlement.BASIS_LEGACY_SALES
                else 'digital_collection_clearing'
            ].id, 'debit': 0, 'credit': settlement.gross_amount,
             'description': f'{settlement.get_collection_method_display()} collections'},
        ],
    )


@transaction.atomic
def post_shift_accounting(shift, cash_account=None, user=None):
    from apps.finance.models import DigitalSettlement, DigitalSettlementAllocation, PaymentAccount, PaymentAccountMovement
    from apps.shifts.models import EmployeeShiftCard, EmployeeShiftDeduction

    active = ShiftAccountingPosting.objects.select_for_update().filter(
        operational_shift=shift, status=ShiftAccountingPosting.STATUS_ACTIVE,
    ).first()
    if active:
        return active
    cards = list(shift.employee_cards.filter(status=EmployeeShiftCard.STATUS_ACTIVE).prefetch_related(
        'meters__price_segments', 'collections', 'credit_slips', 'deductions',
    ))
    if not cards:
        raise ValidationError({'shift': 'At least one active Shift Card is required before financial locking.'})
    if any(card.completeness_status != 'complete' for card in cards):
        raise ValidationError({'shift': 'Complete every Shift Card and acknowledge shortages or excesses before locking.'})
    if any(
        deduction.status == EmployeeShiftDeduction.STATUS_ACTIVE
        and deduction.approval_status == EmployeeShiftDeduction.APPROVAL_PENDING
        for card in cards for deduction in card.deductions.all()
    ):
        raise ValidationError({'shift': 'Approve or reject every pending shift expense before locking.'})
    has_legacy_settlement = DigitalSettlementAllocation.objects.filter(
        collection__operational_shift=shift,
        settlement__status=DigitalSettlement.STATUS_ACTIVE,
        settlement__accounting_basis=DigitalSettlement.BASIS_LEGACY_SALES,
    ).exists()
    if has_legacy_settlement:
        raise ValidationError({
            'shift': 'This shift has a legacy digital settlement. Void it first, lock the shift, then record the settlement again.'
        })

    totals = defaultdict(lambda: Decimal('0.00'))
    for card in cards:
        sale = sum(
            (_amount(segment.sale_amount) for meter in card.meters.all() for segment in meter.price_segments.all()),
            Decimal('0.00'),
        )
        cash = sum((_amount(row.amount) for row in card.collections.all() if row.status == 'active' and row.collection_method == 'cash'), Decimal('0.00'))
        card_amount = sum((_amount(row.amount) for row in card.collections.all() if row.status == 'active' and row.collection_method == 'card'), Decimal('0.00'))
        upi = sum((_amount(row.amount) for row in card.collections.all() if row.status == 'active' and row.collection_method == 'upi'), Decimal('0.00'))
        fleet = sum((_amount(row.amount) for row in card.collections.all() if row.status == 'active' and row.collection_method == 'fleet_card'), Decimal('0.00'))
        credit = sum((_amount(row.amount) for row in card.credit_slips.all() if row.status == 'active'), Decimal('0.00'))
        increases = sum((_amount(row.amount) for row in card.deductions.all() if row.status == 'active' and row.approval_status == 'approved' and row.direction == 'increases_accounted'), Decimal('0.00'))
        decreases = sum((_amount(row.amount) for row in card.deductions.all() if row.status == 'active' and row.approval_status == 'approved' and row.direction == 'decreases_accounted'), Decimal('0.00'))
        difference = cash + card_amount + upi + fleet + credit + increases - decreases - sale
        totals['fuel_sales'] += sale
        totals['cash'] += cash
        totals['card'] += card_amount
        totals['upi'] += upi
        totals['fleet'] += fleet
        totals['credit'] += credit
        totals['increases'] += increases
        totals['decreases'] += decreases
        if difference < 0:
            totals['shortage'] += abs(difference)
        elif difference > 0:
            totals['excess'] += difference

    if totals['cash'] > 0:
        if not cash_account:
            choices = PaymentAccount.objects.filter(
                organisation=shift.organisation, account_type=PaymentAccount.TYPE_CASH, is_active=True,
            ).filter(models.Q(outlet__isnull=True) | models.Q(outlet=shift.outlet))
            if choices.count() == 1:
                cash_account = choices.first()
            else:
                raise ValidationError({'cash_account': 'Select the Cash account receiving this shift collection.'})
        if cash_account.organisation_id != shift.organisation_id or (cash_account.outlet_id and cash_account.outlet_id != shift.outlet_id):
            raise ValidationError({'cash_account': 'Cash account is not available for this outlet.'})
        if cash_account.account_type != PaymentAccount.TYPE_CASH or not cash_account.is_active:
            raise ValidationError({'cash_account': 'Select an active Cash account.'})
    else:
        cash_account = None

    version = (ShiftAccountingPosting.objects.filter(operational_shift=shift).aggregate(
        maximum=models.Max('version'),
    )['maximum'] or 0) + 1
    posting = ShiftAccountingPosting.objects.create(
        organisation=shift.organisation, outlet=shift.outlet, operational_shift=shift, version=version,
        cash_account=cash_account, fuel_sales_amount=_amount(totals['fuel_sales']),
        cash_amount=_amount(totals['cash']), card_amount=_amount(totals['card']),
        upi_amount=_amount(totals['upi']), fleet_card_amount=_amount(totals['fleet']),
        credit_slip_amount=_amount(totals['credit']), approved_increase_amount=_amount(totals['increases']),
        approved_decrease_amount=_amount(totals['decreases']), shortage_amount=_amount(totals['shortage']),
        excess_amount=_amount(totals['excess']), posted_by=user,
    )
    accounts = _accounts(shift.organisation)
    digital = posting.digital_amount
    lines = [
        {'account_id': ensure_payment_account_ledger(cash_account, user).id, 'debit': posting.cash_amount, 'credit': 0, 'description': 'Shift cash collection'} if cash_account else None,
        {'account_id': accounts['digital_collection_clearing'].id, 'debit': digital, 'credit': 0, 'description': 'Card, UPI and fleet-card collections'},
        {'account_id': accounts['accounts_receivable'].id, 'debit': posting.credit_slip_amount, 'credit': 0, 'description': 'Fuel credit slips'},
        {'account_id': accounts['shift_adjustment_expense'].id, 'debit': posting.approved_increase_amount, 'credit': 0, 'description': 'Approved shift cash expenses and adjustments'},
        {'account_id': accounts['employee_shortage_receivable'].id, 'debit': posting.shortage_amount, 'credit': 0, 'description': 'Employee shortages'},
        {'account_id': accounts['fuel_sales'].id, 'debit': 0, 'credit': posting.fuel_sales_amount, 'description': 'Meter fuel sales'},
        {'account_id': accounts['shift_adjustment_income'].id, 'debit': 0, 'credit': posting.approved_decrease_amount, 'description': 'Approved decreasing adjustments'},
        {'account_id': accounts['shift_excess_income'].id, 'debit': 0, 'credit': posting.excess_amount, 'description': 'Employee excess collections'},
    ]
    _post(
        organisation=shift.organisation, outlet=shift.outlet, source_type='shift_accounting', source_id=posting.id,
        entry_date=shift.business_date, reference=f'SHIFT-{shift.business_date}-{shift.shift_definition.code}',
        narration=f'Shift accounting · {shift.shift_definition.name} · {shift.business_date}',
        lines=[line for line in lines if line], user=user,
    )
    if posting.cash_amount > 0:
        PaymentAccountMovement.objects.create(
            organisation=shift.organisation, outlet=shift.outlet, account=cash_account,
            effective_date=shift.business_date, signed_amount=posting.cash_amount,
            movement_type=PaymentAccountMovement.TYPE_SHIFT_CASH_COLLECTION,
            source_type='shift_accounting', source_id=posting.id,
            idempotency_key=f'shift-accounting-cash:{posting.id}',
            description=f'{shift.shift_definition.name} · {shift.business_date} cash collection', created_by=user,
        )
    return posting


@transaction.atomic
def reverse_shift_accounting(shift, reason, user=None):
    from apps.finance.models import DigitalSettlement, DigitalSettlementAllocation, PaymentAccountMovement
    from apps.sales.models import SalesInvoice, SalesInvoiceCreditSlipLink

    posting = ShiftAccountingPosting.objects.select_for_update().filter(
        operational_shift=shift, status=ShiftAccountingPosting.STATUS_ACTIVE,
    ).first()
    if not posting:
        return None
    if DigitalSettlementAllocation.objects.filter(
        collection__operational_shift=shift, settlement__status=DigitalSettlement.STATUS_ACTIVE,
    ).exists():
        raise ValidationError({'shift': 'Void active digital settlements for this shift before unlocking it.'})
    if SalesInvoiceCreditSlipLink.objects.filter(
        credit_slip__operational_shift=shift, released_at__isnull=True, invoice__status=SalesInvoice.STATUS_ACTIVE,
    ).exists():
        raise ValidationError({'shift': 'Void linked active credit-slip invoices before unlocking this shift.'})
    original = PaymentAccountMovement.objects.filter(
        source_type='shift_accounting', source_id=posting.id,
        movement_type=PaymentAccountMovement.TYPE_SHIFT_CASH_COLLECTION,
    ).first()
    if original:
        PaymentAccountMovement.objects.create(
            organisation=posting.organisation, outlet=posting.outlet, account=original.account,
            effective_date=to_outlet_business_date(timezone.now(), outlet=posting.outlet, organisation=posting.organisation),
            signed_amount=-original.signed_amount,
            movement_type=PaymentAccountMovement.TYPE_SHIFT_CASH_COLLECTION_REVERSAL,
            source_type='shift_accounting', source_id=posting.id, reversal_of=original,
            idempotency_key=f'shift-accounting-cash-reversal:{posting.id}',
            description=f'Reversal of shift cash · {shift.business_date}', created_by=user,
        )
    reverse_source_journal(
        organisation=posting.organisation, outlet=posting.outlet, source_type='shift_accounting',
        source_id=posting.id, reason=reason, user=user,
    )
    posting.status = ShiftAccountingPosting.STATUS_REVERSED
    posting.reversed_by = user
    posting.reversed_at = timezone.now()
    posting.reversal_reason = reason
    posting._allow_reversal = True
    posting.save(update_fields=['status', 'reversed_by', 'reversed_at', 'reversal_reason'])
    return posting


@transaction.atomic
def reverse_source_journal(*, organisation, outlet, source_type, source_id, reason, user=None, reversal_date=None):
    journal = _source_journal(organisation, outlet, source_type, source_id)
    if not journal:
        return None
    return reverse_journal(
        journal, reason, user, reversal_date=reversal_date or timezone.localdate(), enforce_permission=False,
    )


def journal_id_for_source(organisation_id, outlet_id, source_type, source_id):
    return JournalEntry.objects.filter(
        organisation_id=organisation_id, outlet_id=outlet_id, source_type=source_type,
        source_id=source_id, reversal_of__isnull=True,
    ).values_list('id', flat=True).first()
