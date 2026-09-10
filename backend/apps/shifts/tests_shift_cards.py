# apps/shifts/tests_shift_cards.py
from datetime import time, date, datetime, timedelta
from decimal import Decimal
import io
from django.test import TestCase
from django.urls import reverse
from django.core.exceptions import ValidationError
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

from apps.organizations.models import Organisation, Outlet, Role, PermissionDefinition, RolePermission, OrganisationMembership
from apps.organizations.services import create_organisation_with_owner, create_outlet
from apps.employees.models import Employee, EmployeeDesignation
from apps.employees.services import create_employee, create_designation, assign_employee_to_outlets
from apps.forecourt.models import FuelProduct, Tank, Dispenser, Nozzle, ProductPrice
from apps.forecourt.services import create_fuel_product, create_tank, create_dispenser, create_nozzle, set_product_price
from apps.operations.models import NozzleCommissioning, OpeningBalanceBatch, NozzleOpeningBalance
from apps.operations.services import commission_nozzle
from apps.shifts.models import (
    ShiftDefinition, OperationalShift, EmployeeShiftCard, ShiftNozzleMeter,
    EmployeeShiftCollection, EmployeeShiftDeduction, EmployeeShiftSettlement,
    FuelCreditSlip, Customer
)
from apps.shifts.services import (
    create_shift_definition, atomic_save_shift_card, void_shift_card,
    lock_shift, unlock_shift, approve_shift_deduction, reject_shift_deduction,
    recheck_chronological_continuity_chain
)
from apps.shifts.selectors import (
    get_historical_nozzles_for_shift, derive_nozzle_opening_reading,
    get_shift_card_preparation_data, get_last_entered_business_date
)

User = get_user_model()


