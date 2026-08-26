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
    OpeningBalanceBatch, NozzleOpeningBalance, TankOpeningBalance
)
from .services import (
    import_calibration_chart, activate_calibration_chart,
    assign_calibration_chart_to_tank, convert_dip_to_volume,
    create_opening_balance_batch, set_nozzle_opening_balance, set_tank_opening_balance,
    confirm_opening_balance_batch
)
from .selectors import check_outlet_operational_readiness

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
