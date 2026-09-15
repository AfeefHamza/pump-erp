from django.core.exceptions import ValidationError as DjangoValidationError
from django.shortcuts import get_object_or_404
from django.utils.dateparse import parse_date
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.organizations.models import Organisation, Outlet
from apps.organizations.permissions import require_permission

from .models import AccountingPeriodLock, ChartOfAccount, JournalEntry
from .selectors import account_ledger, list_accounts, list_journals, trial_balance
from .serializers import AccountingPeriodLockSerializer, ChartOfAccountInputSerializer, ChartOfAccountSerializer, JournalEntryInputSerializer, JournalEntrySerializer, JournalReverseSerializer, PeriodLockInputSerializer, PeriodUnlockSerializer
from .services import create_account, deactivate_account, lock_period, post_journal, reverse_journal, unlock_period, update_account


def org(org_id):
    return get_object_or_404(Organisation, id=org_id)


def context(org_id, outlet_id):
    organisation = org(org_id)
    return organisation, get_object_or_404(Outlet, id=outlet_id, organisation=organisation)


def validation_response(error):
    if hasattr(error, 'message_dict'):
        return Response(error.message_dict, status=status.HTTP_400_BAD_REQUEST)
    return Response({'detail': '; '.join(error.messages)}, status=status.HTTP_400_BAD_REQUEST)


class AccountListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id):
        organisation = org(org_id); require_permission(request.user, organisation, 'chart_of_accounts.view')
        return Response(ChartOfAccountSerializer(list_accounts(organisation, request.query_params), many=True).data)

    def post(self, request, org_id):
        organisation = org(org_id); serializer = ChartOfAccountInputSerializer(data=request.data); serializer.is_valid(raise_exception=True)
        data = serializer.validated_data; parent_id = data.pop('parent_id', None)
        parent = get_object_or_404(ChartOfAccount, id=parent_id, organisation=organisation) if parent_id else None
        try: account = create_account(organisation=organisation, parent=parent, user=request.user, **data)
        except DjangoValidationError as error: return validation_response(error)
        return Response(ChartOfAccountSerializer(account).data, status=status.HTTP_201_CREATED)


class AccountDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id, account_id):
        organisation = org(org_id); require_permission(request.user, organisation, 'chart_of_accounts.view')
        return Response(ChartOfAccountSerializer(get_object_or_404(ChartOfAccount, id=account_id, organisation=organisation)).data)

    def patch(self, request, org_id, account_id):
        organisation = org(org_id); account = get_object_or_404(ChartOfAccount, id=account_id, organisation=organisation)
        serializer = ChartOfAccountInputSerializer(data=request.data, partial=True); serializer.is_valid(raise_exception=True); data = serializer.validated_data
        if 'parent_id' in data:
            parent_id = data.pop('parent_id'); data['parent'] = get_object_or_404(ChartOfAccount, id=parent_id, organisation=organisation) if parent_id else None
        try: account = update_account(account, request.user, **data)
        except DjangoValidationError as error: return validation_response(error)
        return Response(ChartOfAccountSerializer(account).data)


class AccountDeactivateView(APIView):
    permission_classes = [IsAuthenticated]
    def post(self, request, org_id, account_id):
        organisation = org(org_id); account = get_object_or_404(ChartOfAccount, id=account_id, organisation=organisation)
        try: account = deactivate_account(account, request.user)
        except DjangoValidationError as error: return validation_response(error)
        return Response(ChartOfAccountSerializer(account).data)


class JournalListCreateView(APIView):
    permission_classes = [IsAuthenticated]
    def get(self, request, org_id, outlet_id):
        organisation, outlet = context(org_id, outlet_id); require_permission(request.user, organisation, 'journal_voucher.view', outlet=outlet)
        return Response(JournalEntrySerializer(list_journals(organisation, outlet, request.query_params), many=True).data)
    def post(self, request, org_id, outlet_id):
        organisation, outlet = context(org_id, outlet_id); serializer = JournalEntryInputSerializer(data=request.data); serializer.is_valid(raise_exception=True)
        try: journal = post_journal(organisation=organisation, outlet=outlet, user=request.user, **serializer.validated_data)
        except DjangoValidationError as error: return validation_response(error)
        return Response(JournalEntrySerializer(JournalEntry.objects.select_related('created_by').prefetch_related('lines').get(pk=journal.pk)).data, status=status.HTTP_201_CREATED)


