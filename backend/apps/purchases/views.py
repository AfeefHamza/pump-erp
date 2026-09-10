# apps/purchases/views.py
import os
from decimal import Decimal
from django.http import Http404, FileResponse
from django.shortcuts import get_object_or_404
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils.dateparse import parse_date
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

from apps.organizations.models import Organisation, Outlet
from apps.forecourt.models import Tank, FuelProduct
from apps.organizations.permissions import require_permission, has_permission
from .models import (
    Supplier, TankerReceipt, TankerReceiptProductLine,
    TankerReceiptTankAllocation, TankerReceiptAttachment,
    PurchaseBill, PurchaseBillReceiptLink, PurchaseBillLine,
    PurchaseBillAdjustmentComponent, PurchaseBillAttachment,
    PurchaseBillAuditLog, PurchaseTaxCode, PurchaseTaxCodeRate,
    PurchaseTaxCodeComponent, PurchaseItem, ProductPurchaseTaxMapping,
    PurchaseBillOtherCharge
)
from .serializers import (
    SupplierSerializer, TankerReceiptListSerializer,
    TankerReceiptDetailSerializer, TankerReceiptCreateUpdateSerializer,
    TankerReceiptVoidSerializer, VarianceAcknowledgeSerializer,
    DipConversionPreviewSerializer, TankerReceiptAttachmentSerializer,
    PurchaseBillListSerializer, PurchaseBillDetailSerializer,
    PurchaseBillCreateUpdateSerializer, PurchaseBillVoidSerializer,
    PurchaseBillAttachmentSerializer,
    PurchaseTaxCodeSerializer, PurchaseTaxCodeRateSerializer,
    PurchaseTaxCodeComponentSerializer, PurchaseItemSerializer,
    ProductPurchaseTaxMappingSerializer, PurchaseBillOtherChargeSerializer
)
from .selectors import (
    list_suppliers, list_tanker_receipts, get_tanker_receipt_detail,
    list_purchase_bills, get_purchase_bill_detail,
    get_available_tanker_receipts_for_billing,
    get_supplier_outstanding_summary, get_supplier_statement,
    list_purchase_tax_codes, get_purchase_tax_code_detail,
    list_purchase_items, get_purchase_item_detail,
    list_product_tax_mappings
)
from .services import (
    create_supplier, update_supplier, create_tanker_receipt,
    update_tanker_receipt, confirm_tanker_receipt, void_tanker_receipt,
    acknowledge_receipt_variance, upload_receipt_attachment,
    preview_dip_volume_for_tank,
    create_purchase_bill, update_purchase_bill, void_purchase_bill,
    upload_bill_attachment,
    create_purchase_tax_code, update_purchase_tax_code,
    create_purchase_tax_code_rate, update_purchase_tax_code_rate,
    create_purchase_item, update_purchase_item,
    create_or_update_product_tax_mapping,
    calculate_bill_totals_v2
)


def _get_org(org_id):
    return get_object_or_404(Organisation, id=org_id)


def _get_org_and_outlet(org_id, outlet_id):
    org = get_object_or_404(Organisation, id=org_id)
    outlet = get_object_or_404(Outlet, id=outlet_id, organisation=org)
    return org, outlet


def _handle_validation_error(exc):
    if hasattr(exc, 'message_dict'):
        return Response({'detail': exc.message_dict}, status=status.HTTP_400_BAD_REQUEST)
    return Response({'detail': str(exc.message if hasattr(exc, 'message') else exc)}, status=status.HTTP_400_BAD_REQUEST)


class SupplierListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id):
        org = _get_org(org_id)
        require_permission(request.user, org, 'tanker_receipt.view')
        suppliers = list_suppliers(org)
        return Response(SupplierSerializer(suppliers, many=True).data, status=status.HTTP_200_OK)

    def post(self, request, org_id):
        org = _get_org(org_id)
        require_permission(request.user, org, 'tanker_receipt.create')
        serializer = SupplierSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            supplier = create_supplier(
                organisation=org,
                code=data['code'],
                name=data['name'],
                contact_person=data.get('contact_person'),
                phone=data.get('phone'),
                email=data.get('email'),
                tax_number=data.get('tax_number'),
                gstin=data.get('gstin'),
                gst_registration_type=data.get('gst_registration_type', 'pending_review'),
                state=data.get('state'),
                state_code=data.get('state_code'),
                tax_treatment=data.get('tax_treatment', 'regular'),
                address=data.get('address')
            )
            return Response(SupplierSerializer(supplier).data, status=status.HTTP_201_CREATED)
        except DjangoValidationError as e:
            return _handle_validation_error(e)


class SupplierDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id, supplier_id):
        org = _get_org(org_id)
        require_permission(request.user, org, 'tanker_receipt.view')
        supplier = get_object_or_404(Supplier, id=supplier_id, organisation=org)
        return Response(SupplierSerializer(supplier).data, status=status.HTTP_200_OK)

    def put(self, request, org_id, supplier_id):
        org = _get_org(org_id)
        require_permission(request.user, org, 'tanker_receipt.create')
        supplier = get_object_or_404(Supplier, id=supplier_id, organisation=org)
        serializer = SupplierSerializer(supplier, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)

        try:
            updated = update_supplier(supplier, **serializer.validated_data)
            return Response(SupplierSerializer(updated).data, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            return _handle_validation_error(e)


class TankerReceiptListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id, outlet_id):
        org, outlet = _get_org_and_outlet(org_id, outlet_id)
        require_permission(request.user, org, 'tanker_receipt.view', outlet=outlet)

        status_filter = request.query_params.get('status')
        supplier_id = request.query_params.get('supplier_id')
        from_date_str = request.query_params.get('from_date')
        to_date_str = request.query_params.get('to_date')
        from_date = parse_date(from_date_str) if from_date_str else None
        to_date = parse_date(to_date_str) if to_date_str else None
        vehicle = request.query_params.get('vehicle_registration')
        search = request.query_params.get('search')

        receipts = list_tanker_receipts(
            organisation=org,
            outlet=outlet,
            status=status_filter,
            supplier_id=supplier_id,
            from_date=from_date,
            to_date=to_date,
            vehicle_registration=vehicle,
            search=search
        )
        return Response(TankerReceiptListSerializer(receipts, many=True).data, status=status.HTTP_200_OK)

    def post(self, request, org_id, outlet_id):
        org, outlet = _get_org_and_outlet(org_id, outlet_id)
        require_permission(request.user, org, 'tanker_receipt.create', outlet=outlet)

        serializer = TankerReceiptCreateUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        v_data = serializer.validated_data

        supplier = get_object_or_404(Supplier, id=v_data['supplier_id'], organisation=org)

        # Build lines data
        lines_data = []
        for line_in in v_data.get('product_lines', []):
            product = get_object_or_404(FuelProduct, id=line_in['product_id'], organisation=org)
            allocs = []
            for alloc_in in line_in.get('allocations', []):
                tank = get_object_or_404(Tank, id=alloc_in['tank_id'], organisation=org, outlet=outlet)
                allocs.append({
                    'tank': tank,
                    'allocated_book_quantity': alloc_in['allocated_book_quantity'],
                    'pre_unloading_dip_height': alloc_in.get('pre_unloading_dip_height'),
                    'pre_unloading_dip_unit': alloc_in.get('pre_unloading_dip_unit', 'millimetre'),
                    'post_unloading_dip_height': alloc_in.get('post_unloading_dip_height'),
                    'post_unloading_dip_unit': alloc_in.get('post_unloading_dip_unit', 'millimetre'),
                    'notes': alloc_in.get('notes')
                })
            lines_data.append({
                'product': product,
                'invoice_quantity': line_in['invoice_quantity'],
                'accepted_book_quantity': line_in['accepted_book_quantity'],
                'unit_rate': line_in.get('unit_rate'),
                'invoice_density': line_in.get('invoice_density'),
                'observed_density': line_in.get('observed_density'),
                'observed_temperature': line_in.get('observed_temperature'),
                'quantity_override_reason': line_in.get('quantity_override_reason'),
                'remarks': line_in.get('remarks'),
                'allocations': allocs
            })

        try:
            receipt = create_tanker_receipt(
                organisation=org,
                outlet=outlet,
                receipt_number=v_data['receipt_number'],
                supplier=supplier,
                invoice_number=v_data['invoice_number'],
                invoice_date=v_data['invoice_date'],
                vehicle_registration=v_data['vehicle_registration'],
                unloading_end_time=v_data['unloading_end_time'],
                product_lines_data=lines_data,
                user=request.user,
                delivery_challan_number=v_data.get('delivery_challan_number'),
                driver_name=v_data.get('driver_name'),
                driver_phone=v_data.get('driver_phone'),
                seal_details=v_data.get('seal_details'),
                unloading_start_time=v_data.get('unloading_start_time'),
                notes=v_data.get('notes')
            )
            detail = get_tanker_receipt_detail(receipt.id, org, outlet)
            return Response(TankerReceiptDetailSerializer(detail).data, status=status.HTTP_201_CREATED)
        except DjangoValidationError as e:
            return _handle_validation_error(e)


class TankerReceiptDetailUpdateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id, outlet_id, receipt_id):
        org, outlet = _get_org_and_outlet(org_id, outlet_id)
        require_permission(request.user, org, 'tanker_receipt.view', outlet=outlet)

        receipt = get_tanker_receipt_detail(receipt_id, org, outlet)
        if not receipt:
            raise Http404("Tanker receipt not found.")

        return Response(TankerReceiptDetailSerializer(receipt).data, status=status.HTTP_200_OK)

    def put(self, request, org_id, outlet_id, receipt_id):
        org, outlet = _get_org_and_outlet(org_id, outlet_id)
        require_permission(request.user, org, 'tanker_receipt.update', outlet=outlet)

        receipt = get_object_or_404(TankerReceipt, id=receipt_id, organisation=org, outlet=outlet)

        serializer = TankerReceiptCreateUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        v_data = serializer.validated_data

        supplier = get_object_or_404(Supplier, id=v_data['supplier_id'], organisation=org)

        lines_data = []
        for line_in in v_data.get('product_lines', []):
            product = get_object_or_404(FuelProduct, id=line_in['product_id'], organisation=org)
            allocs = []
            for alloc_in in line_in.get('allocations', []):
                tank = get_object_or_404(Tank, id=alloc_in['tank_id'], organisation=org, outlet=outlet)
                allocs.append({
                    'tank': tank,
                    'allocated_book_quantity': alloc_in['allocated_book_quantity'],
                    'pre_unloading_dip_height': alloc_in.get('pre_unloading_dip_height'),
                    'pre_unloading_dip_unit': alloc_in.get('pre_unloading_dip_unit', 'millimetre'),
                    'post_unloading_dip_height': alloc_in.get('post_unloading_dip_height'),
                    'post_unloading_dip_unit': alloc_in.get('post_unloading_dip_unit', 'millimetre'),
                    'notes': alloc_in.get('notes')
                })
            lines_data.append({
                'product': product,
                'invoice_quantity': line_in['invoice_quantity'],
                'accepted_book_quantity': line_in['accepted_book_quantity'],
                'unit_rate': line_in.get('unit_rate'),
                'invoice_density': line_in.get('invoice_density'),
                'observed_density': line_in.get('observed_density'),
                'observed_temperature': line_in.get('observed_temperature'),
                'quantity_override_reason': line_in.get('quantity_override_reason'),
                'remarks': line_in.get('remarks'),
                'allocations': allocs
            })

        update_payload = dict(v_data)
        update_payload['supplier'] = supplier
        update_payload['product_lines'] = lines_data

        try:
            updated = update_tanker_receipt(receipt, update_payload, request.user)
            detail = get_tanker_receipt_detail(updated.id, org, outlet)
            return Response(TankerReceiptDetailSerializer(detail).data, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            return _handle_validation_error(e)


class TankerReceiptConfirmView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, org_id, outlet_id, receipt_id):
        org, outlet = _get_org_and_outlet(org_id, outlet_id)
        require_permission(request.user, org, 'tanker_receipt.confirm', outlet=outlet)

        receipt = get_object_or_404(TankerReceipt, id=receipt_id, organisation=org, outlet=outlet)

        try:
            confirmed = confirm_tanker_receipt(receipt.id, request.user)
            detail = get_tanker_receipt_detail(confirmed.id, org, outlet)
            return Response(TankerReceiptDetailSerializer(detail).data, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            return _handle_validation_error(e)


class TankerReceiptVoidView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, org_id, outlet_id, receipt_id):
        org, outlet = _get_org_and_outlet(org_id, outlet_id)
        require_permission(request.user, org, 'tanker_receipt.void', outlet=outlet)

        receipt = get_object_or_404(TankerReceipt, id=receipt_id, organisation=org, outlet=outlet)

        serializer = TankerReceiptVoidSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            voided = void_tanker_receipt(receipt.id, request.user, serializer.validated_data['void_reason'])
            detail = get_tanker_receipt_detail(voided.id, org, outlet)
            return Response(TankerReceiptDetailSerializer(detail).data, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            return _handle_validation_error(e)


class TankerReceiptAttachmentUploadView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, org_id, outlet_id, receipt_id):
        org, outlet = _get_org_and_outlet(org_id, outlet_id)
        receipt = get_object_or_404(TankerReceipt, id=receipt_id, organisation=org, outlet=outlet)

        file = request.FILES.get('file')
        if not file:
            return Response({'detail': "No file provided."}, status=status.HTTP_400_BAD_REQUEST)

        attachment_type = request.data.get('attachment_type', TankerReceiptAttachment.TYPE_INVOICE)

        try:
            att = upload_receipt_attachment(receipt, file, attachment_type, request.user)
            return Response(TankerReceiptAttachmentSerializer(att).data, status=status.HTTP_201_CREATED)
        except DjangoValidationError as e:
            return _handle_validation_error(e)


