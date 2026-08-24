# apps/forecourt/serializers.py
from rest_framework import serializers
from .models import FuelProduct, ProductPrice, Tank, Dispenser, Nozzle

class FuelProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = FuelProduct
        fields = [
            'id', 'organisation', 'code', 'name', 'short_name', 
            'category', 'custom_category_name', 'unit', 'display_order', 
            'is_active', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'organisation', 'created_at', 'updated_at']

    def validate(self, attrs):
        category = attrs.get('category')
        custom_category_name = attrs.get('custom_category_name')
        
        # Check custom category constraint
        if category == FuelProduct.CATEGORY_OTHER and not custom_category_name:
            raise serializers.ValidationError({'custom_category_name': "Custom category name is required when category is 'other'."})
        
        return attrs


class ProductPriceSerializer(serializers.ModelSerializer):
    product_name = serializers.ReadOnlyField(source='product.name')
    product_code = serializers.ReadOnlyField(source='product.code')
    created_by_name = serializers.ReadOnlyField(source='created_by.display_name')

    class Meta:
        model = ProductPrice
        fields = [
            'id', 'organisation', 'outlet', 'product', 'product_name', 'product_code',
            'selling_price', 'effective_from', 'effective_to', 'created_by', 
            'created_by_name', 'created_at'
        ]
        read_only_fields = ['id', 'organisation', 'outlet', 'effective_to', 'created_by', 'created_at']

    def validate_selling_price(self, value):
        if value <= 0:
            raise serializers.ValidationError("Price must be greater than zero.")
        return value


class PriceEntryItemSerializer(serializers.Serializer):
    product_id = serializers.UUIDField()
    selling_price = serializers.DecimalField(max_digits=12, decimal_places=4)

    def validate_selling_price(self, value):
        if value <= 0:
            raise serializers.ValidationError("Price must be greater than zero.")
        return value


class BulkPriceEntrySerializer(serializers.Serializer):
    effective_from = serializers.DateTimeField(required=False, allow_null=True)
    prices = PriceEntryItemSerializer(many=True)


class TankSerializer(serializers.ModelSerializer):
    product_name = serializers.ReadOnlyField(source='product.name')
    product_code = serializers.ReadOnlyField(source='product.code')
    product_unit = serializers.ReadOnlyField(source='product.unit')

    class Meta:
        model = Tank
        fields = [
            'id', 'organisation', 'outlet', 'product', 'product_name', 'product_code', 'product_unit',
            'code', 'name', 'capacity', 'safe_fill_capacity', 'dead_stock_level', 'low_stock_threshold',
            'manufacturer', 'serial_number', 'commissioned_on', 'status', 'notes', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'organisation', 'outlet', 'created_at', 'updated_at']

    def validate(self, attrs):
        capacity = attrs.get('capacity')
        safe_fill_capacity = attrs.get('safe_fill_capacity')
        dead_stock_level = attrs.get('dead_stock_level')
        low_stock_threshold = attrs.get('low_stock_threshold')

        # Run model cleaning equivalent check
        if capacity is not None and capacity <= 0:
            raise serializers.ValidationError({'capacity': "Capacity must be greater than zero."})
        
        if safe_fill_capacity is not None and capacity is not None and safe_fill_capacity > capacity:
            raise serializers.ValidationError({'safe_fill_capacity': "Safe-fill capacity cannot exceed physical capacity."})
            
        if dead_stock_level is not None and capacity is not None and dead_stock_level > capacity:
            raise serializers.ValidationError({'dead_stock_level': "Dead-stock level cannot exceed capacity."})
            
        if low_stock_threshold is not None and capacity is not None and low_stock_threshold > capacity:
            raise serializers.ValidationError({'low_stock_threshold': "Low-stock threshold cannot exceed capacity."})

        return attrs


class DispenserSerializer(serializers.ModelSerializer):
    class Meta:
        model = Dispenser
        fields = [
            'id', 'organisation', 'outlet', 'code', 'name', 
            'manufacturer', 'model_number', 'serial_number', 'commissioned_on', 
            'status', 'notes', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'organisation', 'outlet', 'created_at', 'updated_at']


class NozzleSerializer(serializers.ModelSerializer):
    dispenser_name = serializers.ReadOnlyField(source='dispenser.name')
    dispenser_code = serializers.ReadOnlyField(source='dispenser.code')
    tank_name = serializers.ReadOnlyField(source='tank.name')
    tank_code = serializers.ReadOnlyField(source='tank.code')
    product_id = serializers.UUIDField(source='tank.product.id', read_only=True)
    product_name = serializers.ReadOnlyField(source='tank.product.name')
    product_category = serializers.ReadOnlyField(source='tank.product.category')

    class Meta:
        model = Nozzle
        fields = [
            'id', 'organisation', 'outlet', 'dispenser', 'dispenser_name', 'dispenser_code',
            'tank', 'tank_name', 'tank_code', 'product_id', 'product_name', 'product_category',
            'code', 'name', 'nozzle_number', 'status', 'notes', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'organisation', 'outlet', 'created_at', 'updated_at']
