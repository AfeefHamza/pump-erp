# apps/organizations/tests.py
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError
from .models import Organisation, Outlet, OrganisationMembership, OutletAccess
from .services import (
    create_organisation_with_owner,
    create_outlet,
    add_organisation_member,
    grant_outlet_access,
    revoke_outlet_access,
)
from .selectors import (
    organisations_for_user,
    outlets_for_user_in_organisation,
    active_owners_of_organisation,
)

User = get_user_model()

class OrganisationServiceTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="owner@example.com", password="password")
        self.member_user = User.objects.create_user(email="member@example.com", password="password")

    def test_create_organisation_with_owner_success(self):
        org = create_organisation_with_owner(
            name="Test Org",
            code="TORG",
            owner_user=self.user,
            legal_name="Test Legal Name"
        )
        self.assertEqual(org.name, "Test Org")
        self.assertEqual(org.code, "TORG")
        self.assertEqual(org.legal_name, "Test Legal Name")
        
        # Check membership
        membership = OrganisationMembership.objects.get(organisation=org, user=self.user)
        self.assertEqual(membership.membership_type, OrganisationMembership.TYPE_OWNER)
        self.assertEqual(membership.status, OrganisationMembership.STATUS_ACTIVE)
        self.assertIsNotNone(membership.joined_at)

    def test_create_organisation_with_owner_atomic_rollback(self):
        initial_org_count = Organisation.objects.count()
        
        # Providing None as owner_user will fail membership creation (foreign key constraint)
        # ensuring the database rolls back the creation of the Organisation too.
        with self.assertRaises(Exception):
            create_organisation_with_owner(
                name="Rollback Org",
                code="RORG",
                owner_user=None
            )
        
        self.assertEqual(Organisation.objects.count(), initial_org_count)

    def test_duplicate_membership_rejection(self):
        org = create_organisation_with_owner(name="Org 1", code="ORG1", owner_user=self.user)
        
        with self.assertRaises(IntegrityError):
            OrganisationMembership.objects.create(
                organisation=org,
                user=self.user,
                membership_type=OrganisationMembership.TYPE_MEMBER,
                status=OrganisationMembership.STATUS_ACTIVE
            )

    def test_unique_outlet_code_per_organisation(self):
        org1 = create_organisation_with_owner(name="Org 1", code="ORG1", owner_user=self.user)
        create_outlet(org1, name="Outlet A", code="OUT-A")
        
        with self.assertRaises(IntegrityError):
            create_outlet(org1, name="Outlet B", code="OUT-A")

    def test_same_outlet_code_allowed_in_different_organisations(self):
        org1 = create_organisation_with_owner(name="Org 1", code="ORG1", owner_user=self.user)
        org2 = create_organisation_with_owner(name="Org 2", code="ORG2", owner_user=self.member_user)
        
        outlet1 = create_outlet(org1, name="Outlet A", code="OUT-A")
        outlet2 = create_outlet(org2, name="Outlet A", code="OUT-A")
        
        self.assertNotEqual(outlet1.id, outlet2.id)
        self.assertEqual(outlet1.code, outlet2.code)

    def test_valid_outlet_access_grant(self):
        org = create_organisation_with_owner(name="Org 1", code="ORG1", owner_user=self.user)
        outlet = create_outlet(org, name="Outlet A", code="OUT-A")
        membership = add_organisation_member(
            org, self.member_user, OrganisationMembership.TYPE_MEMBER, OrganisationMembership.STATUS_ACTIVE
        )
        
        access = grant_outlet_access(membership, outlet)
        self.assertEqual(access.membership, membership)
        self.assertEqual(access.outlet, outlet)

    def test_cross_organisation_outlet_access_rejection(self):
        org1 = create_organisation_with_owner(name="Org 1", code="ORG1", owner_user=self.user)
        org2 = create_organisation_with_owner(name="Org 2", code="ORG2", owner_user=self.member_user)
        
        outlet_org1 = create_outlet(org1, name="Outlet Org 1", code="OUT-1")
        membership_org2 = OrganisationMembership.objects.get(organisation=org2, user=self.member_user)
        
        # The service-layer must reject cross-org outlet access
        with self.assertRaises(ValidationError):
            grant_outlet_access(membership_org2, outlet_org1)
        
        # The model validation (clean method) must also reject cross-org outlet access
        access = OutletAccess(membership=membership_org2, outlet=outlet_org1)
        with self.assertRaises(ValidationError):
            access.full_clean()

    def test_revoke_outlet_access(self):
        org = create_organisation_with_owner(name="Org 1", code="ORG1", owner_user=self.user)
        outlet = create_outlet(org, name="Outlet A", code="OUT-A")
        membership = add_organisation_member(
            org, self.member_user, OrganisationMembership.TYPE_MEMBER, OrganisationMembership.STATUS_ACTIVE
        )
        
        grant_outlet_access(membership, outlet)
        self.assertTrue(OutletAccess.objects.filter(membership=membership, outlet=outlet).exists())
        
        revoke_outlet_access(membership, outlet)
        self.assertFalse(OutletAccess.objects.filter(membership=membership, outlet=outlet).exists())


class OrganisationSelectorTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(email="owner@example.com", password="password")
        self.member = User.objects.create_user(email="member@example.com", password="password")
        self.unrelated = User.objects.create_user(email="unrelated@example.com", password="password")
        
        self.org1 = create_organisation_with_owner(name="Org 1", code="ORG1", owner_user=self.owner)
        self.org2 = create_organisation_with_owner(name="Org 2", code="ORG2", owner_user=self.owner)
        
        self.outlet1 = create_outlet(self.org1, name="Outlet 1", code="OUT1")
        self.outlet2 = create_outlet(self.org1, name="Outlet 2", code="OUT2")
        
        self.membership = add_organisation_member(
            self.org1, self.member, OrganisationMembership.TYPE_MEMBER, OrganisationMembership.STATUS_ACTIVE
        )

    def test_organisations_for_user_selector(self):
        owner_orgs = organisations_for_user(self.owner)
        self.assertEqual(len(owner_orgs), 2)
        self.assertIn(self.org1, owner_orgs)
        self.assertIn(self.org2, owner_orgs)
        
        member_orgs = organisations_for_user(self.member)
        self.assertEqual(len(member_orgs), 1)
        self.assertIn(self.org1, member_orgs)
        
        unrelated_orgs = organisations_for_user(self.unrelated)
        self.assertEqual(len(unrelated_orgs), 0)

    def test_outlets_for_user_in_organisation_selector_owner_admin(self):
        outlets = outlets_for_user_in_organisation(self.owner, self.org1)
        self.assertEqual(len(outlets), 2)
        self.assertIn(self.outlet1, outlets)
        self.assertIn(self.outlet2, outlets)

    def test_outlets_for_user_in_organisation_selector_member(self):
        outlets = outlets_for_user_in_organisation(self.member, self.org1)
        self.assertEqual(len(outlets), 0)
        
        grant_outlet_access(self.membership, self.outlet1)
        
        outlets = outlets_for_user_in_organisation(self.member, self.org1)
        self.assertEqual(len(outlets), 1)
        self.assertIn(self.outlet1, outlets)
        self.assertNotIn(self.outlet2, outlets)

    def test_active_owners_of_organisation_selector(self):
        owners = active_owners_of_organisation(self.org1)
        self.assertEqual(len(owners), 1)
        self.assertIn(self.owner, owners)
