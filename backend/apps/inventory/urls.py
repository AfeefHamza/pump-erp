# apps/inventory/urls.py
from django.urls import path
from .views import (
    FuelStockSummaryView, TankStockLedgerView,
    StockAdjustmentListCreateView, StockAdjustmentReverseView,
    StockAdjustmentAttachmentDownloadView, TankChronologyRecalculateView,
    DayCloseInventoryReadinessView
)

urlpatterns = [
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/fuel-stock/summary/', FuelStockSummaryView.as_view(), name='fuel_stock_summary'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/fuel-stock/tanks/<uuid:tank_id>/ledger/', TankStockLedgerView.as_view(), name='tank_stock_ledger'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/fuel-stock/adjustments/', StockAdjustmentListCreateView.as_view(), name='stock_adjustment_list_create'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/fuel-stock/adjustments/<uuid:adj_id>/reverse/', StockAdjustmentReverseView.as_view(), name='stock_adjustment_reverse'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/fuel-stock/adjustments/<uuid:adj_id>/attachment/', StockAdjustmentAttachmentDownloadView.as_view(), name='stock_adjustment_attachment_download'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/fuel-stock/tanks/<uuid:tank_id>/recalculate/', TankChronologyRecalculateView.as_view(), name='tank_chronology_recalculate'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/fuel-stock/day-close-readiness/', DayCloseInventoryReadinessView.as_view(), name='day_close_inventory_readiness'),
]
