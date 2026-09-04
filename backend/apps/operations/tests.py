# apps/operations/tests.py
from datetime import datetime, timedelta, time
from decimal import Decimal
from django.test import TestCase
from django.core.exceptions import ValidationError
from django.utils import timezone
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.organizations.models import Organisation, Outlet
from apps.organizations.services import create_organisation_with_owner, create_outlet
from apps.forecourt.models import FuelProduct, Tank, Dispenser, Nozzle, ProductPrice
from apps.forecourt.services import create_fuel_product, create_tank, create_dispenser, create_nozzle, set_product_price
from apps.shifts.models import ShiftDefinition
from apps.shifts.services import create_shift_definition
from apps.employees.models import Employee, EmployeeDesignation
from apps.employees.services import create_employee, create_designation, assign_employee_to_outlets

from .models import (
    DipCalibrationChart, DipCalibrationPoint, TankCalibrationAssignment,
    OpeningBalanceBatch, NozzleOpeningBalance, TankOpeningBalance,
    NozzleCommissioning, NozzleCommissioningAuditLog
)
from .services import (
    import_calibration_chart, activate_calibration_chart,
    assign_calibration_chart_to_tank, convert_dip_to_volume,
    create_opening_balance_batch, set_nozzle_opening_balance, set_tank_opening_balance,
    confirm_opening_balance_batch, commission_nozzle, bulk_commission_nozzles
)
from .selectors import check_outlet_operational_readiness
from apps.shifts.models import OperationalShift, ShiftNozzleMeter, ShiftStaffAssignment
from rest_framework.test import APIClient
from apps.organizations.models import Role, RolePermission, PermissionDefinition, OrganisationMembership, MembershipRole

User = get_user_model()

class OperationsTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(email="owner@example.com", password="password")
        self.org = create_organisation_with_owner(name="Test Org", code="TORG", owner_user=self.owner)
        self.outlet = create_outlet(self.org, name="Outlet 1", code="OUT1")
        
        # Forecourt setup
        self.product = create_fuel_product(self.org, code="MS", name="Petrol", category="petrol", unit="litre")
        self.tank = create_tank(self.org, self.outlet, self.product, code="TK1", name="Tank 1", capacity=5000)
        self.dispenser = create_dispenser(self.org, self.outlet, code="DP1", name="Dispenser 1")
        self.nozzle = create_nozzle(self.org, self.outlet, self.dispenser, self.tank, code="NZ1", name="Nozzle 1")

    def test_monotonic_chart_validation(self):
        # Create a mock spreadsheet content (CSV format)
        csv_content = (
            "Dip,Volume\n"
            "10,100\n"
            "20,200\n"
            "30,150\n" # Volume decreases, non-monotonic
        ).encode('utf-8')
        uploaded_file = SimpleUploadedFile("chart.csv", csv_content, content_type="text/csv")
        
        chart = import_calibration_chart(
            self.org, name="Test Chart", nominal_capacity=Decimal('1000'),
            lookup_mode=DipCalibrationChart.LOOKUP_INTERPOLATE,
            original_height_unit=DipCalibrationChart.UNIT_MM,
            file_obj=uploaded_file, dip_col_idx=0, vol_col_idx=1,
            user=self.owner
        )
        
        # Activating should raise ValidationError because volume decreases
        with self.assertRaises(ValidationError):
            activate_calibration_chart(chart)

    def test_millimetre_centimetre_normalization_and_lookup(self):
        # Centimetre input file
        csv_content = (
            "Dip cm,Volume\n"
            "0,0\n"
            "1,10\n"  # 10mm -> 10L
            "2,20\n"  # 20mm -> 20L
            "3,30\n"  # 30mm -> 30L
        ).encode('utf-8')
        uploaded_file = SimpleUploadedFile("chart_cm.csv", csv_content, content_type="text/csv")
        
        chart = import_calibration_chart(
            self.org, name="Test Chart CM", nominal_capacity=Decimal('30'),
            lookup_mode=DipCalibrationChart.LOOKUP_INTERPOLATE,
            original_height_unit=DipCalibrationChart.UNIT_CM, # CM unit
            file_obj=uploaded_file, dip_col_idx=0, vol_col_idx=1,
            user=self.owner
        )
        
        # Verify normalized height is 10mm and 20mm
        points = list(chart.points.all().order_by('height_mm'))
        self.assertEqual(points[1].height_mm, Decimal('10'))
        self.assertEqual(points[2].height_mm, Decimal('20'))

        activate_calibration_chart(chart)
        assign_calibration_chart_to_tank(self.org, self.outlet, self.tank, chart, timezone.now() - timedelta(days=1), self.owner)

        # 1. Exact lookup
        res_exact = convert_dip_to_volume(self.tank, Decimal('1.0'), DipCalibrationChart.UNIT_CM) # 1cm = 10mm
        self.assertEqual(res_exact['volume'], Decimal('10'))

        # 2. Interpolated lookup (1.5cm = 15mm -> should interpolate between 10mm (10L) and 20mm (20L) -> 15L)
        res_interp = convert_dip_to_volume(self.tank, Decimal('1.5'), DipCalibrationChart.UNIT_CM)
        self.assertEqual(res_interp['volume'], Decimal('15'))

        # 3. Extrapolation check (outside 0-3cm)
        with self.assertRaises(ValidationError):
            convert_dip_to_volume(self.tank, Decimal('4.0'), DipCalibrationChart.UNIT_CM)

    def test_opening_balance_immutability(self):
        batch = create_opening_balance_batch(self.org, self.outlet, timezone.now(), self.owner)
        set_nozzle_opening_balance(batch, self.nozzle, Decimal('100.0'))
        set_tank_opening_balance(batch, self.tank, Decimal('1000.0'), Decimal('980.0'), manual_quantity_reason="Initial setup")

        confirm_opening_balance_batch(batch, self.owner)

        # After confirmation, editing nozzle balance should fail
        with self.assertRaises(ValidationError):
            set_nozzle_opening_balance(batch, self.nozzle, Decimal('200.0'))

        # Editing tank balance should fail
        with self.assertRaises(ValidationError):
            set_tank_opening_balance(batch, self.tank, Decimal('1200.0'), Decimal('1180.0'), manual_quantity_reason="Initial setup")

    def test_outlet_readiness_calculation(self):
        # Initial check should show not ready because prices, shifts, employees, balances are missing
        readiness1 = check_outlet_operational_readiness(self.outlet)
        self.assertFalse(readiness1['ready'])

        # Fix pricing
        set_product_price(self.org, self.outlet, self.product, Decimal('95.00'), effective_from=timezone.now() - timedelta(days=1))
        
        # Add shift definition
        create_shift_definition(self.org, self.outlet, code="S1", name="Morning", starts_at=time(6, 0), ends_at=time(14, 0))

        # Add active employee
        designation = create_designation(self.org, code="DSM", name="Attendant")
        employee = create_employee(self.org, employee_code="E1", display_name="John Attendant", designation=designation)
        assign_employee_to_outlets(employee, [{'outlet_id': self.outlet.id, 'is_primary': True}])

        # Tank calibration assignment (can set acknowledged_manual_dip = True on tank to bypass chart assignment)
        self.tank.acknowledged_manual_dip = True
        self.tank.save()

        # Add confirmed opening balance batch
        batch = create_opening_balance_batch(self.org, self.outlet, timezone.now(), self.owner)
        set_nozzle_opening_balance(batch, self.nozzle, Decimal('1000.0'))
        set_tank_opening_balance(batch, self.tank, Decimal('2000.0'), Decimal('1980.0'), manual_quantity_reason="Initial setup")
        confirm_opening_balance_batch(batch, self.owner)

        # Now check readiness
        readiness2 = check_outlet_operational_readiness(self.outlet)
        self.assertTrue(readiness2['ready'])

    def test_newly_added_nozzle_commissioning_and_readiness(self):
        # 1. Setup confirmed opening balance for original nozzle
        batch = create_opening_balance_batch(self.org, self.outlet, timezone.now(), self.owner)
        set_nozzle_opening_balance(batch, self.nozzle, Decimal('1000.000'))
        set_tank_opening_balance(batch, self.tank, Decimal('2000.0'), Decimal('1980.0'), manual_quantity_reason="Initial setup")
        confirmed_batch = confirm_opening_balance_batch(batch, self.owner)
        batch_id = confirmed_batch.id
        confirmed_at_orig = confirmed_batch.confirmed_at
        orig_batch_count = confirmed_batch.nozzle_balances.count()

        # 2. Add a new nozzle after opening balance confirmation
        nozzle2 = create_nozzle(self.org, self.outlet, self.dispenser, self.tank, code="NZ2", name="Nozzle 2")

        # 3. Check readiness: nozzle2 has no opening totalizer, so readiness must fail
        readiness = check_outlet_operational_readiness(self.outlet)
        nozzle_check = next(c for c in readiness['checks'] if c['id'] == 'nozzle_totalizers')
        self.assertFalse(nozzle_check['passed'])
        self.assertEqual(nozzle_check['details'], "Some active nozzles do not have an opening totalizer or commissioning record.")
        self.assertEqual(nozzle_check['code'], "nozzle_starting_reading_missing")
        self.assertTrue(any(item['nozzle_id'] == str(nozzle2.id) for item in nozzle_check['items']))
        self.assertEqual(readiness['resolution_links']['nozzle_totalizers'], '/app/settings/dispensers-nozzles')

        # 4. Commission the newly added nozzle
        effective_time = timezone.now()
        comm = commission_nozzle(
            organisation=self.org,
            outlet=self.outlet,
            nozzle=nozzle2,
            initial_totalizer=Decimal('456.789'),
            effective_at=effective_time,
            reason="Newly installed dispenser nozzle",
            notes="Factory calibration confirmed",
            actor=self.owner
        )

        # 5. Verify commissioning record and snapshot fields
        self.assertIsNotNone(comm.id)
        self.assertEqual(comm.initial_totalizer, Decimal('456.789'))
        self.assertEqual(comm.dispenser_code_snapshot, self.dispenser.code)
        self.assertEqual(comm.nozzle_code_snapshot, "NZ2")
        self.assertEqual(comm.product_id_snapshot, self.product.id)
        self.assertEqual(comm.product_name_snapshot, self.product.name)

        # 6. Confirmed opening balance batch remains strictly unchanged
        confirmed_batch.refresh_from_db()
        self.assertEqual(confirmed_batch.id, batch_id)
        self.assertEqual(confirmed_batch.status, OpeningBalanceBatch.STATUS_CONFIRMED)
        self.assertEqual(confirmed_batch.confirmed_at, confirmed_at_orig)
        self.assertEqual(confirmed_batch.nozzle_balances.count(), orig_batch_count)

        # 7. Check readiness passes now that nozzle2 is commissioned
        # Provide prerequisites (price, shift, employee, calibration)
        set_product_price(self.org, self.outlet, self.product, Decimal('95.00'), effective_from=timezone.now() - timedelta(days=1))
        create_shift_definition(self.org, self.outlet, code="S1", name="Morning", starts_at=time(6, 0), ends_at=time(14, 0))
        desig = create_designation(self.org, code="DSM", name="Attendant")
        emp = create_employee(self.org, employee_code="E1", display_name="John Attendant", designation=desig)
        assign_employee_to_outlets(emp, [{'outlet_id': self.outlet.id, 'is_primary': True}])
        self.tank.acknowledged_manual_dip = True
        self.tank.save()

        readiness2 = check_outlet_operational_readiness(self.outlet)
        nozzle_check2 = next(c for c in readiness2['checks'] if c['id'] == 'nozzle_totalizers')
        self.assertTrue(nozzle_check2['passed'])
        self.assertTrue(readiness2['ready'])

    def test_duplicate_commissioning_rejected(self):
        nozzle2 = create_nozzle(self.org, self.outlet, self.dispenser, self.tank, code="NZ2", name="Nozzle 2")
        commission_nozzle(
            self.org, self.outlet, nozzle2, Decimal('100.000'),
            timezone.now(), "First commissioning", None, self.owner
        )
        with self.assertRaises(ValidationError):
            commission_nozzle(
                self.org, self.outlet, nozzle2, Decimal('200.000'),
                timezone.now(), "Duplicate attempt", None, self.owner
            )

    def test_negative_totalizer_rejected(self):
        nozzle2 = create_nozzle(self.org, self.outlet, self.dispenser, self.tank, code="NZ2", name="Nozzle 2")
        with self.assertRaises(ValidationError):
            commission_nozzle(
                self.org, self.outlet, nozzle2, Decimal('-10.000'),
                timezone.now(), "Negative test", None, self.owner
            )

    def test_cross_outlet_and_tenant_commissioning_rejected(self):
        org2 = create_organisation_with_owner(name="Org 2", code="TORG2", owner_user=self.owner)
        outlet2 = create_outlet(org2, name="Outlet 2", code="OUT2")
        nozzle2 = create_nozzle(self.org, self.outlet, self.dispenser, self.tank, code="NZ2", name="Nozzle 2")

        # Mismatched outlet
        with self.assertRaises(ValidationError):
            commission_nozzle(
                self.org, outlet2, nozzle2, Decimal('100.000'),
                timezone.now(), "Cross outlet test", None, self.owner
            )

        # Mismatched org
        with self.assertRaises(ValidationError):
            commission_nozzle(
                org2, self.outlet, nozzle2, Decimal('100.000'),
                timezone.now(), "Cross org test", None, self.owner
            )

    def test_bulk_commissioning_is_atomic(self):
        nozzle2 = create_nozzle(self.org, self.outlet, self.dispenser, self.tank, code="NZ2", name="Nozzle 2")
        nozzle3 = create_nozzle(self.org, self.outlet, self.dispenser, self.tank, code="NZ3", name="Nozzle 3")

        # Row 1 valid, row 2 negative -> should fail atomically
        invalid_items = [
            {'nozzle_id': nozzle2.id, 'initial_totalizer': Decimal('100.000'), 'notes': 'Valid'},
            {'nozzle_id': nozzle3.id, 'initial_totalizer': Decimal('-50.000'), 'notes': 'Invalid'}
        ]
        with self.assertRaises(ValidationError):
            bulk_commission_nozzles(
                organisation=self.org,
                outlet=self.outlet,
                items=invalid_items,
                effective_at=timezone.now(),
                common_reason="Bulk install test",
                actor=self.owner
            )

        # Neither nozzle should be commissioned
        self.assertFalse(NozzleCommissioning.objects.filter(nozzle=nozzle2).exists())
        self.assertFalse(NozzleCommissioning.objects.filter(nozzle=nozzle3).exists())

        # Now supply valid items for both
        valid_items = [
            {'nozzle_id': nozzle2.id, 'initial_totalizer': Decimal('100.000'), 'notes': 'Valid N2'},
            {'nozzle_id': nozzle3.id, 'initial_totalizer': Decimal('200.000'), 'notes': 'Valid N3'}
        ]
        created = bulk_commission_nozzles(
            organisation=self.org,
            outlet=self.outlet,
            items=valid_items,
            effective_at=timezone.now(),
            common_reason="Bulk install test",
            actor=self.owner
        )
        self.assertEqual(len(created), 2)
        self.assertTrue(NozzleCommissioning.objects.filter(nozzle=nozzle2).exists())
        self.assertTrue(NozzleCommissioning.objects.filter(nozzle=nozzle3).exists())

    def test_commissioning_audit_event_created(self):
        nozzle2 = create_nozzle(self.org, self.outlet, self.dispenser, self.tank, code="NZ2", name="Nozzle 2")
        comm = commission_nozzle(
            self.org, self.outlet, nozzle2, Decimal('350.000'),
            timezone.now(), "Audit event test", "Notes on audit", self.owner
        )
        audit = NozzleCommissioningAuditLog.objects.filter(commissioning=comm).first()
        self.assertIsNotNone(audit)
        self.assertEqual(audit.event_type, 'nozzle_commissioned')
        self.assertEqual(audit.actor, self.owner)
        self.assertEqual(audit.reason, "Audit event test")
        self.assertEqual(audit.metadata['initial_totalizer'], '350.000')
        self.assertEqual(audit.metadata['nozzle_code'], 'NZ2')

        # Audit cannot be updated or deleted
        with self.assertRaises(ValidationError):
            audit.reason = "Modified"
            audit.save()

        with self.assertRaises(ValidationError):
            audit.delete()

    def test_commissioning_api_and_permissions(self):
        nozzle2 = create_nozzle(self.org, self.outlet, self.dispenser, self.tank, code="NZ2", name="Nozzle 2")
        client = APIClient()

        # 1. Owner has implicit permission
        client.force_authenticate(user=self.owner)
        url = f"/api/v1/organisations/{self.org.id}/outlets/{self.outlet.id}/nozzles/{nozzle2.id}/commission/"
        res = client.post(url, {
            'initial_totalizer': '150.250',
            'effective_at': timezone.now().isoformat(),
            'reason': 'Owner API commissioning'
        }, format='json')
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data['commissioning']['initial_totalizer'], '150.250')

        # 2. Check status endpoint
        status_url = f"/api/v1/organisations/{self.org.id}/outlets/{self.outlet.id}/nozzles/commissioning-status/"
        res_status = client.get(status_url)
        self.assertEqual(res_status.status_code, 200)
        items = res_status.data
        n2_item = next(i for i in items if i['nozzle_id'] == str(nozzle2.id))
        self.assertEqual(n2_item['status'], 'commissioned')
        self.assertFalse(n2_item['commissioning_allowed'])

        # 3. User without permission (e.g. Accountant) cannot commission
        accountant_user = User.objects.create_user(email="accountant@example.com", password="password")
        accountant_role = Role.objects.get(organisation=self.org, name='Accountant')
        membership = OrganisationMembership.objects.create(
            organisation=self.org, user=accountant_user, membership_type=OrganisationMembership.TYPE_MEMBER,
            status=OrganisationMembership.STATUS_ACTIVE
        )
        MembershipRole.objects.create(membership=membership, role=accountant_role)

        nozzle3 = create_nozzle(self.org, self.outlet, self.dispenser, self.tank, code="NZ3", name="Nozzle 3")
        client.force_authenticate(user=accountant_user)
        url3 = f"/api/v1/organisations/{self.org.id}/outlets/{self.outlet.id}/nozzles/{nozzle3.id}/commission/"
        res3 = client.post(url3, {
            'initial_totalizer': '200.000',
            'effective_at': timezone.now().isoformat(),
            'reason': 'Accountant commissioning attempt'
        }, format='json')
        self.assertEqual(res3.status_code, 403)

