# apps/purchases/serializers.py
import os
from decimal import Decimal
from rest_framework import serializers
from apps.forecourt.models import Tank, FuelProduct
from .models import (
    Supplier, TankerReceipt, TankerReceiptProductLine,
    TankerReceiptTankAllocation, TankerReceiptAttachment
)


class SupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = [
            'id', 'code', 'name', 'contact_person', 'phone',
            'email', 'tax_number', 'address', 'is_active', 'created_at'
        ]


class TankerReceiptAttachmentSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.SerializerMethodField()

    class Meta:
        model = TankerReceiptAttachment
        fields = [
            'id', 'attachment_type', 'file_name', 'file_size',
            'content_type', 'uploaded_at', 'uploaded_by_name'
        ]

    def get_uploaded_by_name(self, obj):
        return obj.uploaded_by.display_name if obj.uploaded_by else None


class TankerReceiptTankAllocationSerializer(serializers.ModelSerializer):
    tank_code = serializers.CharField(source='tank.code', read_only=True)
    tank_name = serializers.CharField(source='tank.name', read_only=True)
    tank_capacity = serializers.DecimalField(source='tank.capacity', max_digits=15, decimal_places=4, read_only=True)
    calibration_chart_name = serializers.CharField(source='calibration_chart.name', read_only=True, allow_null=True)
    variance_acknowledged_by_name = serializers.SerializerMethodField()

    class Meta:
        model = TankerReceiptTankAllocation
        fields = [
            'id', 'tank', 'tank_code', 'tank_name', 'tank_capacity',
            'allocated_book_quantity', 'pre_unloading_dip_height', 'pre_unloading_dip_unit',
            'pre_unloading_volume', 'post_unloading_dip_height', 'post_unloading_dip_unit',
            'post_unloading_volume', 'physical_dip_gain', 'variance',
            'calibration_chart', 'calibration_chart_name', 'conversion_method',
            'variance_status', 'variance_acknowledged_at', 'variance_acknowledged_by_name',
            'variance_acknowledgement_reason', 'notes'
        ]

    def get_variance_acknowledged_by_name(self, obj):
        return obj.variance_acknowledged_by.display_name if obj.variance_acknowledged_by else None


class TankerReceiptProductLineSerializer(serializers.ModelSerializer):
    product_code = serializers.CharField(source='product.code', read_only=True)
    product_name = serializers.CharField(source='product.name', read_only=True)
    allocations = TankerReceiptTankAllocationSerializer(many=True, read_only=True)

    class Meta:
        model = TankerReceiptProductLine
        fields = [
            'id', 'product', 'product_code', 'product_name',
            'invoice_quantity', 'accepted_book_quantity', 'unit_rate', 'total_value',
            'invoice_density', 'observed_density', 'observed_temperature',
            'quantity_override_reason', 'remarks', 'allocations'
        ]


class TankerReceiptListSerializer(serializers.ModelSerializer):
    supplier_name = serializers.CharField(source='supplier_name_snapshot', read_only=True)
    products_summary = serializers.SerializerMethodField()
    total_invoice_quantity = serializers.SerializerMethodField()
    total_accepted_quantity = serializers.SerializerMethodField()
    total_physical_dip_gain = serializers.SerializerMethodField()
    total_variance = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    confirmed_by_name = serializers.SerializerMethodField()
    voided_by_name = serializers.SerializerMethodField()

    class Meta:
        model = TankerReceipt
        fields = [
            'id', 'receipt_number', 'supplier', 'supplier_name', 'supplier_code_snapshot',
            'invoice_number', 'invoice_date', 'delivery_challan_number',
            'vehicle_registration', 'driver_name', 'unloading_start_time',
            'unloading_end_time', 'status', 'products_summary',
            'total_invoice_quantity', 'total_accepted_quantity',
            'total_physical_dip_gain', 'total_variance',
            'created_by_name', 'confirmed_by_name', 'voided_by_name',
            'confirmed_at', 'voided_at', 'created_at'
        ]

    def get_products_summary(self, obj):
        return [line.product.name for line in obj.product_lines.all()]

    def get_total_invoice_quantity(self, obj):
        return sum((line.invoice_quantity for line in obj.product_lines.all()), Decimal('0.0000'))

    def get_total_accepted_quantity(self, obj):
        return sum((line.accepted_book_quantity for line in obj.product_lines.all()), Decimal('0.0000'))

    def get_total_physical_dip_gain(self, obj):
        gains = [
            alloc.physical_dip_gain
            for line in obj.product_lines.all()
            for alloc in line.allocations.all()
            if alloc.physical_dip_gain is not None
        ]
        return sum(gains, Decimal('0.0000')) if gains else None

    def get_total_variance(self, obj):
        variances = [
            alloc.variance
            for line in obj.product_lines.all()
            for alloc in line.allocations.all()
            if alloc.variance is not None
        ]
        return sum(variances, Decimal('0.0000')) if variances else None

    def get_created_by_name(self, obj):
        return obj.created_by.display_name if obj.created_by else None

    def get_confirmed_by_name(self, obj):
        return obj.confirmed_by.display_name if obj.confirmed_by else None

    def get_voided_by_name(self, obj):
        return obj.voided_by.display_name if obj.voided_by else None