class JournalDetailView(APIView):
    permission_classes = [IsAuthenticated]
    def get(self, request, org_id, outlet_id, journal_id):
        organisation, outlet = context(org_id, outlet_id); require_permission(request.user, organisation, 'journal_voucher.view', outlet=outlet)
        journal = get_object_or_404(JournalEntry.objects.select_related('created_by', 'reversal_of').prefetch_related('lines'), id=journal_id, organisation=organisation, outlet=outlet)
        return Response(JournalEntrySerializer(journal).data)


class JournalReverseView(APIView):
    permission_classes = [IsAuthenticated]
    def post(self, request, org_id, outlet_id, journal_id):
        organisation, outlet = context(org_id, outlet_id); journal = get_object_or_404(JournalEntry, id=journal_id, organisation=organisation, outlet=outlet)
        serializer = JournalReverseSerializer(data=request.data); serializer.is_valid(raise_exception=True)
        try: reversal = reverse_journal(journal, user=request.user, **serializer.validated_data)
        except DjangoValidationError as error: return validation_response(error)
        return Response(JournalEntrySerializer(JournalEntry.objects.prefetch_related('lines').get(pk=reversal.pk)).data)


class TrialBalanceView(APIView):
    permission_classes = [IsAuthenticated]
    def get(self, request, org_id, outlet_id):
        organisation, outlet = context(org_id, outlet_id); require_permission(request.user, organisation, 'general_ledger.view', outlet=outlet)
        return Response(trial_balance(organisation, outlet, parse_date(request.query_params.get('from_date', '')), parse_date(request.query_params.get('to_date', ''))))


class AccountLedgerView(APIView):
    permission_classes = [IsAuthenticated]
    def get(self, request, org_id, outlet_id, account_id):
        organisation, outlet = context(org_id, outlet_id); require_permission(request.user, organisation, 'general_ledger.view', outlet=outlet)
        account = get_object_or_404(ChartOfAccount, id=account_id, organisation=organisation)
        return Response(account_ledger(organisation, outlet, account, parse_date(request.query_params.get('from_date', '')), parse_date(request.query_params.get('to_date', ''))))


class PeriodLockListCreateView(APIView):
    permission_classes = [IsAuthenticated]
    def get(self, request, org_id):
        organisation = org(org_id); require_permission(request.user, organisation, 'accounting_period.view')
        return Response(AccountingPeriodLockSerializer(AccountingPeriodLock.objects.filter(organisation=organisation).select_related('outlet', 'locked_by'), many=True).data)
    def post(self, request, org_id):
        organisation = org(org_id); serializer = PeriodLockInputSerializer(data=request.data); serializer.is_valid(raise_exception=True); data = serializer.validated_data
        outlet_id = data.pop('outlet_id', None); outlet = get_object_or_404(Outlet, id=outlet_id, organisation=organisation) if outlet_id else None
        try: row = lock_period(organisation=organisation, outlet=outlet, user=request.user, **data)
        except DjangoValidationError as error: return validation_response(error)
        return Response(AccountingPeriodLockSerializer(row).data, status=status.HTTP_201_CREATED)


class PeriodUnlockView(APIView):
    permission_classes = [IsAuthenticated]
    def post(self, request, org_id, lock_id):
        organisation = org(org_id); row = get_object_or_404(AccountingPeriodLock, id=lock_id, organisation=organisation)
        serializer = PeriodUnlockSerializer(data=request.data); serializer.is_valid(raise_exception=True)
        try: row = unlock_period(row, serializer.validated_data['reason'], request.user)
        except DjangoValidationError as error: return validation_response(error)
        return Response(AccountingPeriodLockSerializer(row).data)
