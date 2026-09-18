from django.core.exceptions import ValidationError as DjangoValidationError
from django.shortcuts import get_object_or_404
from django.utils.dateparse import parse_date
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.organizations.models import Organisation, Outlet
from apps.organizations.permissions import require_permission

from .selectors import (
    core_report_pack, daily_business_summary, employee_accountability,
    management_dashboard, operational_report_pack, report_date_range,
)


def _context(org_id, outlet_id):
    organisation = get_object_or_404(Organisation, id=org_id)
    outlet = get_object_or_404(Outlet, id=outlet_id, organisation=organisation)
    return organisation, outlet


def _dates(request, organisation, outlet):
    raw_from = request.query_params.get('from_date')
    raw_to = request.query_params.get('to_date')
    from_date = parse_date(raw_from) if raw_from else None
    to_date = parse_date(raw_to) if raw_to else None
    if raw_from and not from_date:
        raise DjangoValidationError({'from_date': 'Use YYYY-MM-DD format.'})
    if raw_to and not to_date:
        raise DjangoValidationError({'to_date': 'Use YYYY-MM-DD format.'})
    return report_date_range(outlet, organisation, from_date, to_date)


def _validation_response(error):
    if hasattr(error, 'message_dict'):
        return Response(error.message_dict, status=status.HTTP_400_BAD_REQUEST)
    return Response({'detail': '; '.join(error.messages)}, status=status.HTTP_400_BAD_REQUEST)


class DailyBusinessSummaryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id, outlet_id):
        organisation, outlet = _context(org_id, outlet_id)
        require_permission(request.user, organisation, 'report.view', outlet=outlet)
        try:
            from_date, to_date = _dates(request, organisation, outlet)
            return Response(daily_business_summary(organisation, outlet, from_date, to_date))
        except DjangoValidationError as error:
            return _validation_response(error)


class CoreReportPackView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id, outlet_id):
        organisation, outlet = _context(org_id, outlet_id)
        require_permission(request.user, organisation, 'report.view', outlet=outlet)
        try:
            from_date, to_date = _dates(request, organisation, outlet)
            return Response(core_report_pack(organisation, outlet, from_date, to_date))
        except DjangoValidationError as error:
            return _validation_response(error)


class OperationalReportPackView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id, outlet_id):
        organisation, outlet = _context(org_id, outlet_id)
        require_permission(request.user, organisation, 'report.view', outlet=outlet)
        try:
            from_date, to_date = _dates(request, organisation, outlet)
            return Response(operational_report_pack(organisation, outlet, from_date, to_date))
        except DjangoValidationError as error:
            return _validation_response(error)


class ManagementDashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id, outlet_id):
        organisation, outlet = _context(org_id, outlet_id)
        require_permission(request.user, organisation, 'dashboard.view', outlet=outlet)
        return Response(management_dashboard(organisation, outlet))


class EmployeeAccountabilityView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id, outlet_id):
        organisation, outlet = _context(org_id, outlet_id)
        require_permission(request.user, organisation, 'report.view', outlet=outlet)
        try:
            from_date, to_date = _dates(request, organisation, outlet)
            employee_id = request.query_params.get('employee_id') or None
            return Response(employee_accountability(
                organisation, outlet, from_date, to_date, employee_id=employee_id,
            ))
        except (DjangoValidationError, ValueError) as error:
            if isinstance(error, ValueError):
                error = DjangoValidationError({'employee_id': 'Select a valid employee.'})
            return _validation_response(error)
