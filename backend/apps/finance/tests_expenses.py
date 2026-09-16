from datetime import date
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounting.models import ChartOfAccount, JournalEntry
from apps.organizations.models import FinancialYear
from apps.organizations.services import create_organisation_with_owner, create_outlet
from apps.users.models import User

from .models import CashBankTransfer, Expense, ExpenseCategory, PaymentAccountMovement
from .services import (
    create_cash_bank_transfer,
    create_expense,
    create_expense_category,
    create_payment_account,
    void_cash_bank_transfer,
    void_expense,
)


class ExpenseCashBankTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(email='expense-owner@example.com', password='secret')
        self.org = create_organisation_with_owner(name='Expense Fuels', code='EF', owner_user=self.owner)
        self.outlet = create_outlet(self.org, name='Main Outlet', code='MAIN')
        self.other_outlet = create_outlet(self.org, name='Other Outlet', code='OTHER')
        today = date.today()
        FinancialYear.objects.create(
            organisation=self.org, name=f'FY {today.year}', start_date=date(today.year, 1, 1),
            end_date=date(today.year, 12, 31), status=FinancialYear.STATUS_OPEN, is_default=True,
        )
        self.expense_ledger = ChartOfAccount.objects.get(organisation=self.org, system_key='general_expenses')
        self.category = create_expense_category(
            organisation=self.org, user=self.owner, code='OFFICE', name='Office Expense',
            ledger_account=self.expense_ledger,
        )
        self.cash = create_payment_account(
            organisation=self.org, outlet=self.outlet, user=self.owner,
            code='CASH-01', name='Main Cash', account_type='cash', opening_balance='5000.00',
        )
        self.bank = create_payment_account(
            organisation=self.org, outlet=None, user=self.owner,
            code='BANK-01', name='Current Account', account_type='bank', bank_name='SBI',
            account_number_last4='1234', opening_balance='10000.00',
        )
        self.client = APIClient()

    def _expense(self, request_id=None):
        return create_expense(
            organisation=self.org, outlet=self.outlet, category=self.category,
            payment_account=self.cash, expense_date=date.today(), amount='250.00',
            payee='Office Mart', reference_number='INV-10', user=self.owner,
            client_request_id=request_id,
        )

    def test_expense_posts_account_movement_and_balanced_journal(self):
        expense = self._expense()
        self.cash.refresh_from_db()
        self.assertEqual(self.cash.current_balance, Decimal('4750.00'))
        movement = PaymentAccountMovement.objects.get(source_type='expense', source_id=expense.id)
        self.assertEqual(movement.signed_amount, Decimal('-250.00'))
        journal = JournalEntry.objects.get(source_type='expense', source_id=expense.id)
        self.assertEqual(journal.total_debit, Decimal('250.00'))
        self.assertEqual(journal.total_credit, Decimal('250.00'))
        self.assertTrue(journal.lines.filter(account=self.expense_ledger, debit='250.00').exists())

    def test_expense_retry_is_idempotent_and_record_is_immutable(self):
        request_id = 'bdb6a660-23c5-4eb1-bb55-4a7b44cc53d8'
        first = self._expense(request_id)
        second = self._expense(request_id)
        self.assertEqual(first.id, second.id)
        self.assertEqual(PaymentAccountMovement.objects.filter(source_type='expense', source_id=first.id).count(), 1)
        first.amount = Decimal('300.00')
        with self.assertRaises(ValidationError):
            first.save()

    def test_void_expense_exactly_restores_account_and_reverses_journal(self):
        expense = self._expense()
        void_expense(expense, 'Entered twice by mistake', self.owner)
        void_expense(expense, 'Repeated void request', self.owner)
        self.cash.refresh_from_db(); expense.refresh_from_db()
        self.assertEqual(expense.status, Expense.STATUS_VOIDED)
        self.assertEqual(self.cash.current_balance, Decimal('5000.00'))
        movements = PaymentAccountMovement.objects.filter(source_type='expense', source_id=expense.id)
        self.assertEqual(movements.count(), 2)
        self.assertEqual(JournalEntry.objects.get(source_type='expense', source_id=expense.id, reversal_of__isnull=True).status, JournalEntry.STATUS_REVERSED)

    def test_transfer_posts_two_movements_and_one_journal(self):
        transfer = create_cash_bank_transfer(
            organisation=self.org, outlet=self.outlet, from_account=self.cash, to_account=self.bank,
            transfer_date=date.today(), amount='1000.00', reference_number='DEP-1', user=self.owner,
        )
        self.cash.refresh_from_db(); self.bank.refresh_from_db()
        self.assertEqual(transfer.transfer_type, 'cash_deposit')
        self.assertEqual(self.cash.current_balance, Decimal('4000.00'))
        self.assertEqual(self.bank.current_balance, Decimal('11000.00'))
        values = list(PaymentAccountMovement.objects.filter(source_type='cash_bank_transfer', source_id=transfer.id).values_list('signed_amount', flat=True))
        self.assertCountEqual(values, [Decimal('-1000.00'), Decimal('1000.00')])
        self.assertEqual(JournalEntry.objects.get(source_type='cash_bank_transfer', source_id=transfer.id).total_debit, Decimal('1000.00'))

    def test_void_transfer_exactly_restores_both_accounts(self):
        transfer = create_cash_bank_transfer(
            organisation=self.org, outlet=self.outlet, from_account=self.bank, to_account=self.cash,
            transfer_date=date.today(), amount='500.00', user=self.owner,
        )
        void_cash_bank_transfer(transfer, 'Wrong destination selected', self.owner)
        void_cash_bank_transfer(transfer, 'Repeated request', self.owner)
        self.cash.refresh_from_db(); self.bank.refresh_from_db(); transfer.refresh_from_db()
        self.assertEqual(transfer.status, CashBankTransfer.STATUS_VOIDED)
        self.assertEqual(self.cash.current_balance, Decimal('5000.00'))
        self.assertEqual(self.bank.current_balance, Decimal('10000.00'))
        self.assertEqual(PaymentAccountMovement.objects.filter(source_type='cash_bank_transfer', source_id=transfer.id).count(), 4)

    def test_same_account_and_cross_outlet_transfer_are_rejected(self):
        with self.assertRaises(ValidationError):
            create_cash_bank_transfer(
                organisation=self.org, outlet=self.outlet, from_account=self.cash, to_account=self.cash,
                transfer_date=date.today(), amount='100.00', user=self.owner,
            )
        other_cash = create_payment_account(
            organisation=self.org, outlet=self.other_outlet, user=self.owner,
            code='OTHER-CASH', name='Other Cash', account_type='cash',
        )
        with self.assertRaises(ValidationError):
            create_cash_bank_transfer(
                organisation=self.org, outlet=self.outlet, from_account=self.cash, to_account=other_cash,
                transfer_date=date.today(), amount='100.00', user=self.owner,
            )

    def test_expense_and_transfer_api_contracts(self):
        self.client.force_authenticate(self.owner)
        expense_response = self.client.post(
            f'/api/v1/organisations/{self.org.id}/outlets/{self.outlet.id}/expenses/',
            {'expense_date': date.today().isoformat(), 'category_id': str(self.category.id),
             'payment_account_id': str(self.cash.id), 'amount': '125.00', 'payee': 'Tea Shop'},
            format='json',
        )
        self.assertEqual(expense_response.status_code, 201, expense_response.data)
        self.assertEqual(expense_response.data['category_name'], 'Office Expense')
        self.assertIsNotNone(expense_response.data['accounting_journal_id'])
        transfer_response = self.client.post(
            f'/api/v1/organisations/{self.org.id}/outlets/{self.outlet.id}/cash-bank-transfers/',
            {'transfer_date': date.today().isoformat(), 'from_account_id': str(self.cash.id),
             'to_account_id': str(self.bank.id), 'amount': '300.00'}, format='json',
        )
        self.assertEqual(transfer_response.status_code, 201, transfer_response.data)
        self.assertEqual(transfer_response.data['transfer_type'], 'cash_deposit')
        self.assertIsNotNone(transfer_response.data['accounting_journal_id'])

    def test_cash_book_returns_running_balance(self):
        self._expense()
        self.client.force_authenticate(self.owner)
        response = self.client.get(
            f'/api/v1/organisations/{self.org.id}/outlets/{self.outlet.id}/payment-accounts/{self.cash.id}/book/',
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['opening_balance'], '5000.00')
        self.assertEqual(response.data['closing_balance'], '4750.00')
        self.assertEqual(response.data['results'][0]['credit'], '250.00')
