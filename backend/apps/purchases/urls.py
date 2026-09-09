# apps/purchases/urls.py
from django.urls import path
from .views import (
    SupplierListCreateView, SupplierDetailView,
    TankerReceiptListCreateView, TankerReceiptDetailUpdateView,
    TankerReceiptConfirmView, TankerReceiptVoidView,
    TankerReceiptAttachmentUploadView, TankerReceiptAttachmentDownloadView,
    VarianceAcknowledgeView, DipConversionPreviewView
)

urlpatterns = [
    # Suppliers (Organisation-scoped)
    path('<uuid:org_id>/suppliers/', SupplierListCreateView.as_view(), name='supplier_list_create'),
    path('<uuid:org_id>/suppliers/<uuid:supplier_id>/', SupplierDetailView.as_view(), name='supplier_detail'),

    # Tanker Receipts (Outlet-scoped)
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/tanker-receipts/', TankerReceiptListCreateView.as_view(), name='tanker_receipt_list_create'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/tanker-receipts/<uuid:receipt_id>/', TankerReceiptDetailUpdateView.as_view(), name='tanker_receipt_detail_update'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/tanker-receipts/<uuid:receipt_id>/confirm/', TankerReceiptConfirmView.as_view(), name='tanker_receipt_confirm'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/tanker-receipts/<uuid:receipt_id>/void/', TankerReceiptVoidView.as_view(), name='tanker_receipt_void'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/tanker-receipts/<uuid:receipt_id>/attachments/', TankerReceiptAttachmentUploadView.as_view(), name='tanker_receipt_attachment_upload'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/tanker-receipts/<uuid:receipt_id>/attachments/<uuid:att_id>/download/', TankerReceiptAttachmentDownloadView.as_view(), name='tanker_receipt_attachment_download'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/tanker-receipts/allocations/<uuid:alloc_id>/acknowledge-variance/', VarianceAcknowledgeView.as_view(), name='variance_acknowledge'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/tanker-receipts/preview-dip/', DipConversionPreviewView.as_view(), name='tanker_receipt_preview_dip'),
]
