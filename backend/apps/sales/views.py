from datetime import date

from django.core.exceptions import ValidationError as DjangoValidationError
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.finance.models import PaymentAccount
from apps.organizations.models import Organisation, Outlet
from apps.organizations.permissions import require_permission
from apps.purchases.models import PurchaseTaxCode
from apps.shifts.models import Customer

from .models import CustomerReceipt, SalesInvoice
from .selectors import customer_open_invoices, customer_outstanding, customer_statement, list_customer_receipts, list_sales_invoices, sales_item_options, unbilled_credit_slips
from .serializers import CustomerReceiptInputSerializer, CustomerReceiptSerializer, SalesInvoiceInputSerializer, SalesInvoiceSerializer, VoidSalesInvoiceSerializer
from .services import create_customer_receipt, create_sales_invoice, void_customer_receipt, void_sales_invoice


def context(org_id, outlet_id):
    organisation = get_object_or_404(Organisation, id=org_id)
    outlet = get_object_or_404(Outlet, id=outlet_id, organisation=organisation)
    return organisation, outlet


def validation_response(exc):
    if hasattr(exc, 'message_dict'):
        return Response(exc.message_dict, status=status.HTTP_400_BAD_REQUEST)
    return Response({'detail': '; '.join(exc.messages)}, status=status.HTTP_400_BAD_REQUEST)


class SalesInvoiceListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id, outlet_id):
        organisation, outlet = context(org_id, outlet_id)
        require_permission(request.user, organisation, 'sales_invoice.view', outlet=outlet)
        rows = list_sales_invoices(organisation, outlet, request.query_params)
        return Response(SalesInvoiceSerializer(rows, many=True).data)

    def post(self, request, org_id, outlet_id):
        organisation, outlet = context(org_id, outlet_id)
        serializer = SalesInvoiceInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        customer_id = data.pop('customer_id', None)
        account_id = data.pop('payment_account_id', None)
        customer = get_object_or_404(Customer, id=customer_id, organisation=organisation) if customer_id else None
        account = get_object_or_404(PaymentAccount, id=account_id, organisation=organisation) if account_id else None
        try:
            invoice = create_sales_invoice(organisation=organisation, outlet=outlet, customer=customer, payment_account=account, user=request.user, **data)
        except DjangoValidationError as exc:
            return validation_response(exc)
        invoice = SalesInvoice.objects.select_related('customer', 'payment_account', 'created_by').prefetch_related('lines__credit_slip', 'audit_logs__actor').get(pk=invoice.pk)
        return Response(SalesInvoiceSerializer(invoice).data, status=status.HTTP_201_CREATED)


class SalesInvoiceDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id, outlet_id, invoice_id):
        organisation, outlet = context(org_id, outlet_id)
        require_permission(request.user, organisation, 'sales_invoice.view', outlet=outlet)
        invoice = get_object_or_404(SalesInvoice.objects.select_related('customer', 'payment_account', 'created_by').prefetch_related('lines__credit_slip', 'audit_logs__actor'), id=invoice_id, organisation=organisation, outlet=outlet)
        return Response(SalesInvoiceSerializer(invoice).data)


class SalesInvoiceVoidView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, org_id, outlet_id, invoice_id):
        organisation, outlet = context(org_id, outlet_id)
        invoice = get_object_or_404(SalesInvoice, id=invoice_id, organisation=organisation, outlet=outlet)
        serializer = VoidSalesInvoiceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            invoice = void_sales_invoice(invoice, serializer.validated_data['void_reason'], request.user)
        except DjangoValidationError as exc:
            return validation_response(exc)
        return Response(SalesInvoiceSerializer(SalesInvoice.objects.prefetch_related('lines', 'audit_logs__actor').get(pk=invoice.pk)).data)


class SalesInvoicePreparationView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id, outlet_id):
        organisation, outlet = context(org_id, outlet_id)
        require_permission(request.user, organisation, 'sales_invoice.view', outlet=outlet)
        invoice_date = request.query_params.get('invoice_date')
        from django.utils.dateparse import parse_date
        date_value = parse_date(invoice_date) if invoice_date else date.today()
        treatments = PurchaseTaxCode.objects.filter(organisation=organisation, is_active=True, is_sales_applicable=True).values('id', 'name', 'tax_regime')
        return Response({'items': sales_item_options(organisation, outlet, date_value), 'tax_treatments': list(treatments)})


class UnbilledCreditSlipsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id, outlet_id, customer_id):
        organisation, outlet = context(org_id, outlet_id)
        require_permission(request.user, organisation, 'sales_invoice.view', outlet=outlet)
        customer = get_object_or_404(Customer, id=customer_id, organisation=organisation)
        rows = unbilled_credit_slips(organisation, outlet, customer)
        return Response([{'id': str(row.id), 'slip_number': row.slip_number, 'occurred_at': row.occurred_at, 'product_name': row.product.name, 'quantity': str(row.quantity), 'unit_price': str(row.unit_price), 'amount': str(row.amount), 'vehicle_number': row.vehicle_number or ''} for row in rows])


class CustomerOutstandingView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id, outlet_id):
        organisation, outlet = context(org_id, outlet_id)
        require_permission(request.user, organisation, 'customer_outstanding.view', outlet=outlet)
        return Response(customer_outstanding(organisation, outlet))


class CustomerStatementView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id, outlet_id, customer_id):
        organisation, outlet = context(org_id, outlet_id)
        require_permission(request.user, organisation, 'customer_outstanding.view', outlet=outlet)
        customer = get_object_or_404(Customer, id=customer_id, organisation=organisation)
        return Response(customer_statement(organisation, outlet, customer))


class CustomerOpenInvoicesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id, outlet_id, customer_id):
        organisation, outlet = context(org_id, outlet_id)
        require_permission(request.user, organisation, 'customer_receipt.view', outlet=outlet)
        customer = get_object_or_404(Customer, id=customer_id, organisation=organisation)
        rows = customer_open_invoices(organisation, outlet, customer)
        return Response([{'id': str(row.id), 'invoice_number': row.invoice_number, 'invoice_date': row.invoice_date, 'due_date': row.due_date, 'grand_total': str(row.grand_total), 'outstanding_amount': str(row.outstanding_amount)} for row in rows])


class CustomerReceiptListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id, outlet_id):
        organisation, outlet = context(org_id, outlet_id)
        require_permission(request.user, organisation, 'customer_receipt.view', outlet=outlet)
        return Response(CustomerReceiptSerializer(list_customer_receipts(organisation, outlet, request.query_params), many=True).data)

    def post(self, request, org_id, outlet_id):
        organisation, outlet = context(org_id, outlet_id)
        serializer = CustomerReceiptInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        customer = get_object_or_404(Customer, id=data.pop('customer_id'), organisation=organisation)
        account = get_object_or_404(PaymentAccount, id=data.pop('payment_account_id'), organisation=organisation)
        try:
            receipt = create_customer_receipt(organisation=organisation, outlet=outlet, customer=customer, payment_account=account, user=request.user, **data)
        except DjangoValidationError as exc:
            return validation_response(exc)
        return Response(CustomerReceiptSerializer(CustomerReceipt.objects.select_related('customer', 'payment_account').prefetch_related('allocations__sales_invoice').get(pk=receipt.pk)).data, status=status.HTTP_201_CREATED)


class CustomerReceiptDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id, outlet_id, receipt_id):
        organisation, outlet = context(org_id, outlet_id)
        require_permission(request.user, organisation, 'customer_receipt.view', outlet=outlet)
        receipt = get_object_or_404(CustomerReceipt.objects.select_related('customer', 'payment_account').prefetch_related('allocations__sales_invoice'), id=receipt_id, organisation=organisation, outlet=outlet)
        return Response(CustomerReceiptSerializer(receipt).data)


class CustomerReceiptVoidView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, org_id, outlet_id, receipt_id):
        organisation, outlet = context(org_id, outlet_id)
        receipt = get_object_or_404(CustomerReceipt, id=receipt_id, organisation=organisation, outlet=outlet)
        try:
            receipt = void_customer_receipt(receipt, request.data.get('void_reason', ''), request.user)
        except DjangoValidationError as exc:
            return validation_response(exc)
        return Response(CustomerReceiptSerializer(CustomerReceipt.objects.select_related('customer', 'payment_account').prefetch_related('allocations__sales_invoice').get(pk=receipt.pk)).data)
