# apps/shifts/tests.py
from datetime import time, date
from django.test import TestCase
from django.urls import reverse
from django.core.exceptions import ValidationError
from django.contrib.auth import get_user_model

from apps.organizations.models import Organisation, Outlet
from apps.organizations.services import create_organisation_with_owner, create_outlet
from apps.employees.models import Employee, EmployeeDesignation
from apps.employees.services import create_employee, create_designation, assign_employee_to_outlets
from apps.forecourt.models import FuelProduct, Tank, Dispenser, Nozzle
from apps.forecourt.services import create_fuel_product, create_tank, create_dispenser, create_nozzle

from .models import ShiftDefinition, ShiftRoster, ShiftStaffAssignment, ShiftNozzleAssignment
from .services import (
    create_shift_definition, create_or_update_roster,
    assign_employee_to_roster, assign_nozzles_to_employee
)

User = get_user_model()

class ShiftRosterTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(email="owner@example.com", password="password")
        self.org = create_organisation_with_owner(name="Test Org", code="TORG", owner_user=self.owner)
        self.outlet = create_outlet(self.org, name="Outlet 1", code="OUT1")
        
        self.designation = create_designation(self.org, code="DSM", name="Pump Attendant", requires_nozzle_assignment=True)
        self.employee1 = create_employee(self.org, employee_code="EMP01", display_name="John Doe", designation=self.designation)
        self.employee2 = create_employee(self.org, employee_code="EMP02", display_name="Jane Smith", designation=self.designation)
        
        # Assign employees to outlet
        assign_employee_to_outlets(self.employee1, [{'outlet_id': self.outlet.id, 'is_primary': True}])
        assign_employee_to_outlets(self.employee2, [{'outlet_id': self.outlet.id, 'is_primary': True}])

        # Forecourt setup
        self.product = create_fuel_product(self.org, code="MS", name="Petrol", category="petrol", unit="litre")
        self.tank = create_tank(self.org, self.outlet, self.product, code="TK1", name="Tank 1", capacity=5000)
        self.dispenser = create_dispenser(self.org, self.outlet, code="DP1", name="Dispenser 1")
        self.nozzle1 = create_nozzle(self.org, self.outlet, self.dispenser, self.tank, code="NZ1", name="Nozzle 1")
        self.nozzle2 = create_nozzle(self.org, self.outlet, self.dispenser, self.tank, code="NZ2", name="Nozzle 2")

    def test_overnight_shift_definition(self):
        # Starts 10 PM, ends 6 AM
        shift = create_shift_definition(
            self.org, self.outlet, code="S3", name="Night Shift",
            starts_at=time(22, 0), ends_at=time(6, 0)
        )
        self.assertTrue(shift.crosses_midnight)

        # Standard daytime shift
        shift2 = create_shift_definition(
            self.org, self.outlet, code="S1", name="Morning Shift",
            starts_at=time(6, 0), ends_at=time(14, 0)
        )
        self.assertFalse(shift2.crosses_midnight)

    def test_employee_may_receive_multiple_nozzles(self):
        shift = create_shift_definition(self.org, self.outlet, code="S1", name="Shift 1", starts_at=time(6, 0), ends_at=time(14, 0))
        roster = create_or_update_roster(self.org, self.outlet, shift, date(2026, 8, 26), user=self.owner)
        
        staff_ass = assign_employee_to_roster(roster, self.employee1, self.designation)
        
        # Assign multiple nozzles
        nozzle_assignments = assign_nozzles_to_employee(staff_ass, [self.nozzle1, self.nozzle2])
        self.assertEqual(len(nozzle_assignments), 2)

    def test_same_nozzle_cannot_have_two_primary_employees_in_one_roster(self):
        shift = create_shift_definition(self.org, self.outlet, code="S1", name="Shift 1", starts_at=time(6, 0), ends_at=time(14, 0))
        roster = create_or_update_roster(self.org, self.outlet, shift, date(2026, 8, 26), user=self.owner)
        
        staff_ass1 = assign_employee_to_roster(roster, self.employee1, self.designation)
        staff_ass2 = assign_employee_to_roster(roster, self.employee2, self.designation)
        
        # Assign nozzle1 to employee1
        assign_nozzles_to_employee(staff_ass1, [self.nozzle1])
        
        # Assigning nozzle1 to employee2 should raise ValidationError
        with self.assertRaises(ValidationError):
            assign_nozzles_to_employee(staff_ass2, [self.nozzle1])

    def test_locked_roster_prevents_modifications(self):
        shift = create_shift_definition(self.org, self.outlet, code="S1", name="Shift 1", starts_at=time(6, 0), ends_at=time(14, 0))
        roster = create_or_update_roster(self.org, self.outlet, shift, date(2026, 8, 26), user=self.owner)
        
        # Lock the roster
        roster.is_locked = True
        roster.save()

        # Try assigning employee to roster
        with self.assertRaises(ValidationError):
            assign_employee_to_roster(roster, self.employee1, self.designation)

    def test_roster_workspace_nonexistent_returns_available_staff(self):
        self.client.login(email="owner@example.com", password="password")
        url = reverse('shift_roster_workspace', kwargs={'org_id': self.org.id, 'outlet_id': self.outlet.id})
        
        # Create a shift definition
        shift = create_shift_definition(self.org, self.outlet, code="S1", name="Shift 1", starts_at=time(6, 0), ends_at=time(14, 0))
        
        response = self.client.get(url, {
            'business_date': '2026-08-26',
            'shift_definition_id': str(shift.id)
        })
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['exists'])
        self.assertIn('available_staff', response.data)
        # Verify both employees are in available_staff (since they are active and assigned to this outlet)
        self.assertEqual(len(response.data['available_staff']), 2)
        # Verify active nozzles are returned
        self.assertIn('nozzles', response.data)
        self.assertEqual(len(response.data['nozzles']), 2)

    def test_roster_workspace_existent_returns_available_staff(self):
        self.client.login(email="owner@example.com", password="password")
        url = reverse('shift_roster_workspace', kwargs={'org_id': self.org.id, 'outlet_id': self.outlet.id})
        
        # Create shift definition and roster
        shift = create_shift_definition(self.org, self.outlet, code="S1", name="Shift 1", starts_at=time(6, 0), ends_at=time(14, 0))
        create_or_update_roster(self.org, self.outlet, shift, date(2026, 8, 26), user=self.owner)
        
        response = self.client.get(url, {
            'business_date': '2026-08-26',
            'shift_definition_id': str(shift.id)
        })
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['exists'])
        self.assertIn('available_staff', response.data)
        self.assertEqual(len(response.data['available_staff']), 2)

    def test_roster_can_save_without_primary_cashier(self):
        shift = create_shift_definition(self.org, self.outlet, code="S1", name="Shift 1", starts_at=time(6, 0), ends_at=time(14, 0))
        roster = create_or_update_roster(self.org, self.outlet, shift, date(2026, 8, 26), user=self.owner)
        staff_ass = assign_employee_to_roster(roster, self.employee1, self.designation)
        assign_nozzles_to_employee(staff_ass, [self.nozzle1])

        # Verify assignment in DB
        saved_ass = ShiftStaffAssignment.objects.get(id=staff_ass.id)
        self.assertEqual(saved_ass.employee, self.employee1)
        self.assertEqual(saved_ass.nozzle_assignments.count(), 1)


from decimal import Decimal
from datetime import date, time, timedelta, datetime
from django.utils import timezone
from rest_framework.test import APIClient
from apps.organizations.models import Role, OrganisationMembership, MembershipRole, OutletAccess
from apps.forecourt.models import ProductPrice
from apps.forecourt.services import set_product_price
from apps.operations.models import (
    DipCalibrationChart, DipCalibrationPoint, TankCalibrationAssignment,
    OpeningBalanceBatch, NozzleOpeningBalance, TankOpeningBalance,
    NozzleCommissioning
)
from apps.operations.services import (
    import_calibration_chart, activate_calibration_chart,
    assign_calibration_chart_to_tank, create_opening_balance_batch,
    set_nozzle_opening_balance, set_tank_opening_balance, confirm_opening_balance_batch,
    commission_nozzle
)
from .models import (
    OperationalShift, OperationalShiftStaff, OperationalShiftNozzleAssignment,
    ShiftNozzleMeter, ShiftNozzlePriceSegment, ShiftMeterEvent,
    ShiftTestingRecord, ShiftTankDipObservation, ShiftActivityLog
)
from .services import (
    prepare_shift_opening, open_operational_shift, update_open_shift_assignments,
    add_staff_to_open_shift, transfer_nozzle_assignment, correct_nozzle_assignment,
    activate_nozzle_midshift,
    record_closing_meter_reading, record_meter_event, record_testing,
    update_testing, delete_testing, record_shift_dip,
    apply_product_price_change_during_shift, recalculate_shift_totals,
    close_operational_shift, reopen_operational_shift, discard_open_operational_shift
)
from .selectors import (
    derive_nozzle_opening_reading, calculate_shift_totals,
    preview_shift_closing_data, check_can_reopen_shift
)