class TankerReceiptDetailSerializer(serializers.ModelSerializer):
    supplier_name = serializers.CharField(source='supplier_name_snapshot', read_only=True)
    product_lines = TankerReceiptProductLineSerializer(many=True, read_only=True)
    attachments = TankerReceiptAttachmentSerializer(many=True, read_only=True)
    created_by_name = serializers.SerializerMethodField()
    updated_by_name = serializers.SerializerMethodField()
    confirmed_by_name = serializers.SerializerMethodField()
    voided_by_name = serializers.SerializerMethodField()

    class Meta:
        model = TankerReceipt
        fields = [
            'id', 'receipt_number', 'supplier', 'supplier_name', 'supplier_code_snapshot',
            'invoice_number', 'invoice_date', 'delivery_challan_number',
            'vehicle_registration', 'driver_name', 'driver_phone', 'seal_details',
            'unloading_start_time', 'unloading_end_time', 'status', 'notes',
            'product_lines', 'attachments',
            'created_by_name', 'updated_by_name', 'confirmed_by_name', 'voided_by_name',
            'confirmed_at', 'voided_at', 'void_reason', 'created_at', 'updated_at'
        ]

    def get_created_by_name(self, obj):
        return obj.created_by.display_name if obj.created_by else None

    def get_updated_by_name(self, obj):
        return obj.updated_by.display_name if obj.updated_by else None

    def get_confirmed_by_name(self, obj):
        return obj.confirmed_by.display_name if obj.confirmed_by else None

    def get_voided_by_name(self, obj):
        return obj.voided_by.display_name if obj.voided_by else None


class TankAllocationInputSerializer(serializers.Serializer):
    tank_id = serializers.UUIDField()
    allocated_book_quantity = serializers.DecimalField(max_digits=15, decimal_places=4, min_value=Decimal('0.0001'))
    pre_unloading_dip_height = serializers.DecimalField(max_digits=12, decimal_places=4, required=False, allow_null=True)
    pre_unloading_dip_unit = serializers.ChoiceField(choices=['millimetre', 'centimetre', 'inch'], default='millimetre')
    post_unloading_dip_height = serializers.DecimalField(max_digits=12, decimal_places=4, required=False, allow_null=True)
    post_unloading_dip_unit = serializers.ChoiceField(choices=['millimetre', 'centimetre', 'inch'], default='millimetre')
    notes = serializers.CharField(required=False, allow_blank=True, allow_null=True)


class ProductLineInputSerializer(serializers.Serializer):
    product_id = serializers.UUIDField()
    invoice_quantity = serializers.DecimalField(max_digits=15, decimal_places=4, min_value=Decimal('0.0000'))
    accepted_book_quantity = serializers.DecimalField(max_digits=15, decimal_places=4, min_value=Decimal('0.0000'))
    unit_rate = serializers.DecimalField(max_digits=15, decimal_places=4, required=False, allow_null=True)
    invoice_density = serializers.DecimalField(max_digits=8, decimal_places=4, required=False, allow_null=True)
    observed_density = serializers.DecimalField(max_digits=8, decimal_places=4, required=False, allow_null=True)
    observed_temperature = serializers.DecimalField(max_digits=6, decimal_places=2, required=False, allow_null=True)
    quantity_override_reason = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    remarks = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    allocations = TankAllocationInputSerializer(many=True, required=False, default=list)


class TankerReceiptCreateUpdateSerializer(serializers.Serializer):
    receipt_number = serializers.CharField(max_length=100)
    supplier_id = serializers.UUIDField()
    invoice_number = serializers.CharField(max_length=100)
    invoice_date = serializers.DateField()
    delivery_challan_number = serializers.CharField(max_length=100, required=False, allow_blank=True, allow_null=True)
    vehicle_registration = serializers.CharField(max_length=100)
    driver_name = serializers.CharField(max_length=255, required=False, allow_blank=True, allow_null=True)
    driver_phone = serializers.CharField(max_length=50, required=False, allow_blank=True, allow_null=True)
    seal_details = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    unloading_start_time = serializers.DateTimeField(required=False, allow_null=True)
    unloading_end_time = serializers.DateTimeField()
    notes = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    product_lines = ProductLineInputSerializer(many=True, required=False, default=list)


class TankerReceiptVoidSerializer(serializers.Serializer):
    void_reason = serializers.CharField(min_length=5)


class VarianceAcknowledgeSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True)
    acknowledgement_reason = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        reason = (attrs.get('reason') or attrs.get('acknowledgement_reason') or '').strip()
        if len(reason) < 5:
            raise serializers.ValidationError({'reason': "A mandatory reason of at least 5 characters is required."})
        attrs['reason'] = reason
        return attrs


class DipConversionPreviewSerializer(serializers.Serializer):
    tank_id = serializers.UUIDField()
    measured_height = serializers.DecimalField(max_digits=12, decimal_places=4, min_value=Decimal('0.0000'))
    input_unit = serializers.ChoiceField(choices=['millimetre', 'centimetre', 'inch'], default='millimetre')
    measured_at = serializers.DateTimeField(required=False, allow_null=True)
