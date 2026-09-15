from decimal import Decimal

from django.db import models

from apps.inventory.models import Item, ItemStockBalanceProjection
from apps.purchases.models import ItemPurchaseTaxTreatment
from apps.shifts.models import FuelCreditSlip

from .models import CustomerReceipt, SalesInvoice, SalesInvoiceCreditSlipLink


def list_sales_invoices(organisation, outlet, params):
    qs = SalesInvoice.objects.filter(organisation=organisation, outlet=outlet).select_related('customer', 'payment_account', 'created_by')
    if params.get('status') and params.get('status') != 'all':
        qs = qs.filter(status=params['status'])
    if params.get('invoice_type'):
        qs = qs.filter(invoice_type=params['invoice_type'])
    if params.get('customer'):
        qs = qs.filter(customer_id=params['customer'])
    if params.get('search'):
        search = params['search']
        qs = qs.filter(models.Q(invoice_number__icontains=search) | models.Q(customer_name_snapshot__icontains=search))
    return qs.prefetch_related('lines')[:250]


def unbilled_credit_slips(organisation, outlet, customer):
    active_ids = SalesInvoiceCreditSlipLink.objects.filter(released_at__isnull=True).values('credit_slip_id')
    return FuelCreditSlip.objects.filter(
        organisation=organisation, outlet=outlet, customer=customer,
        status=FuelCreditSlip.STATUS_ACTIVE,
    ).exclude(id__in=active_ids).select_related('product', 'product__canonical_item').order_by('occurred_at')


def sales_item_options(organisation, outlet, invoice_date):
    items = Item.objects.filter(organisation=organisation, is_active=True, is_sellable=True).exclude(item_type=Item.ITEM_TYPE_FUEL).select_related('base_unit', 'stock_profile')
    balances = {row.item_id: row.current_quantity for row in ItemStockBalanceProjection.objects.filter(outlet=outlet, item__in=items)}
    result = []
    for item in items:
        mapping = ItemPurchaseTaxTreatment.objects.filter(
            organisation=organisation, item=item, effective_from__lte=invoice_date,
        ).filter(models.Q(effective_to__isnull=True) | models.Q(effective_to__gte=invoice_date)).select_related('tax_treatment').first()
        result.append({
            'id': str(item.id), 'code': item.code, 'name': item.name, 'item_type': item.item_type,
            'unit': item.base_unit.code, 'hsn_sac': item.hsn_sac or '',
            'available_quantity': str(balances.get(item.id, Decimal('0.0000'))) if item.inventory_tracking_mode == Item.TRACKING_QUANTITY else None,
            'tax_treatment_id': str(mapping.tax_treatment_id) if mapping and mapping.tax_treatment.is_sales_applicable else None,
            'tax_treatment_name': mapping.tax_treatment.name if mapping and mapping.tax_treatment.is_sales_applicable else None,
        })
    return result


def customer_outstanding(organisation, outlet):
    rows = []
    customers = organisation.customers.filter(status='active')
    total_outstanding = Decimal('0.00')
    total_unbilled = Decimal('0.00')
    for customer in customers:
        invoices = SalesInvoice.objects.filter(organisation=organisation, outlet=outlet, customer=customer, status=SalesInvoice.STATUS_ACTIVE)
        invoiced = invoices.aggregate(total=models.Sum('grand_total'))['total'] or Decimal('0.00')
        paid = invoices.aggregate(total=models.Sum('amount_paid'))['total'] or Decimal('0.00')
        outstanding = invoices.aggregate(total=models.Sum('outstanding_amount'))['total'] or Decimal('0.00')
        slips = unbilled_credit_slips(organisation, outlet, customer)
        unbilled = slips.aggregate(total=models.Sum('amount'))['total'] or Decimal('0.00')
        if invoiced or unbilled:
            rows.append({'customer_id': str(customer.id), 'customer_code': customer.customer_code, 'customer_name': customer.display_name, 'total_invoiced': str(invoiced), 'total_paid': str(paid), 'outstanding': str(outstanding), 'unbilled_credit': str(unbilled)})
            total_outstanding += outstanding
            total_unbilled += unbilled
    return {'total_outstanding': str(total_outstanding), 'total_unbilled_credit': str(total_unbilled), 'customers': rows}


def customer_statement(organisation, outlet, customer):
    invoices = SalesInvoice.objects.filter(organisation=organisation, outlet=outlet, customer=customer).order_by('invoice_date', 'created_at')
    running = Decimal('0.00')
    lines = []
    for invoice in invoices:
        if invoice.status == SalesInvoice.STATUS_ACTIVE:
            running += invoice.outstanding_amount
        lines.append({'invoice_id': str(invoice.id), 'invoice_number': invoice.invoice_number, 'invoice_date': invoice.invoice_date.isoformat(), 'due_date': invoice.due_date.isoformat(), 'grand_total': str(invoice.grand_total), 'amount_paid': str(invoice.amount_paid), 'outstanding_amount': str(invoice.outstanding_amount), 'status': invoice.status, 'running_balance': str(running)})
    return {'customer_id': str(customer.id), 'customer_name': customer.display_name, 'lines': lines, 'outstanding': str(running)}


def customer_open_invoices(organisation, outlet, customer):
    return SalesInvoice.objects.filter(
        organisation=organisation, outlet=outlet, customer=customer,
        status=SalesInvoice.STATUS_ACTIVE, outstanding_amount__gt=0,
    ).order_by('due_date', 'invoice_date')


def list_customer_receipts(organisation, outlet, params):
    rows = CustomerReceipt.objects.filter(organisation=organisation, outlet=outlet).select_related('customer', 'payment_account')
    if params.get('status') and params.get('status') != 'all':
        rows = rows.filter(status=params['status'])
    if params.get('customer'):
        rows = rows.filter(customer_id=params['customer'])
    return rows.prefetch_related('allocations__sales_invoice')[:250]
