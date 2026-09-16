from decimal import Decimal

from rest_framework import serializers

from .models import (
    CashBankTransfer,
    DigitalSettlement,
    DigitalSettlementAllocation,
    Expense,
    ExpenseCategory,
    PaymentAccount,
    PaymentAccountMovement,
    SupplierPayment,
    SupplierPaymentAllocation,
    SupplierPaymentAuditLog,
)


class PaymentAccountSerializer(serializers.ModelSerializer):
    outlet_name = serializers.CharField(source='outlet.name', read_only=True, allow_null=True)
    current_balance = serializers.SerializerMethodField()
    movements = serializers.SerializerMethodField()
    ledger_account_code = serializers.CharField(source='ledger_account.code', read_only=True, allow_null=True)
    ledger_account_name = serializers.CharField(source='ledger_account.name', read_only=True, allow_null=True)

    class Meta:
        model = PaymentAccount
        fields = ['id', 'organisation', 'outlet', 'outlet_name', 'code', 'name', 'account_type', 'bank_name',
                  'account_number_last4', 'ifsc', 'opening_balance', 'opening_balance_date', 'current_balance',
                  'ledger_account', 'ledger_account_code', 'ledger_account_name', 'notes', 'display_order',
                  'is_active', 'movements', 'created_at', 'updated_at']
        read_only_fields = ['id', 'organisation', 'ledger_account', 'current_balance', 'created_at', 'updated_at']

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
    accounting_journal_id = serializers.SerializerMethodField()

    class Meta:
        model = SupplierPayment
        fields = ['id', 'organisation', 'outlet', 'supplier', 'supplier_name', 'supplier_code', 'payment_number',
                  'payment_date', 'amount', 'payment_account', 'payment_account_name', 'payment_method',
                  'reference_number', 'cheque_number', 'cheque_date', 'notes', 'allocated_amount',
                  'unallocated_amount', 'status', 'accounting_journal_id', 'created_by_name', 'created_at', 'voided_at', 'void_reason',
                  'allocations', 'account_movements', 'audit_logs']

    def get_allocated_amount(self, obj):
        return str((obj.amount - obj.unallocated_amount).quantize(Decimal('0.01')))

    def get_accounting_journal_id(self, obj):
        from apps.accounting.posting import journal_id_for_source
        return journal_id_for_source(obj.organisation_id, obj.outlet_id, 'supplier_payment', obj.id)


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


class ExpenseCategorySerializer(serializers.ModelSerializer):
    ledger_account_code = serializers.CharField(source='ledger_account.code', read_only=True)
    ledger_account_name = serializers.CharField(source='ledger_account.name', read_only=True)

    class Meta:
        model = ExpenseCategory
        fields = ['id', 'organisation', 'code', 'name', 'ledger_account', 'ledger_account_code',
                  'ledger_account_name', 'description', 'display_order', 'is_active', 'created_at', 'updated_at']
        read_only_fields = ['id', 'organisation', 'created_at', 'updated_at']


class ExpenseCategoryInputSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=50)
    name = serializers.CharField(max_length=150)
    ledger_account_id = serializers.UUIDField()
    description = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    display_order = serializers.IntegerField(required=False, min_value=0, default=0)
    is_active = serializers.BooleanField(required=False, default=True)


class ExpenseSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category_name_snapshot', read_only=True)
    payment_account_name = serializers.CharField(source='payment_account.name', read_only=True)
    payment_account_type = serializers.CharField(source='payment_account.account_type', read_only=True)
    created_by_name = serializers.CharField(source='created_by.display_name', read_only=True, allow_null=True)
    accounting_journal_id = serializers.SerializerMethodField()
    account_movements = serializers.SerializerMethodField()

    class Meta:
        model = Expense
        fields = ['id', 'organisation', 'outlet', 'expense_number', 'expense_date', 'category',
                  'category_name', 'category_code_snapshot', 'ledger_account', 'ledger_code_snapshot',
                  'ledger_name_snapshot', 'payment_account', 'payment_account_name', 'payment_account_type',
                  'payee', 'amount', 'reference_number', 'notes', 'attachment', 'status',
                  'accounting_journal_id', 'account_movements', 'created_by_name', 'created_at',
                  'voided_at', 'void_reason']

    def get_accounting_journal_id(self, obj):
        from apps.accounting.posting import journal_id_for_source
        return journal_id_for_source(obj.organisation_id, obj.outlet_id, 'expense', obj.id)

    def get_account_movements(self, obj):
        rows = PaymentAccountMovement.objects.filter(source_type='expense', source_id=obj.id).order_by('created_at')
        return PaymentAccountMovementSerializer(rows, many=True).data


class ExpenseInputSerializer(serializers.Serializer):
    client_request_id = serializers.UUIDField(required=False, allow_null=True)
    expense_date = serializers.DateField()
    category_id = serializers.UUIDField()
    payment_account_id = serializers.UUIDField()
    payee = serializers.CharField(required=False, allow_blank=True, allow_null=True, max_length=200)
    amount = serializers.DecimalField(max_digits=15, decimal_places=2, min_value=Decimal('0.01'))
    reference_number = serializers.CharField(required=False, allow_blank=True, allow_null=True, max_length=100)
    notes = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    attachment = serializers.FileField(required=False, allow_null=True)

    def validate_attachment(self, value):
        if not value:
            return value
        if value.size > 10 * 1024 * 1024:
            raise serializers.ValidationError('Attachment must be 10 MB or smaller.')
        allowed = {'application/pdf', 'image/jpeg', 'image/png', 'image/webp'}
        if getattr(value, 'content_type', None) not in allowed:
            raise serializers.ValidationError('Attach a PDF, JPG, PNG or WebP file.')
        return value


class CashBankTransferSerializer(serializers.ModelSerializer):
    from_account_name = serializers.CharField(source='from_account.name', read_only=True)
    to_account_name = serializers.CharField(source='to_account.name', read_only=True)
    transfer_type = serializers.CharField(read_only=True)
    created_by_name = serializers.CharField(source='created_by.display_name', read_only=True, allow_null=True)
    accounting_journal_id = serializers.SerializerMethodField()
    account_movements = serializers.SerializerMethodField()

    class Meta:
        model = CashBankTransfer
        fields = ['id', 'organisation', 'outlet', 'transfer_number', 'transfer_date', 'transfer_type',
                  'from_account', 'from_account_name', 'to_account', 'to_account_name', 'amount',
                  'reference_number', 'notes', 'status', 'accounting_journal_id', 'account_movements',
                  'created_by_name', 'created_at', 'voided_at', 'void_reason']

    def get_accounting_journal_id(self, obj):
        from apps.accounting.posting import journal_id_for_source
        return journal_id_for_source(obj.organisation_id, obj.outlet_id, 'cash_bank_transfer', obj.id)

    def get_account_movements(self, obj):
        rows = PaymentAccountMovement.objects.filter(
            source_type='cash_bank_transfer', source_id=obj.id,
        ).select_related('account').order_by('created_at')
        data = PaymentAccountMovementSerializer(rows, many=True).data
        for row, movement in zip(data, rows):
            row['account_name'] = movement.account.name
        return data


class CashBankTransferInputSerializer(serializers.Serializer):
    client_request_id = serializers.UUIDField(required=False, allow_null=True)
    transfer_date = serializers.DateField()
    from_account_id = serializers.UUIDField()
    to_account_id = serializers.UUIDField()
    amount = serializers.DecimalField(max_digits=15, decimal_places=2, min_value=Decimal('0.01'))
    reference_number = serializers.CharField(required=False, allow_blank=True, allow_null=True, max_length=100)
    notes = serializers.CharField(required=False, allow_blank=True, allow_null=True)


class PaymentAccountBookRowSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    effective_date = serializers.DateField()
    movement_type = serializers.CharField()
    description = serializers.CharField()
    source_type = serializers.CharField()
    source_id = serializers.UUIDField(allow_null=True)
    debit = serializers.DecimalField(max_digits=15, decimal_places=2)
    credit = serializers.DecimalField(max_digits=15, decimal_places=2)
    running_balance = serializers.DecimalField(max_digits=15, decimal_places=2)


class PendingDigitalCollectionSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    collection_method = serializers.CharField()
    amount = serializers.DecimalField(max_digits=15, decimal_places=2)
    occurred_at = serializers.DateTimeField()
    provider_name = serializers.CharField(allow_null=True)
    reference_number = serializers.CharField(allow_null=True)
    terminal_or_account_reference = serializers.CharField(allow_null=True)
    employee_name = serializers.CharField(source='employee.display_name')
    shift_id = serializers.UUIDField(source='operational_shift_id')
    shift_card_id = serializers.UUIDField(allow_null=True)


class DigitalSettlementAllocationSerializer(serializers.ModelSerializer):
    collection_method = serializers.CharField(source='collection.collection_method', read_only=True)
    provider_name = serializers.CharField(source='collection.provider_name', read_only=True, allow_null=True)

    class Meta:
        model = DigitalSettlementAllocation
        fields = ['id', 'collection', 'amount', 'employee_name_snapshot',
                  'collection_reference_snapshot', 'occurred_at_snapshot', 'collection_method', 'provider_name']


class DigitalSettlementSerializer(serializers.ModelSerializer):
    payment_account_name = serializers.CharField(source='payment_account.name', read_only=True)
    collection_method_display = serializers.CharField(source='get_collection_method_display', read_only=True)
    created_by_name = serializers.CharField(source='created_by.display_name', read_only=True, allow_null=True)
    allocations = DigitalSettlementAllocationSerializer(many=True, read_only=True)
    accounting_journal_id = serializers.SerializerMethodField()
    account_movements = serializers.SerializerMethodField()

    class Meta:
        model = DigitalSettlement
        fields = ['id', 'organisation', 'outlet', 'settlement_number', 'settlement_date',
                  'collection_method', 'collection_method_display', 'provider_name', 'batch_reference',
                  'payment_account', 'payment_account_name', 'gross_amount', 'charges_amount',
                  'tds_amount', 'net_amount', 'bank_reference', 'notes', 'status',
                  'accounting_basis',
                  'accounting_journal_id', 'account_movements', 'allocations', 'created_by_name',
                  'created_at', 'voided_at', 'void_reason']

    def get_accounting_journal_id(self, obj):
        from apps.accounting.posting import journal_id_for_source
        return journal_id_for_source(obj.organisation_id, obj.outlet_id, 'digital_settlement', obj.id)

    def get_account_movements(self, obj):
        rows = PaymentAccountMovement.objects.filter(
            source_type='digital_settlement', source_id=obj.id,
        ).order_by('created_at')
        return PaymentAccountMovementSerializer(rows, many=True).data


class DigitalSettlementInputSerializer(serializers.Serializer):
    client_request_id = serializers.UUIDField(required=False, allow_null=True)
    settlement_date = serializers.DateField()
    payment_account_id = serializers.UUIDField()
    collection_ids = serializers.ListField(child=serializers.UUIDField(), allow_empty=False)
    charges_amount = serializers.DecimalField(max_digits=15, decimal_places=2, min_value=Decimal('0.00'), required=False, default=Decimal('0.00'))
    tds_amount = serializers.DecimalField(max_digits=15, decimal_places=2, min_value=Decimal('0.00'), required=False, default=Decimal('0.00'))
    batch_reference = serializers.CharField(required=False, allow_blank=True, allow_null=True, max_length=100)
    bank_reference = serializers.CharField(max_length=100)
    notes = serializers.CharField(required=False, allow_blank=True, allow_null=True)
