# apps/inventory/serializers.py
import os
from decimal import Decimal
from rest_framework import serializers
from apps.forecourt.models import Tank
from .models import StockAdjustment, StockAdjustmentAttachment, TankStockMovement


class StockAdjustmentAttachmentSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.SerializerMethodField()

    class Meta:
        model = StockAdjustmentAttachment
        fields = ['id', 'file_name', 'file_size', 'content_type', 'uploaded_at', 'uploaded_by_name']

    def get_uploaded_by_name(self, obj):
        return obj.uploaded_by.display_name if obj.uploaded_by else None


class StockAdjustmentSerializer(serializers.ModelSerializer):
    tank_code = serializers.CharField(source='tank.code', read_only=True)
    tank_name = serializers.CharField(source='tank.name', read_only=True)
    product_name = serializers.CharField(source='tank.product.name', read_only=True)
    created_by_name = serializers.SerializerMethodField()
    reversed_by_name = serializers.SerializerMethodField()
    attachments = StockAdjustmentAttachmentSerializer(many=True, read_only=True)

    class Meta:
        model = StockAdjustment
        fields = [
            'id', 'tank', 'tank_code', 'tank_name', 'product_name',
            'adjustment_type', 'quantity', 'effective_at', 'reason_category',
            'explanation', 'is_reversed', 'reversed_at', 'reversal_reason',
            'created_by_name', 'reversed_by_name', 'attachments', 'created_at'
        ]

    def get_created_by_name(self, obj):
        return obj.created_by.display_name if obj.created_by else None

    def get_reversed_by_name(self, obj):
        return obj.reversed_by.display_name if obj.reversed_by else None


class StockAdjustmentCreateSerializer(serializers.Serializer):
    tank_id = serializers.UUIDField()
    adjustment_type = serializers.ChoiceField(choices=['increase', 'decrease'])
    quantity = serializers.DecimalField(max_digits=15, decimal_places=4, min_value=Decimal('0.0001'))
    effective_at = serializers.DateTimeField()
    reason_category = serializers.ChoiceField(choices=StockAdjustment.REASON_CHOICES)
    explanation = serializers.CharField(min_length=5)
    attachment = serializers.FileField(required=False, allow_null=True)

    def validate_attachment(self, value):
        if not value:
            return value
        if value.size > 5 * 1024 * 1024:
            raise serializers.ValidationError("Attachment exceeds maximum allowed size of 5MB.")
        ext = os.path.splitext(value.name)[1].lower()
        if ext not in ['.pdf', '.png', '.jpg', '.jpeg']:
            raise serializers.ValidationError(f"Unsupported file extension '{ext}'. Allowed: .pdf, .png, .jpg, .jpeg")
        if hasattr(value, 'content_type') and value.content_type:
            allowed_mime = ['application/pdf', 'image/png', 'image/jpeg', 'image/pjpeg']
            if value.content_type.lower() not in allowed_mime:
                raise serializers.ValidationError(f"Invalid MIME type '{value.content_type}'.")
        return value


class StockAdjustmentReverseSerializer(serializers.Serializer):
    reversal_reason = serializers.CharField(min_length=5)
