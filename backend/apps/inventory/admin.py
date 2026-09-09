# apps/inventory/admin.py
from django.contrib import admin
from .models import TankStockMovement, TankStockBalanceProjection, StockAdjustment, StockAdjustmentAttachment

@admin.register(TankStockMovement)
class TankStockMovementAdmin(admin.ModelAdmin):
    list_display = ['effective_at', 'movement_type', 'direction', 'quantity', 'tank', 'source_type', 'idempotency_key']
    list_filter = ['movement_type', 'direction', 'effective_at']
    readonly_fields = [f.name for f in TankStockMovement._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

@admin.register(TankStockBalanceProjection)
class TankStockBalanceProjectionAdmin(admin.ModelAdmin):
    list_display = ['tank', 'current_book_stock', 'has_chronology_conflict', 'recalculated_at']
    readonly_fields = [f.name for f in TankStockBalanceProjection._meta.fields]

@admin.register(StockAdjustment)
class StockAdjustmentAdmin(admin.ModelAdmin):
    list_display = ['effective_at', 'tank', 'adjustment_type', 'quantity', 'reason_category', 'is_reversed']
    list_filter = ['adjustment_type', 'reason_category', 'is_reversed']

@admin.register(StockAdjustmentAttachment)
class StockAdjustmentAttachmentAdmin(admin.ModelAdmin):
    list_display = ['file_name', 'adjustment', 'file_size', 'uploaded_at']
