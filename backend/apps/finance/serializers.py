from decimal import Decimal

from rest_framework import serializers

from .models import PaymentAccount, PaymentAccountMovement, SupplierPayment, SupplierPaymentAllocation, SupplierPaymentAuditLog


class PaymentAccountSerializer(serializers.ModelSerializer):
    outlet_name = serializers.CharField(source='outlet.name', read_only=True, allow_null=True)
    current_balance = serializers.SerializerMethodField()
    movements = serializers.SerializerMethodField()

    class Meta:
        model = PaymentAccount
        fields = ['id', 'organisation', 'outlet', 'outlet_name', 'code', 'name', 'account_type', 'bank_name',
                  'account_number_last4', 'ifsc', 'opening_balance', 'opening_balance_date', 'current_balance',
                  'notes', 'display_order', 'is_active', 'movements', 'created_at', 'updated_at']
        read_only_fields = ['id', 'organisation', 'current_balance', 'created_at', 'updated_at']

    def get_current_balance(self, obj):
        return str(obj.current_balance)

    def get_movements(self, obj):
        return [
            {
                'id': str(row.id), 'effective_date': row.effective_date.isoformat(),
                'signed_amount': str(row.signed_amount), 'movement_type': row.movement_type,
                'description': row.description,
            }
            for row in obj.movements.order_by('-effective_date', '-created_at')[:50]
        ]


class PaymentAccountInputSerializer(serializers.Serializer):
    outlet_id = serializers.UUIDField(required=False, allow_null=True)
    code = serializers.CharField(max_length=50)
    name = serializers.CharField(max_length=150)
    account_type = serializers.ChoiceField(choices=PaymentAccount.TYPE_CHOICES)
    bank_name = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    account_number_last4 = serializers.CharField(required=False, allow_blank=True, allow_null=True, max_length=4)
    ifsc = serializers.CharField(required=False, allow_blank=True, allow_null=True, max_length=11)
    opening_balance = serializers.DecimalField(max_digits=15, decimal_places=2, required=False, default=Decimal('0.00'))
    opening_balance_date = serializers.DateField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    display_order = serializers.IntegerField(required=False, min_value=0, default=0)
    is_active = serializers.BooleanField(required=False, default=True)


class SupplierPaymentAllocationSerializer(serializers.ModelSerializer):
    bill_number = serializers.CharField(source='purchase_bill.bill_number', read_only=True)
    supplier_invoice_number = serializers.CharField(source='purchase_bill.supplier_invoice_number', read_only=True)
    invoice_date = serializers.DateField(source='purchase_bill.invoice_date', read_only=True)

    class Meta:
        model = SupplierPaymentAllocation
        fields = ['id', 'purchase_bill', 'bill_number', 'supplier_invoice_number', 'invoice_date', 'amount', 'created_at']


class PaymentAccountMovementSerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentAccountMovement
        fields = ['id', 'effective_date', 'signed_amount', 'movement_type', 'source_type', 'source_id', 'reversal_of', 'description', 'created_at']


class SupplierPaymentAuditSerializer(serializers.ModelSerializer):
    actor_name = serializers.CharField(source='actor.display_name', read_only=True, allow_null=True)

    class Meta:
        model = SupplierPaymentAuditLog
        fields = ['id', 'event_type', 'actor_name', 'reason', 'metadata', 'created_at']


class SupplierPaymentSerializer(serializers.ModelSerializer):
    supplier_name = serializers.CharField(source='supplier_name_snapshot', read_only=True)
    supplier_code = serializers.CharField(source='supplier_code_snapshot', read_only=True)
    payment_account_name = serializers.CharField(source='payment_account.name', read_only=True)
    created_by_name = serializers.CharField(source='created_by.display_name', read_only=True, allow_null=True)
    allocated_amount = serializers.SerializerMethodField()
    allocations = SupplierPaymentAllocationSerializer(many=True, read_only=True)
    account_movements = PaymentAccountMovementSerializer(many=True, read_only=True)
    audit_logs = SupplierPaymentAuditSerializer(many=True, read_only=True)

    class Meta:
        model = SupplierPayment
        fields = ['id', 'organisation', 'outlet', 'supplier', 'supplier_name', 'supplier_code', 'payment_number',
                  'payment_date', 'amount', 'payment_account', 'payment_account_name', 'payment_method',
                  'reference_number', 'cheque_number', 'cheque_date', 'notes', 'allocated_amount',
                  'unallocated_amount', 'status', 'created_by_name', 'created_at', 'voided_at', 'void_reason',
                  'allocations', 'account_movements', 'audit_logs']

    def get_allocated_amount(self, obj):
        return str((obj.amount - obj.unallocated_amount).quantize(Decimal('0.01')))


class AllocationInputSerializer(serializers.Serializer):
    purchase_bill_id = serializers.UUIDField()
    amount = serializers.DecimalField(max_digits=15, decimal_places=2, min_value=Decimal('0.01'))


class SupplierPaymentInputSerializer(serializers.Serializer):
    client_request_id = serializers.UUIDField(required=False, allow_null=True)
    supplier_id = serializers.UUIDField()
    payment_account_id = serializers.UUIDField()
    payment_date = serializers.DateField()
    amount = serializers.DecimalField(max_digits=15, decimal_places=2, min_value=Decimal('0.01'))
    payment_method = serializers.ChoiceField(choices=SupplierPayment.METHOD_CHOICES)
    reference_number = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    cheque_number = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    cheque_date = serializers.DateField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    allocations = AllocationInputSerializer(many=True, required=False, default=list)


class AddAllocationsSerializer(serializers.Serializer):
    allocations = AllocationInputSerializer(many=True, allow_empty=False)


class VoidPaymentSerializer(serializers.Serializer):
    void_reason = serializers.CharField(min_length=5)


class OpenPurchaseBillSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    bill_number = serializers.CharField()
    supplier_invoice_number = serializers.CharField()
    invoice_date = serializers.DateField()
    due_date = serializers.DateField()
    grand_total = serializers.DecimalField(max_digits=15, decimal_places=2)
    amount_paid = serializers.DecimalField(max_digits=15, decimal_places=2)
    outstanding_amount = serializers.DecimalField(max_digits=15, decimal_places=2)
    payment_status = serializers.SerializerMethodField()

    def get_payment_status(self, obj):
        if obj.outstanding_amount <= 0:
            return 'paid'
        return 'partially_paid' if obj.amount_paid > 0 else 'unpaid'
