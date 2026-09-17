from collections import defaultdict
from datetime import timedelta
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db.models import Q, Sum
from django.utils import timezone

from apps.accounting.models import ShiftAccountingPosting
from apps.core.timezone_utils import to_outlet_business_date
from apps.finance.selectors import digital_settlement_summary
from apps.inventory.models import TankStockMovement
from apps.inventory.selectors import get_tank_stock_summary
from apps.purchases.selectors import get_supplier_outstanding_summary
from apps.sales.selectors import customer_outstanding
from apps.finance.models import Expense
from apps.purchases.models import PurchaseBill
from apps.sales.models import SalesInvoice, SalesInvoiceLine
from apps.shifts.models import (
    EmployeeShiftCard, EmployeeShiftSettlement, OperationalShift, ShiftNozzlePriceSegment,
)


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


def management_dashboard(organisation, outlet):
    business_date = to_outlet_business_date(timezone.now(), outlet=outlet, organisation=organisation)
    daily = daily_business_summary(organisation, outlet, business_date, business_date)
    tank_summary = get_tank_stock_summary(organisation, outlet)
    receivables = customer_outstanding(organisation, outlet)
    payables = get_supplier_outstanding_summary(organisation, outlet)
    digital = digital_settlement_summary(organisation, outlet)

    open_shifts = OperationalShift.objects.filter(
        organisation=organisation, outlet=outlet,
        status=OperationalShift.STATUS_OPEN, is_locked=False,
    ).select_related('shift_definition').order_by('business_date', 'scheduled_starts_at')
    awaiting_recording = OperationalShift.objects.filter(
        organisation=organisation, outlet=outlet, business_date=business_date,
        status=OperationalShift.STATUS_CLOSED, is_locked=False,
    ).select_related('shift_definition').order_by('scheduled_starts_at')

    tank_rows = []
    alerts = []
    for tank in tank_summary['tanks']:
        utilization = Decimal(tank['capacity_utilization_pct'])
        level = 'normal'
        if utilization <= Decimal('10.0'):
            level = 'critical'
        elif utilization <= Decimal('20.0'):
            level = 'low'
        if level != 'normal':
            alerts.append({
                'type': 'tank_stock', 'severity': 'danger' if level == 'critical' else 'warning',
                'title': f"{tank['tank_code']} stock is {level}",
                'detail': f"{tank['product_name']} book stock is {_quantity(tank['current_book_stock'])} L ({utilization}%).",
                'path': '/app/inventory/fuel-stock',
            })
        if tank['has_chronology_conflict'] or tank['has_negative_balance_history']:
            alerts.append({
                'type': 'stock_conflict', 'severity': 'danger',
                'title': f"{tank['tank_code']} requires stock review",
                'detail': 'The tank projection contains a chronology or negative-balance warning.',
                'path': '/app/inventory/fuel-stock',
            })
        tank_rows.append({
            'tank_id': tank['tank_id'], 'tank_code': tank['tank_code'],
            'tank_name': tank['tank_name'], 'product_name': tank['product_name'],
            'capacity': _quantity(tank['capacity']),
            'book_stock': _quantity(tank['current_book_stock']),
            'utilization_pct': str(utilization.quantize(Decimal('0.1'))),
            'level': level, 'status': tank['status'],
        })

    pending_digital = Decimal(digital['pending_amount'])
    if pending_digital > ZERO:
        alerts.append({
            'type': 'digital_settlement', 'severity': 'warning',
            'title': 'Digital collections are awaiting settlement',
            'detail': f"{digital['pending_count']} collection(s) totalling {_money(pending_digital)} remain unsettled.",
            'path': '/app/finance/settlements',
        })
    supplier_overdue = Decimal(payables['overdue_total'])
    if supplier_overdue > ZERO:
        alerts.append({
            'type': 'supplier_overdue', 'severity': 'warning',
            'title': 'Supplier bills are overdue',
            'detail': f"Overdue supplier balance is {_money(supplier_overdue)}.",
            'path': '/app/purchases/supplier-outstanding',
        })
    shortage = Decimal(daily['summary']['shortage'])
    if shortage > ZERO:
        alerts.append({
            'type': 'shift_shortage', 'severity': 'danger',
            'title': 'Recorded shift shortage requires attention',
            'detail': f"Today’s recorded shortage is {_money(shortage)}.",
            'path': '/app/reports/employee-accountability',
        })
    if awaiting_recording.exists():
        alerts.append({
            'type': 'shift_recording', 'severity': 'warning',
            'title': 'Closed shifts are awaiting financial recording',
            'detail': f"{awaiting_recording.count()} shift(s) are closed but not financially locked.",
            'path': '/app/operations/shift-cards',
        })

    return {
        'business_date': business_date.isoformat(),
        'outlet': {'id': str(outlet.id), 'code': outlet.code, 'name': outlet.name},
        'basis': 'Recorded totals include financially locked shifts only. Open and pending shifts are shown separately.',
        'recorded': daily['summary'],
        'fuel_products': daily['fuel_products'],
        'operations': {
            'recorded_shift_count': daily['summary']['recorded_shift_count'],
            'open_shift_count': open_shifts.count(),
            'awaiting_recording_count': awaiting_recording.count(),
            'open_shifts': [{
                'shift_id': str(shift.id), 'business_date': shift.business_date.isoformat(),
                'shift_name': shift.shift_definition.name,
                'is_stale': shift.business_date < business_date,
            } for shift in open_shifts[:10]],
        },
        'stock': {
            'total_tanks': tank_summary['metrics']['total_tanks'],
            'total_book_stock': _quantity(tank_summary['metrics']['total_book_stock']),
            'low_stock_count': sum(1 for tank in tank_rows if tank['level'] != 'normal'),
            'conflict_count': tank_summary['metrics']['conflict_alert_count'],
            'tanks': tank_rows,
        },
        'receivables': {
            'customer_outstanding': _money(receivables['total_outstanding']),
            'unbilled_credit': _money(receivables['total_unbilled_credit']),
        },
        'payables': {
            'supplier_outstanding': _money(payables['total_outstanding']),
            'supplier_overdue': _money(payables['overdue_total']),
        },
        'settlements': {
            'pending_count': digital['pending_count'],
            'pending_amount': _money(digital['pending_amount']),
        },
        'alerts': alerts,
    }