class OperationalShiftMilestone9Tests(TestCase):
    def setUp(self):
        self.client = APIClient()
        # 1. Users & Roles
        self.owner = User.objects.create_user(email="owner9@example.com", password="password", display_name="Owner User")
        self.manager_user = User.objects.create_user(email="manager9@example.com", password="password", display_name="Manager User")
        self.operator_user = User.objects.create_user(email="operator9@example.com", password="password", display_name="Operator User")
        self.viewer_user = User.objects.create_user(email="viewer9@example.com", password="password", display_name="Viewer User")

        self.org = create_organisation_with_owner(name="Milestone9 Org", code="M9ORG", owner_user=self.owner)
        self.outlet = create_outlet(self.org, name="Flagship Outlet", code="OUTM9")

        # Assign Manager, Operator, Viewer memberships and roles
        manager_role = Role.objects.get(organisation=self.org, name='Manager', is_system=True)
        operator_role = Role.objects.get(organisation=self.org, name='Shift Operator', is_system=True)
        viewer_role = Role.objects.get(organisation=self.org, name='Viewer', is_system=True)

        m_mem = OrganisationMembership.objects.create(
            user=self.manager_user, organisation=self.org, membership_type=OrganisationMembership.TYPE_MEMBER,
            status=OrganisationMembership.STATUS_ACTIVE, joined_at=timezone.now()
        )
        MembershipRole.objects.create(membership=m_mem, role=manager_role)
        OutletAccess.objects.create(membership=m_mem, outlet=self.outlet)

        o_mem = OrganisationMembership.objects.create(
            user=self.operator_user, organisation=self.org, membership_type=OrganisationMembership.TYPE_MEMBER,
            status=OrganisationMembership.STATUS_ACTIVE, joined_at=timezone.now()
        )
        MembershipRole.objects.create(membership=o_mem, role=operator_role)
        OutletAccess.objects.create(membership=o_mem, outlet=self.outlet)

        v_mem = OrganisationMembership.objects.create(
            user=self.viewer_user, organisation=self.org, membership_type=OrganisationMembership.TYPE_MEMBER,
            status=OrganisationMembership.STATUS_ACTIVE, joined_at=timezone.now()
        )
        MembershipRole.objects.create(membership=v_mem, role=viewer_role)
        OutletAccess.objects.create(membership=v_mem, outlet=self.outlet)

        # 2. Employees & Designations
        self.desig_dsm = create_designation(self.org, code="DSM", name="Pump Attendant", requires_nozzle_assignment=True)
        self.emp1 = create_employee(self.org, employee_code="E01", display_name="Alice Attendant", designation=self.desig_dsm)
        self.emp2 = create_employee(self.org, employee_code="E02", display_name="Bob Attendant", designation=self.desig_dsm)
        assign_employee_to_outlets(self.emp1, [{'outlet_id': self.outlet.id, 'is_primary': True}])
        assign_employee_to_outlets(self.emp2, [{'outlet_id': self.outlet.id, 'is_primary': True}])

        # 3. Forecourt: Products, Tanks, Dispensers, Nozzles, Pricing
        self.product = create_fuel_product(self.org, code="MS", name="Motor Spirit", category="petrol", unit="litre")
        self.tank = create_tank(self.org, self.outlet, self.product, code="TK1", name="Underground Tank 1", capacity=Decimal('20000'))
        self.dispenser = create_dispenser(self.org, self.outlet, code="D1", name="Dispenser 1")
        self.nozzle1 = create_nozzle(self.org, self.outlet, self.dispenser, self.tank, code="N1", name="Nozzle 1")
        self.nozzle2 = create_nozzle(self.org, self.outlet, self.dispenser, self.tank, code="N2", name="Nozzle 2")

        self.price = set_product_price(
            organisation=self.org, outlet=self.outlet, product=self.product,
            selling_price=Decimal('100.0000'), effective_from=timezone.now() - timedelta(days=5),
            created_by=self.owner
        )

        # 4. Calibration chart & assignment
        chart = DipCalibrationChart.objects.create(
            organisation=self.org, name="Tank 1 Calibration", nominal_capacity=Decimal('20000'),
            lookup_mode=DipCalibrationChart.LOOKUP_INTERPOLATE, original_height_unit=DipCalibrationChart.UNIT_MM,
            normalized_height_unit='millimetre', volume_unit='litre', status=DipCalibrationChart.STATUS_DRAFT
        )
        DipCalibrationPoint.objects.create(chart=chart, sequence=1, height_mm=Decimal('0'), volume_litres=Decimal('0'))
        DipCalibrationPoint.objects.create(chart=chart, sequence=2, height_mm=Decimal('500'), volume_litres=Decimal('5000'))
        DipCalibrationPoint.objects.create(chart=chart, sequence=3, height_mm=Decimal('1000'), volume_litres=Decimal('10000'))
        DipCalibrationPoint.objects.create(chart=chart, sequence=4, height_mm=Decimal('2000'), volume_litres=Decimal('20000'))
        self.chart = activate_calibration_chart(chart)
        self.assignment = assign_calibration_chart_to_tank(
            organisation=self.org, outlet=self.outlet, tank=self.tank, chart=self.chart,
            effective_from=timezone.now() - timedelta(days=5), user=self.owner
        )

        # 5. Confirmed Opening Balance Batch
        ob_batch = create_opening_balance_batch(
            organisation=self.org, outlet=self.outlet, effective_at=timezone.now() - timedelta(days=2),
            user=self.owner, notes="Initial Confirmed Opening Batch"
        )
        set_nozzle_opening_balance(ob_batch, self.nozzle1, Decimal('1000.000'))
        set_nozzle_opening_balance(ob_batch, self.nozzle2, Decimal('2000.000'))
        set_tank_opening_balance(
            ob_batch, self.tank, book_quantity=Decimal('8000.0000'), physical_quantity=Decimal('8000.0000'),
            raw_dip_value=Decimal('800'), raw_dip_unit='millimetre', calibration_assignment=self.assignment,
            conversion_method='calibration_interpolated'
        )
        self.confirmed_batch = confirm_opening_balance_batch(ob_batch, self.owner)

        # 6. Shift Definitions
        self.shift_def_day = create_shift_definition(
            self.org, self.outlet, code="DAY", name="Day Shift",
            starts_at=time(6, 0), ends_at=time(14, 0)
        )
        self.shift_def_night = create_shift_definition(
            self.org, self.outlet, code="NIGHT", name="Overnight Shift",
            starts_at=time(22, 0), ends_at=time(6, 0)
        )

    def test_one_open_shift_per_outlet(self):
        # Open shift 1
        staff_data = [
            {'employee_id': str(self.emp1.id), 'nozzle_ids': [str(self.nozzle1.id), str(self.nozzle2.id)]}
        ]
        shift1 = open_operational_shift(
            organisation=self.org, outlet=self.outlet, shift_definition=self.shift_def_day,
            business_date=date(2026, 9, 1), staff_assignments_data=staff_data, manual_exceptions_data={},
            notes="Shift 1", user=self.owner
        )
        self.assertEqual(shift1.status, OperationalShift.STATUS_OPEN)

        # Attempt to open second shift while shift 1 is open -> must raise ValidationError
        shift_def2 = create_shift_definition(self.org, self.outlet, code="EVE", name="Evening Shift", starts_at=time(14, 0), ends_at=time(22, 0))
        with self.assertRaises(ValidationError) as ctx:
            open_operational_shift(
                organisation=self.org, outlet=self.outlet, shift_definition=shift_def2,
                business_date=date(2026, 9, 1), staff_assignments_data=staff_data, manual_exceptions_data={},
                notes="Shift 2", user=self.owner
            )
        self.assertIn("Only one shift may be open at a time", str(ctx.exception))

    def test_business_date_for_overnight_shift(self):
        # Overnight shift starting at 22:00
        staff_data = [
            {'employee_id': str(self.emp1.id), 'nozzle_ids': [str(self.nozzle1.id)]},
            {'employee_id': str(self.emp2.id), 'nozzle_ids': [str(self.nozzle2.id)]}
        ]
        night_shift = open_operational_shift(
            organisation=self.org, outlet=self.outlet, shift_definition=self.shift_def_night,
            business_date=date(2026, 9, 2), staff_assignments_data=staff_data, manual_exceptions_data={},
            notes="Overnight", user=self.owner
        )
        self.assertEqual(night_shift.business_date, date(2026, 9, 2))
        self.assertEqual(night_shift.scheduled_starts_at.date(), date(2026, 9, 2))
        self.assertEqual(night_shift.scheduled_ends_at.date(), date(2026, 9, 3))

    def test_opening_derived_from_confirmed_opening_balance(self):
        # First operational shift uses confirmed opening balance (1000.000 for N1, 2000.000 for N2)
        derived1 = derive_nozzle_opening_reading(self.outlet, self.nozzle1)
        self.assertEqual(derived1['source'], ShiftNozzleMeter.SOURCE_OPENING_BALANCE)
        self.assertEqual(derived1['reading'], Decimal('1000.000'))

        staff_data = [
            {'employee_id': str(self.emp1.id), 'nozzle_ids': [str(self.nozzle1.id), str(self.nozzle2.id)]}
        ]
        shift = open_operational_shift(
            organisation=self.org, outlet=self.outlet, shift_definition=self.shift_def_day,
            business_date=date(2026, 9, 1), staff_assignments_data=staff_data, manual_exceptions_data={},
            notes="Opening derivation test", user=self.owner
        )

        meter1 = ShiftNozzleMeter.objects.get(shift=shift, nozzle=self.nozzle1)
        self.assertEqual(meter1.opening_reading, Decimal('1000.000'))
        self.assertEqual(meter1.opening_source, ShiftNozzleMeter.SOURCE_OPENING_BALANCE)

    def test_roster_snapshot_independence(self):
        staff_data = [
            {'employee_id': str(self.emp1.id), 'nozzle_ids': [str(self.nozzle1.id), str(self.nozzle2.id)]}
        ]
        shift = open_operational_shift(
            organisation=self.org, outlet=self.outlet, shift_definition=self.shift_def_day,
            business_date=date(2026, 9, 1), staff_assignments_data=staff_data, manual_exceptions_data={},
            notes="Snapshot test", user=self.owner
        )
        staff_snapshot = OperationalShiftStaff.objects.get(shift=shift, source_employee=self.emp1)
        self.assertEqual(staff_snapshot.employee_name_snapshot, "Alice Attendant")

        # Now edit employee display name and designation in master data
        self.emp1.display_name = "Alice Updated"
        self.emp1.save()

        # The snapshot on the opened shift MUST remain immutable!
        staff_snapshot.refresh_from_db()
        self.assertEqual(staff_snapshot.employee_name_snapshot, "Alice Attendant")

    def test_every_active_nozzle_assigned_before_opening(self):
        # Assign only nozzle1, leaving nozzle2 unassigned -> Must fail validation
        staff_data = [
            {'employee_id': str(self.emp1.id), 'nozzle_ids': [str(self.nozzle1.id)]}
        ]
        with self.assertRaises(ValidationError) as ctx:
            open_operational_shift(
                organisation=self.org, outlet=self.outlet, shift_definition=self.shift_def_day,
                business_date=date(2026, 9, 1), staff_assignments_data=staff_data, manual_exceptions_data={},
                notes="", user=self.owner
            )
        self.assertIn("must be assigned to an employee", str(ctx.exception))

    def test_decimal_meter_and_testing_calculations(self):
        staff_data = [
            {'employee_id': str(self.emp1.id), 'nozzle_ids': [str(self.nozzle1.id), str(self.nozzle2.id)]}
        ]
        shift = open_operational_shift(
            organisation=self.org, outlet=self.outlet, shift_definition=self.shift_def_day,
            business_date=date(2026, 9, 1), staff_assignments_data=staff_data, manual_exceptions_data={},
            notes="Calc test", user=self.owner
        )
        # N1: opening is 1000.000. Set closing to 1250.500 -> Gross = 250.500
        record_closing_meter_reading(shift, self.nozzle1, Decimal('1250.500'), self.owner)
        
        # Record returned testing: 5.000 L (returns to tank stock)
        record_testing(shift, self.nozzle1, Decimal('5.000'), returned_to_tank=True, destination_tank=self.tank, user=self.owner)
        # Record unreturned testing: 2.500 L (calibration test or calibration loss, does not return to tank)
        record_testing(shift, self.nozzle1, Decimal('2.500'), returned_to_tank=False, user=self.owner)

        # Totals verification
        meter1 = ShiftNozzleMeter.objects.get(shift=shift, nozzle=self.nozzle1)
        self.assertEqual(meter1.gross_quantity, Decimal('250.500'))
        self.assertEqual(meter1.testing_quantity, Decimal('7.500')) # 5.000 + 2.500
        # Sale quantity = Gross - All testing = 250.500 - 7.500 = 243.000
        self.assertEqual(meter1.sale_quantity, Decimal('243.000'))
        # Stock depletion = Gross - Returned testing = 250.500 - 5.000 = 245.500
        self.assertEqual(meter1.stock_depletion_quantity, Decimal('245.500'))

        # Segments & amount: unit price is 100.0000. Amount = 243.000 * 100.0000 = 24300.00
        seg = meter1.price_segments.first()
        self.assertEqual(seg.sale_amount, Decimal('24300.00'))

    def test_testing_cannot_exceed_gross_dispensing(self):
        staff_data = [
            {'employee_id': str(self.emp1.id), 'nozzle_ids': [str(self.nozzle1.id), str(self.nozzle2.id)]}
        ]
        shift = open_operational_shift(
            organisation=self.org, outlet=self.outlet, shift_definition=self.shift_def_day,
            business_date=date(2026, 9, 1), staff_assignments_data=staff_data, manual_exceptions_data={},
            notes="Testing exceed test", user=self.owner
        )
        # Closing reading 1010.000 -> gross is 10.000
        record_closing_meter_reading(shift, self.nozzle1, Decimal('1010.000'), self.owner)
        record_closing_meter_reading(shift, self.nozzle2, Decimal('2050.000'), self.owner)

        # Record testing 15.000 L -> Exceeds gross of 10.000 L
        record_testing(shift, self.nozzle1, Decimal('15.000'), returned_to_tank=True, destination_tank=self.tank, user=self.owner)

        # Preview closing must show blocking error
        preview = preview_shift_closing_data(shift)
        self.assertFalse(preview['can_close'])
        self.assertTrue(any("cannot exceed dispensed meter quantity" in err for err in preview['blocking_errors']))

    def test_price_change_segment_continuity_and_atomic_apply(self):
        staff_data = [
            {'employee_id': str(self.emp1.id), 'nozzle_ids': [str(self.nozzle1.id), str(self.nozzle2.id)]}
        ]
        shift = open_operational_shift(
            organisation=self.org, outlet=self.outlet, shift_definition=self.shift_def_day,
            business_date=date(2026, 9, 1), staff_assignments_data=staff_data, manual_exceptions_data={},
            notes="Price change test", user=self.owner
        )
        # N1 opened at 1000.000 @ price 100.00
        # N2 opened at 2000.000 @ price 100.00

        # Change price to 105.00 mid-shift
        snapshots = {
            str(self.nozzle1.id): Decimal('1100.000'),
            str(self.nozzle2.id): Decimal('2150.000')
        }
        apply_product_price_change_during_shift(
            outlet=self.outlet, product=self.product, new_price=Decimal('105.0000'),
            effective_at=timezone.now(), nozzle_snapshot_readings=snapshots, actor=self.owner
        )

        meter1 = ShiftNozzleMeter.objects.get(shift=shift, nozzle=self.nozzle1)
        segments1 = list(meter1.price_segments.order_by('sequence'))
        self.assertEqual(len(segments1), 2)

        # Segment 1: 1000.000 -> 1100.000 @ 100.0000
        self.assertEqual(segments1[0].opening_reading, Decimal('1000.000'))
        self.assertEqual(segments1[0].closing_reading, Decimal('1100.000'))
        self.assertEqual(segments1[0].unit_price, Decimal('100.0000'))
        self.assertEqual(segments1[0].gross_quantity, Decimal('100.000'))
        self.assertEqual(segments1[0].sale_amount, Decimal('10000.00'))

        # Segment 2: starts at 1100.000 @ 105.0000 (continuity guaranteed: opening == prev closing)
        self.assertEqual(segments1[1].opening_reading, Decimal('1100.000'))
        self.assertEqual(segments1[1].unit_price, Decimal('105.0000'))

        # Record final closing reading 1200.000 on N1
        record_closing_meter_reading(shift, self.nozzle1, Decimal('1200.000'), self.owner)
        segments1_updated = list(meter1.price_segments.order_by('sequence'))
        # Segment 2 gross = 1200 - 1100 = 100.000. Amount = 100 * 105 = 10500.00
        self.assertEqual(segments1_updated[1].sale_amount, Decimal('10500.00'))

        # Total meter1 sale amount = 10000.00 + 10500.00 = 20500.00
        totals = calculate_shift_totals(shift)
        m1_tot = next(n for n in totals['nozzles'] if n['nozzle_code'] == 'N1')
        self.assertEqual(m1_tot['sale_amount'], Decimal('20500.00'))

    def test_meter_reset_rollover_continuity(self):
        staff_data = [
            {'employee_id': str(self.emp1.id), 'nozzle_ids': [str(self.nozzle1.id), str(self.nozzle2.id)]}
        ]
        shift = open_operational_shift(
            organisation=self.org, outlet=self.outlet, shift_definition=self.shift_def_day,
            business_date=date(2026, 9, 1), staff_assignments_data=staff_data, manual_exceptions_data={},
            notes="Rollover test", user=self.owner
        )
        # N1 opened at 1000.000. Rollover occurs at 9999.000 to 0.000
        event = record_meter_event(
            shift=shift, nozzle=self.nozzle1, event_type=ShiftMeterEvent.EVENT_ROLLOVER,
            reading_before=Decimal('9999.000'), reading_after=Decimal('0.000'),
            reason="Mechanical totalizer rollover past 9999", user=self.owner
        )
        self.assertEqual(event.event_type, ShiftMeterEvent.EVENT_ROLLOVER)

        # After rollover, new closing reading is 150.000
        record_closing_meter_reading(shift, self.nozzle1, Decimal('150.000'), self.owner)

        meter1 = ShiftNozzleMeter.objects.get(shift=shift, nozzle=self.nozzle1)
        # Gross before event = 9999 - 1000 = 8999.000
        # Gross after event = 150 - 0 = 150.000
        # Total gross = 8999 + 150 = 9149.000 (No negative result!)
        self.assertEqual(meter1.gross_quantity, Decimal('9149.000'))

    def test_closing_validation_and_reopen_workflow(self):
        staff_data = [
            {'employee_id': str(self.emp1.id), 'nozzle_ids': [str(self.nozzle1.id), str(self.nozzle2.id)]}
        ]
        shift1 = open_operational_shift(
            organisation=self.org, outlet=self.outlet, shift_definition=self.shift_def_day,
            business_date=date(2026, 9, 1), staff_assignments_data=staff_data, manual_exceptions_data={},
            notes="Close/reopen test", user=self.owner
        )
        # Attempt to close without entering closing readings -> raises ValidationError
        with self.assertRaises(ValidationError):
            close_operational_shift(shift1, self.owner)

        # Enter valid closing readings
        record_closing_meter_reading(shift1, self.nozzle1, Decimal('1200.000'), self.owner)
        record_closing_meter_reading(shift1, self.nozzle2, Decimal('2300.000'), self.owner)

        # Close shift1 atomically
        closed_shift = close_operational_shift(shift1, self.owner)
        self.assertEqual(closed_shift.status, OperationalShift.STATUS_CLOSED)
        self.assertIsNotNone(closed_shift.closed_at)

        # Closed shift immutability: attempting to record meter reading on closed shift fails
        with self.assertRaises(ValidationError):
            record_closing_meter_reading(closed_shift, self.nozzle1, Decimal('1250.000'), self.owner)

        # Controlled Reopening of latest shift: requires mandatory reason
        with self.assertRaises(ValidationError):
            reopen_operational_shift(closed_shift, self.owner, reason="")

        # Reopen successfully
        reopened = reopen_operational_shift(closed_shift, self.owner, reason="Approved correction of DSM entry error")
        self.assertEqual(reopened.status, OperationalShift.STATUS_OPEN)
        self.assertEqual(reopened.reopen_reason, "Approved correction of DSM entry error")

        # Now reclose shift1
        close_operational_shift(reopened, self.owner)

        # Now open Shift 2 on the next business date
        shift2 = open_operational_shift(
            organisation=self.org, outlet=self.outlet, shift_definition=self.shift_def_day,
            business_date=date(2026, 9, 2), staff_assignments_data=staff_data, manual_exceptions_data={},
            notes="Shift 2", user=self.owner
        )
        # Shift 2 must inherit final readings of Shift 1: N1=1200.000, N2=2300.000
        m1_s2 = ShiftNozzleMeter.objects.get(shift=shift2, nozzle=self.nozzle1)
        m2_s2 = ShiftNozzleMeter.objects.get(shift=shift2, nozzle=self.nozzle2)
        self.assertEqual(m1_s2.opening_reading, Decimal('1200.000'))
        self.assertEqual(m1_s2.opening_source, ShiftNozzleMeter.SOURCE_PREVIOUS_SHIFT)
        self.assertEqual(m2_s2.opening_reading, Decimal('2300.000'))

        # Later dependent shift prevents reopening shift1!
        with self.assertRaises(ValidationError) as ctx:
            reopen_operational_shift(shift1, self.owner, reason="Attempt to reopen historical shift")
        self.assertIn("Only the latest closed shift", str(ctx.exception))

    def test_permission_enforcement(self):
        # Viewer user cannot open a shift
        self.client.login(email="viewer9@example.com", password="password")
        url = reverse('shift_open', kwargs={'org_id': self.org.id, 'outlet_id': self.outlet.id})
        resp = self.client.post(url, {
            'shift_definition_id': str(self.shift_def_day.id),
            'business_date': '2026-09-01',
            'staff_assignments': []
        }, format='json')
        self.assertEqual(resp.status_code, 403)

        # Manager user CAN open shift
        self.client.login(email="manager9@example.com", password="password")
        staff_data = [
            {'employee_id': str(self.emp1.id), 'nozzle_ids': [str(self.nozzle1.id), str(self.nozzle2.id)]}
        ]
        resp_mgr = self.client.post(url, {
            'shift_definition_id': str(self.shift_def_day.id),
            'business_date': '2026-09-01',
            'staff_assignments': staff_data
        }, format='json')
        self.assertEqual(resp_mgr.status_code, 201)

    def test_audit_activity_logging(self):
        staff_data = [
            {'employee_id': str(self.emp1.id), 'nozzle_ids': [str(self.nozzle1.id), str(self.nozzle2.id)]}
        ]
        shift = open_operational_shift(
            organisation=self.org, outlet=self.outlet, shift_definition=self.shift_def_day,
            business_date=date(2026, 9, 1), staff_assignments_data=staff_data, manual_exceptions_data={},
            notes="Audit test", user=self.owner
        )
        record_closing_meter_reading(shift, self.nozzle1, Decimal('1100.000'), self.owner)
        record_testing(shift, self.nozzle1, Decimal('5.000'), returned_to_tank=True, destination_tank=self.tank, user=self.owner)

        logs = ShiftActivityLog.objects.filter(shift=shift).order_by('occurred_at')
        event_types = [l.event_type for l in logs]
        self.assertIn('shift_opened', event_types)
        self.assertIn('meter_reading_recorded', event_types)
        self.assertIn('testing_created', event_types)

    def test_discard_open_operational_shift(self):
        staff_data = [
            {'employee_id': str(self.emp1.id), 'nozzle_ids': [str(self.nozzle1.id), str(self.nozzle2.id)]}
        ]
        shift = open_operational_shift(
            organisation=self.org, outlet=self.outlet, shift_definition=self.shift_def_day,
            business_date=date(2026, 9, 1), staff_assignments_data=staff_data, manual_exceptions_data={},
            notes="To be discarded", user=self.owner
        )
        url = f"/api/v1/organisations/{self.org.id}/outlets/{self.outlet.id}/operational-shifts/{shift.id}/"
        self.client.force_authenticate(user=self.owner)

        # Discard the open shift
        resp = self.client.delete(url, {'reason': 'Test shift opened mistakenly'}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(OperationalShift.objects.filter(id=shift.id).exists())

        # Now opening a fresh shift for the exact same definition & date succeeds
        new_shift = open_operational_shift(
            organisation=self.org, outlet=self.outlet, shift_definition=self.shift_def_day,
            business_date=date(2026, 9, 1), staff_assignments_data=staff_data, manual_exceptions_data={},
            notes="Fresh shift", user=self.owner
        )
        self.assertEqual(new_shift.status, OperationalShift.STATUS_OPEN)

        # Attempting to delete a closed shift must fail
        record_closing_meter_reading(new_shift, self.nozzle1, Decimal('1100.000'), self.owner)
        record_closing_meter_reading(new_shift, self.nozzle2, Decimal('2100.000'), self.owner)
        close_operational_shift(new_shift, self.owner)

        url_closed = f"/api/v1/organisations/{self.org.id}/outlets/{self.outlet.id}/operational-shifts/{new_shift.id}/"
        resp_closed = self.client.delete(url_closed, format='json')
        self.assertEqual(resp_closed.status_code, 400)
        self.assertTrue(OperationalShiftStaff.objects.filter(shift=new_shift).exists())


class OperationalShiftStaffManagementTests(TestCase):
    """
    Comprehensive tests for Milestone 9 Live-Shift Staff Management:
    - Adding staff without nozzles & custom designations
    - Cashier historical period tracking & single active cashier
    - Attendant nozzle handover with exact meter reading intervals
    - Testing deduction attribution to exact assignment interval
    - Multi-price segment intersection with handover intervals
    - Backdated handover validation guards
    - Separate correction vs handover workflow
    - Prevention of Add Staff bypassing handover rules
    - Controlled mid-shift nozzle activation
    """

    def setUp(self):
        self.client = APIClient()
        self.org = Organisation.objects.create(name="Forecourt Test Org", code="FTORG")
        self.outlet = Outlet.objects.create(organisation=self.org, name="Station Beta", code="STB")
        self.other_outlet = Outlet.objects.create(organisation=self.org, name="Other Station", code="OST")
        self.owner = get_user_model().objects.create_user(email="manager@forecourt.test", password="Password123!")
        OrganisationMembership.objects.create(
            organisation=self.org, user=self.owner, membership_type=OrganisationMembership.TYPE_OWNER,
            status=OrganisationMembership.STATUS_ACTIVE, joined_at=timezone.now()
        )

        self.product = FuelProduct.objects.create(organisation=self.org, name="Diesel", code="HSD")
        self.tank = Tank.objects.create(
            organisation=self.org, outlet=self.outlet, code="T1", name="Diesel Tank",
            product=self.product, capacity=Decimal('20000.000')
        )
        self.dispenser = Dispenser.objects.create(organisation=self.org, outlet=self.outlet, code="D1", name="Dispenser 1")
        self.nozzle1 = Nozzle.objects.create(organisation=self.org, outlet=self.outlet, dispenser=self.dispenser, tank=self.tank, code="N1", name="Nozzle 1")
        self.nozzle2 = Nozzle.objects.create(organisation=self.org, outlet=self.outlet, dispenser=self.dispenser, tank=self.tank, code="N2", name="Nozzle 2")

        # Designations
        self.desig_attendant = create_designation(self.org, code="DSM", name="Pump Attendant", requires_nozzle_assignment=True)
        self.desig_cashier = create_designation(self.org, code="CSH", name="Cashier", requires_nozzle_assignment=False)
        self.desig_supervisor = create_designation(self.org, code="SUP", name="Forecourt Supervisor", requires_nozzle_assignment=False)

        # Employees
        self.emp_alice = create_employee(self.org, employee_code="E01", display_name="Alice Attendant", designation=self.desig_attendant)
        assign_employee_to_outlets(self.emp_alice, [{'outlet_id': self.outlet.id, 'is_primary': True}])

        self.emp_bob = create_employee(self.org, employee_code="E02", display_name="Bob Attendant", designation=self.desig_attendant)
        assign_employee_to_outlets(self.emp_bob, [{'outlet_id': self.outlet.id, 'is_primary': True}])

        self.emp_carol = create_employee(self.org, employee_code="E03", display_name="Carol Cashier", designation=self.desig_cashier)
        assign_employee_to_outlets(self.emp_carol, [{'outlet_id': self.outlet.id, 'is_primary': True}])

        self.emp_other = create_employee(self.org, employee_code="E99", display_name="Other Station Staff", designation=self.desig_attendant)
        assign_employee_to_outlets(self.emp_other, [{'outlet_id': self.other_outlet.id, 'is_primary': True}])

        # Base prices
        ProductPrice.objects.create(organisation=self.org, outlet=self.outlet, product=self.product, selling_price=Decimal('100.0000'), effective_from=timezone.now() - timedelta(days=1))

        # Calibration chart & assignment
        chart = DipCalibrationChart.objects.create(
            organisation=self.org, name="Tank 1 Calibration", nominal_capacity=Decimal('20000'),
            lookup_mode=DipCalibrationChart.LOOKUP_INTERPOLATE, original_height_unit=DipCalibrationChart.UNIT_MM,
            normalized_height_unit='millimetre', volume_unit='litre', status=DipCalibrationChart.STATUS_DRAFT
        )
        DipCalibrationPoint.objects.create(chart=chart, sequence=1, height_mm=Decimal('0'), volume_litres=Decimal('0'))
        DipCalibrationPoint.objects.create(chart=chart, sequence=2, height_mm=Decimal('1000'), volume_litres=Decimal('10000'))
        DipCalibrationPoint.objects.create(chart=chart, sequence=3, height_mm=Decimal('2000'), volume_litres=Decimal('20000'))
        self.chart = activate_calibration_chart(chart)
        self.assignment = assign_calibration_chart_to_tank(
            organisation=self.org, outlet=self.outlet, tank=self.tank, chart=self.chart,
            effective_from=timezone.now() - timedelta(days=5), user=self.owner
        )

        # Confirmed opening balance for meter continuity
        ob_batch = create_opening_balance_batch(
            organisation=self.org, outlet=self.outlet, effective_at=timezone.now() - timedelta(days=2),
            user=self.owner, notes="Initial Confirmed Opening Batch"
        )
        set_nozzle_opening_balance(ob_batch, self.nozzle1, Decimal('1000.000'))
        set_nozzle_opening_balance(ob_batch, self.nozzle2, Decimal('2000.000'))
        set_tank_opening_balance(
            ob_batch, self.tank, book_quantity=Decimal('8000.0000'), physical_quantity=Decimal('8000.0000'),
            conversion_method='manual_quantity', manual_quantity_reason='Initial setup'
        )
        self.confirmed_batch = confirm_opening_balance_batch(ob_batch, self.owner)

        # Shift definition
        self.shift_def = create_shift_definition(self.org, self.outlet, code="MORN", name="Morning Shift", starts_at=time(6, 0), ends_at=time(14, 0))

    def _open_test_shift(self):
        staff_data = [
            {'employee_id': str(self.emp_alice.id), 'nozzle_ids': [str(self.nozzle1.id), str(self.nozzle2.id)]}
        ]
        return open_operational_shift(
            organisation=self.org, outlet=self.outlet, shift_definition=self.shift_def,
            business_date=date(2026, 9, 10), staff_assignments_data=staff_data, manual_exceptions_data={},
            notes="Live shift testing", user=self.owner
        )

    def test_add_staff_without_nozzles_and_custom_designation(self):
        shift = self._open_test_shift()

        # Add Carol as non-nozzle Supervisor
        staff = add_staff_to_open_shift(
            shift=shift,
            employee_id=self.emp_carol.id,
            duty_designation_id=self.desig_supervisor.id,
            notes="Added for afternoon forecourt supervision",
            user=self.owner
        )

        self.assertEqual(staff.source_employee, self.emp_carol)
        self.assertEqual(staff.designation_snapshot, "Forecourt Supervisor")
        self.assertIsNone(staff.effective_to)
        self.assertEqual(staff.nozzle_assignments.count(), 0)

        # Audit activity logged
        log = ShiftActivityLog.objects.filter(shift=shift, event_type='staff_added').first()
        self.assertIsNotNone(log)
        self.assertEqual(log.metadata['employee_name'], "Carol Cashier")
        self.assertEqual(log.metadata['designation'], "Forecourt Supervisor")

    def test_employee_with_no_nozzles_has_zero_fuel_sales_totals(self):
        """
        Multiple staff can exist without nozzles (e.g. Supervisor, Cashier designation).
        Attendants with assigned nozzles account for sales; non-nozzle staff have 0 sales.
        """
        shift = self._open_test_shift()

        # Add Carol (Cashier designation) and Bob (Supervisor) with no nozzles
        add_staff_to_open_shift(
            shift=shift, employee_id=self.emp_carol.id, duty_designation_id=self.desig_cashier.id,
            user=self.owner
        )
        add_staff_to_open_shift(
            shift=shift, employee_id=self.emp_bob.id, duty_designation_id=self.desig_supervisor.id,
            user=self.owner
        )

        # Alice dispenses fuel on N1 (1000 -> 1050 = 50L) and N2 (2000 -> 2030 = 30L)
        record_closing_meter_reading(shift, self.nozzle1, Decimal('1050.000'), self.owner)
        record_closing_meter_reading(shift, self.nozzle2, Decimal('2030.000'), self.owner)

        totals = calculate_shift_totals(shift)
        emp_map = {e['employee_name']: e for e in totals['employees']}

        # Alice has all 80L sales
        self.assertEqual(emp_map['Alice Attendant']['gross_quantity'], Decimal('80.000'))
        self.assertEqual(emp_map['Alice Attendant']['sale_amount'], Decimal('8000.00'))

        # Carol Cashier has 0 fuel sales
        self.assertEqual(emp_map['Carol Cashier']['gross_quantity'], Decimal('0.000'))
        self.assertEqual(emp_map['Carol Cashier']['sale_amount'], Decimal('0.00'))
        self.assertEqual(emp_map['Carol Cashier']['nozzle_codes'], [])

        # Bob Attendant has 0 fuel sales
        self.assertEqual(emp_map['Bob Attendant']['gross_quantity'], Decimal('0.000'))
        self.assertEqual(emp_map['Bob Attendant']['sale_amount'], Decimal('0.00'))

    def test_legacy_cashier_transfer_endpoint_returns_410_gone(self):
        """Legacy primary cashier transfer endpoint must return 410 Gone."""
        shift = self._open_test_shift()
        self.client.force_authenticate(user=self.owner)
        url = reverse('shift_cashier_transfer', kwargs={'org_id': self.org.id, 'outlet_id': self.outlet.id, 'shift_id': shift.id})
        resp = self.client.post(url, {'new_staff_id': 'fake-id', 'reason': 'test'}, format='json')
        self.assertEqual(resp.status_code, 410)
        self.assertIn("decommissioned", resp.data['detail'])

    def test_cashier_transfer_permission_removed(self):
        """The shift.cashier_transfer permission must not exist in active permissions."""
        from apps.organizations.models import PermissionDefinition
        self.assertFalse(PermissionDefinition.objects.filter(code='shift.cashier_transfer').exists())

    def test_roster_and_shift_apis_reject_legacy_primary_cashier_field(self):
        """APIs must reject legacy is_primary_cashier field with 400 Bad Request."""
        self.client.force_authenticate(user=self.owner)

        # 1. Roster workspace save rejects is_primary_cashier (via staff_assignments or assignments)
        roster_url = reverse('shift_roster_workspace', kwargs={'org_id': self.org.id, 'outlet_id': self.outlet.id})
        resp_roster = self.client.post(roster_url, {
            'shift_definition_id': str(self.shift_def.id),
            'business_date': '2026-09-15',
            'staff_assignments': [
                {'employee_id': str(self.emp_alice.id), 'nozzle_ids': [str(self.nozzle1.id)], 'is_primary_cashier': True}
            ]
        }, format='json')
        self.assertEqual(resp_roster.status_code, 400)
        self.assertIn("is_primary_cashier", resp_roster.data['detail'])

        resp_roster_direct = self.client.post(roster_url, {
            'shift_definition_id': str(self.shift_def.id),
            'business_date': '2026-09-15',
            'assignments': [
                {'employee_id': str(self.emp_alice.id), 'nozzle_ids': [str(self.nozzle1.id)], 'is_primary_cashier': True}
            ]
        }, format='json')
        self.assertEqual(resp_roster_direct.status_code, 400)
        self.assertIn("is_primary_cashier", resp_roster_direct.data['detail'])

        # 2. Shift open rejects is_primary_cashier
        open_url = reverse('shift_open', kwargs={'org_id': self.org.id, 'outlet_id': self.outlet.id})
        resp_open = self.client.post(open_url, {
            'shift_definition_id': str(self.shift_def.id),
            'business_date': '2026-09-15',
            'staff_assignments': [
                {'employee_id': str(self.emp_alice.id), 'nozzle_ids': [str(self.nozzle1.id), str(self.nozzle2.id)], 'is_primary_cashier': True}
            ]
        }, format='json')
        self.assertEqual(resp_open.status_code, 400)
        self.assertIn("is_primary_cashier", resp_open.data['detail'])

        # 3. Add staff rejects is_primary_cashier
        shift = self._open_test_shift()
        add_staff_url = reverse('shift_staff_add', kwargs={'org_id': self.org.id, 'outlet_id': self.outlet.id, 'shift_id': shift.id})
        resp_add = self.client.post(add_staff_url, {
            'employee_id': str(self.emp_bob.id),
            'is_primary_cashier': True
        }, format='json')
        self.assertEqual(resp_add.status_code, 400)
        self.assertIn("is_primary_cashier", str(resp_add.data))

    def test_api_responses_omit_is_primary_cashier(self):
        """API shift detail and staff history responses must not return is_primary_cashier or cashier_periods."""
        shift = self._open_test_shift()
        self.client.force_authenticate(user=self.owner)

        # Shift detail
        detail_url = reverse('operational_shift_detail', kwargs={'org_id': self.org.id, 'outlet_id': self.outlet.id, 'shift_id': shift.id})
        resp = self.client.get(detail_url)
        self.assertEqual(resp.status_code, 200)
        staff_list = resp.data['shift']['staff_members']
        self.assertTrue(len(staff_list) > 0)
        for s in staff_list:
            self.assertNotIn('is_primary_cashier', s)

        # Staff history
        history_url = reverse('shift_staff_history', kwargs={'org_id': self.org.id, 'outlet_id': self.outlet.id, 'shift_id': shift.id})
        hist_resp = self.client.get(history_url)
        self.assertEqual(hist_resp.status_code, 200)
        self.assertNotIn('cashier_periods', hist_resp.data)

    def test_nozzle_handover_exact_meter_interval_split(self):
        """
        Opening reading: 1000.000
        Alice handles nozzle until reading 1015.000 (15 L)
        Handover reading: 1015.000
        Bob handles nozzle from reading 1015.000 onward
        Closing reading: 1040.000 (25 L)
        Employee totals:
        Alice: 15 litres
        Bob: 25 litres
        """
        shift = self._open_test_shift()

        # Perform handover at 1015.000
        handover_time = timezone.now()
        new_asm = transfer_nozzle_assignment(
            shift=shift,
            nozzle_id=self.nozzle1.id,
            new_employee_id=self.emp_bob.id,
            handover_reading=Decimal('1015.000'),
            handover_time=handover_time,
            reason="Alice lunch break",
            user=self.owner
        )

        self.assertEqual(new_asm.opening_reading, Decimal('1015.000'))
        self.assertIsNone(new_asm.closing_reading)
        self.assertEqual(new_asm.shift_staff.source_employee, self.emp_bob)

        # Check that previous assignment is closed at 1015.000
        alice_asm = OperationalShiftNozzleAssignment.objects.get(
            shift=shift, nozzle=self.nozzle1, shift_staff__source_employee=self.emp_alice
        )
        self.assertEqual(alice_asm.closing_reading, Decimal('1015.000'))
        self.assertEqual(alice_asm.effective_to, handover_time)

        # Now record closing readings for both nozzles
        record_closing_meter_reading(shift, self.nozzle1, Decimal('1040.000'), self.owner)
        record_closing_meter_reading(shift, self.nozzle2, Decimal('2000.000'), self.owner)

        # Close shift
        close_operational_shift(shift, self.owner)

        totals = calculate_shift_totals(shift)
        emp_totals = {e['employee_name']: e for e in totals['employees']}

        # Alice: 15.000 L
        self.assertEqual(emp_totals['Alice Attendant']['gross_quantity'], Decimal('15.000'))
        self.assertEqual(emp_totals['Alice Attendant']['sale_quantity'], Decimal('15.000'))
        # 15 L * 100 = 1500.00
        self.assertEqual(emp_totals['Alice Attendant']['sale_amount'], Decimal('1500.00'))

        # Bob: 25.000 L
        self.assertEqual(emp_totals['Bob Attendant']['gross_quantity'], Decimal('25.000'))
        self.assertEqual(emp_totals['Bob Attendant']['sale_quantity'], Decimal('25.000'))
        # 25 L * 100 = 2500.00
        self.assertEqual(emp_totals['Bob Attendant']['sale_amount'], Decimal('2500.00'))

        # Overall total = 40.000 L
        self.assertEqual(totals['overall']['total_sale_quantity'], Decimal('40.000'))
        self.assertEqual(totals['overall']['total_fuel_sale_amount'], Decimal('4000.00'))

    def test_price_segments_remain_continuous_through_handover(self):
        """
        Mid-shift price change + attendant handover:
        Initial price: 100.0000
        Alice handles 1000.000 -> 1020.000.
        Midway, price changes to 110.0000 at reading 1010.000.
        Alice:
          10 L @ 100 = 1000.00
          10 L @ 110 = 1100.00
          Alice Total = 2100.00
        Handover to Bob at 1020.000.
        Bob handles 1020.000 -> 1030.000 (all @ 110.0000):
          10 L @ 110 = 1100.00
          Bob Total = 1100.00
        """
        shift = self._open_test_shift()

        # Mid-shift price change at 1010.000
        apply_product_price_change_during_shift(
            outlet=self.outlet, product=self.product, new_price=Decimal('110.0000'),
            effective_at=timezone.now(),
            nozzle_snapshot_readings={str(self.nozzle1.id): Decimal('1010.000'), str(self.nozzle2.id): Decimal('2000.000')},
            actor=self.owner
        )

        # Handover at 1020.000 to Bob
        transfer_nozzle_assignment(
            shift=shift, nozzle_id=self.nozzle1.id, new_employee_id=self.emp_bob.id,
            handover_reading=Decimal('1020.000'), reason="Shift transfer", user=self.owner
        )

        # Record closing reading at 1030.000
        record_closing_meter_reading(shift, self.nozzle1, Decimal('1030.000'), self.owner)
        record_closing_meter_reading(shift, self.nozzle2, Decimal('2000.000'), self.owner)

        totals = calculate_shift_totals(shift)
        emp_totals = {e['employee_name']: e for e in totals['employees']}

        self.assertEqual(emp_totals['Alice Attendant']['gross_quantity'], Decimal('20.000'))
        self.assertEqual(emp_totals['Alice Attendant']['sale_amount'], Decimal('2100.00'))

        self.assertEqual(emp_totals['Bob Attendant']['gross_quantity'], Decimal('10.000'))
        self.assertEqual(emp_totals['Bob Attendant']['sale_amount'], Decimal('1100.00'))

    def test_testing_attributed_to_exact_employee_interval(self):
        """
        Alice handles 1000 -> 1020. Fuel test of 5L done during Alice's period.
        Bob handles 1020 -> 1050. No testing during Bob's period.
        Alice: gross 20, test 5, net 15.
        Bob: gross 30, test 0, net 30.
        """
        shift = self._open_test_shift()

        # Alice handles and records 5L test
        record_testing(shift, self.nozzle1, Decimal('5.000'), returned_to_tank=True, destination_tank=self.tank, user=self.owner)

        # Handover to Bob at 1020.000
        transfer_nozzle_assignment(
            shift=shift, nozzle_id=self.nozzle1.id, new_employee_id=self.emp_bob.id,
            handover_reading=Decimal('1020.000'), reason="Handover to Bob", user=self.owner
        )

        # Bob advances meter to 1050.000
        record_closing_meter_reading(shift, self.nozzle1, Decimal('1050.000'), self.owner)
        record_closing_meter_reading(shift, self.nozzle2, Decimal('2000.000'), self.owner)

        totals = calculate_shift_totals(shift)
        emp_totals = {e['employee_name']: e for e in totals['employees']}

        self.assertEqual(emp_totals['Alice Attendant']['gross_quantity'], Decimal('20.000'))
        self.assertEqual(emp_totals['Alice Attendant']['testing_quantity'], Decimal('5.000'))
        self.assertEqual(emp_totals['Alice Attendant']['sale_quantity'], Decimal('15.000'))

        self.assertEqual(emp_totals['Bob Attendant']['gross_quantity'], Decimal('30.000'))
        self.assertEqual(emp_totals['Bob Attendant']['testing_quantity'], Decimal('0.000'))
        self.assertEqual(emp_totals['Bob Attendant']['sale_quantity'], Decimal('30.000'))

    def test_backdated_handover_rejected_when_later_events_exist(self):
        shift = self._open_test_shift()
        two_hours_ago = timezone.now() - timedelta(hours=2)
        shift.opened_at = two_hours_ago
        shift.save(update_fields=['opened_at'])
        OperationalShiftNozzleAssignment.objects.filter(shift=shift).update(effective_from=two_hours_ago)

        # Record a test at 30 minutes ago
        test_time = timezone.now() - timedelta(minutes=30)
        record_testing(
            shift=shift, nozzle=self.nozzle1, quantity=Decimal('2.000'),
            returned_to_tank=True, destination_tank=self.tank,
            occurred_at=test_time, user=self.owner
        )

        # Try to handover with a timestamp from 1 hour ago (after assignment start, but before recorded test)
        backdated_time = timezone.now() - timedelta(hours=1)
        with self.assertRaises(ValidationError) as ctx:
            transfer_nozzle_assignment(
                shift=shift, nozzle_id=self.nozzle1.id, new_employee_id=self.emp_bob.id,
                handover_reading=Decimal('1010.000'), handover_time=backdated_time,
                reason="Backdated handover", user=self.owner
            )
        self.assertIn("prior to recorded fuel tests", str(ctx.exception))

    def test_add_staff_cannot_replace_active_nozzle(self):
        shift = self._open_test_shift()

        # Nozzle 1 is already assigned to Alice. Trying to assign nozzle 1 via add_staff must fail.
        with self.assertRaises(ValidationError) as ctx:
            add_staff_to_open_shift(
                shift=shift, employee_id=self.emp_bob.id,
                assigned_nozzle_ids=[self.nozzle1.id],
                user=self.owner
            )
        self.assertIn("already has an active attendant", str(ctx.exception))
        self.assertIn("Use 'Transfer Nozzle'", str(ctx.exception))

    def test_correction_allowed_only_before_meter_advancement(self):
        shift = self._open_test_shift()

        # Meter has not advanced (current closing_reading is None)
        corrected = correct_nozzle_assignment(
            shift=shift, nozzle_id=self.nozzle1.id, new_employee_id=self.emp_bob.id,
            reason="Wrong DSM selected at shift opening", user=self.owner
        )
        self.assertEqual(corrected.shift_staff.source_employee, self.emp_bob)
        self.assertEqual(corrected.assignment_type, 'correction')

        # Now advance meter
        record_closing_meter_reading(shift, self.nozzle1, Decimal('1010.000'), self.owner)

        # Further correction must be rejected because dispensing occurred
        with self.assertRaises(ValidationError) as ctx:
            correct_nozzle_assignment(
                shift=shift, nozzle_id=self.nozzle1.id, new_employee_id=self.emp_alice.id,
                reason="Try correcting after sales", user=self.owner
            )
        self.assertIn("Dispensing has already occurred", str(ctx.exception))

    def test_closed_shift_rejects_staff_changes(self):
        shift = self._open_test_shift()
        record_closing_meter_reading(shift, self.nozzle1, Decimal('1050.000'), self.owner)
        record_closing_meter_reading(shift, self.nozzle2, Decimal('2000.000'), self.owner)
        close_operational_shift(shift, self.owner)

        with self.assertRaises(ValidationError):
            transfer_nozzle_assignment(
                shift=shift, nozzle_id=self.nozzle1.id, new_employee_id=self.emp_bob.id,
                handover_reading=Decimal('1020.000'), reason="Post close", user=self.owner
            )

        with self.assertRaises(ValidationError):
            add_staff_to_open_shift(
                shift=shift, employee_id=self.emp_bob.id, user=self.owner
            )

    def test_cross_outlet_employee_rejected(self):
        shift = self._open_test_shift()
        with self.assertRaises(ValidationError) as ctx:
            add_staff_to_open_shift(
                shift=shift, employee_id=self.emp_other.id, user=self.owner
            )
        self.assertIn("not assigned to this outlet", str(ctx.exception))

    def test_midshift_activation_requires_valid_exception(self):
        shift = self._open_test_shift()

        # Create a new nozzle added after shift opening
        new_nozzle = Nozzle.objects.create(
            organisation=self.org, outlet=self.outlet, dispenser=self.dispenser,
            tank=self.tank, code="N3", name="Nozzle 3"
        )

        meter = activate_nozzle_midshift(
            shift=shift, nozzle_id=new_nozzle.id, employee_id=self.emp_bob.id,
            starting_reading=Decimal('500.000'), reason="Commissioned new pump mid-shift",
            user=self.owner
        )

        self.assertEqual(meter.opening_reading, Decimal('500.000'))
        self.assertEqual(meter.manual_exception_type, 'midshift_activation')
        self.assertEqual(meter.staff_assignment.source_employee, self.emp_bob)

        # Assignment is active
        asm = OperationalShiftNozzleAssignment.objects.get(shift=shift, nozzle=new_nozzle)
        self.assertEqual(asm.opening_reading, Decimal('500.000'))
        self.assertIsNone(asm.effective_to)

    def test_commissioned_nozzle_opening_derivation_and_continuity(self):
        # 1. nozzle1 and nozzle2 have opening balance (1000.000, 2000.000)
        # Create nozzle3 which has NO opening balance
        nozzle3 = Nozzle.objects.create(
            organisation=self.org, outlet=self.outlet, dispenser=self.dispenser,
            tank=self.tank, code="N3", name="Nozzle 3"
        )

        # Commission nozzle3 with starting reading 3000.000
        comm_time = timezone.now() - timedelta(hours=1)
        comm = commission_nozzle(
            organisation=self.org, outlet=self.outlet, nozzle=nozzle3,
            initial_totalizer=Decimal('3000.000'), effective_at=comm_time,
            reason="Commissioned Nozzle 3", actor=self.owner
        )

        # 2. Check preview
        preview = prepare_shift_opening(
            organisation=self.org, outlet=self.outlet,
            shift_definition=self.shift_def, business_date=date(2026, 9, 1)
        )
        n1_preview = next(n for n in preview['nozzles'] if n['nozzle_id'] == str(self.nozzle1.id))
        n3_preview = next(n for n in preview['nozzles'] if n['nozzle_id'] == str(nozzle3.id))

        # Original nozzle continues using opening balance
        self.assertEqual(n1_preview['opening_source'], ShiftNozzleMeter.SOURCE_OPENING_BALANCE)
        self.assertEqual(n1_preview['derived_opening_reading'], Decimal('1000.000'))

        # Newly commissioned nozzle uses commissioning reading
        self.assertEqual(n3_preview['opening_source'], ShiftNozzleMeter.SOURCE_COMMISSIONING)
        self.assertEqual(n3_preview['derived_opening_reading'], Decimal('3000.000'))
        self.assertEqual(n3_preview['opening_source_description'], "Opening source: Nozzle commissioning")
        self.assertEqual(n3_preview['opening_source_reference'], str(comm.id))

        # 3. Open operational shift
        staff_data = [
            {
                'employee_id': str(self.emp_alice.id),
                'nozzle_ids': [str(self.nozzle1.id), str(self.nozzle2.id), str(nozzle3.id)]
            }
        ]
        shift = open_operational_shift(
            organisation=self.org, outlet=self.outlet, shift_definition=self.shift_def,
            business_date=date(2026, 9, 1), staff_assignments_data=staff_data,
            manual_exceptions_data={}, notes="Commissioning test shift", user=self.owner
        )

        meter3 = ShiftNozzleMeter.objects.get(shift=shift, nozzle=nozzle3)
        self.assertEqual(meter3.opening_reading, Decimal('3000.000'))
        self.assertEqual(meter3.opening_source, ShiftNozzleMeter.SOURCE_COMMISSIONING)
        self.assertEqual(meter3.opening_source_reference, str(comm.id))

        # 4. Record closing reading and close shift
        record_closing_meter_reading(shift, self.nozzle1, Decimal('1100.000'), self.owner)
        record_closing_meter_reading(shift, self.nozzle2, Decimal('2100.000'), self.owner)
        record_closing_meter_reading(shift, nozzle3, Decimal('3250.000'), self.owner)
        closed_shift = close_operational_shift(shift, self.owner)
        self.assertEqual(closed_shift.status, OperationalShift.STATUS_CLOSED)

        # 5. Subsequent shift MUST use previous closed-shift reading instead of commissioning!
        derived_next = derive_nozzle_opening_reading(self.outlet, nozzle3)
        self.assertEqual(derived_next['source'], ShiftNozzleMeter.SOURCE_PREVIOUS_SHIFT)
        self.assertEqual(derived_next['reading'], Decimal('3250.000'))

    def test_future_commissioning_not_used_for_earlier_shift(self):
        nozzle_future = Nozzle.objects.create(
            organisation=self.org, outlet=self.outlet, dispenser=self.dispenser,
            tank=self.tank, code="NFuture", name="Nozzle Future"
        )
        # Commission effective tomorrow
        future_time = timezone.now() + timedelta(days=1)
        commission_nozzle(
            organisation=self.org, outlet=self.outlet, nozzle=nozzle_future,
            initial_totalizer=Decimal('500.000'), effective_at=future_time,
            reason="Future installation", actor=self.owner
        )

        # Deriving opening reading for NOW should NOT use the future commissioning
        derived = derive_nozzle_opening_reading(self.outlet, nozzle_future, as_of_time=timezone.now())
        self.assertEqual(derived['source'], ShiftNozzleMeter.SOURCE_MANUAL_EXCEPTION)
        self.assertIsNone(derived['reading'])

    def test_discarded_shift_does_not_corrupt_commissioning(self):
        nozzle_discard = Nozzle.objects.create(
            organisation=self.org, outlet=self.outlet, dispenser=self.dispenser,
            tank=self.tank, code="NDisc", name="Nozzle Discard"
        )
        comm = commission_nozzle(
            organisation=self.org, outlet=self.outlet, nozzle=nozzle_discard,
            initial_totalizer=Decimal('700.000'), effective_at=timezone.now() - timedelta(hours=2),
            reason="Commissioning before discarded shift", actor=self.owner
        )

        # Open shift
        staff_data = [
            {
                'employee_id': str(self.emp_alice.id),
                'nozzle_ids': [str(self.nozzle1.id), str(self.nozzle2.id), str(nozzle_discard.id)]
            }
        ]
        shift = open_operational_shift(
            organisation=self.org, outlet=self.outlet, shift_definition=self.shift_def,
            business_date=date(2026, 9, 1), staff_assignments_data=staff_data,
            manual_exceptions_data={}, notes="Shift to discard", user=self.owner
        )

        # Discard the shift
        discard_open_operational_shift(shift, self.owner, reason="Test discard")

        # After discard, nozzle_discard still has valid commissioning as starting source
        derived = derive_nozzle_opening_reading(self.outlet, nozzle_discard)
        self.assertEqual(derived['source'], ShiftNozzleMeter.SOURCE_COMMISSIONING)
        self.assertEqual(derived['reading'], Decimal('700.000'))

    def test_open_shift_requires_separate_midshift_activation(self):
        shift = self._open_test_shift()

        # Add a new nozzle while shift is open
        nozzle_mid = Nozzle.objects.create(
            organisation=self.org, outlet=self.outlet, dispenser=self.dispenser,
            tank=self.tank, code="NMid", name="Nozzle Mid"
        )

        # Commission it normally
        comm = commission_nozzle(
            organisation=self.org, outlet=self.outlet, nozzle=nozzle_mid,
            initial_totalizer=Decimal('800.000'), effective_at=timezone.now(),
            reason="Commissioned while shift open", actor=self.owner
        )

        # Ordinary commissioning must NOT silently inject the nozzle into the active shift!
        self.assertFalse(ShiftNozzleMeter.objects.filter(shift=shift, nozzle=nozzle_mid).exists())

        # Mid-shift activation workflow is required to bring it into the live shift
        meter = activate_nozzle_midshift(
            shift=shift,
            nozzle_id=nozzle_mid.id,
            employee_id=self.emp_bob.id,
            starting_reading=Decimal('800.000'),
            reason="Activating newly commissioned nozzle mid-shift",
            user=self.owner
        )
        self.assertEqual(meter.opening_reading, Decimal('800.000'))
        self.assertTrue(ShiftNozzleMeter.objects.filter(shift=shift, nozzle=nozzle_mid).exists())

    def test_one_employee_multiple_nozzles_aggregates_sales(self):
        """One employee managing multiple nozzles aggregates sales from all intervals."""
        shift = self._open_test_shift()

        # Alice has N1 and N2. N1: 1000 -> 1010 (10L). N2: 2000 -> 2025 (25L).
        record_closing_meter_reading(shift, self.nozzle1, Decimal('1010.000'), self.owner)
        record_closing_meter_reading(shift, self.nozzle2, Decimal('2025.000'), self.owner)

        totals = calculate_shift_totals(shift)
        emp_totals = {e['employee_name']: e for e in totals['employees']}

        alice = emp_totals['Alice Attendant']
        self.assertEqual(alice['gross_quantity'], Decimal('35.000'))
        self.assertEqual(alice['sale_quantity'], Decimal('35.000'))
        self.assertEqual(alice['sale_amount'], Decimal('3500.00'))
        self.assertIn('N1', alice['nozzle_codes'])
        self.assertIn('N2', alice['nozzle_codes'])

    def test_cross_tenant_access_denied_for_shift_staff(self):
        """User belonging to another organization cannot manage or access shift staff."""
        other_user = get_user_model().objects.create_user(email="intruder@foreign.test", password="Password123!")
        other_org = Organisation.objects.create(name="Foreign Org", code="FORG")
        OrganisationMembership.objects.create(
            organisation=other_org, user=other_user, membership_type=OrganisationMembership.TYPE_OWNER,
            status=OrganisationMembership.STATUS_ACTIVE, joined_at=timezone.now()
        )

        shift = self._open_test_shift()
        self.client.force_authenticate(user=other_user)

        # Attempt to add staff from foreign tenant
        add_url = reverse('shift_staff_add', kwargs={'org_id': self.org.id, 'outlet_id': self.outlet.id, 'shift_id': shift.id})
        resp = self.client.post(add_url, {'employee_id': str(self.emp_bob.id)}, format='json')
        self.assertEqual(resp.status_code, 403)

        # Attempt to handover nozzle from foreign tenant
        handover_url = reverse('shift_nozzle_handover', kwargs={'org_id': self.org.id, 'outlet_id': self.outlet.id, 'shift_id': shift.id})
        resp_h = self.client.post(handover_url, {
            'nozzle_id': str(self.nozzle1.id),
            'new_employee_id': str(self.emp_bob.id),
            'handover_reading': '1010.000',
            'reason': 'Intrusion'
        }, format='json')
        self.assertEqual(resp_h.status_code, 403)



