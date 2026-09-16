from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import models
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.organizations.models import Organisation, Outlet
from apps.organizations.permissions import require_permission
from apps.purchases.models import Supplier
from apps.accounting.models import ChartOfAccount

from .models import CashBankTransfer, DigitalSettlement, Expense, ExpenseCategory, PaymentAccount, SupplierPayment
from .selectors import (
    list_cash_bank_transfers,
    digital_settlement_summary,
    list_expense_categories,
    list_expenses,
    list_digital_settlements,
    list_payment_accounts,
    list_supplier_payments,
    open_purchase_bills,
    payment_account_book,
    payment_totals,
    pending_digital_collections,
)
from .serializers import (
    AddAllocationsSerializer,
    OpenPurchaseBillSerializer,
    PaymentAccountInputSerializer,
    PaymentAccountSerializer,
    SupplierPaymentInputSerializer,
    SupplierPaymentSerializer,
    VoidPaymentSerializer,
    CashBankTransferInputSerializer,
    CashBankTransferSerializer,
    ExpenseCategoryInputSerializer,
    ExpenseCategorySerializer,
    ExpenseInputSerializer,
    ExpenseSerializer,
    PaymentAccountBookRowSerializer,
    DigitalSettlementInputSerializer,
    DigitalSettlementSerializer,
    PendingDigitalCollectionSerializer,
)
from .services import (
    allocate_supplier_payment,
    create_payment_account,
    create_supplier_payment,
    deactivate_payment_account,
    update_payment_account,
    void_supplier_payment,
    create_cash_bank_transfer,
    create_expense,
    create_expense_category,
    deactivate_expense_category,
    update_expense_category,
    void_cash_bank_transfer,
    void_expense,
    create_digital_settlement,
    void_digital_settlement,
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


class ExpenseCategoryListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id):
        organisation = _org(org_id)
        require_permission(request.user, organisation, 'expense_category.view')
        rows = list_expense_categories(
            organisation, active_only=request.query_params.get('active') == 'true',
            search=request.query_params.get('search'),
        )
        return Response(ExpenseCategorySerializer(rows, many=True).data)

    def post(self, request, org_id):
        organisation = _org(org_id)
        serializer = ExpenseCategoryInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        ledger = get_object_or_404(ChartOfAccount, id=data.pop('ledger_account_id'), organisation=organisation)
        try:
            category = create_expense_category(
                organisation=organisation, user=request.user, ledger_account=ledger, **data,
            )
        except DjangoValidationError as error:
            return _validation_response(error)
        return Response(ExpenseCategorySerializer(category).data, status=status.HTTP_201_CREATED)


class ExpenseCategoryDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id, category_id):
        organisation = _org(org_id)
        require_permission(request.user, organisation, 'expense_category.view')
        category = get_object_or_404(ExpenseCategory.objects.select_related('ledger_account'), id=category_id, organisation=organisation)
        return Response(ExpenseCategorySerializer(category).data)

    def patch(self, request, org_id, category_id):
        organisation = _org(org_id)
        category = get_object_or_404(ExpenseCategory, id=category_id, organisation=organisation)
        serializer = ExpenseCategoryInputSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        if 'ledger_account_id' in data:
            data['ledger_account'] = get_object_or_404(
                ChartOfAccount, id=data.pop('ledger_account_id'), organisation=organisation,
            )
        try:
            category = update_expense_category(category, request.user, **data)
        except DjangoValidationError as error:
            return _validation_response(error)
        return Response(ExpenseCategorySerializer(category).data)


class ExpenseCategoryDeactivateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, org_id, category_id):
        organisation = _org(org_id)
        category = get_object_or_404(ExpenseCategory, id=category_id, organisation=organisation)
        try:
            category = deactivate_expense_category(category, request.user)
        except DjangoValidationError as error:
            return _validation_response(error)
        return Response(ExpenseCategorySerializer(category).data)


class ExpenseListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id, outlet_id):
        organisation, outlet = _org_outlet(org_id, outlet_id)
        require_permission(request.user, organisation, 'expense.view', outlet=outlet)
        expenses = list_expenses(organisation, outlet, request.query_params)
        active_total = expenses.filter(status=Expense.STATUS_ACTIVE).aggregate(total=models.Sum('amount'))['total'] or Decimal('0.00')
        return Response({'results': ExpenseSerializer(expenses, many=True).data, 'summary': {'active_total': str(active_total)}})

    def post(self, request, org_id, outlet_id):
        organisation, outlet = _org_outlet(org_id, outlet_id)
        serializer = ExpenseInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        category = get_object_or_404(ExpenseCategory, id=data.pop('category_id'), organisation=organisation)
        account = get_object_or_404(PaymentAccount, id=data.pop('payment_account_id'), organisation=organisation)
        try:
            expense = create_expense(
                organisation=organisation, outlet=outlet, category=category,
                payment_account=account, user=request.user, **data,
            )
        except DjangoValidationError as error:
            return _validation_response(error)
        return Response(ExpenseSerializer(expense).data, status=status.HTTP_201_CREATED)


class ExpenseDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id, outlet_id, expense_id):
        organisation, outlet = _org_outlet(org_id, outlet_id)
        require_permission(request.user, organisation, 'expense.view', outlet=outlet)
        expense = get_object_or_404(
            Expense.objects.select_related('category', 'ledger_account', 'payment_account', 'created_by'),
            id=expense_id, organisation=organisation, outlet=outlet,
        )
        return Response(ExpenseSerializer(expense).data)


class ExpenseVoidView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, org_id, outlet_id, expense_id):
        organisation, outlet = _org_outlet(org_id, outlet_id)
        expense = get_object_or_404(Expense, id=expense_id, organisation=organisation, outlet=outlet)
        serializer = VoidPaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            expense = void_expense(expense, serializer.validated_data['void_reason'], request.user)
        except DjangoValidationError as error:
            return _validation_response(error)
        return Response(ExpenseSerializer(expense).data)


class CashBankTransferListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id, outlet_id):
        organisation, outlet = _org_outlet(org_id, outlet_id)
        require_permission(request.user, organisation, 'cash_bank_transfer.view', outlet=outlet)
        rows = list_cash_bank_transfers(organisation, outlet, request.query_params)
        return Response(CashBankTransferSerializer(rows, many=True).data)

    def post(self, request, org_id, outlet_id):
        organisation, outlet = _org_outlet(org_id, outlet_id)
        serializer = CashBankTransferInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        from_account = get_object_or_404(PaymentAccount, id=data.pop('from_account_id'), organisation=organisation)
        to_account = get_object_or_404(PaymentAccount, id=data.pop('to_account_id'), organisation=organisation)
        try:
            transfer = create_cash_bank_transfer(
                organisation=organisation, outlet=outlet, from_account=from_account,
                to_account=to_account, user=request.user, **data,
            )
        except DjangoValidationError as error:
            return _validation_response(error)
        return Response(CashBankTransferSerializer(transfer).data, status=status.HTTP_201_CREATED)


class CashBankTransferDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id, outlet_id, transfer_id):
        organisation, outlet = _org_outlet(org_id, outlet_id)
        require_permission(request.user, organisation, 'cash_bank_transfer.view', outlet=outlet)
        transfer = get_object_or_404(
            CashBankTransfer.objects.select_related('from_account', 'to_account', 'created_by'),
            id=transfer_id, organisation=organisation, outlet=outlet,
        )
        return Response(CashBankTransferSerializer(transfer).data)


