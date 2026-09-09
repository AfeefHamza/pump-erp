# apps/purchases/admin.py
from django.contrib import admin
from .models import (
    Supplier, TankerReceipt, TankerReceiptProductLine,
    TankerReceiptTankAllocation, TankerReceiptAttachment
)

@admin.register(Supplier)
class SupplierAdmin(admin.ModelAdmin):
    list_display = ['name', 'code', 'organisation', 'contact_person', 'phone', 'is_active']
    search_fields = ['name', 'code']

class ProductLineInline(admin.TabularInline):
    model = TankerReceiptProductLine
    extra = 0

class TankAllocationInline(admin.TabularInline):
    model = TankerReceiptTankAllocation
    extra = 0

@admin.register(TankerReceipt)
class TankerReceiptAdmin(admin.ModelAdmin):
    list_display = ['receipt_number', 'supplier_name_snapshot', 'invoice_number', 'invoice_date', 'status', 'unloading_end_time']
    list_filter = ['status', 'invoice_date']
    search_fields = ['receipt_number', 'invoice_number', 'supplier_name_snapshot', 'vehicle_registration']
    inlines = [ProductLineInline]

@admin.register(TankerReceiptAttachment)
class TankerReceiptAttachmentAdmin(admin.ModelAdmin):
    list_display = ['file_name', 'receipt', 'attachment_type', 'file_size', 'uploaded_at']
