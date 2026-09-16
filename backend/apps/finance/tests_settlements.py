from datetime import date, datetime, time, timedelta
from decimal import Decimal
from uuid import uuid4

from django.core.exceptions import ValidationError
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounting.models import JournalEntry, ShiftAccountingPosting
from apps.employees.models import Employee, EmployeeDesignation
from apps.organizations.models import FinancialYear
from apps.organizations.services import create_organisation_with_owner, create_outlet
from apps.shifts.models import EmployeeShiftCollection, OperationalShift, ShiftDefinition
from apps.users.models import User

from .models import DigitalSettlement, PaymentAccountMovement
from .selectors import pending_digital_collections
from .services import create_digital_settlement, create_payment_account, void_digital_settlement


class DigitalSettlementTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(email='settlement-owner@example.com', password='secret')
        self.org = create_organisation_with_owner(name='Settlement Fuels', code='SET', owner_user=self.owner)
        self.outlet = create_outlet(self.org, name='Main Outlet', code='MAIN')
        self.other_outlet = create_outlet(self.org, name='Other Outlet', code='OTHER')
        today = date.today()
        FinancialYear.objects.create(
            organisation=self.org, name=f'FY {today.year}', start_date=date(today.year, 1, 1),
            end_date=date(today.year, 12, 31), status=FinancialYear.STATUS_OPEN, is_default=True,
        )
        self.bank = create_payment_account(
            organisation=self.org, outlet=self.outlet, user=self.owner, code='BANK-01',
            name='SBI Current', account_type='bank', bank_name='SBI',
            account_number_last4='1234', opening_balance=Decimal('1000.00'),
        )
        self.definition = ShiftDefinition.objects.create(
            organisation=self.org, outlet=self.outlet, code='DAY', name='Day',
            starts_at=time(6), ends_at=time(14),
        )
        start = timezone.make_aware(datetime.combine(today, time(6)))
        self.shift = OperationalShift.objects.create(
            organisation=self.org, outlet=self.outlet, shift_definition=self.definition,
            business_date=today, scheduled_starts_at=start,
            scheduled_ends_at=start + timedelta(hours=8), opened_at=start, opened_by=self.owner,
        )
        designation = EmployeeDesignation.objects.create(
            organisation=self.org, code='CASHIER', name='Cashier',
        )
        self.employee = Employee.objects.create(
            organisation=self.org, employee_code='EMP-001', display_name='Asha',
            designation=designation, created_by=self.owner, updated_by=self.owner,
        )
        self.card_1 = self._collection('card', '500.00', 'HDFC', 'CARD-001')
        self.card_2 = self._collection('card', '500.00', 'HDFC', 'CARD-002')
        self.upi = self._collection('upi', '250.00', 'PhonePe', 'UPI-001')
        self.shift.is_locked = True
        self.shift.locked_at = timezone.now()
        self.shift.locked_by = self.owner
        self.shift.lock_source = 'test'
        self.shift.save(update_fields=['is_locked', 'locked_at', 'locked_by', 'lock_source'])
        ShiftAccountingPosting.objects.create(
            organisation=self.org, outlet=self.outlet, operational_shift=self.shift, version=1,
            fuel_sales_amount=Decimal('1250.00'), card_amount=Decimal('1000.00'),
            upi_amount=Decimal('250.00'), posted_by=self.owner,
        )
        self.client = APIClient()

    def _collection(self, method, amount, provider, reference):
        return EmployeeShiftCollection.objects.create(
            organisation=self.org, outlet=self.outlet, operational_shift=self.shift,
            employee=self.employee, collection_method=method, amount=Decimal(amount),
            occurred_at=timezone.now(), provider_name=provider, reference_number=reference,
            created_by=self.owner, updated_by=self.owner,
        )

    def _settlement(self, collections=None, request_id=None):
        return create_digital_settlement(
            organisation=self.org, outlet=self.outlet, payment_account=self.bank,
            settlement_date=date.today(), collection_ids=[row.id for row in (collections or [self.card_1, self.card_2])],
            charges_amount='20.00', tds_amount='10.00', batch_reference='HDFC-BATCH-1',
            bank_reference='UTR-SETTLEMENT-1', client_request_id=request_id, user=self.owner,
        )

    def test_settlement_posts_bank_credit_and_balanced_journal(self):
        settlement = self._settlement()
        self.assertEqual(settlement.gross_amount, Decimal('1000.00'))
        self.assertEqual(settlement.net_amount, Decimal('970.00'))
        self.assertEqual(settlement.allocations.count(), 2)

        movement = PaymentAccountMovement.objects.get(
            source_type='digital_settlement', source_id=settlement.id,
            movement_type=PaymentAccountMovement.TYPE_DIGITAL_SETTLEMENT,
        )
        self.assertEqual(movement.signed_amount, Decimal('970.00'))
        self.bank.refresh_from_db()
        self.assertEqual(self.bank.current_balance, Decimal('1970.00'))

        journal = JournalEntry.objects.get(source_type='digital_settlement', source_id=settlement.id)
        self.assertEqual(journal.total_debit, Decimal('1000.00'))
        self.assertEqual(journal.total_credit, Decimal('1000.00'))
        lines = {line.account.system_key: (line.debit, line.credit) for line in journal.lines.select_related('account')}
        self.assertEqual(lines[f'payment_account:{self.bank.id}'], (Decimal('970.00'), Decimal('0.00')))
        self.assertEqual(lines['payment_gateway_charges'], (Decimal('20.00'), Decimal('0.00')))
        self.assertEqual(lines['tds_receivable'], (Decimal('10.00'), Decimal('0.00')))
        self.assertEqual(lines['digital_collection_clearing'], (Decimal('0.00'), Decimal('1000.00')))

    def test_pending_selector_and_api_exclude_active_allocations(self):
        self.assertEqual(pending_digital_collections(self.org, self.outlet).count(), 3)
        settlement = self._settlement()
        self.assertEqual(pending_digital_collections(self.org, self.outlet).count(), 1)

        self.client.force_authenticate(self.owner)
        response = self.client.get(
            f'/api/v1/organisations/{self.org.id}/outlets/{self.outlet.id}/digital-settlements/pending-collections/'
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual([row['id'] for row in response.data], [str(self.upi.id)])

        detail = self.client.get(
            f'/api/v1/organisations/{self.org.id}/outlets/{self.outlet.id}/digital-settlements/{settlement.id}/'
        )
        self.assertEqual(detail.status_code, 200, detail.data)
        self.assertEqual(detail.data['gross_amount'], '1000.00')
        self.assertEqual(len(detail.data['allocations']), 2)
        self.assertIsNotNone(detail.data['accounting_journal_id'])

    def test_method_or_provider_mixing_is_rejected_atomically(self):
        with self.assertRaises(ValidationError):
            self._settlement([self.card_1, self.upi])
        other_provider = self._collection('card', '100.00', 'ICICI', 'CARD-003')
        with self.assertRaises(ValidationError):
            self._settlement([self.card_1, other_provider])
        self.assertFalse(DigitalSettlement.objects.exists())
        self.assertFalse(PaymentAccountMovement.objects.filter(source_type='digital_settlement').exists())

    def test_collection_cannot_be_settled_twice_while_active(self):
        self._settlement()
        with self.assertRaises(ValidationError):
            self._settlement()
        self.assertEqual(DigitalSettlement.objects.count(), 1)

    def test_client_retry_is_idempotent(self):
        request_id = uuid4()
        first = self._settlement(request_id=request_id)
        second = self._settlement(request_id=request_id)
        self.assertEqual(first.id, second.id)
        self.assertEqual(PaymentAccountMovement.objects.filter(source_id=first.id).count(), 1)
        self.assertEqual(JournalEntry.objects.filter(source_type='digital_settlement', source_id=first.id).count(), 1)

    def test_void_exactly_reverses_and_releases_collections(self):
        settlement = self._settlement()
        void_digital_settlement(settlement, 'Incorrect bank reference', self.owner)
        void_digital_settlement(settlement, 'Repeated request', self.owner)

        settlement.refresh_from_db()
        self.bank.refresh_from_db()
        self.assertEqual(settlement.status, DigitalSettlement.STATUS_VOIDED)
        self.assertEqual(self.bank.current_balance, Decimal('1000.00'))
        movements = PaymentAccountMovement.objects.filter(source_id=settlement.id).order_by('created_at')
        self.assertEqual(list(movements.values_list('signed_amount', flat=True)), [Decimal('970.00'), Decimal('-970.00')])
        original = JournalEntry.objects.get(
            source_type='digital_settlement', source_id=settlement.id, reversal_of__isnull=True,
        )
        self.assertEqual(original.status, JournalEntry.STATUS_REVERSED)
        reversal = JournalEntry.objects.get(reversal_of=original)
        self.assertEqual(reversal.total_debit, original.total_credit)
        self.assertEqual(reversal.total_credit, original.total_debit)
        self.assertEqual(pending_digital_collections(self.org, self.outlet).count(), 3)

    def test_recorded_settlement_and_allocations_are_immutable(self):
        settlement = self._settlement()
        settlement.bank_reference = 'CHANGED'
        with self.assertRaises(ValidationError):
            settlement.save()
        allocation = settlement.allocations.first()
        allocation.amount = Decimal('1.00')
        with self.assertRaises(ValidationError):
            allocation.save()

    def test_api_creates_settlement_and_validates_bank_account(self):
        self.client.force_authenticate(self.owner)
        response = self.client.post(
            f'/api/v1/organisations/{self.org.id}/outlets/{self.outlet.id}/digital-settlements/',
            {
                'client_request_id': str(uuid4()), 'settlement_date': date.today().isoformat(),
                'payment_account_id': str(self.bank.id),
                'collection_ids': [str(self.card_1.id), str(self.card_2.id)],
                'charges_amount': '20.00', 'tds_amount': '10.00',
                'batch_reference': 'HDFC-BATCH-1', 'bank_reference': 'UTR-API-1',
            }, format='json',
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['settlement_number'], f'SET-MAIN-{date.today().year}-00001')
        self.assertEqual(response.data['net_amount'], '970.00')
        self.assertEqual(len(response.data['account_movements']), 1)
