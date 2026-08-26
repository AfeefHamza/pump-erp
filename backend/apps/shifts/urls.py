# apps/shifts/urls.py
from django.urls import path
from .views import ShiftDefinitionListCreateView, ShiftDefinitionDetailView, ShiftRosterWorkspaceView

urlpatterns = [
    # Shift Definitions
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/shifts/', ShiftDefinitionListCreateView.as_view(), name='shift_definition_list_create'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/shifts/<uuid:shift_id>/', ShiftDefinitionDetailView.as_view(), name='shift_definition_detail'),

    # Shift Roster Workspace
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/rosters/', ShiftRosterWorkspaceView.as_view(), name='shift_roster_workspace'),
]
