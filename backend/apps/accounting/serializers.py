from decimal import Decimal

from rest_framework import serializers

from .models import AccountingPeriodLock, ChartOfAccount, JournalEntry, JournalLine


class ChartOfAccountSerializer(serializers.ModelSerializer):
    parent_name = serializers.CharField(source='parent.name', read_only=True, allow_null=True)
    normal_balance = serializers.CharField(read_only=True)

    class Meta:
        model = ChartOfAccount
        fields = ['id', 'parent', 'parent_name', 'code', 'name', 'account_type', 'normal_balance', 'is_group', 'allow_manual_posting', 'system_key', 'description', 'display_order', 'is_active']


class ChartOfAccountInputSerializer(serializers.Serializer):
    parent_id = serializers.UUIDField(required=False, allow_null=True)
    code = serializers.CharField(max_length=30)
    name = serializers.CharField(max_length=150)
    account_type = serializers.ChoiceField(choices=ChartOfAccount.TYPE_CHOICES)
    is_group = serializers.BooleanField(required=False, default=False)
    allow_manual_posting = serializers.BooleanField(required=False, default=True)
    description = serializers.CharField(required=False, allow_blank=True)
    display_order = serializers.IntegerField(required=False, min_value=0, default=0)
    is_active = serializers.BooleanField(required=False, default=True)


class JournalLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = JournalLine
        fields = ['id', 'sequence', 'account', 'account_code_snapshot', 'account_name_snapshot', 'description', 'debit', 'credit', 'party_type', 'party_id', 'party_name_snapshot']


class JournalEntrySerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source='created_by.display_name', read_only=True, allow_null=True)
    reversal_entry_id = serializers.UUIDField(source='reversal_entry.id', read_only=True, allow_null=True)
    lines = JournalLineSerializer(many=True, read_only=True)

    class Meta:
        model = JournalEntry
        fields = ['id', 'journal_number', 'entry_date', 'source_type', 'source_id', 'reference', 'narration', 'total_debit', 'total_credit', 'status', 'reversal_of', 'reversal_entry_id', 'reversal_reason', 'created_by_name', 'created_at', 'lines']


class JournalLineInputSerializer(serializers.Serializer):
    account_id = serializers.UUIDField()
    description = serializers.CharField(required=False, allow_blank=True)
    debit = serializers.DecimalField(max_digits=18, decimal_places=2, min_value=Decimal('0.00'), required=False, default=Decimal('0.00'))
    credit = serializers.DecimalField(max_digits=18, decimal_places=2, min_value=Decimal('0.00'), required=False, default=Decimal('0.00'))
    party_type = serializers.CharField(required=False, allow_blank=True)
    party_id = serializers.UUIDField(required=False, allow_null=True)
    party_name = serializers.CharField(required=False, allow_blank=True)


class JournalEntryInputSerializer(serializers.Serializer):
    client_request_id = serializers.UUIDField(required=False, allow_null=True)
    entry_date = serializers.DateField()
    reference = serializers.CharField(required=False, allow_blank=True)
    narration = serializers.CharField(min_length=5)
    lines = JournalLineInputSerializer(many=True, allow_empty=False)


class JournalReverseSerializer(serializers.Serializer):
    reason = serializers.CharField(min_length=5)
    reversal_date = serializers.DateField(required=False)


class AccountingPeriodLockSerializer(serializers.ModelSerializer):
    outlet_name = serializers.CharField(source='outlet.name', read_only=True, allow_null=True)
    locked_by_name = serializers.CharField(source='locked_by.display_name', read_only=True, allow_null=True)

    class Meta:
        model = AccountingPeriodLock
        fields = ['id', 'outlet', 'outlet_name', 'month', 'reason', 'locked_by_name', 'locked_at', 'unlocked_at', 'unlock_reason', 'is_active']


class PeriodLockInputSerializer(serializers.Serializer):
    month = serializers.DateField()
    outlet_id = serializers.UUIDField(required=False, allow_null=True)
    reason = serializers.CharField(min_length=5)


class PeriodUnlockSerializer(serializers.Serializer):
    reason = serializers.CharField(min_length=5)
