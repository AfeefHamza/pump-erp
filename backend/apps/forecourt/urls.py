# apps/forecourt/urls.py
from django.urls import path
from .views import (
    FuelProductListCreateView, FuelProductDetailView,
    ProductPriceListCreateView, ProductPriceHistoryView,
    TankListCreateView, TankDetailView,
    DispenserListCreateView, DispenserDetailView,
    NozzleListCreateView, NozzleDetailView,
    ForecourtStructureView
)

urlpatterns = [
    # Fuel Products (organisation-level)
    path('<uuid:org_id>/fuel-products/', FuelProductListCreateView.as_view(), name='fuel_product_list_create'),
    path('<uuid:org_id>/fuel-products/<uuid:product_id>/', FuelProductDetailView.as_view(), name='fuel_product_detail'),

    # Product Prices (outlet-level)
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/product-prices/', ProductPriceListCreateView.as_view(), name='product_price_list_create'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/product-prices/<uuid:product_id>/history/', ProductPriceHistoryView.as_view(), name='product_price_history'),

    # Tanks (outlet-level)
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/tanks/', TankListCreateView.as_view(), name='tank_list_create'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/tanks/<uuid:tank_id>/', TankDetailView.as_view(), name='tank_detail'),

    # Dispensers (outlet-level)
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/dispensers/', DispenserListCreateView.as_view(), name='dispenser_list_create'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/dispensers/<uuid:dispenser_id>/', DispenserDetailView.as_view(), name='dispenser_detail'),

    # Nozzles (outlet-level)
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/nozzles/', NozzleListCreateView.as_view(), name='nozzle_list_create'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/nozzles/<uuid:nozzle_id>/', NozzleDetailView.as_view(), name='nozzle_detail'),

    # Forecourt complete structure (outlet-level)
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/forecourt/', ForecourtStructureView.as_view(), name='forecourt_structure'),
]
