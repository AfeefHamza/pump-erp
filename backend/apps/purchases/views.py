# apps/purchases/views.py
import os
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
    TankerReceiptTankAllocation, TankerReceiptAttachment
)
from .serializers import (
    SupplierSerializer, TankerReceiptListSerializer,
    TankerReceiptDetailSerializer, TankerReceiptCreateUpdateSerializer,
    TankerReceiptVoidSerializer, VarianceAcknowledgeSerializer,
    DipConversionPreviewSerializer, TankerReceiptAttachmentSerializer
)
from .selectors import (
    list_suppliers, list_tanker_receipts, get_tanker_receipt_detail
)
from .services import (
    create_supplier, update_supplier, create_tanker_receipt,
    update_tanker_receipt, confirm_tanker_receipt, void_tanker_receipt,
    acknowledge_receipt_variance, upload_receipt_attachment,
    preview_dip_volume_for_tank
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
