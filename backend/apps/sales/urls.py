from django.urls import path

from .views import CustomerOpenInvoicesView, CustomerOutstandingView, CustomerReceiptDetailView, CustomerReceiptListCreateView, CustomerReceiptVoidView, CustomerStatementView, SalesInvoiceDetailView, SalesInvoiceListCreateView, SalesInvoicePreparationView, SalesInvoiceVoidView, UnbilledCreditSlipsView

urlpatterns = [
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/sales-invoices/', SalesInvoiceListCreateView.as_view()),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/sales-invoices/prepare/', SalesInvoicePreparationView.as_view()),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/sales-invoices/<uuid:invoice_id>/', SalesInvoiceDetailView.as_view()),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/sales-invoices/<uuid:invoice_id>/void/', SalesInvoiceVoidView.as_view()),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/customers/<uuid:customer_id>/unbilled-credit-slips/', UnbilledCreditSlipsView.as_view()),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/customer-outstanding/', CustomerOutstandingView.as_view()),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/customers/<uuid:customer_id>/statement/', CustomerStatementView.as_view()),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/customers/<uuid:customer_id>/open-sales-invoices/', CustomerOpenInvoicesView.as_view()),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/customer-receipts/', CustomerReceiptListCreateView.as_view()),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/customer-receipts/<uuid:receipt_id>/', CustomerReceiptDetailView.as_view()),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/customer-receipts/<uuid:receipt_id>/void/', CustomerReceiptVoidView.as_view()),
]
