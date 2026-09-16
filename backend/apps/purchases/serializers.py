# apps/purchases/serializers.py
import os
from decimal import Decimal
from rest_framework import serializers
from apps.forecourt.models import Tank, FuelProduct
from apps.inventory.models import Item
from .models import (
    Supplier, TankerReceipt, TankerReceiptProductLine,
    TankerReceiptTankAllocation, TankerReceiptAttachment,
    PurchaseBill, PurchaseBillReceiptLink, PurchaseBillLine,
    PurchaseBillAdjustmentComponent, PurchaseBillAttachment,
    PurchaseBillAuditLog, PurchaseTaxCode, PurchaseTaxCodeRate,
    PurchaseTaxCodeComponent, PurchaseItem, ProductPurchaseTaxMapping,
    PurchaseBillOtherCharge, ItemPurchaseTaxTreatment
)


class SupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = [
            'id', 'code', 'name', 'contact_person', 'phone',
            'email', 'tax_number', 'gstin', 'gst_registration_type',
            'state', 'state_code', 'tax_treatment', 'address',
            'is_active', 'created_at'
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


# ============================================================================
# Milestone 12 & Tax V2: Purchase Bills, Items & Tax Code Serializers
# ============================================================================

class TaxTreatmentComponentSerializer(serializers.ModelSerializer):
    class Meta:
        model = PurchaseTaxCodeComponent
        fields = [
            'id', 'name', 'component_type', 'calculation_base',
            'calculation_type', 'rate_value', 'is_inclusive', 'sequence'
        ]


class TaxTreatmentRateSerializer(serializers.ModelSerializer):
    components = TaxTreatmentComponentSerializer(many=True, read_only=True)
    is_locked = serializers.BooleanField(read_only=True)

    class Meta:
        model = PurchaseTaxCodeRate
        fields = [
            'id', 'tax_code', 'effective_from', 'effective_to',
            'gst_rate', 'cess_rate', 'cess_per_unit', 'notes',
            'is_locked', 'components', 'created_at'
        ]


class TaxTreatmentSerializer(serializers.ModelSerializer):
    rates = TaxTreatmentRateSerializer(many=True, read_only=True)

    class Meta:
        model = PurchaseTaxCode
        fields = [
            'id', 'code', 'name', 'tax_regime', 'description',
            'is_purchase_applicable', 'is_sales_applicable', 'is_active',
            'rates', 'created_at', 'updated_at'
        ]

    def to_internal_value(self, data):
        data = data.copy()
        regime = data.get('tax_regime')
        if regime in ('petroleum', 'vat'):
            data['tax_regime'] = PurchaseTaxCode.REGIME_NON_GST_PETROLEUM
        return super().to_internal_value(data)


class ItemPurchaseTaxTreatmentSerializer(serializers.ModelSerializer):
    tax_treatment_code = serializers.CharField(source='tax_treatment.code', read_only=True)
    tax_treatment_name = serializers.CharField(source='tax_treatment.name', read_only=True)
    tax_regime = serializers.CharField(source='tax_treatment.tax_regime', read_only=True)
    item_code = serializers.CharField(source='item.code', read_only=True)
    item_name = serializers.CharField(source='item.name', read_only=True)

    class Meta:
        model = ItemPurchaseTaxTreatment
        fields = [
            'id', 'item', 'item_code', 'item_name',
            'tax_treatment', 'tax_treatment_code', 'tax_treatment_name', 'tax_regime',
            'default_itc_classification', 'effective_from', 'effective_to',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


# Backward-compatible serializer aliases
PurchaseTaxCodeComponentSerializer = TaxTreatmentComponentSerializer
PurchaseTaxCodeRateSerializer = TaxTreatmentRateSerializer
PurchaseTaxCodeSerializer = TaxTreatmentSerializer


class PurchaseItemSerializer(serializers.ModelSerializer):
    default_purchase_tax_code_code = serializers.CharField(source='default_purchase_tax_code.code', read_only=True, allow_null=True)

    class Meta:
        model = PurchaseItem
        fields = [
            'id', 'code', 'name', 'item_type', 'unit', 'hsn_sac',
            'purchase_tax_treatment', 'default_purchase_tax_code',
            'default_purchase_tax_code_code', 'default_itc_classification',
            'is_active', 'created_at', 'updated_at'
        ]


class ProductPurchaseTaxMappingSerializer(serializers.ModelSerializer):
    fuel_product_name = serializers.CharField(source='fuel_product.name', read_only=True, allow_null=True)
    fuel_product_code = serializers.CharField(source='fuel_product.code', read_only=True, allow_null=True)
    purchase_item_name = serializers.CharField(source='purchase_item.name', read_only=True, allow_null=True)
    purchase_item_code = serializers.CharField(source='purchase_item.code', read_only=True, allow_null=True)
    purchase_tax_code_code = serializers.CharField(source='purchase_tax_code.code', read_only=True, allow_null=True)

    class Meta:
        model = ProductPurchaseTaxMapping
        fields = [
            'id', 'fuel_product', 'fuel_product_name', 'fuel_product_code',
            'purchase_item', 'purchase_item_name', 'purchase_item_code',
            'purchase_tax_treatment', 'hsn_sac', 'purchase_tax_code',
            'purchase_tax_code_code', 'default_itc_classification',
            'purchase_unit', 'updated_at'
        ]


class PurchaseBillOtherChargeSerializer(serializers.ModelSerializer):
    tax_code_code = serializers.CharField(source='tax_code.code', read_only=True, allow_null=True)

    class Meta:
        model = PurchaseBillOtherCharge
        fields = [
            'id', 'charge_type', 'description', 'calculation_type',
            'percentage_rate', 'amount', 'tax_treatment', 'hsn_sac',
            'tax_code', 'tax_code_code', 'tax_code_rate_version',
            'gst_rate', 'cgst_amount', 'sgst_amount', 'igst_amount',
            'total_amount', 'sequence'
        ]


class PurchaseBillOtherChargeInputSerializer(serializers.Serializer):
    charge_type = serializers.ChoiceField(
        choices=PurchaseBillOtherCharge.CHARGE_CHOICES,
        default=PurchaseBillOtherCharge.CHARGE_FREIGHT
    )
    description = serializers.CharField(max_length=255)
    calculation_type = serializers.ChoiceField(
        choices=PurchaseBillOtherCharge.CALC_CHOICES,
        default=PurchaseBillOtherCharge.CALC_FIXED
    )
    percentage_rate = serializers.DecimalField(
        max_digits=5, decimal_places=2, required=False, allow_null=True
    )
    amount = serializers.DecimalField(
        max_digits=15, decimal_places=2, required=False, default=Decimal('0.00')
    )
    tax_treatment = serializers.ChoiceField(
        choices=PurchaseBillOtherCharge.TREATMENT_CHOICES,
        default=PurchaseBillOtherCharge.TREATMENT_TAXABLE
    )
    hsn_sac = serializers.CharField(max_length=20, required=False, allow_blank=True, allow_null=True)
    tax_code_id = serializers.UUIDField(required=False, allow_null=True)
    sequence = serializers.IntegerField(required=False, default=1)


class PurchaseBillReceiptLinkSerializer(serializers.ModelSerializer):
    tanker_receipt_number = serializers.CharField(source='tanker_receipt.receipt_number', read_only=True)
    product_name = serializers.CharField(source='receipt_product_line.product.name', read_only=True, allow_null=True)
    product_code = serializers.CharField(source='receipt_product_line.product.code', read_only=True, allow_null=True)

    class Meta:
        model = PurchaseBillReceiptLink
        fields = [
            'id', 'tanker_receipt', 'tanker_receipt_number',
            'receipt_product_line', 'product_name', 'product_code',
            'linked_quantity', 'linked_invoice_value', 'released_at', 'created_at'
        ]


class PurchaseBillLineSerializer(serializers.ModelSerializer):
    item_id = serializers.UUIDField(source='item.id', read_only=True, allow_null=True)
    item_name = serializers.CharField(source='item.name', read_only=True, allow_null=True)
    item_code = serializers.CharField(source='item.code', read_only=True, allow_null=True)
    product_name = serializers.CharField(source='product.name', read_only=True, allow_null=True)
    product_code = serializers.CharField(source='product.code', read_only=True, allow_null=True)
    purchase_item_name = serializers.CharField(source='purchase_item.name', read_only=True, allow_null=True)
    purchase_item_code = serializers.CharField(source='purchase_item.code', read_only=True, allow_null=True)
    tax_code_code = serializers.CharField(source='tax_code.code', read_only=True, allow_null=True)
    applied_transaction_discount = serializers.DecimalField(source='allocated_transaction_discount', max_digits=15, decimal_places=2, read_only=True)
    petroleum_tax_total = serializers.DecimalField(source='petroleum_tax_amount', max_digits=15, decimal_places=2, read_only=True)

    class Meta:
        model = PurchaseBillLine
        fields = [
            'id', 'line_number', 'receipt_link', 'line_type',
            'description', 'item', 'item_id', 'item_code', 'item_name',
            'product', 'product_code', 'product_name',
            'purchase_item', 'purchase_item_code', 'purchase_item_name',
            'product_code_snapshot', 'product_name_snapshot',
            'quantity', 'unit', 'unit_rate', 'gross_amount',
            'discount_method', 'discount_percentage', 'discount_amount',
            'allocated_transaction_discount', 'applied_transaction_discount', 'taxable_amount',
            'tax_treatment', 'tax_code', 'tax_code_code', 'tax_code_rate_version',
            'tax_code_snapshot', 'tax_treatment_id', 'tax_treatment_name', 'tax_regime',
            'effective_rate_version_id',
            'hsn_sac', 'gst_rate',
            'cgst_amount', 'sgst_amount', 'igst_amount',
            'cess_rate', 'cess_amount', 'petroleum_tax_amount', 'petroleum_tax_total',
            'is_petroleum_manual_override', 'petroleum_manual_override_reason',
            'itc_classification', 'line_total',
            'quantity_override_reason', 'notes'
        ]


class PurchaseBillAdjustmentComponentSerializer(serializers.ModelSerializer):
    class Meta:
        model = PurchaseBillAdjustmentComponent
        fields = [
            'id', 'label', 'component_type', 'calculation_type',
            'percentage_rate', 'calculated_amount', 'sequence', 'notes'
        ]


class PurchaseBillAttachmentSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.SerializerMethodField()

    class Meta:
        model = PurchaseBillAttachment
        fields = [
            'id', 'attachment_type', 'file_name', 'file_size',
            'content_type', 'uploaded_at', 'uploaded_by_name'
        ]

    def get_uploaded_by_name(self, obj):
        return obj.uploaded_by.display_name if obj.uploaded_by else None


class PurchaseBillAuditLogSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = PurchaseBillAuditLog
        fields = [
            'id', 'event_type', 'actor', 'actor_name', 'occurred_at',
            'changed_fields', 'previous_totals', 'new_totals', 'reason', 'metadata'
        ]

    def get_actor_name(self, obj):
        return obj.actor.display_name if obj.actor else None


class PurchaseBillListSerializer(serializers.ModelSerializer):
    supplier_name = serializers.CharField(source='supplier_name_snapshot', read_only=True)
    supplier_code = serializers.CharField(source='supplier_code_snapshot', read_only=True)
    is_overdue = serializers.SerializerMethodField()
    days_overdue = serializers.SerializerMethodField()
    linked_tanker_receipts = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    payment_status = serializers.SerializerMethodField()
    accounting_journal_id = serializers.SerializerMethodField()

    class Meta:
        model = PurchaseBill
        fields = [
            'id', 'bill_number', 'supplier', 'supplier_name', 'supplier_code',
            'supplier_invoice_number', 'invoice_date', 'received_date', 'due_date',
            'currency', 'calculation_version', 'purchase_type',
            'subtotal', 'discount_total', 'additional_charges_total',
            'tax_total', 'taxable_value_total', 'cgst_total', 'sgst_total',
            'igst_total', 'gst_cess_total', 'petroleum_tax_total',
            'other_charges_subtotal', 'other_charges_tax_total',
            'round_off_amount', 'grand_total', 'amount_paid',
            'outstanding_amount', 'payment_status', 'status', 'accounting_journal_id', 'is_overdue', 'days_overdue',
            'linked_tanker_receipts', 'created_by_name', 'created_at'
        ]

    def _get_today(self, obj):
        from apps.core.timezone_utils import to_outlet_business_date
        from django.utils import timezone
        return to_outlet_business_date(timezone.now(), outlet=obj.outlet, organisation=obj.organisation)

    def get_is_overdue(self, obj):
        if obj.status != PurchaseBill.STATUS_ACTIVE or obj.outstanding_amount <= Decimal('0.00'):
            return False
        today = self._get_today(obj)
        return obj.due_date < today

    def get_days_overdue(self, obj):
        if obj.status != PurchaseBill.STATUS_ACTIVE or obj.outstanding_amount <= Decimal('0.00'):
            return 0
        today = self._get_today(obj)
        diff = (today - obj.due_date).days
        return max(0, diff)

    def get_linked_tanker_receipts(self, obj):
        return list(set(link.tanker_receipt.receipt_number for link in obj.receipt_links.all()))

    def get_created_by_name(self, obj):
        return obj.created_by.display_name if obj.created_by else None

    def get_payment_status(self, obj):
        if obj.status == PurchaseBill.STATUS_VOIDED:
            return 'voided'
        if obj.outstanding_amount <= Decimal('0.00'):
            return 'paid'
        return 'partially_paid' if obj.amount_paid > Decimal('0.00') else 'unpaid'

    def get_accounting_journal_id(self, obj):
        from apps.accounting.posting import journal_id_for_source
        return journal_id_for_source(obj.organisation_id, obj.outlet_id, 'purchase_bill', obj.id)


class PurchaseBillDetailSerializer(serializers.ModelSerializer):
    supplier_name = serializers.CharField(source='supplier_name_snapshot', read_only=True)
    supplier_code = serializers.CharField(source='supplier_code_snapshot', read_only=True)
    lines = PurchaseBillLineSerializer(many=True, read_only=True)
    adjustments = PurchaseBillAdjustmentComponentSerializer(many=True, read_only=True)
    other_charges = PurchaseBillOtherChargeSerializer(many=True, read_only=True)
    receipt_links = PurchaseBillReceiptLinkSerializer(many=True, read_only=True)
    attachments = PurchaseBillAttachmentSerializer(many=True, read_only=True)
    audit_logs = PurchaseBillAuditLogSerializer(many=True, read_only=True)

    place_of_supply_override = serializers.BooleanField(source='is_place_of_supply_overridden', read_only=True)
    tax_override = serializers.SerializerMethodField()
    tax_override_reason = serializers.SerializerMethodField()
    is_overdue = serializers.SerializerMethodField()
    days_overdue = serializers.SerializerMethodField()
    linked_tanker_receipts = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    updated_by_name = serializers.SerializerMethodField()
    voided_by_name = serializers.SerializerMethodField()
    payment_status = serializers.SerializerMethodField()
    payment_allocations = serializers.SerializerMethodField()
    accounting_journal_id = serializers.SerializerMethodField()

    class Meta:
        model = PurchaseBill
        fields = [
            'id', 'bill_number', 'supplier', 'supplier_name', 'supplier_code',
            'supplier_invoice_number', 'normalized_supplier_invoice_number',
            'is_duplicate_override', 'duplicate_override_reason', 'conflicting_bill',
            'invoice_date', 'received_date', 'due_date', 'currency',
            'calculation_version', 'purchase_type', 'tax_price_mode', 'discount_mode',
            'transaction_discount_method', 'transaction_discount_amount', 'transaction_discount_percentage',
            'place_of_supply_state', 'place_of_supply_state_code', 'is_interstate',
            'place_of_supply_override', 'place_of_supply_override_reason',
            'tax_override', 'tax_override_reason',
            'subtotal', 'discount_total', 'additional_charges_total',
            'tax_total', 'taxable_value_total', 'cgst_total', 'sgst_total',
            'igst_total', 'gst_cess_total', 'petroleum_tax_total',
            'other_charges_subtotal', 'other_charges_tax_total',
            'round_off_amount', 'grand_total', 'amount_paid',
            'outstanding_amount', 'payment_status', 'payment_allocations', 'status', 'accounting_journal_id', 'is_overdue', 'days_overdue',
            'notes', 'created_by_name', 'updated_by_name', 'voided_by_name',
            'voided_at', 'void_reason', 'lines', 'adjustments', 'other_charges',
            'receipt_links', 'attachments', 'audit_logs',
            'linked_tanker_receipts', 'created_at', 'updated_at'
        ]

    def get_accounting_journal_id(self, obj):
        from apps.accounting.posting import journal_id_for_source
        return journal_id_for_source(obj.organisation_id, obj.outlet_id, 'purchase_bill', obj.id)

    def get_tax_override(self, obj):
        return any(bool(line.is_petroleum_manual_override) for line in obj.lines.all())

    def get_tax_override_reason(self, obj):
        for line in obj.lines.all():
            if line.petroleum_manual_override_reason:
                return line.petroleum_manual_override_reason
        return None

    def _get_today(self, obj):
        from apps.core.timezone_utils import to_outlet_business_date
        from django.utils import timezone
        return to_outlet_business_date(timezone.now(), outlet=obj.outlet, organisation=obj.organisation)

    def get_is_overdue(self, obj):
        if obj.status != PurchaseBill.STATUS_ACTIVE or obj.outstanding_amount <= Decimal('0.00'):
            return False
        today = self._get_today(obj)
        return obj.due_date < today

    def get_days_overdue(self, obj):
        if obj.status != PurchaseBill.STATUS_ACTIVE or obj.outstanding_amount <= Decimal('0.00'):
            return 0
        today = self._get_today(obj)
        diff = (today - obj.due_date).days
        return max(0, diff)

    def get_linked_tanker_receipts(self, obj):
        return list(set(link.tanker_receipt.receipt_number for link in obj.receipt_links.all()))

    def get_created_by_name(self, obj):
        return obj.created_by.display_name if obj.created_by else None

    def get_updated_by_name(self, obj):
        return obj.updated_by.display_name if obj.updated_by else None

    def get_voided_by_name(self, obj):
        return obj.voided_by.display_name if obj.voided_by else None

    def get_payment_status(self, obj):
        if obj.status == PurchaseBill.STATUS_VOIDED:
            return 'voided'
        if obj.outstanding_amount <= Decimal('0.00'):
            return 'paid'
        return 'partially_paid' if obj.amount_paid > Decimal('0.00') else 'unpaid'

    def get_payment_allocations(self, obj):
        return [
            {
                'payment_id': str(allocation.payment_id),
                'payment_number': allocation.payment.payment_number,
                'payment_date': allocation.payment.payment_date.isoformat(),
                'amount': str(allocation.amount),
            }
            for allocation in obj.payment_allocations.select_related('payment').filter(payment__status='active')
        ]


class PurchaseBillLineInputSerializer(serializers.Serializer):
    line_number = serializers.IntegerField(required=False, min_value=1)
    tanker_receipt_line_id = serializers.UUIDField(required=False, allow_null=True)
    line_type = serializers.ChoiceField(
        choices=[PurchaseBillLine.LINE_TYPE_FUEL, PurchaseBillLine.LINE_TYPE_OTHER],
        default=PurchaseBillLine.LINE_TYPE_FUEL
    )
    description = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    item_id = serializers.UUIDField(required=False, allow_null=True)
    product_id = serializers.UUIDField(required=False, allow_null=True)
    purchase_item_id = serializers.UUIDField(required=False, allow_null=True)
    quantity = serializers.DecimalField(max_digits=15, decimal_places=4, min_value=Decimal('0.0000'))
    unit = serializers.CharField(max_length=20, default='Litre')
    unit_rate = serializers.DecimalField(max_digits=15, decimal_places=4, min_value=Decimal('0.0000'))

    discount_method = serializers.ChoiceField(
        choices=['none', 'fixed_amount', 'percentage'],
        default='none',
        required=False
    )
    discount_amount = serializers.DecimalField(
        max_digits=15, decimal_places=2, min_value=Decimal('0.00'), required=False, default=Decimal('0.00')
    )
    discount_percentage = serializers.DecimalField(
        max_digits=5, decimal_places=2, min_value=Decimal('0.00'), required=False, allow_null=True, default=None
    )

    tax_treatment = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    tax_treatment_id = serializers.UUIDField(required=False, allow_null=True)
    tax_code_id = serializers.UUIDField(required=False, allow_null=True)
    hsn_sac = serializers.CharField(max_length=20, required=False, allow_blank=True, allow_null=True)
    itc_classification = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    manual_petroleum_tax_amount = serializers.DecimalField(
        max_digits=15, decimal_places=2, required=False, allow_null=True
    )

    quantity_override_reason = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    def validate(self, attrs):
        # Support tax_treatment_id as alternative to tax_code_id
        if attrs.get('tax_treatment_id') and not attrs.get('tax_code_id'):
            attrs['tax_code_id'] = attrs['tax_treatment_id']

        method = attrs.get('discount_method') or 'none'
        amt = attrs.get('discount_amount') or Decimal('0.00')
        pct = attrs.get('discount_percentage')

        if method == 'none' and amt > Decimal('0.00'):
            method = 'fixed_amount'
            attrs['discount_method'] = 'fixed_amount'

        if method == 'fixed_amount':
            if pct is not None and pct > Decimal('0.00'):
                raise serializers.ValidationError({'discount_percentage': "Discount percentage must be 0 when discount method is fixed amount."})
            attrs['discount_percentage'] = None
        elif method == 'percentage':
            if amt > Decimal('0.00'):
                raise serializers.ValidationError({'discount_amount': "Discount amount must be 0 when discount method is percentage."})
        elif method == 'none':
            if amt > Decimal('0.00') or (pct is not None and pct > Decimal('0.00')):
                raise serializers.ValidationError("Discount amount/percentage must be 0 when discount method is none.")
            attrs['discount_percentage'] = None
            attrs['discount_amount'] = Decimal('0.00')

        return attrs


class PurchaseBillAdjustmentInputSerializer(serializers.Serializer):
    label = serializers.CharField(max_length=100)
    component_type = serializers.ChoiceField(
        choices=[
            PurchaseBillAdjustmentComponent.TYPE_CHARGE,
            PurchaseBillAdjustmentComponent.TYPE_DISCOUNT,
            PurchaseBillAdjustmentComponent.TYPE_TAX,
            PurchaseBillAdjustmentComponent.TYPE_ROUND_OFF,
        ]
    )
    calculation_type = serializers.ChoiceField(
        choices=[
            PurchaseBillAdjustmentComponent.CALC_FIXED,
            PurchaseBillAdjustmentComponent.CALC_PERCENTAGE,
        ],
        default=PurchaseBillAdjustmentComponent.CALC_FIXED
    )
    percentage_rate = serializers.DecimalField(
        max_digits=7, decimal_places=4, required=False, allow_null=True
    )
    calculated_amount = serializers.DecimalField(
        max_digits=15, decimal_places=2, required=False, default=Decimal('0.00')
    )
    sequence = serializers.IntegerField(required=False, default=0)
    notes = serializers.CharField(required=False, allow_blank=True, allow_null=True)


class PurchaseBillCreateUpdateSerializer(serializers.Serializer):
    supplier_id = serializers.UUIDField()
    supplier_invoice_number = serializers.CharField(max_length=100)
    invoice_date = serializers.DateField()
    received_date = serializers.DateField(required=False, allow_null=True)
    due_date = serializers.DateField()
    bill_number = serializers.CharField(max_length=100, required=False, allow_blank=True, allow_null=True)
    currency = serializers.CharField(max_length=10, default='INR')
    notes = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    calculation_version = serializers.ChoiceField(
        choices=['legacy_v1', 'item_tax_v2'],
        default='item_tax_v2',
        required=False
    )
    purchase_type = serializers.ChoiceField(
        choices=['fuel', 'goods_services', 'mixed'],
        default='fuel',
        required=False
    )
    tax_price_mode = serializers.ChoiceField(
        choices=['exclusive', 'inclusive', 'tax_exclusive', 'tax_inclusive'],
        default='exclusive',
        required=False
    )
    discount_mode = serializers.ChoiceField(
        choices=['line', 'transaction', 'line_level', 'transaction_level'],
        default='line',
        required=False
    )
    transaction_discount_method = serializers.ChoiceField(
        choices=['none', 'fixed_amount', 'percentage'],
        default='none',
        required=False
    )
    transaction_discount_amount = serializers.DecimalField(
        max_digits=15, decimal_places=2, min_value=Decimal('0.00'), required=False, default=Decimal('0.00')
    )
    transaction_discount_percentage = serializers.DecimalField(
        max_digits=5, decimal_places=2, min_value=Decimal('0.00'), required=False, allow_null=True, default=None
    )

    place_of_supply_override = serializers.BooleanField(default=False, required=False)
    place_of_supply_state_code = serializers.CharField(max_length=2, required=False, allow_blank=True, allow_null=True)
    place_of_supply_override_reason = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    tax_override = serializers.BooleanField(default=False, required=False)
    tax_override_reason = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    is_duplicate_override = serializers.BooleanField(default=False)
    conflicting_bill_id = serializers.UUIDField(required=False, allow_null=True)
    duplicate_override_reason = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    lines = PurchaseBillLineInputSerializer(many=True)
    adjustments = PurchaseBillAdjustmentInputSerializer(many=True, required=False, default=list)
    other_charges = PurchaseBillOtherChargeInputSerializer(many=True, required=False, default=list)

    def validate(self, attrs):
        if attrs.get('due_date') and attrs.get('invoice_date'):
            if attrs['due_date'] < attrs['invoice_date']:
                raise serializers.ValidationError({'due_date': "Due date cannot precede invoice date."})

        # Normalize modes
        tax_mode = attrs.get('tax_price_mode', 'exclusive')
        if tax_mode in ('tax_exclusive', 'exclusive'):
            attrs['tax_price_mode'] = 'exclusive'
        elif tax_mode in ('tax_inclusive', 'inclusive'):
            attrs['tax_price_mode'] = 'inclusive'

        disc_mode = attrs.get('discount_mode', 'line')
        if disc_mode in ('line_level', 'line'):
            attrs['discount_mode'] = 'line'
        elif disc_mode in ('transaction_level', 'transaction'):
            attrs['discount_mode'] = 'transaction'

        # Discount exclusivity
        disc_method = attrs.get('transaction_discount_method') or 'none'
        disc_amt = attrs.get('transaction_discount_amount') or Decimal('0.00')
        disc_pct = attrs.get('transaction_discount_percentage')

        if disc_method == 'none' and disc_amt > Decimal('0.00'):
            disc_method = 'fixed_amount'
            attrs['transaction_discount_method'] = 'fixed_amount'

        if disc_method == 'fixed_amount':
            if disc_pct is not None and disc_pct > Decimal('0.00'):
                raise serializers.ValidationError({'transaction_discount_percentage': "Discount percentage must be 0 when transaction discount method is fixed amount."})
            attrs['transaction_discount_percentage'] = None
        elif disc_method == 'percentage':
            if disc_amt > Decimal('0.00'):
                raise serializers.ValidationError({'transaction_discount_amount': "Discount amount must be 0 when transaction discount method is percentage."})
        elif disc_method == 'none':
            if disc_amt > Decimal('0.00') or (disc_pct is not None and disc_pct > Decimal('0.00')):
                raise serializers.ValidationError("Transaction discount amount/percentage must be 0 when discount method is none.")
            attrs['transaction_discount_percentage'] = None
            attrs['transaction_discount_amount'] = Decimal('0.00')

        # POS override validation
        if attrs.get('place_of_supply_override'):
            if not attrs.get('place_of_supply_state_code'):
                raise serializers.ValidationError({'place_of_supply_state_code': "State code is required when place of supply is overridden."})
            pos_reason = (attrs.get('place_of_supply_override_reason') or '').strip()
            if len(pos_reason) < 5:
                raise serializers.ValidationError({'place_of_supply_override_reason': "A reason of at least 5 characters is required for place of supply override."})

        # Tax override validation
        if attrs.get('tax_override'):
            tax_reason = (attrs.get('tax_override_reason') or '').strip()
            if len(tax_reason) < 5:
                raise serializers.ValidationError({'tax_override_reason': "A reason of at least 5 characters is required for tax override."})

        if attrs.get('is_duplicate_override'):
            if not attrs.get('conflicting_bill_id'):
                raise serializers.ValidationError({'conflicting_bill_id': "You must provide the conflicting bill ID to override duplicate invoice protection."})
            reason = (attrs.get('duplicate_override_reason') or '').strip()
            if len(reason) < 5:
                raise serializers.ValidationError({'duplicate_override_reason': "A mandatory reason (at least 5 characters) is required to override duplicate invoice protection."})

        return attrs


class PurchaseBillVoidSerializer(serializers.Serializer):
    void_reason = serializers.CharField(min_length=5)
