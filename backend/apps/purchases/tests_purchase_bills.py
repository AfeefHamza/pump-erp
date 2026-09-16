# apps/purchases/tests_purchase_bills.py
from datetime import date, timedelta
from decimal import Decimal
from django.test import TestCase
from django.urls import reverse
from django.core.exceptions import ValidationError, PermissionDenied
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

from apps.organizations.models import (
    Organisation, Outlet, Role, PermissionDefinition, FinancialYear,
    RolePermission, OrganisationMembership, MembershipRole
)
from apps.organizations.services import (
    create_organisation_with_owner, create_outlet,
    add_organisation_member, grant_outlet_access
)
from apps.forecourt.models import FuelProduct, Tank
from apps.forecourt.services import create_fuel_product, create_tank
from apps.purchases.models import (
    Supplier, TankerReceipt, TankerReceiptProductLine,
    TankerReceiptTankAllocation, PurchaseBill, PurchaseBillLine,
    PurchaseBillReceiptLink, PurchaseBillAdjustmentComponent,
    PurchaseBillAttachment, PurchaseBillAuditLog
)
from apps.purchases.services import (
    create_supplier, create_tanker_receipt, confirm_tanker_receipt,
    void_tanker_receipt, create_purchase_bill, update_purchase_bill,
    void_purchase_bill, upload_bill_attachment, normalize_invoice_number,
    calculate_bill_totals
)
from apps.purchases.selectors import (
    list_purchase_bills, get_purchase_bill_detail,
    get_available_tanker_receipts_for_billing,
    get_supplier_outstanding_summary, get_supplier_statement
)

User = get_user_model()


