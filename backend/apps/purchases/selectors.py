# apps/purchases/selectors.py
from decimal import Decimal
from django.db.models import Sum, Q
from apps.organizations.models import Organisation, Outlet
from .models import Supplier, TankerReceipt, TankerReceiptProductLine, TankerReceiptTankAllocation


def list_suppliers(organisation: Organisation, active_only: bool = False):
    qs = Supplier.objects.filter(organisation=organisation)
    if active_only:
        qs = qs.filter(is_active=True)
    return qs.order_by('name')


def list_tanker_receipts(
    organisation: Organisation,
    outlet: Outlet,
    status=None,
    supplier_id=None,
    from_date=None,
    to_date=None,
    vehicle_registration=None,
    search=None
):
    qs = TankerReceipt.objects.filter(
        organisation=organisation,
        outlet=outlet
    ).select_related('supplier', 'created_by', 'confirmed_by', 'voided_by').prefetch_related(
        'product_lines',
        'product_lines__product',
        'product_lines__allocations'
    ).order_by('-unloading_end_time', '-created_at')

    if status:
        qs = qs.filter(status=status)
    if supplier_id:
        qs = qs.filter(supplier_id=supplier_id)
    if from_date:
        qs = qs.filter(invoice_date__gte=from_date)
    if to_date:
        qs = qs.filter(invoice_date__lte=to_date)
    if vehicle_registration:
        qs = qs.filter(vehicle_registration__icontains=vehicle_registration)
    if search:
        qs = qs.filter(
            Q(receipt_number__icontains=search) |
            Q(invoice_number__icontains=search) |
            Q(supplier_name_snapshot__icontains=search) |
            Q(vehicle_registration__icontains=search)
        )

    return qs


def get_tanker_receipt_detail(receipt_id, organisation: Organisation, outlet: Outlet):
    try:
        return TankerReceipt.objects.select_related(
            'supplier', 'created_by', 'updated_by', 'confirmed_by', 'voided_by'
        ).prefetch_related(
            'product_lines',
            'product_lines__product',
            'product_lines__allocations',
            'product_lines__allocations__tank',
            'product_lines__allocations__calibration_chart',
            'attachments',
            'attachments__uploaded_by'
        ).get(
            id=receipt_id,
            organisation=organisation,
            outlet=outlet
        )
    except TankerReceipt.DoesNotExist:
        return None
