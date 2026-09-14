from django.urls import path

from .views import (
    PaymentAccountDeactivateView,
    PaymentAccountDetailView,
    PaymentAccountListCreateView,
    PaymentAccountOptionsView,
    SupplierOpenBillsView,
    SupplierPaymentAllocateView,
    SupplierPaymentDetailView,
    SupplierPaymentListCreateView,
    SupplierPaymentVoidView,
)

urlpatterns = [
    path('<uuid:org_id>/payment-accounts/', PaymentAccountListCreateView.as_view(), name='payment_account_list_create'),
    path('<uuid:org_id>/payment-accounts/<uuid:account_id>/', PaymentAccountDetailView.as_view(), name='payment_account_detail'),
    path('<uuid:org_id>/payment-accounts/<uuid:account_id>/deactivate/', PaymentAccountDeactivateView.as_view(), name='payment_account_deactivate'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/payment-accounts/options/', PaymentAccountOptionsView.as_view(), name='payment_account_options'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/supplier-payments/', SupplierPaymentListCreateView.as_view(), name='supplier_payment_list_create'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/supplier-payments/<uuid:payment_id>/', SupplierPaymentDetailView.as_view(), name='supplier_payment_detail'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/supplier-payments/<uuid:payment_id>/allocations/', SupplierPaymentAllocateView.as_view(), name='supplier_payment_allocate'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/supplier-payments/<uuid:payment_id>/void/', SupplierPaymentVoidView.as_view(), name='supplier_payment_void'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/suppliers/<uuid:supplier_id>/open-purchase-bills/', SupplierOpenBillsView.as_view(), name='supplier_open_purchase_bills'),
]