def core_report_pack(organisation, outlet, from_date, to_date):
    sales_qs = SalesInvoice.objects.filter(
        organisation=organisation, outlet=outlet, status=SalesInvoice.STATUS_ACTIVE,
        invoice_date__range=(from_date, to_date),
    ).prefetch_related('lines').order_by('-invoice_date', '-created_at')
    sales_totals = sales_qs.aggregate(
        subtotal=Sum('subtotal'), tax=Sum('tax_total'), total=Sum('grand_total'),
        paid=Sum('amount_paid'), outstanding=Sum('outstanding_amount'),
    )
    sales_rows = []
    for invoice in sales_qs[:1000]:
        contains_credit_slips = any(line.source_type == SalesInvoiceLine.SOURCE_CREDIT_SLIP for line in invoice.lines.all())
        sales_rows.append({
            'invoice_id': str(invoice.id), 'invoice_number': invoice.invoice_number,
            'invoice_date': invoice.invoice_date.isoformat(), 'due_date': invoice.due_date.isoformat(),
            'invoice_type': invoice.invoice_type, 'customer_name': invoice.customer_name_snapshot,
            'payment_method': invoice.payment_method or None,
            'subtotal': _money(invoice.subtotal), 'tax_total': _money(invoice.tax_total),
            'grand_total': _money(invoice.grand_total), 'amount_paid': _money(invoice.amount_paid),
            'outstanding': _money(invoice.outstanding_amount),
            'contains_credit_slips': contains_credit_slips,
        })

    purchase_qs = PurchaseBill.objects.filter(
        organisation=organisation, outlet=outlet, status=PurchaseBill.STATUS_ACTIVE,
        invoice_date__range=(from_date, to_date),
    ).order_by('-invoice_date', '-created_at')
    purchase_totals = purchase_qs.aggregate(
        taxable=Sum('taxable_value_total'), tax=Sum('tax_total'), total=Sum('grand_total'),
        paid=Sum('amount_paid'), outstanding=Sum('outstanding_amount'),
    )
    purchase_rows = [{
        'bill_id': str(bill.id), 'bill_number': bill.bill_number,
        'supplier_invoice_number': bill.supplier_invoice_number,
        'invoice_date': bill.invoice_date.isoformat(), 'due_date': bill.due_date.isoformat(),
        'supplier_name': bill.supplier_name_snapshot, 'purchase_type': bill.purchase_type,
        'taxable_value': _money(bill.taxable_value_total), 'tax_total': _money(bill.tax_total),
        'grand_total': _money(bill.grand_total), 'amount_paid': _money(bill.amount_paid),
        'outstanding': _money(bill.outstanding_amount),
    } for bill in purchase_qs[:1000]]

    movement_qs = TankStockMovement.objects.filter(
        organisation=organisation, outlet=outlet, business_date__range=(from_date, to_date),
    ).select_related('tank', 'fuel_product').order_by('-effective_at', '-created_at')
    movement_totals = movement_qs.aggregate(
        inward=Sum('quantity', filter=Q(direction=TankStockMovement.DIR_IN)),
        outward=Sum('quantity', filter=Q(direction=TankStockMovement.DIR_OUT)),
    )
    stock_rows = [{
        'movement_id': str(movement.id), 'tank_id': str(movement.tank_id),
        'business_date': movement.business_date.isoformat() if movement.business_date else None,
        'effective_at': movement.effective_at.isoformat(), 'tank_code': movement.tank.code,
        'product_name': movement.product_name_snapshot, 'movement_type': movement.movement_type,
        'movement_label': movement.get_movement_type_display(), 'direction': movement.direction,
        'quantity': _quantity(movement.quantity), 'source_type': movement.source_type,
        'source_id': str(movement.source_id), 'reason': movement.reason or '',
    } for movement in movement_qs[:1000]]

    postings = ShiftAccountingPosting.objects.filter(
        organisation=organisation, outlet=outlet, status=ShiftAccountingPosting.STATUS_ACTIVE,
        operational_shift__business_date__range=(from_date, to_date),
    ).select_related('operational_shift__shift_definition').order_by(
        '-operational_shift__business_date', '-operational_shift__shift_definition__display_order',
    )
    payment_totals = postings.aggregate(
        cash=Sum('cash_amount'), card=Sum('card_amount'), upi=Sum('upi_amount'),
        fleet_card=Sum('fleet_card_amount'), credit=Sum('credit_slip_amount'),
    )
    payment_rows = [{
        'posting_id': str(posting.id), 'shift_id': str(posting.operational_shift_id),
        'business_date': posting.operational_shift.business_date.isoformat(),
        'shift_name': posting.operational_shift.shift_definition.name,
        'cash': _money(posting.cash_amount), 'card': _money(posting.card_amount),
        'upi': _money(posting.upi_amount), 'fleet_card': _money(posting.fleet_card_amount),
        'credit': _money(posting.credit_slip_amount), 'total': _money(
            posting.cash_amount + posting.card_amount + posting.upi_amount
            + posting.fleet_card_amount + posting.credit_slip_amount
        ),
    } for posting in postings[:1000]]

    return {
        'filters': {'from_date': from_date.isoformat(), 'to_date': to_date.isoformat()},
        'basis': {
            'sales': 'Active sales invoice documents. Credit-slip billing is identified and is not additional meter-sale revenue.',
            'purchases': 'Active recorded purchase bills.',
            'stock': 'Append-only tank stock ledger movements, including reversals.',
            'payments': 'Collection modes from active accounting postings for financially locked shifts only.',
        },
        'sales': {
            'count': sales_qs.count(),
            'totals': {key: _money(value) for key, value in sales_totals.items()},
            'rows': sales_rows, 'truncated': sales_qs.count() > len(sales_rows),
        },
        'purchases': {
            'count': purchase_qs.count(),
            'totals': {key: _money(value) for key, value in purchase_totals.items()},
            'rows': purchase_rows, 'truncated': purchase_qs.count() > len(purchase_rows),
        },
        'stock': {
            'count': movement_qs.count(),
            'totals': {
                'inward': _quantity(movement_totals['inward']),
                'outward': _quantity(movement_totals['outward']),
                'net': _quantity((movement_totals['inward'] or ZERO) - (movement_totals['outward'] or ZERO)),
            },
            'rows': stock_rows, 'truncated': movement_qs.count() > len(stock_rows),
        },
        'payments': {
            'count': postings.count(),
            'totals': {
                **{key: _money(value) for key, value in payment_totals.items()},
                'digital': _money(
                    (payment_totals['card'] or ZERO) + (payment_totals['upi'] or ZERO)
                    + (payment_totals['fleet_card'] or ZERO)
                ),
                'total': _money(sum((value or ZERO for value in payment_totals.values()), ZERO)),
            },
            'rows': payment_rows, 'truncated': postings.count() > len(payment_rows),
        },
    }


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
