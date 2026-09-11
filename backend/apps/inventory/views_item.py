# apps/inventory/views_item.py
"""
Canonical Item Master Views.
Organisation-scoped REST API endpoints for Items, Units, and Conversions.
Zero dependencies on apps.purchases to maintain strict acyclic architecture.
"""
from decimal import Decimal
from django.http import Http404
from django.shortcuts import get_object_or_404
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Q
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response

from apps.organizations.models import Organisation
from apps.organizations.permissions import require_permission, has_permission
from .models import UnitMaster, UnitConversion, Item
from .services_item import (
    create_canonical_item, update_canonical_item,
    deactivate_canonical_item, resolve_legacy_item,
    create_unit_master, create_unit_conversion
)
from .serializers_item import (
    UnitMasterSerializer, UnitConversionSerializer,
    ItemListSerializer, ItemDetailSerializer, ItemOptionSerializer
)


def _get_org(org_id):
    return get_object_or_404(Organisation, id=org_id)


def _handle_validation_error(exc):
    if hasattr(exc, 'message_dict'):
        formatted = []
        for field, msgs in exc.message_dict.items():
            f_name = field.replace('_', ' ').title() if field != '__all__' else ''
            m_str = ', '.join(str(m) for m in (msgs if isinstance(msgs, list) else [msgs]))
            formatted.append(f"{f_name}: {m_str}" if f_name else m_str)
        return Response({'detail': " | ".join(formatted), 'errors': exc.message_dict}, status=status.HTTP_400_BAD_REQUEST)
    return Response({'detail': str(exc.message if hasattr(exc, 'message') else exc)}, status=status.HTTP_400_BAD_REQUEST)


class ItemListCreateView(APIView):
    """
    GET /api/v1/organisations/<org_id>/items/
    POST /api/v1/organisations/<org_id>/items/
    """
    def get(self, request, org_id):
        org = _get_org(org_id)
        require_permission(request.user, org, 'item.view')

        qs = Item.objects.filter(organisation=org).select_related('base_unit').prefetch_related('aliases')

        # Filters
        item_type = request.query_params.get('item_type')
        if item_type:
            qs = qs.filter(item_type=item_type)

        active_param = request.query_params.get('is_active')
        if active_param is not None:
            qs = qs.filter(is_active=active_param.lower() == 'true')
        elif request.query_params.get('active_only', 'false').lower() == 'true':
            qs = qs.filter(is_active=True)

        category = request.query_params.get('category')
        if category:
            qs = qs.filter(category__iexact=category.strip())

        search = request.query_params.get('search')
        if search:
            search = search.strip()
            qs = qs.filter(
                Q(name__icontains=search) |
                Q(code__icontains=search) |
                Q(short_name__icontains=search) |
                Q(barcode__icontains=search) |
                Q(hsn_sac__icontains=search) |
                Q(aliases__alias_code__icontains=search)
            ).distinct()

        serializer = ItemListSerializer(qs, many=True)
        return Response(serializer.data)

    def post(self, request, org_id):
        org = _get_org(org_id)
        require_permission(request.user, org, 'item.create')
        data = request.data

        base_unit_id = data.get('base_unit') or data.get('base_unit_id')
        if not base_unit_id:
            return Response({'detail': "Base unit is required.", 'errors': {'base_unit': ["Base unit is required."]}}, status=status.HTTP_400_BAD_REQUEST)

        base_unit = get_object_or_404(UnitMaster, id=base_unit_id, organisation=org)

        try:
            item = create_canonical_item(
                organisation=org,
                code=data.get('code'),
                name=data.get('name'),
                item_type=data.get('item_type', Item.ITEM_TYPE_STOCK),
                base_unit=base_unit,
                short_name=data.get('short_name'),
                category=data.get('category'),
                description=data.get('description'),
                hsn_sac=data.get('hsn_sac'),
                barcode=data.get('barcode'),
                is_purchasable=data.get('is_purchasable', True),
                is_sellable=data.get('is_sellable', True),
                inventory_tracking_mode=data.get('inventory_tracking_mode'),
                is_active=data.get('is_active', True),
                display_order=data.get('display_order', 0),
                created_by=request.user,
                fuel_profile_data=data.get('fuel_profile'),
                stock_profile_data=data.get('stock_profile'),
                tax_treatment_id=data.get('tax_treatment_id'),
                default_itc_classification=data.get('default_itc_classification'),
                effective_from=data.get('tax_treatment_effective_from'),
            )
            return Response(ItemDetailSerializer(item).data, status=status.HTTP_201_CREATED)
        except DjangoValidationError as e:
            return _handle_validation_error(e)


