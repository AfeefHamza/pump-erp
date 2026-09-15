# apps/inventory/views.py
import os
from decimal import Decimal
from django.http import Http404, FileResponse
from django.shortcuts import get_object_or_404
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils.dateparse import parse_datetime
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

from apps.organizations.models import Organisation, Outlet
from apps.forecourt.models import Tank
from apps.organizations.permissions import require_permission, has_permission
from .models import StockAdjustment, StockAdjustmentAttachment, ItemStockAdjustment, Item
from .serializers import (
    StockAdjustmentSerializer, StockAdjustmentCreateSerializer,
    StockAdjustmentReverseSerializer, ItemStockAdjustmentInputSerializer,
    ItemStockAdjustmentSerializer
)
from .selectors import (
    get_tank_stock_summary, get_tank_movement_ledger,
    get_item_stock_summary, get_item_stock_ledger
)
from .services import (
    record_stock_adjustment, reverse_stock_adjustment,
    recalculate_tank_projection, create_item_stock_adjustment,
    reverse_item_stock_adjustment
)


def _get_org_and_outlet(org_id, outlet_id):
    org = get_object_or_404(Organisation, id=org_id)
    outlet = get_object_or_404(Outlet, id=outlet_id, organisation=org)
    return org, outlet


def _handle_validation_error(exc):
    if hasattr(exc, 'message_dict'):
        return Response({'detail': exc.message_dict}, status=status.HTTP_400_BAD_REQUEST)
    return Response({'detail': str(exc.message if hasattr(exc, 'message') else exc)}, status=status.HTTP_400_BAD_REQUEST)


class FuelStockSummaryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id, outlet_id):
        org, outlet = _get_org_and_outlet(org_id, outlet_id)
        require_permission(request.user, org, 'fuel_stock.view', outlet=outlet)

        summary = get_tank_stock_summary(org, outlet)
        return Response(summary, status=status.HTTP_200_OK)


class TankStockLedgerView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id, outlet_id, tank_id):
        org, outlet = _get_org_and_outlet(org_id, outlet_id)
        require_permission(request.user, org, 'fuel_stock.view', outlet=outlet)

        from_date_str = request.query_params.get('from_date')
        to_date_str = request.query_params.get('to_date')
        from_date = parse_datetime(from_date_str) if from_date_str else None
        to_date = parse_datetime(to_date_str) if to_date_str else None

        movement_type = request.query_params.get('movement_type')
        direction = request.query_params.get('direction')

        ledger = get_tank_movement_ledger(
            organisation=org,
            outlet=outlet,
            tank_id=tank_id,
            from_date=from_date,
            to_date=to_date,
            movement_type=movement_type,
            direction=direction
        )
        if 'error' in ledger:
            return Response(ledger, status=status.HTTP_404_NOT_FOUND)

        return Response(ledger, status=status.HTTP_200_OK)


class StockAdjustmentListCreateView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request, org_id, outlet_id):
        org, outlet = _get_org_and_outlet(org_id, outlet_id)
        require_permission(request.user, org, 'fuel_stock.view', outlet=outlet)

        adjustments = StockAdjustment.objects.filter(
            organisation=org,
            outlet=outlet
        ).select_related('tank', 'tank__product', 'created_by', 'reversed_by').prefetch_related('attachments')

        serializer = StockAdjustmentSerializer(adjustments, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request, org_id, outlet_id):
        org, outlet = _get_org_and_outlet(org_id, outlet_id)
        require_permission(request.user, org, 'fuel_stock.adjust', outlet=outlet)

        serializer = StockAdjustmentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        tank = get_object_or_404(Tank, id=data['tank_id'], organisation=org, outlet=outlet)

        attachment = request.FILES.get('attachment')

        try:
            adj = record_stock_adjustment(
                organisation=org,
                outlet=outlet,
                tank=tank,
                adjustment_type=data['adjustment_type'],
                quantity=data['quantity'],
                effective_at=data['effective_at'],
                reason_category=data['reason_category'],
                explanation=data['explanation'],
                user=request.user,
                attachment_file=attachment
            )
            return Response(StockAdjustmentSerializer(adj).data, status=status.HTTP_201_CREATED)
        except DjangoValidationError as e:
            return _handle_validation_error(e)


