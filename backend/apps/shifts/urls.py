# apps/shifts/urls.py
from django.urls import path
from .views import (
    ShiftDefinitionListCreateView, ShiftDefinitionDetailView, ShiftRosterWorkspaceView,
    OperationalShiftListView, ShiftOpenPreparationView, ShiftOpenView,
    OperationalShiftDetailView, ShiftAssignmentsUpdateView, ShiftMeterReadingView,
    ShiftMeterEventView, ShiftTestingListCreateView, ShiftTestingDetailView,
    ShiftDipListCreateView, ShiftPriceChangePreviewView, ShiftPriceChangeConfirmView,
    ShiftClosingPreviewView, ShiftCloseView, ShiftReopenView,
    ShiftActivityLogView, ShiftTotalsView,
    OperationalShiftStaffAddView, OperationalShiftNozzleHandoverView,
    OperationalShiftNozzleCorrectView, OperationalShiftCashierTransferView,
    OperationalShiftNozzleActivateView, OperationalShiftStaffHistoryView
)

urlpatterns = [
    # Shift Definitions
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/shifts/', ShiftDefinitionListCreateView.as_view(), name='shift_definition_list_create'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/shifts/<uuid:shift_id>/', ShiftDefinitionDetailView.as_view(), name='shift_definition_detail'),

    # Shift Roster Workspace
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/rosters/', ShiftRosterWorkspaceView.as_view(), name='shift_roster_workspace'),

    # Milestone 9: Live Shift Operations Endpoints
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/operational-shifts/', OperationalShiftListView.as_view(), name='operational_shift_list'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/operational-shifts/prepare-opening/', ShiftOpenPreparationView.as_view(), name='shift_open_preparation'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/operational-shifts/open/', ShiftOpenView.as_view(), name='shift_open'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/operational-shifts/<uuid:shift_id>/', OperationalShiftDetailView.as_view(), name='operational_shift_detail'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/operational-shifts/<uuid:shift_id>/assignments/', ShiftAssignmentsUpdateView.as_view(), name='shift_assignments_update'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/operational-shifts/<uuid:shift_id>/staff/', OperationalShiftStaffAddView.as_view(), name='shift_staff_add'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/operational-shifts/<uuid:shift_id>/handover/', OperationalShiftNozzleHandoverView.as_view(), name='shift_nozzle_handover'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/operational-shifts/<uuid:shift_id>/correct-assignment/', OperationalShiftNozzleCorrectView.as_view(), name='shift_nozzle_correct'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/operational-shifts/<uuid:shift_id>/cashier-transfer/', OperationalShiftCashierTransferView.as_view(), name='shift_cashier_transfer'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/operational-shifts/<uuid:shift_id>/transfer-cashier/', OperationalShiftCashierTransferView.as_view()),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/operational-shifts/<uuid:shift_id>/activate-nozzle/', OperationalShiftNozzleActivateView.as_view(), name='shift_nozzle_activate'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/operational-shifts/<uuid:shift_id>/staff-history/', OperationalShiftStaffHistoryView.as_view(), name='shift_staff_history'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/operational-shifts/<uuid:shift_id>/meters/<uuid:nozzle_id>/', ShiftMeterReadingView.as_view(), name='shift_meter_reading'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/operational-shifts/<uuid:shift_id>/meters/<uuid:nozzle_id>/events/', ShiftMeterEventView.as_view(), name='shift_meter_event'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/operational-shifts/<uuid:shift_id>/testing/', ShiftTestingListCreateView.as_view(), name='shift_testing_list_create'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/operational-shifts/<uuid:shift_id>/testing/<uuid:testing_id>/', ShiftTestingDetailView.as_view(), name='shift_testing_detail'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/operational-shifts/<uuid:shift_id>/dips/', ShiftDipListCreateView.as_view(), name='shift_dip_list_create'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/operational-shifts/<uuid:shift_id>/price-change/preview/', ShiftPriceChangePreviewView.as_view(), name='shift_price_change_preview'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/operational-shifts/<uuid:shift_id>/price-change/confirm/', ShiftPriceChangeConfirmView.as_view(), name='shift_price_change_confirm'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/operational-shifts/<uuid:shift_id>/closing-preview/', ShiftClosingPreviewView.as_view(), name='shift_closing_preview'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/operational-shifts/<uuid:shift_id>/close/', ShiftCloseView.as_view(), name='shift_close'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/operational-shifts/<uuid:shift_id>/reopen/', ShiftReopenView.as_view(), name='shift_reopen'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/operational-shifts/<uuid:shift_id>/activity/', ShiftActivityLogView.as_view(), name='shift_activity_log'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/operational-shifts/<uuid:shift_id>/totals/', ShiftTotalsView.as_view(), name='shift_totals'),
]
