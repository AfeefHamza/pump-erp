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
    OperationalShiftNozzleActivateView, OperationalShiftStaffHistoryView,
    # Milestone 10 views
    CustomerListCreateView, CustomerDetailUpdateView, CustomerDeactivateView,
    CustomerCreditPositionView, CustomerCreditSlipsView,
    OutletCreditSlipListView, ShiftCreditSlipListCreateView,
    CreditSlipDetailUpdateView, CreditSlipVoidView,
    ShiftCollectionListCreateView, CollectionDetailUpdateView, CollectionVoidView,
    ShiftDeductionListCreateView, DeductionVoidView,
    EmployeeAccountabilitySummaryView, EmployeeReconciliationPreviewView,
    EmployeeReconcileView, EmployeeSettlementReopenView,
    ShiftReconciliationSummaryView, CollectionActivityTimelineView,
    # Shift Card Workflow Views
    ShiftCardPreparationView, ShiftCardListCreateView, ShiftCardDetailView,
    ShiftCardVoidView, ShiftLockView, ShiftUnlockView,
    ShiftDeductionApproveView, ShiftDeductionRejectView,
    ShiftCardAttachmentDownloadView, ParentShiftSummaryView
)

urlpatterns = [
    # Customer Master (Organisation-scoped)
    path('<uuid:org_id>/customers/', CustomerListCreateView.as_view(), name='customer_list_create'),
    path('<uuid:org_id>/customers/<uuid:customer_id>/', CustomerDetailUpdateView.as_view(), name='customer_detail_update'),
    path('<uuid:org_id>/customers/<uuid:customer_id>/deactivate/', CustomerDeactivateView.as_view(), name='customer_deactivate'),
    path('<uuid:org_id>/customers/<uuid:customer_id>/credit-position/', CustomerCreditPositionView.as_view(), name='customer_credit_position'),
    path('<uuid:org_id>/customers/<uuid:customer_id>/credit-slips/', CustomerCreditSlipsView.as_view(), name='customer_credit_slips'),

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

    # Milestone 10: Credit Slips
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/credit-slips/', OutletCreditSlipListView.as_view(), name='outlet_credit_slip_list'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/credit-slips/<uuid:slip_id>/', CreditSlipDetailUpdateView.as_view(), name='credit_slip_detail_update'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/credit-slips/<uuid:slip_id>/void/', CreditSlipVoidView.as_view(), name='credit_slip_void'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/operational-shifts/<uuid:shift_id>/credit-slips/', ShiftCreditSlipListCreateView.as_view(), name='shift_credit_slip_list_create'),

    # Milestone 10: Employee Collections
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/operational-shifts/<uuid:shift_id>/collections/', ShiftCollectionListCreateView.as_view(), name='shift_collection_list_create'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/collections/<uuid:collection_id>/', CollectionDetailUpdateView.as_view(), name='collection_detail_update'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/collections/<uuid:collection_id>/void/', CollectionVoidView.as_view(), name='collection_void'),

    # Milestone 10: Employee Shift Deductions & Adjustments
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/operational-shifts/<uuid:shift_id>/deductions/', ShiftDeductionListCreateView.as_view(), name='shift_deduction_list_create'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/deductions/<uuid:deduction_id>/void/', DeductionVoidView.as_view(), name='deduction_void'),

    # Milestone 10: Accountability & Reconciliation
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/operational-shifts/<uuid:shift_id>/accountability/', EmployeeAccountabilitySummaryView.as_view(), name='employee_accountability_summary'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/operational-shifts/<uuid:shift_id>/accountability/<uuid:employee_id>/preview/', EmployeeReconciliationPreviewView.as_view(), name='employee_reconciliation_preview'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/operational-shifts/<uuid:shift_id>/accountability/<uuid:employee_id>/reconcile/', EmployeeReconcileView.as_view(), name='employee_reconcile'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/operational-shifts/<uuid:shift_id>/settlements/<uuid:settlement_id>/reopen/', EmployeeSettlementReopenView.as_view(), name='employee_settlement_reopen'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/operational-shifts/<uuid:shift_id>/reconciliation/', ShiftReconciliationSummaryView.as_view(), name='shift_reconciliation_summary'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/operational-shifts/<uuid:shift_id>/collection-activity/', CollectionActivityTimelineView.as_view(), name='collection_activity_timeline'),

    # Document-based Shift Card Endpoints
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/shift-cards/prepare/', ShiftCardPreparationView.as_view(), name='shift_card_prepare'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/shift-cards/preparation/', ShiftCardPreparationView.as_view(), name='shift_card_preparation'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/shift-cards/', ShiftCardListCreateView.as_view(), name='shift_card_list_create'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/shift-cards/<uuid:card_id>/', ShiftCardDetailView.as_view(), name='shift_card_detail'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/shift-cards/<uuid:card_id>/void/', ShiftCardVoidView.as_view(), name='shift_card_void'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/shift-cards/<uuid:card_id>/attachment/', ShiftCardAttachmentDownloadView.as_view(), name='shift_card_attachment'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/operational-shifts/<uuid:shift_id>/summary/', ParentShiftSummaryView.as_view(), name='parent_shift_summary'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/shifts/<uuid:shift_id>/summary/', ParentShiftSummaryView.as_view()),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/operational-shifts/<uuid:shift_id>/lock/', ShiftLockView.as_view(), name='shift_lock'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/shifts/<uuid:shift_id>/lock/', ShiftLockView.as_view()),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/operational-shifts/<uuid:shift_id>/unlock/', ShiftUnlockView.as_view(), name='shift_unlock'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/shifts/<uuid:shift_id>/unlock/', ShiftUnlockView.as_view()),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/deductions/<uuid:deduction_id>/approve/', ShiftDeductionApproveView.as_view(), name='shift_deduction_approve'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/deductions/<uuid:deduction_id>/reject/', ShiftDeductionRejectView.as_view(), name='shift_deduction_reject'),
]
