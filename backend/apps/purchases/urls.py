# apps/purchases/urls.py
from django.urls import path
from .views import (
    SupplierListCreateView, SupplierDetailView,
    TankerReceiptListCreateView, TankerReceiptDetailUpdateView,
    TankerReceiptConfirmView, TankerReceiptVoidView,
    TankerReceiptAttachmentUploadView, TankerReceiptAttachmentDownloadView,
    VarianceAcknowledgeView, DipConversionPreviewView,
    PurchaseBillListCreateView, PurchaseBillDetailUpdateView,
    PurchaseBillVoidView, AvailableTankerReceiptsView,
    PurchaseBillAttachmentUploadView, PurchaseBillAttachmentDownloadView,
    SupplierOutstandingSummaryView, SupplierOutstandingStatementView,
    PurchaseTaxCodeListCreateView, PurchaseTaxCodeDetailView,
    PurchaseTaxCodeRateCreateView, PurchaseTaxCodeRateUpdateView,
    PurchaseItemListCreateView, PurchaseItemDetailView,
    ProductPurchaseTaxMappingListCreateView,
    PurchaseBillCalculatePreviewView,
    TaxTreatmentListCreateView, TaxTreatmentDetailView,
    TaxTreatmentRateCreateView, TaxTreatmentRateUpdateView,
    TaxTreatmentDeactivateView, ItemTaxTreatmentListCreateView
)

urlpatterns = [
    # Suppliers (Organisation-scoped)
    path('<uuid:org_id>/suppliers/', SupplierListCreateView.as_view(), name='supplier_list_create'),
    path('<uuid:org_id>/suppliers/<uuid:supplier_id>/', SupplierDetailView.as_view(), name='supplier_detail'),

    # Tax Treatments (Settings - Organisation-scoped)
    path('<uuid:org_id>/tax-treatments/', TaxTreatmentListCreateView.as_view(), name='tax_treatment_list_create'),
    path('<uuid:org_id>/tax-treatments/<uuid:code_id>/', TaxTreatmentDetailView.as_view(), name='tax_treatment_detail'),
    path('<uuid:org_id>/tax-treatments/<uuid:code_id>/rates/', TaxTreatmentRateCreateView.as_view(), name='tax_treatment_rate_create'),
    path('<uuid:org_id>/tax-treatments/<uuid:code_id>/rates/<uuid:rate_id>/', TaxTreatmentRateUpdateView.as_view(), name='tax_treatment_rate_update'),
    path('<uuid:org_id>/tax-treatments/<uuid:code_id>/deactivate/', TaxTreatmentDeactivateView.as_view(), name='tax_treatment_deactivate'),

    # Item Tax Treatments Mapping (Organisation-scoped)
    path('<uuid:org_id>/items/<uuid:item_id>/tax-treatments/', ItemTaxTreatmentListCreateView.as_view(), name='item_tax_treatment_list_create'),

    # Legacy Purchase Tax Codes (Organisation-scoped backward-compatibility)
    path('<uuid:org_id>/purchase-tax-codes/', PurchaseTaxCodeListCreateView.as_view(), name='purchase_tax_code_list_create'),
    path('<uuid:org_id>/purchase-tax-codes/<uuid:code_id>/', PurchaseTaxCodeDetailView.as_view(), name='purchase_tax_code_detail'),
    path('<uuid:org_id>/purchase-tax-codes/<uuid:code_id>/rates/', PurchaseTaxCodeRateCreateView.as_view(), name='purchase_tax_code_rate_create'),
    path('<uuid:org_id>/purchase-tax-codes/<uuid:code_id>/rates/<uuid:rate_id>/', PurchaseTaxCodeRateUpdateView.as_view(), name='purchase_tax_code_rate_update'),

    # Purchase Items Master (Organisation-scoped)
    path('<uuid:org_id>/purchase-items/', PurchaseItemListCreateView.as_view(), name='purchase_item_list_create'),
    path('<uuid:org_id>/purchase-items/<uuid:item_id>/', PurchaseItemDetailView.as_view(), name='purchase_item_detail'),

    # Product Purchase Tax Mappings (Organisation-scoped)
    path('<uuid:org_id>/product-tax-mappings/', ProductPurchaseTaxMappingListCreateView.as_view(), name='product_tax_mapping_list_create'),

    # Tanker Receipts (Outlet-scoped)
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/tanker-receipts/', TankerReceiptListCreateView.as_view(), name='tanker_receipt_list_create'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/tanker-receipts/<uuid:receipt_id>/', TankerReceiptDetailUpdateView.as_view(), name='tanker_receipt_detail_update'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/tanker-receipts/<uuid:receipt_id>/confirm/', TankerReceiptConfirmView.as_view(), name='tanker_receipt_confirm'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/tanker-receipts/<uuid:receipt_id>/void/', TankerReceiptVoidView.as_view(), name='tanker_receipt_void'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/tanker-receipts/<uuid:receipt_id>/attachments/', TankerReceiptAttachmentUploadView.as_view(), name='tanker_receipt_attachment_upload'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/tanker-receipts/<uuid:receipt_id>/attachments/<uuid:att_id>/download/', TankerReceiptAttachmentDownloadView.as_view(), name='tanker_receipt_attachment_download'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/tanker-receipts/allocations/<uuid:alloc_id>/acknowledge-variance/', VarianceAcknowledgeView.as_view(), name='variance_acknowledge'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/tanker-receipts/preview-dip/', DipConversionPreviewView.as_view(), name='tanker_receipt_preview_dip'),

    # Purchase Bills (Outlet-scoped)
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/purchase-bills/', PurchaseBillListCreateView.as_view(), name='purchase_bill_list_create'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/purchase-bills/calculate-preview/', PurchaseBillCalculatePreviewView.as_view(), name='purchase_bill_calculate_preview'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/purchase-bills/available-tanker-receipts/', AvailableTankerReceiptsView.as_view(), name='purchase_bill_available_tanker_receipts'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/purchase-bills/<uuid:bill_id>/', PurchaseBillDetailUpdateView.as_view(), name='purchase_bill_detail_update'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/purchase-bills/<uuid:bill_id>/void/', PurchaseBillVoidView.as_view(), name='purchase_bill_void'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/purchase-bills/<uuid:bill_id>/attachments/', PurchaseBillAttachmentUploadView.as_view(), name='purchase_bill_attachment_upload'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/purchase-bills/<uuid:bill_id>/attachments/<uuid:att_id>/download/', PurchaseBillAttachmentDownloadView.as_view(), name='purchase_bill_attachment_download'),

    # Supplier Outstanding (Outlet-scoped)
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/supplier-outstanding/summary/', SupplierOutstandingSummaryView.as_view(), name='supplier_outstanding_summary'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/supplier-outstanding/suppliers/<uuid:supplier_id>/', SupplierOutstandingStatementView.as_view(), name='supplier_outstanding_statement'),
]


