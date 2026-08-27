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
