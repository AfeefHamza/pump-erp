from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.organizations.models import Organisation, Outlet
from apps.organizations.permissions import require_permission
from apps.purchases.models import Supplier

from .models import PaymentAccount, SupplierPayment
from .selectors import list_payment_accounts, list_supplier_payments, open_purchase_bills, payment_totals
from .serializers import (
    AddAllocationsSerializer,
    OpenPurchaseBillSerializer,
    PaymentAccountInputSerializer,
    PaymentAccountSerializer,
    SupplierPaymentInputSerializer,
    SupplierPaymentSerializer,
    VoidPaymentSerializer,
)
from .services import (
    allocate_supplier_payment,
    create_payment_account,
    create_supplier_payment,
    deactivate_payment_account,
    update_payment_account,
    void_supplier_payment,
)


def _org(org_id):
    return get_object_or_404(Organisation, id=org_id)


def _org_outlet(org_id, outlet_id):
    organisation = _org(org_id)
    outlet = get_object_or_404(Outlet, id=outlet_id, organisation=organisation)
    return organisation, outlet


def _validation_response(error):
    if hasattr(error, 'message_dict'):
        return Response(error.message_dict, status=status.HTTP_400_BAD_REQUEST)
    return Response({'detail': '; '.join(error.messages)}, status=status.HTTP_400_BAD_REQUEST)


class PaymentAccountListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id):
        organisation = _org(org_id)
        require_permission(request.user, organisation, 'payment_account.view')
        outlet = None
        if request.query_params.get('outlet'):
            outlet = get_object_or_404(Outlet, id=request.query_params['outlet'], organisation=organisation)
            require_permission(request.user, organisation, 'payment_account.view', outlet=outlet)
        accounts = list_payment_accounts(
            organisation,
            outlet=outlet,
            active_only=request.query_params.get('active') == 'true',
            account_type=request.query_params.get('account_type'),
            search=request.query_params.get('search'),
        )
        return Response(PaymentAccountSerializer(accounts, many=True).data)

    def post(self, request, org_id):
        organisation = _org(org_id)
        serializer = PaymentAccountInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        outlet_id = data.pop('outlet_id', None)
        outlet = get_object_or_404(Outlet, id=outlet_id, organisation=organisation) if outlet_id else None
        try:
            account = create_payment_account(organisation=organisation, outlet=outlet, user=request.user, **data)
        except DjangoValidationError as error:
            return _validation_response(error)
        return Response(PaymentAccountSerializer(account).data, status=status.HTTP_201_CREATED)


class PaymentAccountDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id, account_id):
        organisation = _org(org_id)
        account = get_object_or_404(PaymentAccount, id=account_id, organisation=organisation)
        require_permission(request.user, organisation, 'payment_account.view', outlet=account.outlet)
        return Response(PaymentAccountSerializer(account).data)

    def patch(self, request, org_id, account_id):
        organisation = _org(org_id)
        account = get_object_or_404(PaymentAccount, id=account_id, organisation=organisation)
        serializer = PaymentAccountInputSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        if 'outlet_id' in data:
            outlet_id = data.pop('outlet_id')
            data['outlet'] = get_object_or_404(Outlet, id=outlet_id, organisation=organisation) if outlet_id else None
        try:
            account = update_payment_account(account, request.user, **data)
        except DjangoValidationError as error:
            return _validation_response(error)
        return Response(PaymentAccountSerializer(account).data)


class PaymentAccountDeactivateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, org_id, account_id):
        organisation = _org(org_id)
        account = get_object_or_404(PaymentAccount, id=account_id, organisation=organisation)
        try:
            account = deactivate_payment_account(account, request.user)
        except DjangoValidationError as error:
            return _validation_response(error)
        return Response(PaymentAccountSerializer(account).data)


class PaymentAccountOptionsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id, outlet_id):
        organisation, outlet = _org_outlet(org_id, outlet_id)
        require_permission(request.user, organisation, 'payment_account.view', outlet=outlet)
        accounts = list_payment_accounts(organisation, outlet=outlet, active_only=True)
        return Response(PaymentAccountSerializer(accounts, many=True).data)


class SupplierPaymentListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id, outlet_id):
        organisation, outlet = _org_outlet(org_id, outlet_id)
        require_permission(request.user, organisation, 'supplier_payment.view', outlet=outlet)
        payments = list_supplier_payments(organisation, outlet, request.query_params)
        return Response({
            'results': SupplierPaymentSerializer(payments, many=True).data,
            'summary': {k: str(v.quantize(Decimal('0.01'))) for k, v in payment_totals(organisation, outlet).items()},
        })

    def post(self, request, org_id, outlet_id):
        organisation, outlet = _org_outlet(org_id, outlet_id)
        serializer = SupplierPaymentInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        supplier = get_object_or_404(Supplier, id=data.pop('supplier_id'), organisation=organisation)
        account = get_object_or_404(PaymentAccount, id=data.pop('payment_account_id'), organisation=organisation)
        try:
            payment = create_supplier_payment(
                organisation=organisation, outlet=outlet, supplier=supplier,
                payment_account=account, user=request.user, **data
            )
        except DjangoValidationError as error:
            return _validation_response(error)
        payment = SupplierPayment.objects.select_related('supplier', 'payment_account', 'created_by').prefetch_related(
            'allocations__purchase_bill', 'account_movements', 'audit_logs__actor'
        ).get(pk=payment.pk)
        return Response(SupplierPaymentSerializer(payment).data, status=status.HTTP_201_CREATED)


class SupplierPaymentDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id, outlet_id, payment_id):
        organisation, outlet = _org_outlet(org_id, outlet_id)
        require_permission(request.user, organisation, 'supplier_payment.view', outlet=outlet)
        payment = get_object_or_404(
            SupplierPayment.objects.select_related('supplier', 'payment_account', 'created_by').prefetch_related(
                'allocations__purchase_bill', 'account_movements', 'audit_logs__actor'
            ),
            id=payment_id, organisation=organisation, outlet=outlet,
        )
        return Response(SupplierPaymentSerializer(payment).data)


class SupplierPaymentAllocateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, org_id, outlet_id, payment_id):
        organisation, outlet = _org_outlet(org_id, outlet_id)
        payment = get_object_or_404(SupplierPayment, id=payment_id, organisation=organisation, outlet=outlet)
        serializer = AddAllocationsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            payment = allocate_supplier_payment(payment, serializer.validated_data['allocations'], request.user)
        except DjangoValidationError as error:
            return _validation_response(error)
        return Response(SupplierPaymentSerializer(
            SupplierPayment.objects.select_related('supplier', 'payment_account', 'created_by').prefetch_related(
                'allocations__purchase_bill', 'account_movements', 'audit_logs__actor'
            ).get(pk=payment.pk)
        ).data)


class SupplierPaymentVoidView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, org_id, outlet_id, payment_id):
        organisation, outlet = _org_outlet(org_id, outlet_id)
        payment = get_object_or_404(SupplierPayment, id=payment_id, organisation=organisation, outlet=outlet)
        serializer = VoidPaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            payment = void_supplier_payment(payment, serializer.validated_data['void_reason'], request.user)
        except DjangoValidationError as error:
            return _validation_response(error)
        return Response(SupplierPaymentSerializer(
            SupplierPayment.objects.select_related('supplier', 'payment_account', 'created_by').prefetch_related(
                'allocations__purchase_bill', 'account_movements', 'audit_logs__actor'
            ).get(pk=payment.pk)
        ).data)


class SupplierOpenBillsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id, outlet_id, supplier_id):
        organisation, outlet = _org_outlet(org_id, outlet_id)
        require_permission(request.user, organisation, 'supplier_payment.view', outlet=outlet)
        supplier = get_object_or_404(Supplier, id=supplier_id, organisation=organisation)
        return Response(OpenPurchaseBillSerializer(open_purchase_bills(organisation, outlet, supplier), many=True).data)
