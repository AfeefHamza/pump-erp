from datetime import date, timedelta
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.test import TestCase
from rest_framework.test import APIClient

from apps.organizations.services import create_organisation_with_owner, create_outlet
from apps.organizations.models import FinancialYear
from apps.accounting.models import JournalEntry
from apps.purchases.models import PurchaseBill
from apps.purchases.selectors import get_supplier_outstanding_summary, get_supplier_statement
from apps.purchases.services import create_supplier, update_purchase_bill, void_purchase_bill
from apps.users.models import User

from .models import PaymentAccountMovement, SupplierPayment, SupplierPaymentAllocation
from .services import (
    allocate_supplier_payment,
    create_payment_account,
    create_supplier_payment,
    void_supplier_payment,
)


class SupplierPaymentTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(email='finance-owner@example.com', password='secret')
        self.org = create_organisation_with_owner(name='Finance Fuels', code='FF', owner_user=self.owner)
        self.outlet = create_outlet(self.org, name='Main Outlet', code='MAIN')
        self.other_outlet = create_outlet(self.org, name='Other Outlet', code='OTHER')
        today = date.today()
        FinancialYear.objects.create(
            organisation=self.org, name=f'FY {today.year}', start_date=date(today.year, 1, 1),
            end_date=date(today.year, 12, 31), status=FinancialYear.STATUS_OPEN, is_default=True,
        )
        self.supplier = create_supplier(self.org, code='IOCL', name='Indian Oil')
        self.cash = create_payment_account(
            organisation=self.org, outlet=self.outlet, user=self.owner,
            code='CASH-01', name='Main Cash', account_type='cash', opening_balance=Decimal('5000.00')
        )
        self.bank = create_payment_account(
            organisation=self.org, outlet=None, user=self.owner,
            code='BANK-01', name='Current Account', account_type='bank', bank_name='SBI',
            account_number_last4='1234', opening_balance=Decimal('10000.00')
        )
        self.bill1 = self._bill('PB-1', 'INV-1', Decimal('1000.00'), date.today() - timedelta(days=20))
        self.bill2 = self._bill('PB-2', 'INV-2', Decimal('750.00'), date.today() + timedelta(days=10))
        self.client = APIClient()

    def _bill(self, number, invoice, total, due_date):
        return PurchaseBill.objects.create(
            organisation=self.org, outlet=self.outlet, supplier=self.supplier,
            supplier_name_snapshot=self.supplier.name, supplier_code_snapshot=self.supplier.code,
            bill_number=number, supplier_invoice_number=invoice,
            normalized_supplier_invoice_number=invoice, invoice_date=date.today(), due_date=due_date,
            grand_total=total, outstanding_amount=total,
        )

    def _payment(self, amount='600.00', allocations=None, account=None, method='bank_transfer'):
        return create_supplier_payment(
            organisation=self.org, outlet=self.outlet, supplier=self.supplier,
            payment_account=account or self.bank, payment_date=date.today(), amount=amount,
            payment_method=method, reference_number='UTR-123', allocations=allocations or [], user=self.owner,
        )

    def test_payment_account_balance_is_derived_from_movements(self):
        self._payment('600.00')
        self.bank.refresh_from_db()
        self.assertEqual(self.bank.current_balance, Decimal('9400.00'))
        with self.assertRaises(ValidationError):
            self.bank.opening_balance = Decimal('12000.00')
            self.bank.save()

    def test_payment_method_requires_matching_account_type(self):
        with self.assertRaises(ValidationError):
            self._payment(account=self.bank, method='cash')

    def test_partial_allocation_updates_bill_projection(self):
        payment = self._payment('600.00', [{'purchase_bill_id': self.bill1.id, 'amount': '400.00'}])
        self.bill1.refresh_from_db()
        self.assertEqual(self.bill1.amount_paid, Decimal('400.00'))
        self.assertEqual(self.bill1.outstanding_amount, Decimal('600.00'))
        self.assertEqual(payment.unallocated_amount, Decimal('200.00'))
        self.assertEqual(JournalEntry.objects.get(source_type='supplier_payment', source_id=payment.id).total_debit, Decimal('600.00'))

    def test_payment_can_allocate_multiple_bills(self):
        payment = self._payment('1500.00', [
            {'purchase_bill_id': self.bill1.id, 'amount': '1000.00'},
            {'purchase_bill_id': self.bill2.id, 'amount': '500.00'},
        ])
        self.bill1.refresh_from_db(); self.bill2.refresh_from_db()
        self.assertEqual(self.bill1.outstanding_amount, Decimal('0.00'))
        self.assertEqual(self.bill2.outstanding_amount, Decimal('250.00'))
        self.assertEqual(payment.unallocated_amount, Decimal('0.00'))

    def test_client_retry_is_idempotent(self):
        request_id = 'd7da8732-3cee-49aa-aad8-a61ad1a4fce8'
        kwargs = dict(
            organisation=self.org, outlet=self.outlet, supplier=self.supplier,
            payment_account=self.bank, payment_date=date.today(), amount='250.00',
            payment_method='bank_transfer', reference_number='UTR-RETRY', allocations=[],
            client_request_id=request_id, user=self.owner,
        )
        first = create_supplier_payment(**kwargs)
        second = create_supplier_payment(**kwargs)
        self.assertEqual(first.id, second.id)
        self.assertEqual(PaymentAccountMovement.objects.filter(payment=first).count(), 1)

    def test_overallocation_is_rejected_atomically(self):
        with self.assertRaises(ValidationError):
            self._payment('1200.00', [{'purchase_bill_id': self.bill1.id, 'amount': '1200.00'}])
        self.assertFalse(SupplierPayment.objects.exists())
        self.assertFalse(PaymentAccountMovement.objects.exists())

    def test_additional_allocation_uses_only_remaining_advance(self):
        payment = self._payment('900.00', [{'purchase_bill_id': self.bill1.id, 'amount': '500.00'}])
        allocate_supplier_payment(payment, [{'purchase_bill_id': self.bill2.id, 'amount': '300.00'}], self.owner)
        payment.refresh_from_db(); self.bill2.refresh_from_db()
        self.assertEqual(payment.unallocated_amount, Decimal('100.00'))
        self.assertEqual(self.bill2.amount_paid, Decimal('300.00'))
        allocation = payment.allocations.get(purchase_bill=self.bill2)
        self.assertTrue(allocation.is_advance_application)
        self.assertTrue(JournalEntry.objects.filter(source_type='supplier_payment_allocation', source_id=allocation.id).exists())

    def test_void_reverses_money_and_bill_projection_once(self):
        payment = self._payment('500.00', [{'purchase_bill_id': self.bill1.id, 'amount': '500.00'}])
        void_supplier_payment(payment, 'Wrong bank selected', self.owner)
        void_supplier_payment(payment, 'Repeated request', self.owner)
        self.bill1.refresh_from_db(); self.bank.refresh_from_db()
        self.assertEqual(self.bill1.amount_paid, Decimal('0.00'))
        self.assertEqual(self.bill1.outstanding_amount, Decimal('1000.00'))
        self.assertEqual(self.bank.current_balance, Decimal('10000.00'))
        self.assertEqual(PaymentAccountMovement.objects.filter(payment=payment).count(), 2)
        self.assertEqual(JournalEntry.objects.get(source_type='supplier_payment', source_id=payment.id, reversal_of__isnull=True).status, JournalEntry.STATUS_REVERSED)

    def test_recorded_payment_and_allocations_are_immutable(self):
        payment = self._payment('500.00', [{'purchase_bill_id': self.bill1.id, 'amount': '500.00'}])
        payment.amount = Decimal('450.00')
        with self.assertRaises(ValidationError):
            payment.save()
        allocation = SupplierPaymentAllocation.objects.get(payment=payment)
        allocation.amount = Decimal('450.00')
        with self.assertRaises(ValidationError):
            allocation.save()

    def test_paid_purchase_bill_cannot_be_changed_or_voided(self):
        self._payment('200.00', [{'purchase_bill_id': self.bill1.id, 'amount': '200.00'}])
        with self.assertRaises(ValidationError):
            update_purchase_bill(self.bill1.id, self.owner, {'notes': 'Change'})
        with self.assertRaises(ValidationError):
            void_purchase_bill(self.bill1.id, self.owner, 'Duplicate bill')

    def test_outstanding_and_statement_include_payments_and_advances(self):
        self._payment('700.00', [{'purchase_bill_id': self.bill1.id, 'amount': '400.00'}])
        summary = get_supplier_outstanding_summary(self.org, self.outlet)
        self.assertEqual(summary['total_paid'], '400.00')
        self.assertEqual(summary['total_unallocated_advances'], '300.00')
        statement = get_supplier_statement(self.org, self.outlet, self.supplier)
        self.assertEqual(statement['total_unallocated_advances'], '300.00')
        self.assertTrue(any(row['line_type'] == 'supplier_payment' for row in statement['lines']))

    def test_cross_outlet_account_is_rejected(self):
        other_cash = create_payment_account(
            organisation=self.org, outlet=self.other_outlet, user=self.owner,
            code='OTHER-CASH', name='Other Cash', account_type='cash'
        )
        with self.assertRaises(ValidationError):
            self._payment(account=other_cash, method='cash')

    def test_supplier_payment_api_contract(self):
        self.client.force_authenticate(self.owner)
        response = self.client.post(
            f'/api/v1/organisations/{self.org.id}/outlets/{self.outlet.id}/supplier-payments/',
            {
                'client_request_id': '2497f99d-99a7-4ed9-8d73-5d42e969e1ca',
                'supplier_id': str(self.supplier.id), 'payment_account_id': str(self.bank.id),
                'payment_date': date.today().isoformat(), 'amount': '450.00',
                'payment_method': 'bank_transfer', 'reference_number': 'UTR-API',
                'allocations': [{'purchase_bill_id': str(self.bill1.id), 'amount': '400.00'}],
            },
            format='json',
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['allocated_amount'], '400.00')
        self.assertEqual(response.data['unallocated_amount'], '50.00')
        self.assertEqual(response.data['allocations'][0]['bill_number'], 'PB-1')
        self.assertIsNotNone(response.data['accounting_journal_id'])
