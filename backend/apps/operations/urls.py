# apps/operations/urls.py
from django.urls import path
from .views import (
    CalibrationUploadPreviewView, CalibrationImportView,
    CalibrationChartListView, CalibrationChartDetailView,
    TankCalibrationAssignmentView, TankCalibrationHistoryView,
    DipConversionPreviewView,
    OpeningBalanceBatchView, OpeningBalanceEntryView,
    OpeningBalancePreviewView, OpeningBalanceConfirmView,
    OutletOperationalReadinessView
)

urlpatterns = [
    # Calibration Charts
    path('<uuid:org_id>/calibrations/preview/', CalibrationUploadPreviewView.as_view(), name='calibration_preview'),
    path('<uuid:org_id>/calibrations/import/', CalibrationImportView.as_view(), name='calibration_import'),
    path('<uuid:org_id>/calibrations/charts/', CalibrationChartListView.as_view(), name='calibration_chart_list'),
    path('<uuid:org_id>/calibrations/charts/<uuid:chart_id>/', CalibrationChartDetailView.as_view(), name='calibration_chart_detail'),

    # Tank Assignments & History
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/tanks/calibrations/assign/', TankCalibrationAssignmentView.as_view(), name='tank_calibration_assign'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/tanks/<uuid:tank_id>/calibrations/history/', TankCalibrationHistoryView.as_view(), name='tank_calibration_history'),

    # Dip Conversion
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/tanks/convert-dip/', DipConversionPreviewView.as_view(), name='dip_conversion_preview'),

    # Opening Balances
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/opening-balances/batches/', OpeningBalanceBatchView.as_view(), name='opening_balance_batch'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/opening-balances/entries/', OpeningBalanceEntryView.as_view(), name='opening_balance_entries'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/opening-balances/batches/<uuid:batch_id>/preview/', OpeningBalancePreviewView.as_view(), name='opening_balance_preview'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/opening-balances/batches/<uuid:batch_id>/confirm/', OpeningBalanceConfirmView.as_view(), name='opening_balance_confirm'),

    # Outlet Readiness
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/readiness/', OutletOperationalReadinessView.as_view(), name='outlet_readiness'),
]
