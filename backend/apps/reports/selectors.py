from collections import defaultdict
from datetime import timedelta
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db.models import Sum
from django.utils import timezone

from apps.accounting.models import ShiftAccountingPosting
from apps.core.timezone_utils import to_outlet_business_date
from apps.finance.models import Expense
from apps.purchases.models import PurchaseBill
from apps.sales.models import SalesInvoice, SalesInvoiceLine
from apps.shifts.models import EmployeeShiftCard, EmployeeShiftSettlement, ShiftNozzlePriceSegment


ZERO = Decimal('0.00')


def report_date_range(outlet, organisation, from_date=None, to_date=None):
    current = to_outlet_business_date(timezone.now(), outlet=outlet, organisation=organisation)
    start = from_date or current
    end = to_date or start
    if start > end:
        raise ValidationError({'to_date': 'To date must be on or after From date.'})
    if end - start > timedelta(days=366):
        raise ValidationError({'date_range': 'Select a date range of 366 days or less.'})
    return start, end


def _money(value):
    return str(Decimal(value or ZERO).quantize(Decimal('0.01')))


def _quantity(value):
    return str(Decimal(value or '0').quantize(Decimal('0.001')))


def _sum(queryset, field):
    return queryset.aggregate(total=Sum(field))['total'] or ZERO


def daily_business_summary(organisation, outlet, from_date, to_date):
    postings = list(
        ShiftAccountingPosting.objects.filter(
            organisation=organisation,
            outlet=outlet,
            status=ShiftAccountingPosting.STATUS_ACTIVE,
            operational_shift__business_date__range=(from_date, to_date),
        ).select_related('operational_shift__shift_definition', 'cash_account').order_by(
            'operational_shift__business_date', 'operational_shift__shift_definition__display_order',
        )
    )

    totals = defaultdict(lambda: ZERO)
    rows = []
    for posting in postings:
        shift = posting.operational_shift
        digital = posting.digital_amount
        for key, value in (
            ('fuel_sales', posting.fuel_sales_amount), ('cash', posting.cash_amount),
            ('card', posting.card_amount), ('upi', posting.upi_amount),
            ('fleet_card', posting.fleet_card_amount), ('digital', digital),
            ('credit', posting.credit_slip_amount), ('shift_expenses', posting.approved_increase_amount),
            ('decreasing_adjustments', posting.approved_decrease_amount),
            ('shortage', posting.shortage_amount), ('excess', posting.excess_amount),
        ):
            totals[key] += value
        rows.append({
            'shift_id': str(shift.id),
            'posting_id': str(posting.id),
            'posting_version': posting.version,
            'business_date': shift.business_date.isoformat(),
            'shift_name': shift.shift_definition.name,
            'shift_code': shift.shift_definition.code,
            'cash_account_name': posting.cash_account.name if posting.cash_account_id else None,
            'fuel_sales': _money(posting.fuel_sales_amount),
            'cash': _money(posting.cash_amount),
            'card': _money(posting.card_amount),
            'upi': _money(posting.upi_amount),
            'fleet_card': _money(posting.fleet_card_amount),
            'digital': _money(digital),
            'credit': _money(posting.credit_slip_amount),
            'shift_expenses': _money(posting.approved_increase_amount),
            'decreasing_adjustments': _money(posting.approved_decrease_amount),
            'shortage': _money(posting.shortage_amount),
            'excess': _money(posting.excess_amount),
        })

    product_rows = ShiftNozzlePriceSegment.objects.filter(
        shift_nozzle_meter__shift__organisation=organisation,
        shift_nozzle_meter__shift__outlet=outlet,
        shift_nozzle_meter__shift__business_date__range=(from_date, to_date),
        shift_nozzle_meter__shift__accounting_postings__status=ShiftAccountingPosting.STATUS_ACTIVE,
        shift_nozzle_meter__shift_card__status=EmployeeShiftCard.STATUS_ACTIVE,
    ).values('product_id', 'product__code', 'product__name', 'product__unit').annotate(
        quantity=Sum('sale_quantity'), amount=Sum('sale_amount'),
    ).order_by('product__display_order', 'product__name')

    invoice_lines = SalesInvoiceLine.objects.filter(
        invoice__organisation=organisation,
        invoice__outlet=outlet,
        invoice__status=SalesInvoice.STATUS_ACTIVE,
        invoice__invoice_date__range=(from_date, to_date),
        source_type=SalesInvoiceLine.SOURCE_ITEM,
    ).exclude(item_type_snapshot='fuel')
    product_sales = _sum(invoice_lines.exclude(item_type_snapshot='service'), 'line_total')
    service_sales = _sum(invoice_lines.filter(item_type_snapshot='service'), 'line_total')
    sales_tax = _sum(invoice_lines, 'tax_amount')
    cash_invoice_sales = _sum(
        SalesInvoice.objects.filter(
            organisation=organisation, outlet=outlet, status=SalesInvoice.STATUS_ACTIVE,
            invoice_type=SalesInvoice.TYPE_CASH, invoice_date__range=(from_date, to_date),
        ),
        'grand_total',
    )
    general_expenses = _sum(
        Expense.objects.filter(
            organisation=organisation, outlet=outlet, status=Expense.STATUS_ACTIVE,
            expense_date__range=(from_date, to_date),
        ),
        'amount',
    )
    purchases = _sum(
        PurchaseBill.objects.filter(
            organisation=organisation, outlet=outlet, status=PurchaseBill.STATUS_ACTIVE,
            invoice_date__range=(from_date, to_date),
        ),
        'grand_total',
    )
    non_fuel_sales = product_sales + service_sales

    return {
        'filters': {'from_date': from_date.isoformat(), 'to_date': to_date.isoformat()},
        'basis': 'Recorded and financially locked shifts only',
        'summary': {
            'recorded_shift_count': len(postings),
            'fuel_sales': _money(totals['fuel_sales']),
            'product_sales': _money(product_sales),
            'service_sales': _money(service_sales),
            'non_fuel_sales': _money(non_fuel_sales),
            'sales_total': _money(totals['fuel_sales'] + non_fuel_sales),
            'sales_tax': _money(sales_tax),
            'cash_collections': _money(totals['cash']),
            'cash_invoice_sales': _money(cash_invoice_sales),
            'card_collections': _money(totals['card']),
            'upi_collections': _money(totals['upi']),
            'fleet_card_collections': _money(totals['fleet_card']),
            'digital_collections': _money(totals['digital']),
            'credit_sales': _money(totals['credit']),
            'shift_expenses': _money(totals['shift_expenses']),
            'general_expenses': _money(general_expenses),
            'purchase_total': _money(purchases),
            'shortage': _money(totals['shortage']),
            'excess': _money(totals['excess']),
        },
        'fuel_products': [{
            'product_id': str(row['product_id']), 'product_code': row['product__code'],
            'product_name': row['product__name'], 'unit': row['product__unit'],
            'quantity': _quantity(row['quantity']), 'amount': _money(row['amount']),
        } for row in product_rows],
        'shifts': rows,
    }


