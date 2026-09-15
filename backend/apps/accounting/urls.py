from django.urls import path

from .views import AccountDeactivateView, AccountDetailView, AccountLedgerView, AccountListCreateView, JournalDetailView, JournalListCreateView, JournalReverseView, PeriodLockListCreateView, PeriodUnlockView, TrialBalanceView

urlpatterns = [
    path('<uuid:org_id>/accounting/accounts/', AccountListCreateView.as_view()),
    path('<uuid:org_id>/accounting/accounts/<uuid:account_id>/', AccountDetailView.as_view()),
    path('<uuid:org_id>/accounting/accounts/<uuid:account_id>/deactivate/', AccountDeactivateView.as_view()),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/accounting/journals/', JournalListCreateView.as_view()),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/accounting/journals/<uuid:journal_id>/', JournalDetailView.as_view()),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/accounting/journals/<uuid:journal_id>/reverse/', JournalReverseView.as_view()),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/accounting/trial-balance/', TrialBalanceView.as_view()),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/accounting/accounts/<uuid:account_id>/ledger/', AccountLedgerView.as_view()),
    path('<uuid:org_id>/accounting/period-locks/', PeriodLockListCreateView.as_view()),
    path('<uuid:org_id>/accounting/period-locks/<uuid:lock_id>/unlock/', PeriodUnlockView.as_view()),
]
