from datetime import date
from decimal import Decimal

from django.core.exceptions import ValidationError

from apps.accounting.models import JournalEntry, ShiftAccountingPosting
from apps.finance.models import PaymentAccountMovement
from apps.finance.selectors import pending_digital_collections
from apps.finance.services import create_payment_account
from apps.organizations.models import FinancialYear
from apps.shifts.models import EmployeeShiftDeduction
from apps.shifts.services import (
    approve_shift_deduction,
    atomic_save_shift_card,
    calculate_employee_settlement,
    create_customer,
    lock_shift,
    unlock_shift,
)
from apps.shifts.tests_shift_cards import ShiftCardBaseTestCase
from apps.sales.services import create_sales_invoice


class ShiftAccountingTests(ShiftCardBaseTestCase):
    business_date = date(2026, 9, 1)

    def setUp(self):
        super().setUp()
        FinancialYear.objects.create(
            organisation=self.org,
            name='FY 2026',
            start_date=date(2026, 1, 1),
            end_date=date(2026, 12, 31),
            status=FinancialYear.STATUS_OPEN,
            is_default=True,
        )
        self.cash_account = create_payment_account(
            organisation=self.org,
            outlet=self.outlet,
            user=self.owner,
            code='CASH-COUNTER',
            name='Counter Cash',
            account_type='cash',
        )

    def _card(self, **overrides):
        values = {
            'organisation': self.org,
            'outlet': self.outlet,
            'user': self.owner,
            'shift_definition': self.shift_def,
            'business_date': self.business_date,
            'employee': self.emp1,
            'nozzle_meters_data': [{
                'nozzle_id': self.nozzle1.id,
                'opening_reading': Decimal('1000.000'),
                'closing_reading': Decimal('1100.000'),
            }],
        }
        values.update(overrides)
        return atomic_save_shift_card(**values)

    def test_lock_posts_mixed_collections_to_cash_and_digital_clearing(self):
        card = self._card(
            cash_data={'amount': Decimal('4000.00')},
            cards_data=[{'amount': '2500.00', 'provider_name': 'HDFC', 'reference_number': 'CARD-1'}],
            upi_data=[{'amount': '2000.00', 'provider_name': 'PhonePe', 'reference_number': 'UPI-1'}],
            fleet_data=[{'amount': '1500.00', 'provider_name': 'FleetCo', 'reference_number': 'FLEET-1'}],
        )

        calculated = calculate_employee_settlement(card.parent_shift, self.emp1)
        self.assertEqual(calculated['fleet_card_amount'], Decimal('1500.00'))
        self.assertEqual(calculated['total_accounted_amount'], Decimal('10000.00'))

        locked = lock_shift(card.parent_shift, self.owner, cash_account=self.cash_account)
        self.assertTrue(locked.is_locked)
        posting = ShiftAccountingPosting.objects.get(operational_shift=locked, status='active')
        self.assertEqual(posting.fuel_sales_amount, Decimal('10000.00'))
        self.assertEqual(posting.cash_amount, Decimal('4000.00'))
        self.assertEqual(posting.digital_amount, Decimal('6000.00'))

        journal = JournalEntry.objects.get(source_type='shift_accounting', source_id=posting.id)
        self.assertEqual(journal.total_debit, Decimal('10000.00'))
        self.assertEqual(journal.total_credit, Decimal('10000.00'))
        lines = {line.account.system_key: (line.debit, line.credit) for line in journal.lines.select_related('account')}
        self.assertEqual(lines[f'payment_account:{self.cash_account.id}'], (Decimal('4000.00'), Decimal('0.00')))
        self.assertEqual(lines['digital_collection_clearing'], (Decimal('6000.00'), Decimal('0.00')))
        self.assertEqual(lines['fuel_sales'], (Decimal('0.00'), Decimal('10000.00')))
        self.assertEqual(pending_digital_collections(self.org, self.outlet).count(), 3)

    def test_unlock_exactly_reverses_shortage_posting_and_relock_versions_it(self):
        card = self._card(
            cash_data={'amount': Decimal('9800.00')},
            is_shortage_excess_acknowledged=True,
            shortage_excess_acknowledgement_note='Employee accepted the shortage',
        )
        lock_shift(card.parent_shift, self.owner, cash_account=self.cash_account)
        first = ShiftAccountingPosting.objects.get(operational_shift=card.parent_shift, version=1)
        journal = JournalEntry.objects.get(source_type='shift_accounting', source_id=first.id)
        shortage = journal.lines.get(account__system_key='employee_shortage_receivable')
        self.assertEqual(shortage.debit, Decimal('200.00'))
        self.cash_account.refresh_from_db()
        self.assertEqual(self.cash_account.current_balance, Decimal('9800.00'))

        unlock_shift(card.parent_shift, self.owner, 'Correction required')
        first.refresh_from_db()
        journal.refresh_from_db()
        self.cash_account.refresh_from_db()
        self.assertEqual(first.status, ShiftAccountingPosting.STATUS_REVERSED)
        self.assertEqual(journal.status, JournalEntry.STATUS_REVERSED)
        self.assertEqual(self.cash_account.current_balance, Decimal('0.00'))
        movements = PaymentAccountMovement.objects.filter(
            source_type='shift_accounting', source_id=first.id,
        ).order_by('created_at')
        self.assertEqual(list(movements.values_list('signed_amount', flat=True)), [Decimal('9800.00'), Decimal('-9800.00')])

        lock_shift(card.parent_shift, self.owner, cash_account=self.cash_account)
        second = ShiftAccountingPosting.objects.get(operational_shift=card.parent_shift, status='active')
        self.assertEqual(second.version, 2)
        self.assertNotEqual(first.id, second.id)

    def test_pending_expense_blocks_lock_then_approved_expense_balances_journal(self):
        card = self._card(
            cash_data={'amount': Decimal('9500.00')},
            deductions_data=[{
                'deduction_type': 'cash_expense',
                'amount': Decimal('500.00'),
                'description': 'Approved delivery expense',
            }],
            is_shortage_excess_acknowledged=True,
            shortage_excess_acknowledgement_note='Expense awaiting approval',
        )
        deduction = EmployeeShiftDeduction.objects.get(shift_card=card)
        with self.assertRaises(ValidationError):
            lock_shift(card.parent_shift, self.owner, cash_account=self.cash_account)

        approve_shift_deduction(deduction.id, self.owner)
        lock_shift(card.parent_shift, self.owner, cash_account=self.cash_account)
        posting = ShiftAccountingPosting.objects.get(operational_shift=card.parent_shift, status='active')
        journal = JournalEntry.objects.get(source_type='shift_accounting', source_id=posting.id)
        expense = journal.lines.get(account__system_key='shift_adjustment_expense')
        self.assertEqual(expense.debit, Decimal('500.00'))
        self.assertEqual(journal.total_debit, Decimal('10000.00'))
        self.assertEqual(journal.total_credit, Decimal('10000.00'))

    def test_lock_is_idempotent(self):
        card = self._card(cash_data={'amount': Decimal('10000.00')})
        first_shift = lock_shift(card.parent_shift, self.owner, cash_account=self.cash_account)
        second_shift = lock_shift(first_shift, self.owner, cash_account=self.cash_account)
        self.assertEqual(first_shift.id, second_shift.id)
        self.assertEqual(ShiftAccountingPosting.objects.filter(operational_shift=first_shift).count(), 1)
        self.assertEqual(JournalEntry.objects.filter(source_type='shift_accounting').count(), 1)
        self.assertEqual(PaymentAccountMovement.objects.filter(source_type='shift_accounting').count(), 1)

    def test_credit_slip_invoice_does_not_post_fuel_revenue_twice(self):
        customer = create_customer(
            organisation=self.org,
            customer_code='CREDIT-01',
            display_name='Fleet Customer',
            user=self.owner,
            outlet_ids=[self.outlet.id],
            credit_limit=Decimal('50000.00'),
        )
        card = self._card(
            cash_data={'amount': Decimal('9000.00')},
            credit_slips_data=[{
                'customer_id': customer.id,
                'nozzle_id': self.nozzle1.id,
                'product_id': self.product.id,
                'quantity': Decimal('10.000'),
                'unit_price': Decimal('100.0000'),
                'slip_number': 'CS-001',
            }],
        )
        lock_shift(card.parent_shift, self.owner, cash_account=self.cash_account)
        slip = card.credit_slips.get()

        invoice = create_sales_invoice(
            organisation=self.org,
            outlet=self.outlet,
            customer=customer,
            invoice_date=self.business_date,
            invoice_type='credit',
            lines=[{'credit_slip_id': slip.id}],
            user=self.owner,
        )

        self.assertEqual(invoice.grand_total, Decimal('1000.00'))
        self.assertFalse(JournalEntry.objects.filter(source_type='sales_invoice', source_id=invoice.id).exists())
        shift_journal = JournalEntry.objects.get(source_type='shift_accounting')
        self.assertEqual(shift_journal.lines.get(account__system_key='accounts_receivable').debit, Decimal('1000.00'))
        self.assertEqual(shift_journal.lines.get(account__system_key='fuel_sales').credit, Decimal('10000.00'))
        with self.assertRaises(ValidationError):
            unlock_shift(card.parent_shift, self.owner, 'Correct meter reading')