def employee_accountability(organisation, outlet, from_date, to_date, employee_id=None):
    settlements = EmployeeShiftSettlement.objects.filter(
        organisation=organisation,
        outlet=outlet,
        operational_shift__business_date__range=(from_date, to_date),
        operational_shift__accounting_postings__status=ShiftAccountingPosting.STATUS_ACTIVE,
        shift_card__status=EmployeeShiftCard.STATUS_ACTIVE,
    ).select_related('employee', 'operational_shift__shift_definition', 'shift_card').order_by(
        'employee__display_name', 'operational_shift__business_date',
    )
    if employee_id:
        settlements = settlements.filter(employee_id=employee_id)

    employees = {}
    details = []
    total_shortage = ZERO
    total_excess = ZERO
    for settlement in settlements:
        difference = settlement.difference_amount
        shortage = abs(difference) if difference < 0 else ZERO
        excess = difference if difference > 0 else ZERO
        total_shortage += shortage
        total_excess += excess
        employee_key = str(settlement.employee_id)
        if employee_key not in employees:
            employees[employee_key] = {
                'employee_id': employee_key,
                'employee_code': settlement.employee.employee_code,
                'employee_name': settlement.employee.display_name,
                'shift_count': 0,
                'expected_sales': ZERO, 'cash': ZERO, 'card': ZERO, 'upi': ZERO,
                'fleet_card': ZERO, 'digital': ZERO, 'credit': ZERO,
                'approved_increases': ZERO, 'approved_decreases': ZERO,
                'accounted': ZERO, 'shortage': ZERO, 'excess': ZERO,
            }
        summary = employees[employee_key]
        summary['shift_count'] += 1
        for key, value in (
            ('expected_sales', settlement.expected_sale_amount), ('cash', settlement.cash_amount),
            ('card', settlement.card_amount), ('upi', settlement.upi_amount),
            ('fleet_card', settlement.fleet_card_amount), ('credit', settlement.credit_slip_amount),
            ('approved_increases', settlement.approved_increase_adjustments),
            ('approved_decreases', settlement.approved_decrease_adjustments),
            ('accounted', settlement.total_accounted_amount), ('shortage', shortage), ('excess', excess),
        ):
            summary[key] += value
        summary['digital'] += settlement.card_amount + settlement.upi_amount + settlement.fleet_card_amount
        details.append({
            'settlement_id': str(settlement.id),
            'shift_id': str(settlement.operational_shift_id),
            'shift_card_id': str(settlement.shift_card_id),
            'employee_id': employee_key,
            'employee_code': settlement.employee.employee_code,
            'employee_name': settlement.employee.display_name,
            'business_date': settlement.operational_shift.business_date.isoformat(),
            'shift_name': settlement.operational_shift.shift_definition.name,
            'expected_sales': _money(settlement.expected_sale_amount),
            'cash': _money(settlement.cash_amount),
            'card': _money(settlement.card_amount),
            'upi': _money(settlement.upi_amount),
            'fleet_card': _money(settlement.fleet_card_amount),
            'credit': _money(settlement.credit_slip_amount),
            'approved_increases': _money(settlement.approved_increase_adjustments),
            'approved_decreases': _money(settlement.approved_decrease_adjustments),
            'accounted': _money(settlement.total_accounted_amount),
            'shortage': _money(shortage), 'excess': _money(excess),
            'result': settlement.result,
        })

    money_keys = {
        'expected_sales', 'cash', 'card', 'upi', 'fleet_card', 'digital', 'credit',
        'approved_increases', 'approved_decreases', 'accounted', 'shortage', 'excess',
    }
    employee_rows = []
    for row in employees.values():
        employee_rows.append({key: _money(value) if key in money_keys else value for key, value in row.items()})

    return {
        'filters': {
            'from_date': from_date.isoformat(), 'to_date': to_date.isoformat(),
            'employee_id': str(employee_id) if employee_id else None,
        },
        'basis': 'Reconciled employee settlements from financially locked shifts',
        'summary': {
            'employee_count': len(employee_rows),
            'shift_settlement_count': len(details),
            'shortage': _money(total_shortage),
            'excess': _money(total_excess),
        },
        'employees': employee_rows,
        'details': details,
    }
