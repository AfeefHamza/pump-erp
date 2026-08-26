# apps/employees/tests.py
from django.test import TestCase
from django.core.exceptions import ValidationError
from django.db import IntegrityError
from django.contrib.auth import get_user_model

from apps.organizations.models import Organisation, Outlet
from apps.organizations.services import create_organisation_with_owner, create_outlet
from .models import Employee, EmployeeDesignation, EmployeeOutletAssignment
from .services import create_employee, create_designation, update_employee, assign_employee_to_outlets

User = get_user_model()

class EmployeeModelTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(email="owner@example.com", password="password")
        self.org = create_organisation_with_owner(name="Test Org", code="TORG", owner_user=self.owner)
        self.outlet = create_outlet(self.org, name="Outlet 1", code="OUT1")
        self.designation = create_designation(self.org, code="DSM", name="Pump Attendant")

    def test_unique_employee_code_within_organisation(self):
        create_employee(self.org, employee_code="EMP01", display_name="John Doe", designation=self.designation)
        
        # Creating another with same code should fail
        with self.assertRaises((ValidationError, IntegrityError)):
            create_employee(self.org, employee_code="emp01", display_name="Another John", designation=self.designation)

    def test_employee_different_organisations_same_code_allowed(self):
        owner2 = User.objects.create_user(email="owner2@example.com", password="password")
        org2 = create_organisation_with_owner(name="Test Org 2", code="TORG2", owner_user=owner2)
        designation2 = create_designation(org2, code="DSM", name="Pump Attendant")
        
        create_employee(self.org, employee_code="EMP01", display_name="John Doe", designation=self.designation)
        emp2 = create_employee(org2, employee_code="EMP01", display_name="John Second", designation=designation2)
        
        self.assertEqual(emp2.employee_code, "EMP01")

    def test_leaving_date_cannot_be_before_joining_date(self):
        from datetime import date
        with self.assertRaises(ValidationError):
            create_employee(
                self.org,
                employee_code="EMP02",
                display_name="Jane Doe",
                designation=self.designation,
                joined_on=date(2026, 8, 20),
                left_on=date(2026, 8, 10)
            )

    def test_cannot_delete_employee(self):
        emp = create_employee(self.org, employee_code="EMP03", display_name="Bob Smith", designation=self.designation)
        with self.assertRaises(ValidationError):
            emp.delete()

    def test_employee_outlet_tenant_consistency(self):
        owner2 = User.objects.create_user(email="owner2@example.com", password="password")
        org2 = create_organisation_with_owner(name="Test Org 2", code="TORG2", owner_user=owner2)
        outlet2 = create_outlet(org2, name="Outlet 2", code="OUT2")
        
        emp = create_employee(self.org, employee_code="EMP04", display_name="Alice Smith", designation=self.designation)
        
        with self.assertRaises(ValidationError):
            # Assignment must be same tenant
            EmployeeOutletAssignment.objects.create(
                employee=emp,
                outlet=outlet2
            )

    def test_single_primary_outlet_assignment(self):
        outlet2 = create_outlet(self.org, name="Outlet 2", code="OUT2")
        emp = create_employee(self.org, employee_code="EMP05", display_name="Jack Miller", designation=self.designation)
        
        assign_employee_to_outlets(emp, [
            {'outlet_id': self.outlet.id, 'is_primary': True},
            {'outlet_id': outlet2.id, 'is_primary': True}
        ])
        
        # Only one should remain primary
        primary_assignments = EmployeeOutletAssignment.objects.filter(employee=emp, is_primary=True)
        self.assertEqual(primary_assignments.count(), 1)