class ItemDetailView(APIView):
    """
    GET /api/v1/organisations/<org_id>/items/<item_id>/
    PUT /api/v1/organisations/<org_id>/items/<item_id>/
    """
    def get(self, request, org_id, item_id):
        org = _get_org(org_id)
        require_permission(request.user, org, 'item.view')
        item = get_object_or_404(
            Item.objects.select_related('base_unit').prefetch_related('aliases', 'conversions_from'),
            id=item_id,
            organisation=org
        )
        return Response(ItemDetailSerializer(item).data)

    def put(self, request, org_id, item_id):
        org = _get_org(org_id)
        require_permission(request.user, org, 'item.update')
        item = get_object_or_404(Item, id=item_id, organisation=org)
        data = request.data.copy()

        if 'base_unit' in data or 'base_unit_id' in data:
            uid = data.get('base_unit') or data.get('base_unit_id')
            if uid:
                data['base_unit'] = get_object_or_404(UnitMaster, id=uid, organisation=org)

        try:
            updated = update_canonical_item(item, user=request.user, **data)
            return Response(ItemDetailSerializer(updated).data, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            return _handle_validation_error(e)


class ItemDeactivateView(APIView):
    """
    POST /api/v1/organisations/<org_id>/items/<item_id>/deactivate/
    """
    def post(self, request, org_id, item_id):
        org = _get_org(org_id)
        require_permission(request.user, org, 'item.deactivate')
        item = get_object_or_404(Item, id=item_id, organisation=org)
        updated = deactivate_canonical_item(item, user=request.user)
        return Response(ItemDetailSerializer(updated).data, status=status.HTTP_200_OK)


class ItemOptionsView(APIView):
    """
    GET /api/v1/organisations/<org_id>/items/options/
    Lightweight options selector for comboboxes across billing, inventory, forecourt.
    """
    def get(self, request, org_id):
        org = _get_org(org_id)
        # Allow item.view OR purchase_bill permissions for dropdown selection
        if not (
            has_permission(request.user, org, 'item.view') or
            has_permission(request.user, org, 'purchase_bill.view') or
            has_permission(request.user, org, 'purchase_bill.create')
        ):
            require_permission(request.user, org, 'item.view')

        qs = Item.objects.filter(organisation=org).select_related('base_unit')

        # Active-only by default for selectors
        include_inactive = request.query_params.get('include_inactive', 'false').lower() == 'true'
        if not include_inactive:
            qs = qs.filter(is_active=True)

        item_type = request.query_params.get('item_type')
        if item_type:
            qs = qs.filter(item_type=item_type)

        is_purchasable = request.query_params.get('is_purchasable')
        if is_purchasable is not None:
            qs = qs.filter(is_purchasable=is_purchasable.lower() == 'true')

        is_sellable = request.query_params.get('is_sellable')
        if is_sellable is not None:
            qs = qs.filter(is_sellable=is_sellable.lower() == 'true')

        search = request.query_params.get('search')
        if search:
            search = search.strip()
            qs = qs.filter(
                Q(name__icontains=search) |
                Q(code__icontains=search) |
                Q(short_name__icontains=search) |
                Q(barcode__icontains=search)
            )

        serializer = ItemOptionSerializer(qs[:100], many=True)
        return Response(serializer.data)


class ItemResolveLegacyView(APIView):
    """
    GET /api/v1/organisations/<org_id>/items/resolve-legacy/?identifier=<id_or_code>
    Resolves legacy ID/code aliases to canonical Item Master records.
    """
    def get(self, request, org_id):
        org = _get_org(org_id)
        identifier = request.query_params.get('identifier')
        if not identifier:
            return Response({'detail': "Identifier query parameter is required."}, status=status.HTTP_400_BAD_REQUEST)

        item = resolve_legacy_item(org, identifier)
        if not item:
            raise Http404("Item could not be resolved from legacy identifier.")

        return Response(ItemDetailSerializer(item).data)


class UnitMasterListCreateView(APIView):
    """
    GET /api/v1/organisations/<org_id>/units/
    POST /api/v1/organisations/<org_id>/units/
    """
    def get(self, request, org_id):
        org = _get_org(org_id)
        require_permission(request.user, org, 'item.view')
        active_only = request.query_params.get('active_only', 'false').lower() == 'true'
        qs = UnitMaster.objects.filter(organisation=org)
        if active_only:
            qs = qs.filter(is_active=True)
        return Response(UnitMasterSerializer(qs, many=True).data)

    def post(self, request, org_id):
        org = _get_org(org_id)
        require_permission(request.user, org, 'item.create')
        data = request.data
        try:
            unit = create_unit_master(
                organisation=org,
                code=data.get('code'),
                name=data.get('name'),
                symbol=data.get('symbol'),
                is_active=data.get('is_active', True)
            )
            return Response(UnitMasterSerializer(unit).data, status=status.HTTP_201_CREATED)
        except DjangoValidationError as e:
            return _handle_validation_error(e)


class UnitConversionListCreateView(APIView):
    """
    GET /api/v1/organisations/<org_id>/unit-conversions/
    POST /api/v1/organisations/<org_id>/unit-conversions/
    """
    def get(self, request, org_id):
        org = _get_org(org_id)
        require_permission(request.user, org, 'item.view')
        qs = UnitConversion.objects.filter(organisation=org).select_related('from_unit', 'to_unit', 'item')
        item_id = request.query_params.get('item_id')
        if item_id:
            qs = qs.filter(item_id=item_id)
        return Response(UnitConversionSerializer(qs, many=True).data)

    def post(self, request, org_id):
        org = _get_org(org_id)
        require_permission(request.user, org, 'item.create')
        data = request.data

        from_unit_id = data.get('from_unit') or data.get('from_unit_id')
        to_unit_id = data.get('to_unit') or data.get('to_unit_id')
        item_id = data.get('item') or data.get('item_id')

        from_unit = get_object_or_404(UnitMaster, id=from_unit_id, organisation=org)
        to_unit = get_object_or_404(UnitMaster, id=to_unit_id, organisation=org)
        item = get_object_or_404(Item, id=item_id, organisation=org) if item_id else None

        multiplier_val = data.get('multiplier')
        try:
            multiplier = Decimal(str(multiplier_val)) if multiplier_val is not None else Decimal('0')
        except Exception:
            return Response({'detail': "Invalid multiplier decimal value."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            conversion = create_unit_conversion(
                organisation=org,
                from_unit=from_unit,
                to_unit=to_unit,
                multiplier=multiplier,
                item=item,
                is_active=data.get('is_active', True)
            )
            return Response(UnitConversionSerializer(conversion).data, status=status.HTTP_201_CREATED)
        except DjangoValidationError as e:
            return _handle_validation_error(e)
