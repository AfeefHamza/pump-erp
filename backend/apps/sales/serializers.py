from decimal import Decimal

from rest_framework import serializers

from .models import CustomerReceipt, CustomerReceiptAllocation, SalesInvoice, SalesInvoiceAuditLog, SalesInvoiceLine


class SalesInvoiceLineSerializer(serializers.ModelSerializer):
    credit_slip_number = serializers.CharField(source='credit_slip.slip_number', read_only=True, allow_null=True)

    class Meta:
        model = SalesInvoiceLine
        fields = ['id', 'sequence', 'source_type', 'item', 'credit_slip', 'credit_slip_number', 'item_code_snapshot', 'item_name_snapshot', 'item_type_snapshot', 'hsn_sac_snapshot', 'unit_snapshot', 'quantity', 'unit_price', 'gross_amount', 'discount_amount', 'tax_inclusive', 'tax_treatment', 'tax_treatment_name_snapshot', 'tax_regime_snapshot', 'tax_rate_snapshot', 'taxable_amount', 'tax_amount', 'tax_components_snapshot', 'line_total']


class SalesInvoiceAuditSerializer(serializers.ModelSerializer):
    actor_name = serializers.CharField(source='actor.display_name', read_only=True, allow_null=True)

    class Meta:
        model = SalesInvoiceAuditLog
        fields = ['id', 'event_type', 'actor_name', 'reason', 'metadata', 'created_at']


class SalesInvoiceSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source='customer_name_snapshot', read_only=True)
    payment_account_name = serializers.CharField(source='payment_account.name', read_only=True, allow_null=True)
    created_by_name = serializers.CharField(source='created_by.display_name', read_only=True, allow_null=True)
    payment_status = serializers.SerializerMethodField()
    lines = SalesInvoiceLineSerializer(many=True, read_only=True)
    audit_logs = SalesInvoiceAuditSerializer(many=True, read_only=True)
    accounting_journal_id = serializers.SerializerMethodField()

    class Meta:
        model = SalesInvoice
        fields = ['id', 'organisation', 'outlet', 'customer', 'customer_name', 'customer_code_snapshot', 'customer_gstin_snapshot', 'billing_address_snapshot', 'invoice_number', 'invoice_date', 'due_date', 'invoice_type', 'place_of_supply_state_code', 'is_interstate', 'payment_account', 'payment_account_name', 'payment_method', 'payment_reference', 'subtotal', 'discount_total', 'taxable_total', 'tax_total', 'grand_total', 'amount_paid', 'outstanding_amount', 'payment_status', 'notes', 'status', 'accounting_journal_id', 'created_by_name', 'created_at', 'voided_at', 'void_reason', 'lines', 'audit_logs']

    def get_accounting_journal_id(self, obj):
        from apps.accounting.posting import journal_id_for_source
        return journal_id_for_source(obj.organisation_id, obj.outlet_id, 'sales_invoice', obj.id)

    def get_payment_status(self, obj):
        if obj.status == SalesInvoice.STATUS_VOIDED:
            return 'voided'
        if obj.outstanding_amount <= Decimal('0.00'):
            return 'paid'
        return 'partially_paid' if obj.amount_paid > 0 else 'unpaid'


class SalesInvoiceLineInputSerializer(serializers.Serializer):
    item_id = serializers.UUIDField(required=False)
    credit_slip_id = serializers.UUIDField(required=False)
    quantity = serializers.DecimalField(max_digits=15, decimal_places=4, min_value=Decimal('0.0001'), required=False)
    unit_price = serializers.DecimalField(max_digits=15, decimal_places=4, min_value=Decimal('0.0000'), required=False)
    discount_amount = serializers.DecimalField(max_digits=15, decimal_places=2, min_value=Decimal('0.00'), required=False, default=Decimal('0.00'))
    tax_treatment_id = serializers.UUIDField(required=False, allow_null=True)
    tax_inclusive = serializers.BooleanField(required=False, default=False)

    def validate(self, data):
        if bool(data.get('item_id')) == bool(data.get('credit_slip_id')):
            raise serializers.ValidationError('Provide exactly one of item_id or credit_slip_id.')
        if data.get('item_id') and ('quantity' not in data or 'unit_price' not in data):
            raise serializers.ValidationError('Item lines require quantity and unit price.')
        return data


class SalesInvoiceInputSerializer(serializers.Serializer):
    client_request_id = serializers.UUIDField(required=False, allow_null=True)
    customer_id = serializers.UUIDField(required=False, allow_null=True)
    invoice_date = serializers.DateField()
    due_date = serializers.DateField(required=False, allow_null=True)
    invoice_type = serializers.ChoiceField(choices=SalesInvoice.TYPE_CHOICES)
    payment_account_id = serializers.UUIDField(required=False, allow_null=True)
    payment_method = serializers.ChoiceField(choices=SalesInvoice.METHOD_CHOICES, required=False, allow_blank=True)
    payment_reference = serializers.CharField(required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True)
    lines = SalesInvoiceLineInputSerializer(many=True, allow_empty=False)


class VoidSalesInvoiceSerializer(serializers.Serializer):
    void_reason = serializers.CharField(min_length=5)


class CustomerReceiptAllocationSerializer(serializers.ModelSerializer):
    invoice_number = serializers.CharField(source='sales_invoice.invoice_number', read_only=True)

    class Meta:
        model = CustomerReceiptAllocation
        fields = ['id', 'sales_invoice', 'invoice_number', 'amount']


class CustomerReceiptSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source='customer_name_snapshot', read_only=True)
    payment_account_name = serializers.CharField(source='payment_account.name', read_only=True)
    allocations = CustomerReceiptAllocationSerializer(many=True, read_only=True)
    accounting_journal_id = serializers.SerializerMethodField()

    class Meta:
        model = CustomerReceipt
        fields = ['id', 'customer', 'customer_name', 'customer_code_snapshot', 'receipt_number', 'receipt_date', 'amount', 'payment_account', 'payment_account_name', 'payment_method', 'reference_number', 'notes', 'unallocated_amount', 'status', 'accounting_journal_id', 'created_at', 'voided_at', 'void_reason', 'allocations']

    def get_accounting_journal_id(self, obj):
        from apps.accounting.posting import journal_id_for_source
        return journal_id_for_source(obj.organisation_id, obj.outlet_id, 'customer_receipt', obj.id)


class CustomerReceiptAllocationInputSerializer(serializers.Serializer):
    sales_invoice_id = serializers.UUIDField()
    amount = serializers.DecimalField(max_digits=15, decimal_places=2, min_value=Decimal('0.01'))


class CustomerReceiptInputSerializer(serializers.Serializer):
    client_request_id = serializers.UUIDField(required=False, allow_null=True)
    customer_id = serializers.UUIDField()
    receipt_date = serializers.DateField()
    amount = serializers.DecimalField(max_digits=15, decimal_places=2, min_value=Decimal('0.01'))
    payment_account_id = serializers.UUIDField()
    payment_method = serializers.ChoiceField(choices=SalesInvoice.METHOD_CHOICES)
    reference_number = serializers.CharField(required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True)
    allocations = CustomerReceiptAllocationInputSerializer(many=True, required=False, default=list)