class CashBankTransferVoidView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, org_id, outlet_id, transfer_id):
        organisation, outlet = _org_outlet(org_id, outlet_id)
        transfer = get_object_or_404(CashBankTransfer, id=transfer_id, organisation=organisation, outlet=outlet)
        serializer = VoidPaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            transfer = void_cash_bank_transfer(transfer, serializer.validated_data['void_reason'], request.user)
        except DjangoValidationError as error:
            return _validation_response(error)
        return Response(CashBankTransferSerializer(transfer).data)


class PaymentAccountBookView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id, outlet_id, account_id):
        organisation, outlet = _org_outlet(org_id, outlet_id)
        require_permission(request.user, organisation, 'cash_bank_book.view', outlet=outlet)
        account = get_object_or_404(PaymentAccount, id=account_id, organisation=organisation)
        if account.outlet_id and account.outlet_id != outlet.id:
            return Response({'detail': 'This account belongs to another outlet.'}, status=status.HTTP_404_NOT_FOUND)
        opening, rows, closing = payment_account_book(account, outlet, request.query_params)
        return Response({
            'account': PaymentAccountSerializer(account).data,
            'opening_balance': str(opening), 'closing_balance': str(closing),
            'results': PaymentAccountBookRowSerializer(rows, many=True).data,
        })


class PendingDigitalCollectionListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id, outlet_id):
        organisation, outlet = _org_outlet(org_id, outlet_id)
        require_permission(request.user, organisation, 'digital_settlement.view', outlet=outlet)
        rows = pending_digital_collections(organisation, outlet, request.query_params)
        return Response(PendingDigitalCollectionSerializer(rows, many=True).data)


class DigitalSettlementListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id, outlet_id):
        organisation, outlet = _org_outlet(org_id, outlet_id)
        require_permission(request.user, organisation, 'digital_settlement.view', outlet=outlet)
        rows = list_digital_settlements(organisation, outlet, request.query_params)
        summary = digital_settlement_summary(organisation, outlet)
        return Response({
            'results': DigitalSettlementSerializer(rows, many=True).data,
            'summary': {key: (str(value.quantize(Decimal('0.01'))) if isinstance(value, Decimal) else value) for key, value in summary.items()},
        })

    def post(self, request, org_id, outlet_id):
        organisation, outlet = _org_outlet(org_id, outlet_id)
        serializer = DigitalSettlementInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        account = get_object_or_404(PaymentAccount, id=data.pop('payment_account_id'), organisation=organisation)
        try:
            settlement = create_digital_settlement(
                organisation=organisation, outlet=outlet, payment_account=account,
                user=request.user, **data,
            )
        except DjangoValidationError as error:
            return _validation_response(error)
        settlement = DigitalSettlement.objects.select_related('payment_account', 'created_by').prefetch_related(
            'allocations__collection',
        ).get(pk=settlement.pk)
        return Response(DigitalSettlementSerializer(settlement).data, status=status.HTTP_201_CREATED)


class DigitalSettlementDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id, outlet_id, settlement_id):
        organisation, outlet = _org_outlet(org_id, outlet_id)
        require_permission(request.user, organisation, 'digital_settlement.view', outlet=outlet)
        settlement = get_object_or_404(
            DigitalSettlement.objects.select_related('payment_account', 'created_by').prefetch_related(
                'allocations__collection',
            ), id=settlement_id, organisation=organisation, outlet=outlet,
        )
        return Response(DigitalSettlementSerializer(settlement).data)


class DigitalSettlementVoidView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, org_id, outlet_id, settlement_id):
        organisation, outlet = _org_outlet(org_id, outlet_id)
        settlement = get_object_or_404(DigitalSettlement, id=settlement_id, organisation=organisation, outlet=outlet)
        serializer = VoidPaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            settlement = void_digital_settlement(settlement, serializer.validated_data['void_reason'], request.user)
        except DjangoValidationError as error:
            return _validation_response(error)
        return Response(DigitalSettlementSerializer(
            DigitalSettlement.objects.select_related('payment_account', 'created_by').prefetch_related(
                'allocations__collection',
            ).get(pk=settlement.pk)
        ).data)