class TankerReceiptAttachmentDownloadView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id, outlet_id, receipt_id, att_id):
        org, outlet = _get_org_and_outlet(org_id, outlet_id)
        require_permission(request.user, org, 'tanker_receipt.view', outlet=outlet)

        receipt = get_object_or_404(TankerReceipt, id=receipt_id, organisation=org, outlet=outlet)
        att = get_object_or_404(TankerReceiptAttachment, id=att_id, receipt=receipt)

        file_handle = att.file.open('rb')
        filename = os.path.basename(att.file.name)
        ext = os.path.splitext(filename)[1].lower()
        content_type = 'application/pdf' if ext == '.pdf' else ('image/png' if ext == '.png' else 'image/jpeg')

        response = FileResponse(file_handle, content_type=content_type)
        response['Content-Disposition'] = f'inline; filename="{att.file_name or filename}"'
        return response


class VarianceAcknowledgeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, org_id, outlet_id, alloc_id):
        org, outlet = _get_org_and_outlet(org_id, outlet_id)
        require_permission(request.user, org, 'fuel_stock.adjust', outlet=outlet)

        alloc = get_object_or_404(
            TankerReceiptTankAllocation,
            id=alloc_id,
            product_line__receipt__organisation=org,
            product_line__receipt__outlet=outlet
        )

        serializer = VarianceAcknowledgeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            updated_alloc = acknowledge_receipt_variance(
                allocation_id=alloc.id,
                user=request.user,
                reason=serializer.validated_data['reason']
            )
            return Response({
                'message': "Variance acknowledged successfully.",
                'variance_status': updated_alloc.variance_status,
                'variance_acknowledged_at': updated_alloc.variance_acknowledged_at
            }, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            return _handle_validation_error(e)


class DipConversionPreviewView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, org_id, outlet_id):
        org, outlet = _get_org_and_outlet(org_id, outlet_id)
        require_permission(request.user, org, 'tanker_receipt.view', outlet=outlet)

        serializer = DipConversionPreviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        v_data = serializer.validated_data

        tank = get_object_or_404(Tank, id=v_data['tank_id'], organisation=org, outlet=outlet)

        try:
            result = preview_dip_volume_for_tank(
                tank=tank,
                height=v_data['measured_height'],
                unit=v_data['input_unit'],
                measured_at=v_data.get('measured_at')
            )
            return Response({
                'volume': str(result['volume']),
                'chart_name': result['chart'].name,
                'method': result['method']
            }, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            return _handle_validation_error(e)


# ============================================================================
# Milestone 12: Purchase Bills & Supplier Outstanding Views
# ============================================================================

class PurchaseBillListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id, outlet_id):
        org, outlet = _get_org_and_outlet(org_id, outlet_id)
        require_permission(request.user, org, 'purchase_bill.view', outlet=outlet)

        bills = list_purchase_bills(
            organisation=org,
            outlet=outlet,
            status=request.query_params.get('status'),
            supplier_id=request.query_params.get('supplier_id'),
            from_date=parse_date(request.query_params.get('from_date', '')) if request.query_params.get('from_date') else None,
            to_date=parse_date(request.query_params.get('to_date', '')) if request.query_params.get('to_date') else None,
            from_due_date=parse_date(request.query_params.get('from_due_date', '')) if request.query_params.get('from_due_date') else None,
            to_due_date=parse_date(request.query_params.get('to_due_date', '')) if request.query_params.get('to_due_date') else None,
            overdue_only=request.query_params.get('overdue_only') in ['true', '1', True],
            outstanding_only=request.query_params.get('outstanding_only') in ['true', '1', True],
            supplier_invoice_number=request.query_params.get('supplier_invoice_number'),
            bill_number=request.query_params.get('bill_number'),
            tanker_receipt_id=request.query_params.get('tanker_receipt_id'),
            product_id=request.query_params.get('product_id'),
            search=request.query_params.get('search')
        )
        return Response(PurchaseBillListSerializer(bills, many=True).data, status=status.HTTP_200_OK)

    def post(self, request, org_id, outlet_id):
        org, outlet = _get_org_and_outlet(org_id, outlet_id)
        require_permission(request.user, org, 'purchase_bill.create', outlet=outlet)

        serializer = PurchaseBillCreateUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        v_data = serializer.validated_data

        supplier = get_object_or_404(Supplier, id=v_data['supplier_id'], organisation=org)

        try:
            bill = create_purchase_bill(
                organisation=org,
                outlet=outlet,
                supplier=supplier,
                supplier_invoice_number=v_data['supplier_invoice_number'],
                invoice_date=v_data['invoice_date'],
                due_date=v_data['due_date'],
                lines_data=v_data['lines'],
                adjustments_data=v_data.get('adjustments', []),
                other_charges_data=v_data.get('other_charges', []),
                user=request.user,
                received_date=v_data.get('received_date'),
                bill_number=v_data.get('bill_number'),
                currency=v_data.get('currency', 'INR'),
                notes=v_data.get('notes'),
                calculation_version=v_data.get('calculation_version'),
                purchase_type=v_data.get('purchase_type', PurchaseBill.PURCHASE_TYPE_FUEL),
                tax_price_mode=v_data.get('tax_price_mode', PurchaseBill.TAX_MODE_EXCLUSIVE),
                discount_mode=v_data.get('discount_mode', PurchaseBill.DISCOUNT_MODE_LINE),
                transaction_discount_method=v_data.get('transaction_discount_method', PurchaseBill.DISCOUNT_METHOD_NONE),
                transaction_discount_amount=v_data.get('transaction_discount_amount', Decimal('0.00')),
                transaction_discount_percentage=v_data.get('transaction_discount_percentage'),
                is_place_of_supply_overridden=v_data.get('place_of_supply_override', False),
                place_of_supply_override_reason=v_data.get('place_of_supply_override_reason'),
                place_of_supply_state_code=v_data.get('place_of_supply_state_code'),
                is_duplicate_override=v_data.get('is_duplicate_override', False),
                conflicting_bill_id=v_data.get('conflicting_bill_id'),
                duplicate_override_reason=v_data.get('duplicate_override_reason'),
            )
            # Re-fetch full detail
            detail_bill = get_purchase_bill_detail(bill.id, org, outlet)
            return Response(PurchaseBillDetailSerializer(detail_bill).data, status=status.HTTP_201_CREATED)
        except DjangoValidationError as e:
            return _handle_validation_error(e)


class PurchaseBillDetailUpdateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id, outlet_id, bill_id):
        org, outlet = _get_org_and_outlet(org_id, outlet_id)
        require_permission(request.user, org, 'purchase_bill.view', outlet=outlet)

        bill = get_purchase_bill_detail(bill_id, org, outlet)
        if not bill:
            raise Http404("Purchase bill not found.")

        return Response(PurchaseBillDetailSerializer(bill).data, status=status.HTTP_200_OK)

    def put(self, request, org_id, outlet_id, bill_id):
        org, outlet = _get_org_and_outlet(org_id, outlet_id)
        require_permission(request.user, org, 'purchase_bill.update', outlet=outlet)

        # Validate existence
        get_object_or_404(PurchaseBill, id=bill_id, organisation=org, outlet=outlet)

        serializer = PurchaseBillCreateUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)

        try:
            bill = update_purchase_bill(
                bill_id=bill_id,
                user=request.user,
                data=serializer.validated_data
            )
            detail_bill = get_purchase_bill_detail(bill.id, org, outlet)
            return Response(PurchaseBillDetailSerializer(detail_bill).data, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            return _handle_validation_error(e)


class PurchaseBillVoidView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, org_id, outlet_id, bill_id):
        org, outlet = _get_org_and_outlet(org_id, outlet_id)
        require_permission(request.user, org, 'purchase_bill.void', outlet=outlet)

        get_object_or_404(PurchaseBill, id=bill_id, organisation=org, outlet=outlet)

        serializer = PurchaseBillVoidSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            bill = void_purchase_bill(
                bill_id=bill_id,
                user=request.user,
                void_reason=serializer.validated_data['void_reason']
            )
            detail_bill = get_purchase_bill_detail(bill.id, org, outlet)
            return Response(PurchaseBillDetailSerializer(detail_bill).data, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            return _handle_validation_error(e)


class AvailableTankerReceiptsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id, outlet_id):
        org, outlet = _get_org_and_outlet(org_id, outlet_id)
        require_permission(request.user, org, 'purchase_bill.view', outlet=outlet)

        supplier_id = request.query_params.get('supplier_id')
        receipts = get_available_tanker_receipts_for_billing(org, outlet, supplier_id=supplier_id)
        return Response(receipts, status=status.HTTP_200_OK)


