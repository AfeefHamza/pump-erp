# apps/inventory/urls.py
from django.urls import path
from .views import (
    FuelStockSummaryView, TankStockLedgerView,
    StockAdjustmentListCreateView, StockAdjustmentReverseView,
    StockAdjustmentAttachmentDownloadView, TankChronologyRecalculateView
)
from .views_item import (
    ItemListCreateView, ItemDetailView, ItemDeactivateView,
    ItemOptionsView, ItemResolveLegacyView,
    UnitMasterListCreateView, UnitConversionListCreateView
)

urlpatterns = [
    # Canonical Item Master
    path('<uuid:org_id>/items/', ItemListCreateView.as_view(), name='item_list_create'),
    path('<uuid:org_id>/items/options/', ItemOptionsView.as_view(), name='item_options'),
    path('<uuid:org_id>/items/resolve-legacy/', ItemResolveLegacyView.as_view(), name='item_resolve_legacy'),
    path('<uuid:org_id>/items/<uuid:item_id>/', ItemDetailView.as_view(), name='item_detail'),
    path('<uuid:org_id>/items/<uuid:item_id>/deactivate/', ItemDeactivateView.as_view(), name='item_deactivate'),

    # Inventory namespace aliases
    path('<uuid:org_id>/inventory/items/', ItemListCreateView.as_view()),
    path('<uuid:org_id>/inventory/items/options/', ItemOptionsView.as_view()),
    path('<uuid:org_id>/inventory/items/resolve-legacy/', ItemResolveLegacyView.as_view()),
    path('<uuid:org_id>/inventory/items/<uuid:item_id>/', ItemDetailView.as_view()),
    path('<uuid:org_id>/inventory/items/<uuid:item_id>/deactivate/', ItemDeactivateView.as_view()),

    # Units and Unit Conversions
    path('<uuid:org_id>/units/', UnitMasterListCreateView.as_view(), name='unit_master_list_create'),
    path('<uuid:org_id>/unit-conversions/', UnitConversionListCreateView.as_view(), name='unit_conversion_list_create'),
    path('<uuid:org_id>/inventory/units/', UnitMasterListCreateView.as_view()),
    path('<uuid:org_id>/inventory/unit-conversions/', UnitConversionListCreateView.as_view()),

    # Fuel Stock & Tank Ledger
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/fuel-stock/summary/', FuelStockSummaryView.as_view(), name='fuel_stock_summary'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/fuel-stock/tanks/<uuid:tank_id>/ledger/', TankStockLedgerView.as_view(), name='tank_stock_ledger'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/fuel-stock/adjustments/', StockAdjustmentListCreateView.as_view(), name='stock_adjustment_list_create'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/fuel-stock/adjustments/<uuid:adj_id>/reverse/', StockAdjustmentReverseView.as_view(), name='stock_adjustment_reverse'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/fuel-stock/adjustments/<uuid:adj_id>/attachment/', StockAdjustmentAttachmentDownloadView.as_view(), name='stock_adjustment_attachment_download'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/fuel-stock/tanks/<uuid:tank_id>/recalculate/', TankChronologyRecalculateView.as_view(), name='tank_chronology_recalculate'),
]
