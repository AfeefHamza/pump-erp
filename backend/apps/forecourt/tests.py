# apps/forecourt/tests.py
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError
from django.utils import timezone
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from datetime import timedelta, datetime
from decimal import Decimal

from apps.organizations.models import Organisation, Outlet, OrganisationMembership, Role, PermissionDefinition
from apps.organizations.services import create_organisation_with_owner, create_outlet, add_organisation_member, grant_outlet_access
from .models import FuelProduct, ProductPrice, Tank, Dispenser, Nozzle
from .services import (
    create_fuel_product, update_fuel_product, set_product_price,
    create_tank, update_tank, create_dispenser, create_nozzle, connect_nozzle_to_tank
)
from .selectors import current_product_price, complete_forecourt_structure

User = get_user_model()

class ForecourtModelTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(email="owner@example.com", password="password")
        self.org = create_organisation_with_owner(name="Test Org", code="TORG", owner_user=self.owner)
        self.outlet = create_outlet(self.org, name="Outlet 1", code="OUT1")
        self.product = create_fuel_product(self.org, code="MS", name="Petrol", category="petrol", unit="litre")

    def test_unique_product_code_within_organisation(self):
        # Different case code should trigger UniqueConstraint error
        with self.assertRaises((ValidationError, IntegrityError)):
            FuelProduct.objects.create(organisation=self.org, code="ms", name="Petrol 2")

    def test_unique_product_name_within_organisation(self):
        # Different case name should trigger UniqueConstraint error
        with self.assertRaises((ValidationError, IntegrityError)):
            FuelProduct.objects.create(organisation=self.org, code="MS2", name="petrol")

    def test_different_organisations_same_product_code_allowed(self):
        owner2 = User.objects.create_user(email="owner2@example.com", password="password")
        org2 = create_organisation_with_owner(name="Test Org 2", code="TORG2", owner_user=owner2)
        prod2 = FuelProduct.objects.create(organisation=org2, code="MS", name="Petrol")
        self.assertEqual(prod2.code, "MS")

    def test_tank_capacity_validation(self):
        with self.assertRaises(ValidationError):
            # Capacity must be greater than zero
            create_tank(self.org, self.outlet, self.product, code="T1", name="Tank 1", capacity=-100)

        with self.assertRaises(ValidationError):
            # Safe fill cannot exceed capacity
            create_tank(self.org, self.outlet, self.product, code="T1", name="Tank 1", capacity=1000, safe_fill_capacity=1100)

        with self.assertRaises(ValidationError):
            # Dead stock level cannot exceed capacity
            create_tank(self.org, self.outlet, self.product, code="T1", name="Tank 1", capacity=1000, dead_stock_level=1200)

        with self.assertRaises(ValidationError):
            # Low stock threshold cannot exceed capacity
            create_tank(self.org, self.outlet, self.product, code="T1", name="Tank 1", capacity=1000, low_stock_threshold=1500)

    def test_cross_tenant_tank_rejection(self):
        owner2 = User.objects.create_user(email="owner2@example.com", password="password")
        org2 = create_organisation_with_owner(name="Test Org 2", code="TORG2", owner_user=owner2)
        outlet2 = create_outlet(org2, name="Outlet 2", code="OUT2")
        
        # Product and outlet must belong to same organisation
        with self.assertRaises(ValidationError):
            create_tank(org2, outlet2, self.product, code="T2", name="Tank 2", capacity=5000)

    def test_cross_outlet_nozzle_rejection(self):
        outlet2 = create_outlet(self.org, name="Outlet 2", code="OUT2")
        tank = create_tank(self.org, self.outlet, self.product, code="TK1", name="Tank 1", capacity=5000)
        dispenser2 = create_dispenser(self.org, outlet2, code="D2", name="Dispenser 2")

        # Dispenser must belong to same outlet as nozzle
        with self.assertRaises(ValidationError):
            create_nozzle(self.org, self.outlet, dispenser2, tank, code="N1", name="Nozzle 1")

        dispenser = create_dispenser(self.org, self.outlet, code="D1", name="Dispenser 1")
        tank2 = create_tank(self.org, outlet2, self.product, code="TK2", name="Tank 2", capacity=5000)
        
        # Tank must belong to same outlet as nozzle
        with self.assertRaises(ValidationError):
            create_nozzle(self.org, self.outlet, dispenser, tank2, code="N1", name="Nozzle 1")

    def test_connect_nozzle_to_cross_outlet_tank_rejection(self):
        tank = create_tank(self.org, self.outlet, self.product, code="TK1", name="Tank 1", capacity=5000)
        dispenser = create_dispenser(self.org, self.outlet, code="D1", name="Dispenser 1")
        nozzle = create_nozzle(self.org, self.outlet, dispenser, tank, code="N1", name="Nozzle 1")

        outlet2 = create_outlet(self.org, name="Outlet 2", code="OUT2")
        tank2 = create_tank(self.org, outlet2, self.product, code="TK2", name="Tank 2", capacity=5000)

        with self.assertRaises(ValidationError):
            connect_nozzle_to_tank(nozzle, tank2)

    def test_non_overlapping_price_periods(self):
        t0 = timezone.now() - timedelta(hours=5)
        t1 = t0 + timedelta(hours=2)
        t2 = t0 + timedelta(hours=4)

        # Set initial price
        p1 = set_product_price(self.org, self.outlet, self.product, Decimal('95.50'), effective_from=t0)
        self.assertNil = lambda x: self.assertIsNone(x)
        self.assertNil(p1.effective_to)

        # Set second price (chronologically later)
        p2 = set_product_price(self.org, self.outlet, self.product, Decimal('96.00'), effective_from=t2)
        p1.refresh_from_db()
        self.assertEqual(p1.effective_to, t2)
        self.assertNil(p2.effective_to)

        # Set middle price (between t0 and t2)
        p3 = set_product_price(self.org, self.outlet, self.product, Decimal('95.80'), effective_from=t1)
        p1.refresh_from_db()
        p2.refresh_from_db()
        self.assertEqual(p1.effective_to, t1)
        self.assertEqual(p3.effective_to, t2)
        self.assertNil(p2.effective_to)

        # Test selector at specific datetimes
        price_at_t0_plus_1 = current_product_price(self.outlet, self.product, t0 + timedelta(hours=1))
        self.assertEqual(price_at_t0_plus_1.selling_price, p1.selling_price)

        price_at_t1_plus_1 = current_product_price(self.outlet, self.product, t1 + timedelta(hours=1))
        self.assertEqual(price_at_t1_plus_1.selling_price, p3.selling_price)

        price_at_t2_plus_1 = current_product_price(self.outlet, self.product, t2 + timedelta(hours=1))
        self.assertEqual(price_at_t2_plus_1.selling_price, p2.selling_price)