class ShiftCardBaseTestCase(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(email="owner_sc@example.com", password="password")
        self.org = create_organisation_with_owner(name="ShiftCard Org", code="SCORG", owner_user=self.owner)
        self.outlet = create_outlet(self.org, name="SC Outlet", code="SCOUT1")

        self.designation = create_designation(self.org, code="DSM", name="Pump Attendant", requires_nozzle_assignment=True)
        self.emp1 = create_employee(self.org, employee_code="EMP_SC1", display_name="John DSM", designation=self.designation)
        self.emp2 = create_employee(self.org, employee_code="EMP_SC2", display_name="Jane DSM", designation=self.designation)

        assign_employee_to_outlets(self.emp1, [{'outlet_id': self.outlet.id, 'is_primary': True}])
        assign_employee_to_outlets(self.emp2, [{'outlet_id': self.outlet.id, 'is_primary': True}])

        self.product = create_fuel_product(self.org, code="MS", name="Petrol", category="petrol", unit="litre")
        self.tank = create_tank(self.org, self.outlet, self.product, code="TK1", name="Tank 1", capacity=10000)
        self.dispenser = create_dispenser(self.org, self.outlet, code="DP1", name="Dispenser 1")
        self.nozzle1 = create_nozzle(self.org, self.outlet, self.dispenser, self.tank, code="NZ1", name="Nozzle 1")
        self.nozzle2 = create_nozzle(self.org, self.outlet, self.dispenser, self.tank, code="NZ2", name="Nozzle 2")

        # Commission nozzle1 initially
        commission_nozzle(
            organisation=self.org,
            outlet=self.outlet,
            nozzle=self.nozzle1,
            initial_totalizer=Decimal('1000.000'),
            effective_at=timezone.make_aware(datetime(2026, 8, 1, 0, 0)),
            reason="Initial commissioning NZ1",
            actor=self.owner
        )

        # Set product price
        set_product_price(
            self.org, self.outlet, self.product,
            selling_price=Decimal('100.00'),
            effective_from=timezone.make_aware(datetime(2026, 8, 1, 0, 0)),
            created_by=self.owner
        )

        self.shift_def = create_shift_definition(
            self.org, self.outlet, code="S1", name="Day Shift",
            starts_at=time(6, 0), ends_at=time(14, 0)
        )

        self.client = APIClient()
        self.client.force_authenticate(user=self.owner)


class ShiftCardWorkflowTests(ShiftCardBaseTestCase):

    def test_01_employee_shift_card_conditional_uniqueness(self):
        """1. One active Employee Shift Card per parent shift and employee. Voided cards must not prevent creating replacement."""
        b_date = date(2026, 9, 1)

        # Create first active card
        card1 = atomic_save_shift_card(
            organisation=self.org,
            outlet=self.outlet,
            user=self.owner,
            shift_definition=self.shift_def,
            business_date=b_date,
            employee=self.emp1,
            nozzle_meters_data=[{
                'nozzle_id': self.nozzle1.id,
                'opening_reading': Decimal('1000.000'),
                'closing_reading': Decimal('1100.000')
            }],
            cash_data={'amount': Decimal('10000.00')}
        )
        self.assertEqual(card1.status, EmployeeShiftCard.STATUS_ACTIVE)
        self.assertEqual(card1.total_sale_amount, Decimal('10000.00'))

        # Void card1
        voided = void_shift_card(card1, user=self.owner, reason="DSM entered wrong nozzle readings")
        self.assertEqual(voided.status, EmployeeShiftCard.STATUS_VOID)
        self.assertIsNotNone(voided.voided_at)
        self.assertEqual(voided.void_reason, "DSM entered wrong nozzle readings")

        # Now creating a replacement active card for the same parent shift and employee must succeed!
        card2 = atomic_save_shift_card(
            organisation=self.org,
            outlet=self.outlet,
            user=self.owner,
            shift_definition=self.shift_def,
            business_date=b_date,
            employee=self.emp1,
            nozzle_meters_data=[{
                'nozzle_id': self.nozzle1.id,
                'opening_reading': Decimal('1000.000'),
                'closing_reading': Decimal('1120.000')
            }],
            cash_data={'amount': Decimal('12000.00')}
        )
        self.assertEqual(card2.status, EmployeeShiftCard.STATUS_ACTIVE)
        self.assertNotEqual(card1.id, card2.id)
        self.assertEqual(card2.total_sale_amount, Decimal('12000.00'))

    def test_02_expense_approval_defaults_to_pending(self):
        """2. Expense approval must default to pending. Only approved deductions affect Accounted Amount."""
        b_date = date(2026, 9, 1)
        card = atomic_save_shift_card(
            organisation=self.org,
            outlet=self.outlet,
            user=self.owner,
            shift_definition=self.shift_def,
            business_date=b_date,
            employee=self.emp1,
            nozzle_meters_data=[{
                'nozzle_id': self.nozzle1.id,
                'opening_reading': Decimal('1000.000'),
                'closing_reading': Decimal('1100.000')  # 100L * 100 = 10000 sale
            }],
            cash_data={'amount': Decimal('9500.00')},
            deductions_data=[{
                'deduction_type': 'cash_expense',
                'amount': Decimal('500.00'),
                'description': 'Office tea expense'
            }],
            is_shortage_excess_acknowledged=True,
            shortage_excess_acknowledgement_note="Pending manager expense approval"
        )

        deduction = EmployeeShiftDeduction.objects.get(shift_card=card)
        self.assertEqual(deduction.approval_status, EmployeeShiftDeduction.APPROVAL_PENDING)

        # Settlement check: Because deduction is pending, total_accounted is only cash (9500.00), leaving difference -500.00
        settlement = card.settlement
        self.assertEqual(settlement.expected_sale_amount, Decimal('10000.00'))
        self.assertEqual(settlement.cash_amount, Decimal('9500.00'))
        self.assertEqual(settlement.total_accounted_amount, Decimal('9500.00'))
        self.assertEqual(settlement.difference_amount, Decimal('-500.00'))

        # Now manager approves the deduction via approve_shift_deduction
        approved = approve_shift_deduction(deduction.id, user=self.owner)
        self.assertEqual(approved.approval_status, EmployeeShiftDeduction.APPROVAL_APPROVED)

        # Card settlement must now reflect the approved deduction, balancing the card!
        card.refresh_from_db()
        settlement.refresh_from_db()
        self.assertEqual(settlement.total_accounted_amount, Decimal('10000.00'))
        self.assertEqual(settlement.difference_amount, Decimal('0.00'))
        self.assertEqual(settlement.result, EmployeeShiftSettlement.RESULT_BALANCED)

    def test_03_deduction_endpoints(self):
        """2b. Manager approve/reject endpoints work and reject deduction prevents affecting settlement."""
        b_date = date(2026, 9, 1)
        card = atomic_save_shift_card(
            organisation=self.org,
            outlet=self.outlet,
            user=self.owner,
            shift_definition=self.shift_def,
            business_date=b_date,
            employee=self.emp1,
            nozzle_meters_data=[{
                'nozzle_id': self.nozzle1.id,
                'opening_reading': Decimal('1000.000'),
                'closing_reading': Decimal('1050.000')
            }],
            cash_data={'amount': Decimal('4800.00')},
            deductions_data=[{
                'deduction_type': 'cash_expense',
                'amount': Decimal('200.00'),
                'description': 'Disputed snack expense'
            }],
            is_shortage_excess_acknowledged=True,
            shortage_excess_acknowledgement_note="Waiting on review"
        )
        ded = EmployeeShiftDeduction.objects.get(shift_card=card)

        # Reject deduction via API
        url = reverse('shift_deduction_reject', kwargs={
            'org_id': self.org.id,
            'outlet_id': self.outlet.id,
            'deduction_id': ded.id
        })
        resp = self.client.post(url, {'reason': 'Receipt is invalid and disallowed by policy'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        ded.refresh_from_db()
        self.assertEqual(ded.approval_status, EmployeeShiftDeduction.APPROVAL_REJECTED)
        self.assertEqual(ded.rejection_reason, 'Receipt is invalid and disallowed by policy')

    def test_04_historical_equipment_availability(self):
        """3. Backdated coverage must use historical equipment availability at shift physical time."""
        # NZ1 was commissioned 2026-08-01
        # Now commission NZ2 on 2026-09-04
        commission_nozzle(
            organisation=self.org,
            outlet=self.outlet,
            nozzle=self.nozzle2,
            initial_totalizer=Decimal('2000.000'),
            effective_at=timezone.make_aware(datetime(2026, 9, 4, 10, 0)),
            reason="Commissioning NZ2",
            actor=self.owner
        )

        # For backdated shift on 2026-09-01: NZ2 MUST NOT BE REQUIRED!
        nozzles_sep1 = get_historical_nozzles_for_shift(
            self.outlet,
            as_of_time=timezone.make_aware(datetime(2026, 9, 1, 14, 0))
        )
        nz_ids_sep1 = [n.id for n in nozzles_sep1]
        self.assertIn(self.nozzle1.id, nz_ids_sep1)
        self.assertNotIn(self.nozzle2.id, nz_ids_sep1)

        # For shift on 2026-09-05: both NZ1 and NZ2 are active and required
        nozzles_sep5 = get_historical_nozzles_for_shift(
            self.outlet,
            as_of_time=timezone.make_aware(datetime(2026, 9, 5, 14, 0))
        )
        nz_ids_sep5 = [n.id for n in nozzles_sep5]
        self.assertIn(self.nozzle1.id, nz_ids_sep5)
        self.assertIn(self.nozzle2.id, nz_ids_sep5)

    def test_05_commissioning_baseline_cannot_be_bypassed(self):
        """4. Physical-slip opening cannot bypass commissioning for an uncommissioned nozzle."""
        # Uncommissioned nozzle
        uncommissioned_nz = create_nozzle(self.org, self.outlet, self.dispenser, self.tank, code="NZ_NEW", name="Uncommissioned")
        derived = derive_nozzle_opening_reading(
            self.outlet,
            uncommissioned_nz,
            shift_definition=self.shift_def,
            business_date=date(2026, 9, 1)
        )
        self.assertIsNone(derived['reading'])
        self.assertTrue(derived['requires_commissioning'])
        self.assertEqual(derived['continuity_status'], ShiftNozzleMeter.CONTINUITY_EXCEPTION)

        # Attempting to save shift card with opening reading for uncommissioned nozzle without baseline raises ValidationError
        with self.assertRaises(ValidationError) as cm:
            atomic_save_shift_card(
                organisation=self.org,
                outlet=self.outlet,
                user=self.owner,
                shift_definition=self.shift_def,
                business_date=date(2026, 9, 1),
                employee=self.emp1,
                nozzle_meters_data=[{
                    'nozzle_id': uncommissioned_nz.id,
                    'opening_reading': Decimal('100.000'),
                    'closing_reading': Decimal('150.000')
                }],
                cash_data={'amount': Decimal('5000.00')}
            )
        self.assertIn('requires commissioning', str(cm.exception))

    def test_06_retired_mutation_endpoints_return_410_gone(self):
        """5. Old live mutation endpoints return 410 Gone."""
        # 1. ShiftOpenView
        open_url = reverse('shift_open', kwargs={'org_id': self.org.id, 'outlet_id': self.outlet.id})
        resp = self.client.post(open_url, {'shift_definition_id': str(self.shift_def.id), 'business_date': '2026-09-01'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_410_GONE)
        self.assertEqual(resp.data.get('code'), 'ENDPOINT_RETIRED')

        # Create a parent shift for testing child retired mutations
        parent = OperationalShift.objects.create(
            organisation=self.org,
            outlet=self.outlet,
            shift_definition=self.shift_def,
            business_date=date(2026, 9, 1),
            scheduled_starts_at=timezone.now(),
            scheduled_ends_at=timezone.now() + timedelta(hours=8),
            opened_at=timezone.now(),
            opened_by=self.owner,
            status=OperationalShift.STATUS_OPEN
        )

        # 2. ShiftCloseView
        close_url = reverse('shift_close', kwargs={'org_id': self.org.id, 'outlet_id': self.outlet.id, 'shift_id': parent.id})
        resp = self.client.post(close_url, {}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_410_GONE)

        # 3. ShiftReopenView
        reopen_url = reverse('shift_reopen', kwargs={'org_id': self.org.id, 'outlet_id': self.outlet.id, 'shift_id': parent.id})
        resp = self.client.post(reopen_url, {'reason': 'test'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_410_GONE)

        # 4. Assignments update
        assign_url = reverse('shift_assignments_update', kwargs={'org_id': self.org.id, 'outlet_id': self.outlet.id, 'shift_id': parent.id})
        resp = self.client.post(assign_url, {}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_410_GONE)

        # 5. Live reconciliation
        recon_url = reverse('employee_reconcile', kwargs={
            'org_id': self.org.id,
            'outlet_id': self.outlet.id,
            'shift_id': parent.id,
            'employee_id': self.emp1.id
        })
        resp = self.client.post(recon_url, {}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_410_GONE)

    def test_07_controlled_locking_and_unlocking(self):
        """6. Controlled locking and unlocking: locking blocks edits, unlocking requires reason & permission."""
        b_date = date(2026, 9, 1)
        card = atomic_save_shift_card(
            organisation=self.org,
            outlet=self.outlet,
            user=self.owner,
            shift_definition=self.shift_def,
            business_date=b_date,
            employee=self.emp1,
            nozzle_meters_data=[{
                'nozzle_id': self.nozzle1.id,
                'opening_reading': Decimal('1000.000'),
                'closing_reading': Decimal('1050.000')
            }],
            cash_data={'amount': Decimal('5000.00')}
        )
        parent = card.parent_shift

        # Lock shift
        lock_url = reverse('shift_lock', kwargs={'org_id': self.org.id, 'outlet_id': self.outlet.id, 'shift_id': parent.id})
        resp = self.client.post(lock_url, {'reason': 'Shift audit complete'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        parent.refresh_from_db()
        self.assertTrue(parent.is_locked)

        # Editing card on locked shift raises error
        with self.assertRaises(ValidationError):
            atomic_save_shift_card(
                organisation=self.org,
                outlet=self.outlet,
                user=self.owner,
                shift_definition=self.shift_def,
                business_date=b_date,
                employee=self.emp1,
                nozzle_meters_data=[{
                    'nozzle_id': self.nozzle1.id,
                    'opening_reading': Decimal('1000.000'),
                    'closing_reading': Decimal('1060.000')
                }],
                card_id=str(card.id)
            )

        # Attempting unlock with short reason fails
        unlock_url = reverse('shift_unlock', kwargs={'org_id': self.org.id, 'outlet_id': self.outlet.id, 'shift_id': parent.id})
        resp = self.client.post(unlock_url, {'reason': 'bad'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

        # Unlock with valid mandatory reason
        resp = self.client.post(unlock_url, {'reason': 'Auditor requested correction for voucher mismatch'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        parent.refresh_from_db()
        self.assertFalse(parent.is_locked)

    def test_08_multi_step_continuity_chain_recheck(self):
        """8. Multi-step continuity recalculation: inserting or updating earlier shift rechecks chronological chain."""
        # Day 1: 2026-09-01 (1000 -> 1100)
        card_day1 = atomic_save_shift_card(
            organisation=self.org,
            outlet=self.outlet,
            user=self.owner,
            shift_definition=self.shift_def,
            business_date=date(2026, 9, 1),
            employee=self.emp1,
            nozzle_meters_data=[{
                'nozzle_id': self.nozzle1.id,
                'opening_reading': Decimal('1000.000'),
                'closing_reading': Decimal('1100.000')
            }],
            cash_data={'amount': Decimal('10000.00')}
        )

        # Day 2: 2026-09-02 (entered reading 1100 -> 1200) -> continuity valid
        card_day2 = atomic_save_shift_card(
            organisation=self.org,
            outlet=self.outlet,
            user=self.owner,
            shift_definition=self.shift_def,
            business_date=date(2026, 9, 2),
            employee=self.emp1,
            nozzle_meters_data=[{
                'nozzle_id': self.nozzle1.id,
                'opening_reading': Decimal('1100.000'),
                'closing_reading': Decimal('1200.000')
            }],
            cash_data={'amount': Decimal('10000.00')}
        )
        m2 = ShiftNozzleMeter.objects.get(shift_card=card_day2)
        self.assertEqual(m2.continuity_status, ShiftNozzleMeter.CONTINUITY_VALID)

        # Now edit Day 1: change closing reading to 1150.000
        atomic_save_shift_card(
            organisation=self.org,
            outlet=self.outlet,
            user=self.owner,
            shift_definition=self.shift_def,
            business_date=date(2026, 9, 1),
            employee=self.emp1,
            nozzle_meters_data=[{
                'nozzle_id': self.nozzle1.id,
                'opening_reading': Decimal('1000.000'),
                'closing_reading': Decimal('1150.000')
            }],
            cash_data={'amount': Decimal('15000.00')},
            card_id=str(card_day1.id)
        )

        # Day 2 meter continuity must automatically recheck and flag broken continuity!
        m2.refresh_from_db()
        self.assertEqual(m2.continuity_status, ShiftNozzleMeter.CONTINUITY_CONFLICT)
        self.assertEqual(m2.expected_opening_reading, Decimal('1150.000'))
        self.assertEqual(m2.continuity_difference, Decimal('-50.000'))

    def test_09_fleet_card_collections(self):
        """7. Fleet card collections and historical event times."""
        b_date = date(2026, 9, 1)
        past_time = timezone.make_aware(datetime(2026, 9, 1, 10, 30))
        card = atomic_save_shift_card(
            organisation=self.org,
            outlet=self.outlet,
            user=self.owner,
            shift_definition=self.shift_def,
            business_date=b_date,
            employee=self.emp1,
            nozzle_meters_data=[{
                'nozzle_id': self.nozzle1.id,
                'opening_reading': Decimal('1000.000'),
                'closing_reading': Decimal('1050.000')
            }],
            cash_data={'amount': Decimal('3000.00')},
            fleet_data=[{
                'amount': Decimal('2000.00'),
                'reference_number': 'FLEET-9988',
                'provider_name': 'IndianOil XTRAPOWER',
                'occurred_at': past_time
            }]
        )
        coll = EmployeeShiftCollection.objects.get(shift_card=card, collection_method=EmployeeShiftCollection.METHOD_FLEET_CARD)
        self.assertEqual(coll.amount, Decimal('2000.00'))
        self.assertEqual(coll.reference_number, 'FLEET-9988')
        self.assertEqual(coll.occurred_at, past_time)
        self.assertEqual(card.settlement.fleet_card_amount, Decimal('2000.00'))
        self.assertEqual(card.settlement.total_accounted_amount, Decimal('5000.00'))
        self.assertEqual(card.settlement.result, EmployeeShiftSettlement.RESULT_BALANCED)

    def test_10_shortage_excess_acknowledgement_required(self):
        """9 & 10. Shortage/excess requires acknowledgment and explanatory note."""
        b_date = date(2026, 9, 1)
        # 50L sold = 5000.00, only 4000 collected -> shortage of 1000 without acknowledgement raises error
        with self.assertRaises(ValidationError) as ctx:
            atomic_save_shift_card(
                organisation=self.org,
                outlet=self.outlet,
                user=self.owner,
                shift_definition=self.shift_def,
                business_date=b_date,
                employee=self.emp1,
                nozzle_meters_data=[{
                    'nozzle_id': self.nozzle1.id,
                    'opening_reading': Decimal('1000.000'),
                    'closing_reading': Decimal('1050.000')
                }],
                cash_data={'amount': Decimal('4000.00')},
                is_shortage_excess_acknowledged=False
            )
        self.assertIn("shortage", str(ctx.exception).lower())

        # With acknowledgment and note -> succeeds
        card = atomic_save_shift_card(
            organisation=self.org,
            outlet=self.outlet,
            user=self.owner,
            shift_definition=self.shift_def,
            business_date=b_date,
            employee=self.emp1,
            nozzle_meters_data=[{
                'nozzle_id': self.nozzle1.id,
                'opening_reading': Decimal('1000.000'),
                'closing_reading': Decimal('1050.000')
            }],
            cash_data={'amount': Decimal('4000.00')},
            is_shortage_excess_acknowledged=True,
            shortage_excess_acknowledgement_note="DSM short cash; to be recovered from salary"
        )
        self.assertEqual(card.difference_amount, Decimal('-1000.00'))
        self.assertEqual(card.settlement.result, EmployeeShiftSettlement.RESULT_SHORTAGE)
        self.assertTrue(card.settlement.shortage_acknowledged)

    def test_11_secure_mpd_slip_attachment(self):
        """11. Secure MPD-slip attachments: validation and tenant download."""
        b_date = date(2026, 9, 1)
        pdf_content = b"%PDF-1.4 test document content"
        test_file = SimpleUploadedFile("slip.pdf", pdf_content, content_type="application/pdf")

        card = atomic_save_shift_card(
            organisation=self.org,
            outlet=self.outlet,
            user=self.owner,
            shift_definition=self.shift_def,
            business_date=b_date,
            employee=self.emp1,
            nozzle_meters_data=[{
                'nozzle_id': self.nozzle1.id,
                'opening_reading': Decimal('1000.000'),
                'closing_reading': Decimal('1050.000')
            }],
            cash_data={'amount': Decimal('5000.00')},
            mpd_slip_number="MPD-SLIP-4040",
            mpd_slip_attachment=test_file
        )
        self.assertTrue(bool(card.mpd_slip_attachment))

        # Download via API
        url = reverse('shift_card_attachment', kwargs={
            'org_id': self.org.id,
            'outlet_id': self.outlet.id,
            'card_id': card.id
        })
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp['Content-Type'], 'application/pdf')

    def test_12_last_entered_business_date_defaulting(self):
        """12. Business date defaults to last entered business date for user/outlet."""
        # Record card on 2026-09-03
        atomic_save_shift_card(
            organisation=self.org,
            outlet=self.outlet,
            user=self.owner,
            shift_definition=self.shift_def,
            business_date=date(2026, 9, 3),
            employee=self.emp1,
            nozzle_meters_data=[{
                'nozzle_id': self.nozzle1.id,
                'opening_reading': Decimal('1000.000'),
                'closing_reading': Decimal('1050.000')
            }],
            cash_data={'amount': Decimal('5000.00')}
        )

        last_date = get_last_entered_business_date(self.outlet, self.owner)
        self.assertEqual(last_date, "2026-09-03")

    def test_13_shift_cards_list_view_and_serialization(self):
        """13. Verify shift-cards list API endpoint returns 200 and serializes properly."""
        # Check empty list query first
        url = reverse('shift_card_list_create', kwargs={
            'org_id': self.org.id,
            'outlet_id': self.outlet.id
        })
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data, [])

        # Create a card
        card = atomic_save_shift_card(
            organisation=self.org,
            outlet=self.outlet,
            user=self.owner,
            shift_definition=self.shift_def,
            business_date=date(2026, 9, 5),
            employee=self.emp1,
            nozzle_meters_data=[{
                'nozzle_id': self.nozzle1.id,
                'opening_reading': Decimal('1000.000'),
                'closing_reading': Decimal('1050.000')
            }],
            cash_data={'amount': Decimal('5000.00')},
            mpd_slip_number="MPD-9988"
        )

        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data), 1)

        card_data = resp.data[0]
        self.assertEqual(card_data['id'], str(card.id))
        self.assertEqual(card_data['mpd_slip_number'], "MPD-9988")
        # Check nested parent_shift
        self.assertIn('parent_shift', card_data)
        self.assertEqual(card_data['parent_shift']['business_date'], "2026-09-05")
        self.assertEqual(card_data['parent_shift']['shift_definition']['code'], "S1")
        self.assertFalse(card_data['parent_shift']['is_locked'])
        # Check nested employee
        self.assertIn('employee', card_data)
        self.assertEqual(card_data['employee']['display_name'], "John DSM")
        self.assertEqual(card_data['employee']['employee_code'], "EMP_SC1")
        # Check financial properties
        self.assertEqual(Decimal(str(card_data['total_litres_sold'])), Decimal('50.000'))
        self.assertEqual(Decimal(str(card_data['total_sale_amount'])), Decimal('5000.00'))
        self.assertEqual(Decimal(str(card_data['difference_amount'])), Decimal('0.00'))
        self.assertEqual(card_data['discrepancy_status'], 'balanced')

    def test_14_commissioning_vs_initial_opening_balance_sources(self):
        """14. Commissioning and initial opening balance sources remain separate and authoritative."""
        # 14a. Commissioned nozzle (nozzle1 was commissioned in setUp)
        base_comm = derive_nozzle_opening_reading(outlet=self.outlet, nozzle=self.nozzle1, business_date=date(2026, 9, 1))
        self.assertEqual(base_comm['source'], ShiftNozzleMeter.SOURCE_COMMISSIONING)
        self.assertEqual(base_comm['source_description'], "Opening source: Nozzle Commissioning")
        self.assertEqual(base_comm['reading'], Decimal('1000.000'))
        self.assertFalse(base_comm.get('requires_commissioning', False))

        # 14b. Initial opening balance nozzle (nozzle3 with confirmed opening balance batch, no commissioning event)
        nozzle3 = create_nozzle(
            self.org, self.outlet, self.dispenser, self.tank,
            code="NZ3", name="Nozzle 3"
        )
        ob_batch = OpeningBalanceBatch.objects.create(
            organisation=self.org,
            outlet=self.outlet,
            status=OpeningBalanceBatch.STATUS_PREPARING,
            effective_at=timezone.make_aware(datetime(2026, 8, 1, 0, 0))
        )
        NozzleOpeningBalance.objects.create(
            batch=ob_batch,
            nozzle=nozzle3,
            totalizer_reading=Decimal('2500.000')
        )
        ob_batch.status = OpeningBalanceBatch.STATUS_CONFIRMED
        ob_batch.confirmed_by = self.owner
        ob_batch.confirmed_at = timezone.make_aware(datetime(2026, 8, 1, 0, 0))
        ob_batch.save()

        base_iob = derive_nozzle_opening_reading(outlet=self.outlet, nozzle=nozzle3, business_date=date(2026, 9, 1))
        self.assertEqual(base_iob['source'], ShiftNozzleMeter.SOURCE_INITIAL_OPENING_BALANCE)
        self.assertEqual(base_iob['source_description'], "Opening source: Initial Opening Balance")
        self.assertEqual(base_iob['reading'], Decimal('2500.000'))
        self.assertFalse(base_iob.get('requires_commissioning', False))

    def test_15_uncommissioned_nozzle_cannot_use_awaiting_predecessor(self):
        """15. Uncommissioned nozzle cannot use awaiting_predecessor; must require commissioning."""
        # nozzle2 has no opening_balance and no commissioning
        prep = derive_nozzle_opening_reading(outlet=self.outlet, nozzle=self.nozzle2, business_date=date(2026, 9, 1))
        self.assertTrue(prep.get('requires_commissioning'))
        self.assertIn("Commissioning Required", prep.get('source_description', ''))

        # Saving a shift card with uncommissioned nozzle must be rejected with ValidationError
        with self.assertRaises(ValidationError) as ctx:
            atomic_save_shift_card(
                organisation=self.org,
                outlet=self.outlet,
                user=self.owner,
                shift_definition=self.shift_def,
                business_date=date(2026, 9, 1),
                employee=self.emp1,
                nozzle_meters_data=[{
                    'nozzle_id': self.nozzle2.id,
                    'opening_reading': Decimal('500.000'),
                    'closing_reading': Decimal('600.000')
                }],
                cash_data={'amount': Decimal('10000.00')}
            )
        self.assertIn("requires commissioning", str(ctx.exception))

        # But a nozzle that was already commissioned or had opening balance, if entered with missing predecessor
        # (e.g. nozzle1 on 2026-09-10 with custom physical opening differing from predecessor or missing card),
        # gets physical_slip_missing_predecessor and awaiting_predecessor
        card_historical = atomic_save_shift_card(
            organisation=self.org,
            outlet=self.outlet,
            user=self.owner,
            shift_definition=self.shift_def,
            business_date=date(2026, 9, 10),
            employee=self.emp1,
            nozzle_meters_data=[{
                'nozzle_id': self.nozzle1.id,
                'opening_reading': Decimal('1200.000'),  # physical slip opening reading
                'closing_reading': Decimal('1300.000')
            }],
            cash_data={'amount': Decimal('10000.00')}
        )
        meter = ShiftNozzleMeter.objects.get(shift_card=card_historical, nozzle=self.nozzle1)
        self.assertEqual(meter.opening_source, ShiftNozzleMeter.SOURCE_PHYSICAL_SLIP_MISSING_PREDECESSOR)
        self.assertEqual(meter.continuity_status, ShiftNozzleMeter.CONTINUITY_AWAITING_PREDECESSOR)

    def test_16_post_shift_card_endpoint_with_frontend_payload(self):
        """16. POST /api/v1/.../shift-cards/ handles frontend payload with nozzle_meters and digital collections."""
        url = reverse('shift_card_list_create', kwargs={
            'org_id': self.org.id,
            'outlet_id': self.outlet.id
        })
        payload = {
            'shift_definition_id': str(self.shift_def.id),
            'business_date': '2026-09-04',
            'employee_id': str(self.emp1.id),
            'sequence': 1,
            'mpd_slip_number': '5042',
            'notes': 'Test UI submission',
            'is_shortage_excess_acknowledged': False,
            'nozzle_meters': [{
                'nozzle_id': str(self.nozzle1.id),
                'opening_reading': '1000.000',
                'closing_reading': '1100.000',
                'testing_quantity': '0.000',
                'returned_to_tank': True,
                'price_segments': [{
                    'opening_reading': '1000.000',
                    'closing_reading': '1100.000',
                    'unit_price': '100.00',
                    'testing_quantity': '0.000'
                }]
            }],
            'cash': {
                'amount': 0.00,
                'denominations': []
            },
            'cards': [{
                'amount': 5000.00,
                'reference_number': 'POS-123'
            }],
            'upi': [{
                'amount': 5000.00,
                'reference_number': 'UPI-456'
            }],
            'fleet': [],
            'credit_slips': [],
            'deductions': []
        }
        resp = self.client.post(url, payload, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertEqual(Decimal(str(resp.data['total_sale_amount'])), Decimal('10000.00'))
        self.assertEqual(Decimal(str(resp.data['difference_amount'])), Decimal('0.00'))
        self.assertEqual(resp.data['discrepancy_status'], 'balanced')