class StockAdjustmentReverseView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, org_id, outlet_id, adj_id):
        org, outlet = _get_org_and_outlet(org_id, outlet_id)
        require_permission(request.user, org, 'fuel_stock.adjust', outlet=outlet)

        adj = get_object_or_404(StockAdjustment, id=adj_id, organisation=org, outlet=outlet)

        serializer = StockAdjustmentReverseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            reversed_adj = reverse_stock_adjustment(
                adjustment=adj,
                user=request.user,
                reversal_reason=serializer.validated_data['reversal_reason']
            )
            return Response(StockAdjustmentSerializer(reversed_adj).data, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            return _handle_validation_error(e)


class StockAdjustmentAttachmentDownloadView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id, outlet_id, adj_id):
        org, outlet = _get_org_and_outlet(org_id, outlet_id)
        require_permission(request.user, org, 'fuel_stock.view', outlet=outlet)

        adj = get_object_or_404(StockAdjustment, id=adj_id, organisation=org, outlet=outlet)
        att = adj.attachments.first()
        if not att or not att.file:
            raise Http404("Attachment not found.")

        file_handle = att.file.open('rb')
        filename = os.path.basename(att.file.name)
        ext = os.path.splitext(filename)[1].lower()
        content_type = 'application/pdf' if ext == '.pdf' else ('image/png' if ext == '.png' else 'image/jpeg')

        response = FileResponse(file_handle, content_type=content_type)
        response['Content-Disposition'] = f'inline; filename="{att.file_name or filename}"'
        return response


class TankChronologyRecalculateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, org_id, outlet_id, tank_id):
        org, outlet = _get_org_and_outlet(org_id, outlet_id)
        require_permission(request.user, org, 'fuel_stock.adjust', outlet=outlet)

        tank = get_object_or_404(Tank, id=tank_id, organisation=org, outlet=outlet)
        projection = recalculate_tank_projection(tank)

        return Response({
            'message': f"Chronology recalculated for tank {tank.code}.",
            'current_book_stock': str(projection.current_book_stock),
            'has_chronology_conflict': projection.has_chronology_conflict,
            'has_negative_balance_history': projection.has_negative_balance_history,
            'recalculated_at': projection.recalculated_at
        }, status=status.HTTP_200_OK)


class ItemStockSummaryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id, outlet_id):
        org, outlet = _get_org_and_outlet(org_id, outlet_id)
        require_permission(request.user, org, 'item_stock.view', outlet=outlet)
        return Response(get_item_stock_summary(org, outlet, request.query_params.get('search')))


class ItemStockLedgerView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id, outlet_id, item_id):
        org, outlet = _get_org_and_outlet(org_id, outlet_id)
        require_permission(request.user, org, 'item_stock.view', outlet=outlet)
        item = get_object_or_404(Item, id=item_id, organisation=org)
        return Response(get_item_stock_ledger(org, outlet, item))


class ItemStockAdjustmentListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id, outlet_id):
        org, outlet = _get_org_and_outlet(org_id, outlet_id)
        require_permission(request.user, org, 'item_stock.view', outlet=outlet)
        rows = ItemStockAdjustment.objects.filter(organisation=org, outlet=outlet).select_related('item')[:100]
        return Response(ItemStockAdjustmentSerializer(rows, many=True).data)

    def post(self, request, org_id, outlet_id):
        org, outlet = _get_org_and_outlet(org_id, outlet_id)
        serializer = ItemStockAdjustmentInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        item = get_object_or_404(Item, id=data.pop('item_id'), organisation=org)
        try:
            adjustment = create_item_stock_adjustment(organisation=org, outlet=outlet, item=item, user=request.user, **data)
        except DjangoValidationError as exc:
            return _handle_validation_error(exc)
        return Response(ItemStockAdjustmentSerializer(adjustment).data, status=status.HTTP_201_CREATED)


class ItemStockAdjustmentReverseView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, org_id, outlet_id, adjustment_id):
        org, outlet = _get_org_and_outlet(org_id, outlet_id)
        adjustment = get_object_or_404(ItemStockAdjustment, id=adjustment_id, organisation=org, outlet=outlet)
        reason = request.data.get('reason', '')
        try:
            adjustment = reverse_item_stock_adjustment(adjustment, reason, request.user)
        except DjangoValidationError as exc:
            return _handle_validation_error(exc)
        return Response(ItemStockAdjustmentSerializer(adjustment).data)