class PurchaseBillTestCase(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(email="owner_pb@example.com", password="password", display_name="Owner User")
        self.org = create_organisation_with_owner(name="Petro Fuel Ltd", code="PFL", owner_user=self.owner)
        self.outlet = create_outlet(self.org, name="Central Highway Station", code="CHS1")
        FinancialYear.objects.create(
            organisation=self.org, name='FY 2026', start_date=date(2026, 1, 1),
            end_date=date(2026, 12, 31), status=FinancialYear.STATUS_OPEN, is_default=True,
        )

        # Other Org and Outlet for cross-tenant testing
        self.other_owner = User.objects.create_user(email="other_owner@example.com", password="password")
        self.other_org = create_organisation_with_owner(name="Other Corp", code="OTH", owner_user=self.other_owner)
        self.other_outlet = create_outlet(self.other_org, name="Other Outlet", code="OOT1")
        FinancialYear.objects.create(
            organisation=self.other_org, name='FY 2026', start_date=date(2026, 1, 1),
            end_date=date(2026, 12, 31), status=FinancialYear.STATUS_OPEN, is_default=True,
        )

        # Outlet 2 within same Org
        self.outlet2 = create_outlet(self.org, name="North Station", code="CHS2")

        # Products
        self.petrol = create_fuel_product(self.org, code="MS", name="Motor Spirit Petrol", category="petrol", unit="litre")
        self.diesel = create_fuel_product(self.org, code="HSD", name="High Speed Diesel", category="diesel", unit="litre")

        # Tanks
        self.tank_ms = create_tank(self.org, self.outlet, self.petrol, code="TK1", name="Petrol Tank", capacity=20000)
        self.tank_hsd = create_tank(self.org, self.outlet, self.diesel, code="TK2", name="Diesel Tank", capacity=20000)

        # Suppliers
        self.supplier_a = create_supplier(self.org, code="IOCL", name="Indian Oil Corp")
        self.supplier_b = create_supplier(self.org, code="BPCL", name="Bharat Petroleum")
        self.other_supplier = create_supplier(self.other_org, code="IOCL", name="Indian Oil Corp Other Org")

        # Accountant user with purchase_bill view, create, update, and supplier_outstanding.view (no void, no override)
        self.accountant_user = User.objects.create_user(email="accountant@example.com", password="password", display_name="Staff Accountant")
        self.accountant_membership = add_organisation_member(
            self.org, self.accountant_user,
            membership_type=OrganisationMembership.TYPE_MEMBER,
            status=OrganisationMembership.STATUS_ACTIVE
        )
        grant_outlet_access(self.accountant_membership, self.outlet)

        self.accountant_role = Role.objects.create(organisation=self.org, name="AccountantRole")
        for p_code in ['purchase_bill.view', 'purchase_bill.create', 'purchase_bill.update', 'supplier_outstanding.view']:
            perm = PermissionDefinition.objects.get(code=p_code)
            RolePermission.objects.create(role=self.accountant_role, permission=perm)
        MembershipRole.objects.create(membership=self.accountant_membership, role=self.accountant_role)

        # Operator user with NO purchase bill permissions
        self.operator_user = User.objects.create_user(email="operator@example.com", password="password", display_name="Operator")
        self.operator_membership = add_organisation_member(
            self.org, self.operator_user,
            membership_type=OrganisationMembership.TYPE_MEMBER,
            status=OrganisationMembership.STATUS_ACTIVE
        )
        grant_outlet_access(self.operator_membership, self.outlet)

        # Create and confirm 2 Tanker Receipts for Supplier A
        now = timezone.now()
        self.receipt1 = create_tanker_receipt(
            organisation=self.org,
            outlet=self.outlet,
            receipt_number="TR-2026-001",
            supplier=self.supplier_a,
            invoice_number="INV-IOCL-101",
            invoice_date=date(2026, 8, 1),
            vehicle_registration="KA-01-AB-1234",
            unloading_end_time=now - timedelta(days=10),
            product_lines_data=[{
                'product': self.petrol,
                'invoice_quantity': '10000.0000',
                'accepted_book_quantity': '10000.0000',
                'unit_rate': '90.0000',
                'allocations': [{'tank': self.tank_ms, 'allocated_book_quantity': '10000.0000'}]
            }],
            user=self.owner
        )
        confirm_tanker_receipt(self.receipt1.id, self.owner)
        self.receipt1_line = self.receipt1.product_lines.first()

        self.receipt2 = create_tanker_receipt(
            organisation=self.org,
            outlet=self.outlet,
            receipt_number="TR-2026-002",
            supplier=self.supplier_a,
            invoice_number="INV-IOCL-102",
            invoice_date=date(2026, 8, 5),
            vehicle_registration="KA-01-AB-5678",
            unloading_end_time=now - timedelta(days=5),
            product_lines_data=[{
                'product': self.diesel,
                'invoice_quantity': '8000.0000',
                'accepted_book_quantity': '8000.0000',
                'unit_rate': '80.0000',
                'allocations': [{'tank': self.tank_hsd, 'allocated_book_quantity': '8000.0000'}]
            }],
            user=self.owner
        )
        confirm_tanker_receipt(self.receipt2.id, self.owner)
        self.receipt2_line = self.receipt2.product_lines.first()

        self.client = APIClient()

    def test_direct_purchase_bill_save_and_single_receipt_link(self):
        """Validates creating a purchase bill linked to a confirmed tanker receipt."""
        bill = create_purchase_bill(
            organisation=self.org,
            outlet=self.outlet,
            supplier=self.supplier_a,
            supplier_invoice_number="INV-IOCL-101",
            invoice_date=date(2026, 8, 1),
            due_date=date(2026, 8, 31),
            lines_data=[{
                'tanker_receipt_line_id': str(self.receipt1_line.id),
                'product_id': str(self.petrol.id),
                'quantity': '10000.0000',
                'unit_rate': '92.5000',
                'discount_amount': '500.00'
            }],
            adjustments_data=[
                {'label': 'Freight', 'component_type': 'charge', 'calculation_type': 'fixed_amount', 'calculated_amount': '1500.00'},
                {'label': 'VAT 5%', 'component_type': 'tax', 'calculation_type': 'percentage', 'percentage_rate': '5.0000'}
            ],
            user=self.owner
        )

        self.assertIsNotNone(bill.id)
        self.assertTrue(bill.bill_number.startswith("PB-2026-"))
        self.assertEqual(bill.supplier_name_snapshot, "Indian Oil Corp")
        self.assertEqual(bill.supplier_code_snapshot, "IOCL")
        self.assertEqual(bill.status, PurchaseBill.STATUS_ACTIVE)

        # Calculation check:
        # Gross = 10000 * 92.5 = 925,000.00
        # Line discount = 500.00
        # Taxable base = 924,500.00
        # VAT 5% of base = 46,225.00
        # Freight = 1,500.00
        # Grand total = 925000 - 500 + 46225 + 1500 = 972,225.00
        self.assertEqual(bill.subtotal, Decimal('925000.00'))
        self.assertEqual(bill.discount_total, Decimal('500.00'))
        self.assertEqual(bill.tax_total, Decimal('46225.00'))
        self.assertEqual(bill.additional_charges_total, Decimal('1500.00'))
        self.assertEqual(bill.grand_total, Decimal('972225.00'))
        self.assertEqual(bill.amount_paid, Decimal('0.00'))
        self.assertEqual(bill.outstanding_amount, Decimal('972225.00'))

        # Check receipt linkage
        link = bill.receipt_links.first()
        self.assertIsNotNone(link)
        self.assertEqual(link.tanker_receipt, self.receipt1)
        self.assertEqual(link.receipt_product_line, self.receipt1_line)
        self.assertIsNone(link.released_at)

        # Line references link
        line = bill.lines.first()
        self.assertEqual(line.receipt_link, link)

        # Audit log created
        self.assertEqual(bill.audit_logs.count(), 1)
        audit = bill.audit_logs.first()
        self.assertEqual(audit.event_type, 'created')
        self.assertEqual(audit.actor, self.owner)

    def test_multiple_linked_tanker_receipts_in_one_bill(self):
        """Validates linking multiple confirmed tanker receipts from the same supplier and outlet."""
        bill = create_purchase_bill(
            organisation=self.org,
            outlet=self.outlet,
            supplier=self.supplier_a,
            supplier_invoice_number="COMBINED-INV-001",
            invoice_date=date(2026, 8, 10),
            due_date=date(2026, 9, 10),
            lines_data=[
                {
                    'tanker_receipt_line_id': str(self.receipt1_line.id),
                    'product_id': str(self.petrol.id),
                    'quantity': '10000.0000',
                    'unit_rate': '90.0000'
                },
                {
                    'tanker_receipt_line_id': str(self.receipt2_line.id),
                    'product_id': str(self.diesel.id),
                    'quantity': '8000.0000',
                    'unit_rate': '80.0000'
                }
            ],
            adjustments_data=[],
            user=self.owner
        )

        self.assertEqual(bill.receipt_links.count(), 2)
        self.assertEqual(bill.lines.count(), 2)
        # 10000*90 + 8000*80 = 900,000 + 640,000 = 1,540,000.00
        self.assertEqual(bill.grand_total, Decimal('1540000.00'))
        self.assertEqual(bill.outstanding_amount, Decimal('1540000.00'))

    def test_duplicate_supplier_invoice_prevention(self):
        """Active duplicate supplier invoice numbers for the same supplier are rejected."""
        create_purchase_bill(
            organisation=self.org,
            outlet=self.outlet,
            supplier=self.supplier_a,
            supplier_invoice_number="INV-DUPLICATE-TEST",
            invoice_date=date(2026, 8, 1),
            due_date=date(2026, 8, 31),
            lines_data=[{'product_id': str(self.petrol.id), 'quantity': '100.0000', 'unit_rate': '90.0000'}],
            adjustments_data=[],
            user=self.owner
        )

        # Attempt duplicate with slight formatting variations (extra spaces, lowercase)
        with self.assertRaises(ValidationError) as ctx:
            create_purchase_bill(
                organisation=self.org,
                outlet=self.outlet,
                supplier=self.supplier_a,
                supplier_invoice_number="  inv-duplicate-test   ",
                invoice_date=date(2026, 8, 2),
                due_date=date(2026, 9, 1),
                lines_data=[{'product_id': str(self.petrol.id), 'quantity': '200.0000', 'unit_rate': '90.0000'}],
                adjustments_data=[],
                user=self.owner
            )
        self.assertIn('supplier_invoice_number', ctx.exception.message_dict)

    def test_same_invoice_number_allowed_for_different_suppliers(self):
        """The same invoice number is valid across two different suppliers."""
        bill_a = create_purchase_bill(
            organisation=self.org,
            outlet=self.outlet,
            supplier=self.supplier_a,
            supplier_invoice_number="SHARED-INV-999",
            invoice_date=date(2026, 8, 1),
            due_date=date(2026, 8, 31),
            lines_data=[{'product_id': str(self.petrol.id), 'quantity': '100.0000', 'unit_rate': '90.0000'}],
            adjustments_data=[],
            user=self.owner
        )

        bill_b = create_purchase_bill(
            organisation=self.org,
            outlet=self.outlet,
            supplier=self.supplier_b,
            supplier_invoice_number="SHARED-INV-999",
            invoice_date=date(2026, 8, 1),
            due_date=date(2026, 8, 31),
            lines_data=[{'product_id': str(self.petrol.id), 'quantity': '200.0000', 'unit_rate': '90.0000'}],
            adjustments_data=[],
            user=self.owner
        )

        self.assertIsNotNone(bill_a.id)
        self.assertIsNotNone(bill_b.id)

    def test_duplicate_override_safety(self):
        """Authorised override requires conflicting bill ID, permission, reason, and audit."""
        first_bill = create_purchase_bill(
            organisation=self.org,
            outlet=self.outlet,
            supplier=self.supplier_a,
            supplier_invoice_number="REUSED-INV-001",
            invoice_date=date(2026, 8, 1),
            due_date=date(2026, 8, 31),
            lines_data=[{'product_id': str(self.petrol.id), 'quantity': '100.0000', 'unit_rate': '90.0000'}],
            adjustments_data=[],
            user=self.owner
        )

        # Missing conflicting_bill_id should fail
        with self.assertRaises(ValidationError):
            create_purchase_bill(
                organisation=self.org,
                outlet=self.outlet,
                supplier=self.supplier_a,
                supplier_invoice_number="REUSED-INV-001",
                invoice_date=date(2026, 8, 2),
                due_date=date(2026, 9, 1),
                lines_data=[{'product_id': str(self.petrol.id), 'quantity': '100.0000', 'unit_rate': '90.0000'}],
                adjustments_data=[],
                user=self.owner,
                is_duplicate_override=True,
                conflicting_bill_id=None,
                duplicate_override_reason="Legitimate reissue"
            )

        # Short / blank reason should fail
        with self.assertRaises(ValidationError):
            create_purchase_bill(
                organisation=self.org,
                outlet=self.outlet,
                supplier=self.supplier_a,
                supplier_invoice_number="REUSED-INV-001",
                invoice_date=date(2026, 8, 2),
                due_date=date(2026, 9, 1),
                lines_data=[{'product_id': str(self.petrol.id), 'quantity': '100.0000', 'unit_rate': '90.0000'}],
                adjustments_data=[],
                user=self.owner,
                is_duplicate_override=True,
                conflicting_bill_id=first_bill.id,
                duplicate_override_reason="bad"
            )

        # Authorized override succeeds and logs audit
        second_bill = create_purchase_bill(
            organisation=self.org,
            outlet=self.outlet,
            supplier=self.supplier_a,
            supplier_invoice_number="REUSED-INV-001",
            invoice_date=date(2026, 8, 2),
            due_date=date(2026, 9, 1),
            lines_data=[{'product_id': str(self.petrol.id), 'quantity': '100.0000', 'unit_rate': '90.0000'}],
            adjustments_data=[],
            user=self.owner,
            is_duplicate_override=True,
            conflicting_bill_id=first_bill.id,
            duplicate_override_reason="Legitimate invoice reissue authorized by management"
        )
        self.assertIsNotNone(second_bill.id)
        self.assertTrue(second_bill.is_duplicate_override)
        self.assertEqual(second_bill.conflicting_bill, first_bill)
        self.assertTrue(second_bill.audit_logs.filter(event_type='duplicate_invoice_overridden').exists())

    def test_cross_tenant_and_cross_outlet_rejection(self):
        """Cannot create a purchase bill across different organisations or outlets."""
        with self.assertRaises(ValidationError):
            create_purchase_bill(
                organisation=self.org,
                outlet=self.other_outlet,
                supplier=self.supplier_a,
                supplier_invoice_number="INV-CROSS-1",
                invoice_date=date(2026, 8, 1),
                due_date=date(2026, 8, 31),
                lines_data=[{'product_id': str(self.petrol.id), 'quantity': '100.0000', 'unit_rate': '90.0000'}],
                adjustments_data=[],
                user=self.owner
            )

        with self.assertRaises(ValidationError):
            create_purchase_bill(
                organisation=self.org,
                outlet=self.outlet,
                supplier=self.other_supplier,
                supplier_invoice_number="INV-CROSS-2",
                invoice_date=date(2026, 8, 1),
                due_date=date(2026, 8, 31),
                lines_data=[{'product_id': str(self.petrol.id), 'quantity': '100.0000', 'unit_rate': '90.0000'}],
                adjustments_data=[],
                user=self.owner
            )

    def test_supplier_mismatch_rejection_for_tanker_receipt(self):
        """Cannot link a tanker receipt belonging to Supplier A to a bill for Supplier B."""
        with self.assertRaises(ValidationError):
            create_purchase_bill(
                organisation=self.org,
                outlet=self.outlet,
                supplier=self.supplier_b,
                supplier_invoice_number="INV-MISMATCH-1",
                invoice_date=date(2026, 8, 1),
                due_date=date(2026, 8, 31),
                lines_data=[{
                    'tanker_receipt_line_id': str(self.receipt1_line.id),
                    'product_id': str(self.petrol.id),
                    'quantity': '10000.0000',
                    'unit_rate': '90.0000'
                }],
                adjustments_data=[],
                user=self.owner
            )

    def test_unconfirmed_and_voided_receipt_rejection(self):
        """Unconfirmed (recorded) or voided tanker receipts cannot be billed."""
        # Unconfirmed receipt
        unconfirmed = create_tanker_receipt(
            organisation=self.org,
            outlet=self.outlet,
            receipt_number="TR-DRAFT-99",
            supplier=self.supplier_a,
            invoice_number="INV-DRAFT-99",
            invoice_date=date(2026, 8, 1),
            vehicle_registration="KA-01-AB-9999",
            unloading_end_time=timezone.now(),
            product_lines_data=[{
                'product': self.petrol,
                'invoice_quantity': '5000.0000',
                'accepted_book_quantity': '5000.0000',
                'allocations': [{'tank': self.tank_ms, 'allocated_book_quantity': '5000.0000'}]
            }],
            user=self.owner
        )
        line = unconfirmed.product_lines.first()

        with self.assertRaises(ValidationError):
            create_purchase_bill(
                organisation=self.org,
                outlet=self.outlet,
                supplier=self.supplier_a,
                supplier_invoice_number="INV-DRAFT-TEST",
                invoice_date=date(2026, 8, 1),
                due_date=date(2026, 8, 31),
                lines_data=[{
                    'tanker_receipt_line_id': str(line.id),
                    'product_id': str(self.petrol.id),
                    'quantity': '5000.0000',
                    'unit_rate': '90.0000'
                }],
                adjustments_data=[],
                user=self.owner
            )

    def test_receipt_line_cannot_be_billed_twice(self):
        """A single tanker receipt product line cannot be billed by two active bills."""
        create_purchase_bill(
            organisation=self.org,
            outlet=self.outlet,
            supplier=self.supplier_a,
            supplier_invoice_number="INV-FIRST-BILL",
            invoice_date=date(2026, 8, 1),
            due_date=date(2026, 8, 31),
            lines_data=[{
                'tanker_receipt_line_id': str(self.receipt1_line.id),
                'product_id': str(self.petrol.id),
                'quantity': '10000.0000',
                'unit_rate': '90.0000'
            }],
            adjustments_data=[],
            user=self.owner
        )

        with self.assertRaises(ValidationError):
            create_purchase_bill(
                organisation=self.org,
                outlet=self.outlet,
                supplier=self.supplier_a,
                supplier_invoice_number="INV-SECOND-BILL",
                invoice_date=date(2026, 8, 2),
                due_date=date(2026, 9, 1),
                lines_data=[{
                    'tanker_receipt_line_id': str(self.receipt1_line.id),
                    'product_id': str(self.petrol.id),
                    'quantity': '10000.0000',
                    'unit_rate': '90.0000'
                }],
                adjustments_data=[],
                user=self.owner
            )

    def test_voiding_bill_releases_receipt_line_for_rebilling(self):
        """Voiding a bill releases its linked tanker receipt lines so they can be re-billed."""
        bill = create_purchase_bill(
            organisation=self.org,
            outlet=self.outlet,
            supplier=self.supplier_a,
            supplier_invoice_number="INV-BILL-TO-VOID",
            invoice_date=date(2026, 8, 1),
            due_date=date(2026, 8, 31),
            lines_data=[{
                'tanker_receipt_line_id': str(self.receipt1_line.id),
                'product_id': str(self.petrol.id),
                'quantity': '10000.0000',
                'unit_rate': '90.0000'
            }],
            adjustments_data=[],
            user=self.owner
        )

        link = bill.receipt_links.first()
        self.assertIsNone(link.released_at)

        # Void the bill
        void_purchase_bill(bill.id, self.owner, void_reason="Wrong rates entered on invoice")
        bill.refresh_from_db()
        self.assertEqual(bill.status, PurchaseBill.STATUS_VOIDED)
        self.assertEqual(bill.outstanding_amount, Decimal('0.00'))

        link.refresh_from_db()
        self.assertIsNotNone(link.released_at)

        # Now re-billing the same line succeeds!
        new_bill = create_purchase_bill(
            organisation=self.org,
            outlet=self.outlet,
            supplier=self.supplier_a,
            supplier_invoice_number="INV-CORRECTED-BILL",
            invoice_date=date(2026, 8, 1),
            due_date=date(2026, 8, 31),
            lines_data=[{
                'tanker_receipt_line_id': str(self.receipt1_line.id),
                'product_id': str(self.petrol.id),
                'quantity': '10000.0000',
                'unit_rate': '91.0000'
            }],
            adjustments_data=[],
            user=self.owner
        )
        self.assertIsNotNone(new_bill.id)
        self.assertEqual(new_bill.status, PurchaseBill.STATUS_ACTIVE)

    def test_quantity_override_permission_and_mandatory_reason(self):
        """Overriding receipt quantity requires permission and mandatory reason."""
        # Accountant lacks purchase_bill.override_receipt_quantity
        with self.assertRaises(PermissionDenied):
            create_purchase_bill(
                organisation=self.org,
                outlet=self.outlet,
                supplier=self.supplier_a,
                supplier_invoice_number="INV-QTY-OVR-1",
                invoice_date=date(2026, 8, 1),
                due_date=date(2026, 8, 31),
                lines_data=[{
                    'tanker_receipt_line_id': str(self.receipt1_line.id),
                    'product_id': str(self.petrol.id),
                    'quantity': '9900.0000',  # Receipt has 10000
                    'unit_rate': '90.0000',
                    'quantity_override_reason': 'Supplier short invoiced'
                }],
                adjustments_data=[],
                user=self.accountant_user
            )

        # Owner has full permissions, but missing reason fails
        with self.assertRaises(ValidationError):
            create_purchase_bill(
                organisation=self.org,
                outlet=self.outlet,
                supplier=self.supplier_a,
                supplier_invoice_number="INV-QTY-OVR-2",
                invoice_date=date(2026, 8, 1),
                due_date=date(2026, 8, 31),
                lines_data=[{
                    'tanker_receipt_line_id': str(self.receipt1_line.id),
                    'product_id': str(self.petrol.id),
                    'quantity': '9900.0000',
                    'unit_rate': '90.0000',
                    'quantity_override_reason': ''
                }],
                adjustments_data=[],
                user=self.owner
            )

        # Owner with reason succeeds
        bill = create_purchase_bill(
            organisation=self.org,
            outlet=self.outlet,
            supplier=self.supplier_a,
            supplier_invoice_number="INV-QTY-OVR-3",
            invoice_date=date(2026, 8, 1),
            due_date=date(2026, 8, 31),
            lines_data=[{
                'tanker_receipt_line_id': str(self.receipt1_line.id),
                'product_id': str(self.petrol.id),
                'quantity': '9900.0000',
                'unit_rate': '90.0000',
                'quantity_override_reason': 'Credit note issued by supplier for 100L difference'
            }],
            adjustments_data=[],
            user=self.owner
        )
        self.assertIsNotNone(bill.id)
        self.assertEqual(bill.lines.first().quantity, Decimal('9900.0000'))

    def test_voiding_tanker_receipt_rejected_if_linked_to_active_bill(self):
        """A tanker receipt linked to an active purchase bill cannot be voided."""
        bill = create_purchase_bill(
            organisation=self.org,
            outlet=self.outlet,
            supplier=self.supplier_a,
            supplier_invoice_number="INV-ACTIVE-LINK",
            invoice_date=date(2026, 8, 1),
            due_date=date(2026, 8, 31),
            lines_data=[{
                'tanker_receipt_line_id': str(self.receipt1_line.id),
                'product_id': str(self.petrol.id),
                'quantity': '10000.0000',
                'unit_rate': '90.0000'
            }],
            adjustments_data=[],
            user=self.owner
        )

        with self.assertRaises(ValidationError) as ctx:
            void_tanker_receipt(self.receipt1.id, self.owner, void_reason="Attempted void")
        self.assertIn("linked to active Purchase Bill", str(ctx.exception))

    def test_purchase_bills_do_not_alter_tank_stock(self):
        """Saving, editing, or voiding a Purchase Bill does not alter physical tank stock."""
        from apps.inventory.services import get_or_create_tank_projection

        initial_stock = get_or_create_tank_projection(self.tank_ms).current_book_stock

        bill = create_purchase_bill(
            organisation=self.org,
            outlet=self.outlet,
            supplier=self.supplier_a,
            supplier_invoice_number="INV-NO-STOCK",
            invoice_date=date(2026, 8, 1),
            due_date=date(2026, 8, 31),
            lines_data=[{
                'tanker_receipt_line_id': str(self.receipt1_line.id),
                'product_id': str(self.petrol.id),
                'quantity': '10000.0000',
                'unit_rate': '90.0000'
            }],
            adjustments_data=[],
            user=self.owner
        )

        stock_after_save = get_or_create_tank_projection(self.tank_ms).current_book_stock
        self.assertEqual(initial_stock, stock_after_save)

        with self.assertRaises(ValidationError):
            update_purchase_bill(bill.id, self.owner, {'notes': "Updated note"})
        stock_after_update = get_or_create_tank_projection(self.tank_ms).current_book_stock
        self.assertEqual(initial_stock, stock_after_update)

        void_purchase_bill(bill.id, self.owner, void_reason="Mistake in bill")
        stock_after_void = get_or_create_tank_projection(self.tank_ms).current_book_stock
        self.assertEqual(initial_stock, stock_after_void)

    def test_purchase_bill_direct_delete_blocked(self):
        """Correction 3: Direct PurchaseBill.delete() must raise ValidationError."""
        bill = create_purchase_bill(
            organisation=self.org,
            outlet=self.outlet,
            supplier=self.supplier_a,
            supplier_invoice_number="INV-CANNOT-DELETE",
            invoice_date=date(2026, 8, 1),
            due_date=date(2026, 8, 31),
            lines_data=[{'product_id': str(self.petrol.id), 'quantity': '100.0000', 'unit_rate': '90.0000'}],
            adjustments_data=[],
            user=self.owner
        )

        with self.assertRaises(ValidationError):
            bill.delete()

    def test_supplier_outstanding_and_ageing_buckets(self):
        """Validates summary, supplier breakdown, and 5 ageing buckets using outlet-local date."""
        today = date.today()

        # Bill 1: Not due (due in 5 days)
        create_purchase_bill(
            organisation=self.org,
            outlet=self.outlet,
            supplier=self.supplier_a,
            supplier_invoice_number="INV-NOT-DUE",
            invoice_date=today - timedelta(days=10),
            due_date=today + timedelta(days=5),
            lines_data=[{'product_id': str(self.petrol.id), 'quantity': '100.0000', 'unit_rate': '100.0000'}], # 10,000
            adjustments_data=[],
            user=self.owner
        )

        # Bill 2: 1-30 days overdue (due 15 days ago)
        create_purchase_bill(
            organisation=self.org,
            outlet=self.outlet,
            supplier=self.supplier_a,
            supplier_invoice_number="INV-OVERDUE-15D",
            invoice_date=today - timedelta(days=40),
            due_date=today - timedelta(days=15),
            lines_data=[{'product_id': str(self.petrol.id), 'quantity': '200.0000', 'unit_rate': '100.0000'}], # 20,000
            adjustments_data=[],
            user=self.owner
        )

        # Bill 3: 31-60 days overdue (due 45 days ago)
        create_purchase_bill(
            organisation=self.org,
            outlet=self.outlet,
            supplier=self.supplier_a,
            supplier_invoice_number="INV-OVERDUE-45D",
            invoice_date=today - timedelta(days=70),
            due_date=today - timedelta(days=45),
            lines_data=[{'product_id': str(self.petrol.id), 'quantity': '300.0000', 'unit_rate': '100.0000'}], # 30,000
            adjustments_data=[],
            user=self.owner
        )

        # Bill 4: 61-90 days overdue (due 75 days ago)
        create_purchase_bill(
            organisation=self.org,
            outlet=self.outlet,
            supplier=self.supplier_b,
            supplier_invoice_number="INV-OVERDUE-75D",
            invoice_date=today - timedelta(days=100),
            due_date=today - timedelta(days=75),
            lines_data=[{'product_id': str(self.diesel.id), 'quantity': '400.0000', 'unit_rate': '100.0000'}], # 40,000
            adjustments_data=[],
            user=self.owner
        )

        # Bill 5: >90 days overdue (due 120 days ago)
        create_purchase_bill(
            organisation=self.org,
            outlet=self.outlet,
            supplier=self.supplier_b,
            supplier_invoice_number="INV-OVERDUE-120D",
            invoice_date=today - timedelta(days=150),
            due_date=today - timedelta(days=120),
            lines_data=[{'product_id': str(self.diesel.id), 'quantity': '500.0000', 'unit_rate': '100.0000'}], # 50,000
            adjustments_data=[],
            user=self.owner
        )

        summary = get_supplier_outstanding_summary(self.org, self.outlet)

        self.assertEqual(summary['total_outstanding'], '150000.00')
        self.assertEqual(summary['not_due'], '10000.00')
        self.assertEqual(summary['overdue_total'], '140000.00')

        self.assertEqual(summary['ageing_buckets']['not_due'], '10000.00')
        self.assertEqual(summary['ageing_buckets']['bucket_1_30'], '20000.00')
        self.assertEqual(summary['ageing_buckets']['bucket_31_60'], '30000.00')
        self.assertEqual(summary['ageing_buckets']['bucket_61_90'], '40000.00')
        self.assertEqual(summary['ageing_buckets']['bucket_over_90'], '50000.00')

        # Test Statement
        statement = get_supplier_statement(self.org, self.outlet, self.supplier_a)
        self.assertEqual(statement['total_outstanding'], '60000.00')
        self.assertEqual(len(statement['lines']), 3)

    def test_attachment_upload_and_download_permissions(self):
        """Validates secure attachment handling and permission checking."""
        bill = create_purchase_bill(
            organisation=self.org,
            outlet=self.outlet,
            supplier=self.supplier_a,
            supplier_invoice_number="INV-ATT-001",
            invoice_date=date(2026, 8, 1),
            due_date=date(2026, 8, 31),
            lines_data=[{'product_id': str(self.petrol.id), 'quantity': '100.0000', 'unit_rate': '90.0000'}],
            adjustments_data=[],
            user=self.owner
        )

        fake_pdf = SimpleUploadedFile("invoice.pdf", b"%PDF-1.4 test invoice content", content_type="application/pdf")
        att = upload_bill_attachment(bill, fake_pdf, PurchaseBillAttachment.TYPE_SUPPLIER_INVOICE, self.owner)
        self.assertIsNotNone(att.id)
        self.assertEqual(att.file_name, "invoice.pdf")

        # Test DRF download endpoint
        self.client.force_authenticate(user=self.accountant_user)
        download_url = reverse('purchase_bill_attachment_download', kwargs={
            'org_id': self.org.id,
            'outlet_id': self.outlet.id,
            'bill_id': bill.id,
            'att_id': att.id
        })
        response = self.client.get(download_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Operator (no permission) should be denied
        self.client.force_authenticate(user=self.operator_user)
        response = self.client.get(download_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