class PurchaseBillAttachmentUploadView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, org_id, outlet_id, bill_id):
        org, outlet = _get_org_and_outlet(org_id, outlet_id)
        bill = get_object_or_404(PurchaseBill, id=bill_id, organisation=org, outlet=outlet)

        file = request.FILES.get('file')
        if not file:
            return Response({'detail': "No file provided."}, status=status.HTTP_400_BAD_REQUEST)

        attachment_type = request.data.get('attachment_type', PurchaseBillAttachment.TYPE_SUPPLIER_INVOICE)

        try:
            att = upload_bill_attachment(bill, file, attachment_type, request.user)
            return Response(PurchaseBillAttachmentSerializer(att).data, status=status.HTTP_201_CREATED)
        except DjangoValidationError as e:
            return _handle_validation_error(e)


class PurchaseBillAttachmentDownloadView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id, outlet_id, bill_id, att_id):
        org, outlet = _get_org_and_outlet(org_id, outlet_id)
        require_permission(request.user, org, 'purchase_bill.view', outlet=outlet)

        bill = get_object_or_404(PurchaseBill, id=bill_id, organisation=org, outlet=outlet)
        att = get_object_or_404(PurchaseBillAttachment, id=att_id, purchase_bill=bill)

        file_handle = att.file.open('rb')
        filename = os.path.basename(att.file.name)
        ext = os.path.splitext(filename)[1].lower()
        content_type = 'application/pdf' if ext == '.pdf' else ('image/png' if ext == '.png' else 'image/jpeg')

        response = FileResponse(file_handle, content_type=content_type)
        response['Content-Disposition'] = f'inline; filename="{att.file_name or filename}"'
        return response


class SupplierOutstandingSummaryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id, outlet_id):
        org, outlet = _get_org_and_outlet(org_id, outlet_id)
        require_permission(request.user, org, 'supplier_outstanding.view', outlet=outlet)

        summary = get_supplier_outstanding_summary(org, outlet)
        return Response(summary, status=status.HTTP_200_OK)


class SupplierOutstandingStatementView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id, outlet_id, supplier_id):
        org, outlet = _get_org_and_outlet(org_id, outlet_id)
        require_permission(request.user, org, 'supplier_outstanding.view', outlet=outlet)

        supplier = get_object_or_404(Supplier, id=supplier_id, organisation=org)
        statement = get_supplier_statement(org, outlet, supplier)
        return Response(statement, status=status.HTTP_200_OK)


class PurchaseTaxCodeListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id):
        org = _get_org(org_id)
        require_permission(request.user, org, 'purchase_tax_code.view')
        active_only = request.query_params.get('active_only', 'false').lower() == 'true'
        tax_regime = request.query_params.get('tax_regime') or request.query_params.get('tax_type')
        codes = list_purchase_tax_codes(org, active_only=active_only, tax_regime=tax_regime)
        return Response(PurchaseTaxCodeSerializer(codes, many=True).data, status=status.HTTP_200_OK)

    def post(self, request, org_id):
        org = _get_org(org_id)
        require_permission(request.user, org, 'purchase_tax_code.manage')
        serializer = PurchaseTaxCodeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            code = create_purchase_tax_code(
                organisation=org,
                code=data['code'],
                name=data.get('name', data['code']),
                tax_regime=data.get('tax_regime', PurchaseTaxCode.REGIME_GST),
                description=data.get('description'),
                is_active=data.get('is_active', True)
            )
            detail = get_purchase_tax_code_detail(code.id, org)
            return Response(PurchaseTaxCodeSerializer(detail).data, status=status.HTTP_201_CREATED)
        except DjangoValidationError as e:
            return _handle_validation_error(e)


class PurchaseTaxCodeDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id, code_id):
        org = _get_org(org_id)
        require_permission(request.user, org, 'purchase_tax_code.view')
        code = get_purchase_tax_code_detail(code_id, org)
        if not code:
            raise Http404("Purchase tax code not found.")
        return Response(PurchaseTaxCodeSerializer(code).data, status=status.HTTP_200_OK)

    def put(self, request, org_id, code_id):
        org = _get_org(org_id)
        require_permission(request.user, org, 'purchase_tax_code.manage')
        code = get_purchase_tax_code_detail(code_id, org)
        if not code:
            raise Http404("Purchase tax code not found.")

        serializer = PurchaseTaxCodeSerializer(code, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)

        try:
            updated = update_purchase_tax_code(code, **serializer.validated_data)
            detail = get_purchase_tax_code_detail(updated.id, org)
            return Response(PurchaseTaxCodeSerializer(detail).data, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            return _handle_validation_error(e)


class PurchaseTaxCodeRateCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, org_id, code_id):
        org = _get_org(org_id)
        require_permission(request.user, org, 'purchase_tax_code.manage')
        code = get_purchase_tax_code_detail(code_id, org)
        if not code:
            raise Http404("Purchase tax code not found.")

        components_data = request.data.get('components', [])
        effective_from = request.data.get('effective_from')
        effective_to = request.data.get('effective_to')
        gst_rate = Decimal(str(request.data.get('gst_rate', '0.00')))
        cess_rate = Decimal(str(request.data.get('cess_rate', '0.00')))
        cess_per_unit = Decimal(str(request.data.get('cess_per_unit', '0.0000')))
        notes = request.data.get('notes')

        try:
            rate = create_purchase_tax_code_rate(
                tax_code=code,
                effective_from=effective_from,
                effective_to=effective_to,
                gst_rate=gst_rate,
                cess_rate=cess_rate,
                cess_per_unit=cess_per_unit,
                notes=notes,
                components_data=components_data
            )
            return Response(PurchaseTaxCodeRateSerializer(rate).data, status=status.HTTP_201_CREATED)
        except DjangoValidationError as e:
            return _handle_validation_error(e)


class PurchaseTaxCodeRateUpdateView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, org_id, code_id, rate_id):
        org = _get_org(org_id)
        require_permission(request.user, org, 'purchase_tax_code.manage')
        get_object_or_404(PurchaseTaxCode, id=code_id, organisation=org)

        try:
            updated = update_purchase_tax_code_rate(rate_id, org, request.data)
            return Response(PurchaseTaxCodeRateSerializer(updated).data, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            return _handle_validation_error(e)

    def delete(self, request, org_id, code_id, rate_id):
        org = _get_org(org_id)
        require_permission(request.user, org, 'purchase_tax_code.manage')
        get_object_or_404(PurchaseTaxCode, id=code_id, organisation=org)
        rate = get_object_or_404(PurchaseTaxCodeRate, id=rate_id, tax_code_id=code_id)

        try:
            rate.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except DjangoValidationError as e:
            return _handle_validation_error(e)


class PurchaseItemListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id):
        org = _get_org(org_id)
        require_permission(request.user, org, 'purchase_bill.view')
        active_only = request.query_params.get('active_only', 'false').lower() == 'true'
        item_type = request.query_params.get('item_type')
        items = list_purchase_items(org, active_only=active_only, item_type=item_type)
        return Response(PurchaseItemSerializer(items, many=True).data, status=status.HTTP_200_OK)

    def post(self, request, org_id):
        org = _get_org(org_id)
        require_permission(request.user, org, 'purchase_bill.create')
        serializer = PurchaseItemSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            item = create_purchase_item(
                organisation=org,
                code=data['code'],
                name=data['name'],
                item_type=data.get('item_type', 'goods'),
                unit=data.get('unit', 'NOS'),
                hsn_sac=data.get('hsn_sac'),
                purchase_tax_treatment=data.get('purchase_tax_treatment', 'gst'),
                default_purchase_tax_code=data.get('default_purchase_tax_code'),
                default_itc_classification=data.get('default_itc_classification', 'pending_review'),
                is_active=data.get('is_active', True)
            )
            return Response(PurchaseItemSerializer(item).data, status=status.HTTP_201_CREATED)
        except DjangoValidationError as e:
            return _handle_validation_error(e)


class PurchaseItemDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id, item_id):
        org = _get_org(org_id)
        require_permission(request.user, org, 'purchase_bill.view')
        item = get_purchase_item_detail(item_id, org)
        if not item:
            raise Http404("Purchase item not found.")
        return Response(PurchaseItemSerializer(item).data, status=status.HTTP_200_OK)

    def put(self, request, org_id, item_id):
        org = _get_org(org_id)
        require_permission(request.user, org, 'purchase_bill.create')
        item = get_purchase_item_detail(item_id, org)
        if not item:
            raise Http404("Purchase item not found.")

        serializer = PurchaseItemSerializer(item, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)

        try:
            updated = update_purchase_item(item_id, org, **serializer.validated_data)
            return Response(PurchaseItemSerializer(updated).data, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            return _handle_validation_error(e)


class ProductPurchaseTaxMappingListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id):
        org = _get_org(org_id)
        require_permission(request.user, org, 'purchase_bill.view')
        mappings = list_product_tax_mappings(org)
        return Response(ProductPurchaseTaxMappingSerializer(mappings, many=True).data, status=status.HTTP_200_OK)

    def post(self, request, org_id):
        org = _get_org(org_id)
        require_permission(request.user, org, 'purchase_bill.create')
        fuel_product_id = request.data.get('fuel_product_id')
        purchase_item_id = request.data.get('purchase_item_id')
        fuel_product = get_object_or_404(FuelProduct, id=fuel_product_id, organisation=org) if fuel_product_id else None
        purchase_item = get_object_or_404(PurchaseItem, id=purchase_item_id, organisation=org) if purchase_item_id else None

        tax_code_id = request.data.get('purchase_tax_code_id')
        tax_code = get_object_or_404(PurchaseTaxCode, id=tax_code_id, organisation=org) if tax_code_id else None

        try:
            mapping = create_or_update_product_tax_mapping(
                organisation=org,
                fuel_product=fuel_product,
                purchase_item=purchase_item,
                purchase_tax_treatment=request.data.get('purchase_tax_treatment', 'non_gst_petroleum' if fuel_product else 'gst'),
                hsn_sac=request.data.get('hsn_sac'),
                purchase_tax_code=tax_code,
                default_itc_classification=request.data.get('default_itc_classification', 'not_applicable' if fuel_product else 'pending_review'),
                purchase_unit=request.data.get('purchase_unit', 'Litre' if fuel_product else 'NOS')
            )
            return Response(ProductPurchaseTaxMappingSerializer(mapping).data, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            return _handle_validation_error(e)


class PurchaseBillCalculatePreviewView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, org_id, outlet_id):
        org, outlet = _get_org_and_outlet(org_id, outlet_id)
        require_permission(request.user, org, 'purchase_bill.view', outlet=outlet)

        supplier_id = request.data.get('supplier_id')
        supplier = get_object_or_404(Supplier, id=supplier_id, organisation=org)

        invoice_date_raw = request.data.get('invoice_date')
        invoice_date = parse_date(invoice_date_raw) if invoice_date_raw else None
        if not invoice_date:
            return Response({'detail': "A valid invoice_date is required for calculation."}, status=status.HTTP_400_BAD_REQUEST)

        lines_data = request.data.get('lines', [])
        other_charges_data = request.data.get('other_charges', [])
        tax_price_mode = request.data.get('tax_price_mode', 'exclusive')
        discount_mode = request.data.get('discount_mode', 'line')
        tx_disc_method = request.data.get('transaction_discount_method', 'none')
        tx_disc_amt = Decimal(str(request.data.get('transaction_discount_amount', '0.00')))
        tx_disc_pct = Decimal(str(request.data.get('transaction_discount_percentage', '0.00'))) if request.data.get('transaction_discount_percentage') is not None else None
        pos_override = request.data.get('place_of_supply_override', False)
        pos_reason = request.data.get('place_of_supply_override_reason')
        pos_code = request.data.get('place_of_supply_state_code')
        round_off = Decimal(str(request.data.get('round_off_amount', '0.00')))

        try:
            calc_result = calculate_bill_totals_v2(
                organisation=org,
                outlet=outlet,
                supplier=supplier,
                invoice_date=invoice_date,
                lines_data=lines_data,
                other_charges_data=other_charges_data,
                tax_price_mode=tax_price_mode,
                discount_mode=discount_mode,
                transaction_discount_method=tx_disc_method,
                transaction_discount_amount=tx_disc_amt,
                transaction_discount_percentage=tx_disc_pct,
                is_place_of_supply_overridden=pos_override,
                place_of_supply_override_reason=pos_reason,
                place_of_supply_state_code=pos_code,
                round_off_amount=round_off,
            )

            def _convert_decimals(item):
                if isinstance(item, Decimal):
                    return str(item)
                if isinstance(item, dict):
                    return {k: _convert_decimals(v) for k, v in item.items()}
                if isinstance(item, list):
                    return [_convert_decimals(v) for v in item]
                if hasattr(item, 'id'):
                    return str(item.id)
                return item

            return Response(_convert_decimals(calc_result), status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            return _handle_validation_error(e)

