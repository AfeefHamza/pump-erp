# apps/inventory/serializers_item.py
"""
Canonical Item Master Serializers.
Exposes clean Item Master, Unit, Conversion, and Profile models.
Zero imports from apps.purchases to ensure strict acyclic architecture.
"""
from datetime import date
from decimal import Decimal
from django.apps import apps
from django.db import models
from rest_framework import serializers

from .models import (
    UnitMaster, UnitConversion, Item,
    FuelItemProfile, StockItemProfile, ItemCodeAlias
)


class UnitMasterSerializer(serializers.ModelSerializer):
    class Meta:
        model = UnitMaster
        fields = ['id', 'code', 'name', 'symbol', 'is_active']
        read_only_fields = ['id']


class UnitConversionSerializer(serializers.ModelSerializer):
    from_unit_code = serializers.CharField(source='from_unit.code', read_only=True)
    from_unit_name = serializers.CharField(source='from_unit.name', read_only=True)
    to_unit_code = serializers.CharField(source='to_unit.code', read_only=True)
    to_unit_name = serializers.CharField(source='to_unit.name', read_only=True)
    item_code = serializers.CharField(source='item.code', read_only=True, allow_null=True)
    item_name = serializers.CharField(source='item.name', read_only=True, allow_null=True)

    class Meta:
        model = UnitConversion
        fields = [
            'id', 'item', 'item_code', 'item_name',
            'from_unit', 'from_unit_code', 'from_unit_name',
            'to_unit', 'to_unit_code', 'to_unit_name',
            'multiplier', 'is_active'
        ]
        read_only_fields = ['id']


class FuelItemProfileSerializer(serializers.ModelSerializer):
    stock_unit_code = serializers.CharField(source='stock_unit.code', read_only=True, allow_null=True)

    class Meta:
        model = FuelItemProfile
        fields = [
            'id', 'fuel_category', 'custom_category_name', 'short_code',
            'stock_unit', 'stock_unit_code', 'density_std', 'density_min', 'density_max',
            'price_configuration_eligible', 'forecourt_display_order'
        ]
        read_only_fields = ['id']


class StockItemProfileSerializer(serializers.ModelSerializer):
    preferred_purchase_unit_code = serializers.CharField(source='preferred_purchase_unit.code', read_only=True, allow_null=True)
    sales_unit_code = serializers.CharField(source='sales_unit.code', read_only=True, allow_null=True)

    class Meta:
        model = StockItemProfile
        fields = [
            'id', 'brand', 'reorder_level',
            'preferred_purchase_unit', 'preferred_purchase_unit_code',
            'sales_unit', 'sales_unit_code', 'valuation_method'
        ]
        read_only_fields = ['id']


class ItemCodeAliasSerializer(serializers.ModelSerializer):
    class Meta:
        model = ItemCodeAlias
        fields = ['id', 'alias_code', 'source', 'is_conflict', 'notes', 'created_at']
        read_only_fields = ['id', 'created_at']


def _resolve_active_tax_treatment(item: Item, on_date: date = None):
    """
    Dynamically resolves active purchase tax treatment for an item
    via apps.get_model to avoid Python-level imports from apps.purchases.
    """
    try:
        ItemPurchaseTaxTreatment = apps.get_model('purchases', 'ItemPurchaseTaxTreatment')
        check_date = on_date or date.today()
        mapping = ItemPurchaseTaxTreatment.objects.filter(
            item=item,
            effective_from__lte=check_date,
        ).filter(
            models.Q(effective_to__isnull=True) | models.Q(effective_to__gte=check_date)
        ).select_related('tax_treatment').order_by('-effective_from').first()

        if mapping and mapping.tax_treatment:
            return {
                'tax_treatment_id': str(mapping.tax_treatment.id),
                'tax_treatment_code': mapping.tax_treatment.code,
                'tax_treatment_name': mapping.tax_treatment.name,
                'tax_regime': mapping.tax_treatment.tax_regime,
                'default_itc_classification': mapping.default_itc_classification,
                'effective_from': mapping.effective_from.isoformat(),
                'effective_to': mapping.effective_to.isoformat() if mapping.effective_to else None,
            }
    except Exception:
        pass
    return None


class ItemListSerializer(serializers.ModelSerializer):
    base_unit_code = serializers.CharField(source='base_unit.code', read_only=True)
    base_unit_name = serializers.CharField(source='base_unit.name', read_only=True)
    current_purchase_tax_treatment = serializers.SerializerMethodField()
    has_conflict = serializers.SerializerMethodField()

    class Meta:
        model = Item
        fields = [
            'id', 'code', 'name', 'short_name', 'item_type',
            'category', 'base_unit', 'base_unit_code', 'base_unit_name',
            'hsn_sac', 'barcode', 'is_purchasable', 'is_sellable',
            'inventory_tracking_mode', 'is_active', 'display_order',
            'current_purchase_tax_treatment', 'has_conflict', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_current_purchase_tax_treatment(self, obj):
        return _resolve_active_tax_treatment(obj)

    def get_has_conflict(self, obj):
        return obj.aliases.filter(is_conflict=True).exists()


class ItemDetailSerializer(ItemListSerializer):
    fuel_profile = FuelItemProfileSerializer(read_only=True)
    stock_profile = StockItemProfileSerializer(read_only=True)
    aliases = ItemCodeAliasSerializer(many=True, read_only=True)
    conversions = UnitConversionSerializer(source='unit_conversions', many=True, read_only=True)

    class Meta(ItemListSerializer.Meta):
        fields = ItemListSerializer.Meta.fields + [
            'description', 'fuel_profile', 'stock_profile',
            'aliases', 'conversions'
        ]


class ItemOptionSerializer(serializers.ModelSerializer):
    """
    Lightweight serializer for comboboxes and selection grids (e.g. Purchase Bill workspace).
    """
    base_unit_id = serializers.UUIDField(source='base_unit.id', read_only=True)
    base_unit_code = serializers.CharField(source='base_unit.code', read_only=True)
    base_unit_name = serializers.CharField(source='base_unit.name', read_only=True)
    current_purchase_tax_treatment = serializers.SerializerMethodField()

    class Meta:
        model = Item
        fields = [
            'id', 'code', 'name', 'short_name', 'item_type',
            'base_unit_id', 'base_unit_code', 'base_unit_name', 'hsn_sac', 'barcode',
            'is_purchasable', 'is_sellable', 'inventory_tracking_mode',
            'is_active', 'current_purchase_tax_treatment'
        ]

    def get_current_purchase_tax_treatment(self, obj):
        return _resolve_active_tax_treatment(obj)