class ForecourtAPITests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(email="owner@example.com", password="password")
        self.org = create_organisation_with_owner(name="Test Org", code="TORG", owner_user=self.owner)
        self.outlet = create_outlet(self.org, name="Outlet 1", code="OUT1")
        self.product = create_fuel_product(self.org, code="MS", name="Petrol", category="petrol", unit="litre")

        # Second Org (unrelated tenant)
        self.unrelated_user = User.objects.create_user(email="unrelated@example.com", password="password")
        self.org2 = create_organisation_with_owner(name="Unrelated Org", code="UORG", owner_user=self.unrelated_user)
        self.outlet2 = create_outlet(self.org2, name="Outlet 2", code="OUT2")
        self.product2 = create_fuel_product(self.org2, code="HSD", name="Diesel", category="diesel", unit="litre")

        # Active Session Login
        self.client.login(email="owner@example.com", password="password")

    def test_cross_tenant_protection_list_products(self):
        url = reverse('fuel_product_list_create', kwargs={'org_id': self.org.id})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Should only return org1's product
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['code'], 'MS')

        # Accessing org2 with org1 credentials should return 403 Forbidden due to HasGranularPermission
        url_unrelated = reverse('fuel_product_list_create', kwargs={'org_id': self.org2.id})
        response_unrelated = self.client.get(url_unrelated)
        self.assertEqual(response_unrelated.status_code, status.HTTP_403_FORBIDDEN)

    def test_custom_roles_do_not_automatically_receive_permissions(self):
        # Create custom role with no permissions
        custom_role = Role.objects.create(
            organisation=self.org,
            name="Custom Cashier",
            is_system=False,
            is_active=True
        )

        member_user = User.objects.create_user(email="member@example.com", password="password")
        membership = add_organisation_member(
            self.org, member_user, OrganisationMembership.TYPE_MEMBER, OrganisationMembership.STATUS_ACTIVE
        )
        # Link member to custom role
        from apps.organizations.models import MembershipRole
        MembershipRole.objects.create(membership=membership, role=custom_role)
        
        # Log in as the member
        self.client.login(email="member@example.com", password="password")
        
        # Attempt to access fuel product list
        url = reverse('fuel_product_list_create', kwargs={'org_id': self.org.id})
        response = self.client.get(url)
        # Access should be Forbidden because they have no permissions assigned to that custom role
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_forecourt_configuration_loads_for_authorised_outlet_only(self):
        # Log in as owner (who is authorised for org1 outlets)
        self.client.login(email="owner@example.com", password="password")
        
        url = reverse('forecourt_structure', kwargs={'org_id': self.org.id, 'outlet_id': self.outlet.id})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['outlet_id'], str(self.outlet.id))

        # Accessing an outlet that belongs to another organisation should result in 403 Forbidden
        url_cross = reverse('forecourt_structure', kwargs={'org_id': self.org.id, 'outlet_id': self.outlet2.id})
        response_cross = self.client.get(url_cross)
        self.assertEqual(response_cross.status_code, status.HTTP_403_FORBIDDEN)
