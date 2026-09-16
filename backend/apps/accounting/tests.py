from datetime import date
from decimal import Decimal
from io import StringIO

from django.core.exceptions import ValidationError
from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIClient

from apps.organizations.models import FinancialYear
from apps.organizations.services import create_organisation_with_owner, create_outlet
from apps.purchases.models import PurchaseBill
from apps.purchases.services import create_supplier
from apps.users.models import User

from .models import ChartOfAccount, JournalEntry, JournalLine
from .selectors import account_ledger, trial_balance
from .services import create_account, lock_period, post_journal, reverse_journal, unlock_period


class AccountingCoreTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email='accounts-owner@example.com', password='secret')
        self.org = create_organisation_with_owner(name='Ledger Fuels', code='LF', owner_user=self.user)
        self.outlet = create_outlet(self.org, name='Main Outlet', code='MAIN')
        FinancialYear.objects.create(
            organisation=self.org, name='FY 2026', start_date=date(2026, 1, 1),
            end_date=date(2026, 12, 31), status=FinancialYear.STATUS_OPEN, is_default=True,
        )
        self.cash = ChartOfAccount.objects.get(organisation=self.org, system_key='accounts_receivable')
        self.income = ChartOfAccount.objects.get(organisation=self.org, system_key='service_income')
        self.client = APIClient()

    def journal(self, request_id=None):
        return post_journal(
            organisation=self.org, outlet=self.outlet, entry_date=date(2026, 9, 15),
            narration='Service income received', reference='REF-01', user=self.user,
            client_request_id=request_id,
            lines=[
                {'account_id': self.cash.id, 'debit': '1000.00', 'credit': '0'},
                {'account_id': self.income.id, 'debit': '0', 'credit': '1000.00'},
            ],
        )

    def test_standard_chart_is_created_for_new_organisation(self):
        self.assertEqual(ChartOfAccount.objects.filter(organisation=self.org).count(), 21)
        self.assertEqual(self.cash.parent.system_key, 'assets')
        self.assertTrue(ChartOfAccount.objects.get(organisation=self.org, system_key='assets').is_group)

    def test_account_codes_are_unique_per_organisation_case_insensitively(self):
        create_account(organisation=self.org, code='6110', name='Electricity', account_type='expense', user=self.user)
        with self.assertRaises(ValidationError):
            create_account(organisation=self.org, code='6110', name='Power', account_type='expense', user=self.user)
        other_user = User.objects.create_user(email='other-owner@example.com', password='secret')
        other_org = create_organisation_with_owner(name='Other Fuels', code='OF', owner_user=other_user)
        create_account(organisation=other_org, code='6110', name='Power', account_type='expense', user=other_user)

    def test_parent_must_be_group_of_same_type_and_tenant(self):
        with self.assertRaises(ValidationError):
            create_account(organisation=self.org, code='6110', name='Bad Child', account_type='expense', parent=self.cash, user=self.user)
        with self.assertRaises(ValidationError):
            create_account(organisation=self.org, code='6111', name='Bad Parent', account_type='asset', parent=self.cash, user=self.user)

    def test_balanced_journal_posts_with_snapshots_and_sequence(self):
        journal = self.journal()
        self.assertEqual(journal.journal_number, 'JV-MAIN-2026-00001')
        self.assertEqual(journal.total_debit, Decimal('1000.00'))
        self.assertEqual(journal.lines.count(), 2)
        self.assertEqual(journal.lines.get(sequence=1).account_name_snapshot, self.cash.name)

    def test_unbalanced_journal_is_rejected_atomically(self):
        with self.assertRaises(ValidationError):
            post_journal(
                organisation=self.org, outlet=self.outlet, entry_date=date(2026, 9, 15),
                narration='Unbalanced attempt', user=self.user,
                lines=[{'account_id': self.cash.id, 'debit': '100', 'credit': '0'}, {'account_id': self.income.id, 'debit': '0', 'credit': '99'}],
            )
        self.assertFalse(JournalEntry.objects.exists())
        self.assertFalse(JournalLine.objects.exists())

    def test_cross_tenant_account_is_rejected(self):
        other_user = User.objects.create_user(email='tenant-owner@example.com', password='secret')
        other_org = create_organisation_with_owner(name='Tenant Fuels', code='TF', owner_user=other_user)
        other_account = ChartOfAccount.objects.get(organisation=other_org, system_key='accounts_receivable')
        with self.assertRaises(ValidationError):
            post_journal(
                organisation=self.org, outlet=self.outlet, entry_date=date(2026, 9, 15), narration='Cross tenant attempt', user=self.user,
                lines=[{'account_id': other_account.id, 'debit': '100', 'credit': '0'}, {'account_id': self.income.id, 'debit': '0', 'credit': '100'}],
            )

    def test_client_request_is_idempotent(self):
        request_id = '455dfabc-c994-46df-ae93-290c2218777d'
        first = self.journal(request_id); second = self.journal(request_id)
        self.assertEqual(first.id, second.id)
        self.assertEqual(JournalEntry.objects.count(), 1)

    def test_posted_journal_and_lines_are_immutable(self):
        journal = self.journal(); journal.narration = 'Changed narration'
        with self.assertRaises(ValidationError): journal.save()
        line = journal.lines.first(); line.debit = Decimal('900.00')
        with self.assertRaises(ValidationError): line.save()
        with self.assertRaises(ValidationError): journal.delete()

    def test_reversal_swaps_lines_and_nets_ledger_to_zero(self):
        original = self.journal()
        reversal = reverse_journal(original, 'Incorrect ledger selection', self.user, date(2026, 9, 16))
        original.refresh_from_db()
        self.assertEqual(original.status, JournalEntry.STATUS_REVERSED)
        self.assertEqual(reversal.reversal_of_id, original.id)
        self.assertEqual(reversal.lines.get(sequence=1).credit, Decimal('1000.00'))
        result = trial_balance(self.org, self.outlet)
        self.assertEqual(Decimal(result['total_debit']), Decimal('2000.00'))
        self.assertEqual(account_ledger(self.org, self.outlet, self.cash)['closing_balance'], '0.00')

    def test_period_lock_blocks_posting_until_audited_unlock(self):
        period = lock_period(organisation=self.org, outlet=self.outlet, month=date(2026, 9, 1), reason='September books finalised', user=self.user)
        with self.assertRaises(ValidationError): self.journal()
        unlock_period(period, 'Correction approved by owner', self.user)
        self.assertEqual(self.journal().total_credit, Decimal('1000.00'))
        period.refresh_from_db()
        self.assertEqual(period.unlock_reason, 'Correction approved by owner')

    def test_journal_api_contract(self):
        self.client.force_authenticate(self.user)
        response = self.client.post(
            f'/api/v1/organisations/{self.org.id}/outlets/{self.outlet.id}/accounting/journals/',
            {
                'client_request_id': 'd1be2827-1471-46b1-ac0f-3ed08ca57210',
                'entry_date': '2026-09-15', 'reference': 'API-01', 'narration': 'API journal posting',
                'lines': [
                    {'account_id': str(self.cash.id), 'debit': '250.00', 'credit': '0.00'},
                    {'account_id': str(self.income.id), 'debit': '0.00', 'credit': '250.00'},
                ],
            }, format='json',
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['total_debit'], '250.00')
        self.assertEqual(response.data['lines'][0]['account_code_snapshot'], self.cash.code)

    def test_general_ledger_reconciliation_is_preview_first_and_idempotent(self):
        supplier = create_supplier(self.org, code='SUP-1', name='Test Supplier')
        bill = PurchaseBill.objects.create(
            organisation=self.org, outlet=self.outlet, supplier=supplier,
            bill_number='PB-LEGACY-1', supplier_invoice_number='LEGACY-1',
            normalized_supplier_invoice_number='LEGACY-1', invoice_date=date(2026, 9, 15),
            due_date=date(2026, 10, 15), grand_total=Decimal('500.00'),
            outstanding_amount=Decimal('500.00'),
        )
        preview = StringIO()
        call_command('reconcile_general_ledger', organisation=self.org.code, stdout=preview)
        self.assertIn('Preview complete: 1 missing journal', preview.getvalue())
        self.assertFalse(JournalEntry.objects.filter(source_type='purchase_bill', source_id=bill.id).exists())

        call_command('reconcile_general_ledger', organisation=str(self.org.id), apply=True, stdout=StringIO())
        call_command('reconcile_general_ledger', organisation=str(self.org.id), apply=True, stdout=StringIO())
        self.assertEqual(JournalEntry.objects.filter(source_type='purchase_bill', source_id=bill.id).count(), 1)
