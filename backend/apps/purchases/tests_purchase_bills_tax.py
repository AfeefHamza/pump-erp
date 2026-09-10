# apps/purchases/tests_purchase_bills_tax.py
from datetime import date
from decimal import Decimal
from django.test import TestCase
from django.core.exceptions import ValidationError
from rest_framework.test import APIClient
from rest_framework import status

from apps.users.models import User
from apps.organizations.models import Organisation, Outlet
from apps.organizations.services import create_organisation_with_owner, create_outlet
from apps.forecourt.models import FuelProduct
from apps.purchases.models import (
    Supplier, PurchaseBill, PurchaseBillLine, PurchaseTaxCode,
    PurchaseTaxCodeRate, PurchaseTaxCodeComponent, PurchaseItem,
    ProductPurchaseTaxMapping, PurchaseBillOtherCharge
)
from apps.purchases.services import (
    create_supplier, create_purchase_tax_code, create_purchase_tax_code_rate,
    create_purchase_item, create_or_update_product_tax_mapping,
    create_purchase_bill, update_purchase_bill, calculate_bill_totals_v2
)


class UnifiedPurchaseBillTaxTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="manager@kfn.com",
            password="testpassword123",
            display_name="Store Manager"
        )
        self.org = create_organisation_with_owner(
            name="Karnataka Fuel Network",
            code="KFN",
            owner_user=self.user
        )
        self.org.state = "Karnataka"
        self.org.state_code = "29"
        self.org.gstin = "29AAAAA0000A1Z5"
        self.org.save()

        self.outlet = create_outlet(
            self.org,
            name="Bangalore Central Hub",
            code="BCH-01"
        )
        self.outlet.state = "Karnataka"
        self.outlet.state_code = "29"
        self.outlet.gstin = "29AAAAA0000A1Z5"
        self.outlet.save()

        # Local Supplier (Karnataka - 29)
        self.supplier_local = create_supplier(
            organisation=self.org,
            code="SUP-LOC",
            name="Local Spares & Lubes Ltd",
            gstin="29ABCDE1234F1Z5",
            gst_registration_type="registered",
            state="Karnataka",
            state_code="29"
        )

        # Inter-state Supplier (Maharashtra - 27)
        self.supplier_interstate = create_supplier(
            organisation=self.org,
            code="SUP-INT",
            name="Apex Refining Mumbai",
            gstin="27ABCDE1234F1Z2",
            gst_registration_type="registered",
            state="Maharashtra",
            state_code="27"
        )

        # Overseas Supplier
        self.supplier_overseas = create_supplier(
            organisation=self.org,
            code="SUP-OS",
            name="Global Petro Dubai",
            gst_registration_type="overseas",
            state="International"
        )

        # Tax Code: GST 18%
        self.tax_code_gst18 = create_purchase_tax_code(
            organisation=self.org,
            code="GST18",
            name="GST 18%",
            description="Standard Goods & Services GST 18%",
            tax_regime=PurchaseTaxCode.REGIME_GST
        )
        self.rate_gst18 = create_purchase_tax_code_rate(
            tax_code=self.tax_code_gst18,
            effective_from=date(2026, 1, 1),
            effective_to=date(2026, 12, 31),
            gst_rate=Decimal('18.00'),
            cess_rate=Decimal('0.00'),
            cess_per_unit=Decimal('0.0000')
        )

        # Tax Code: GST 28% + 12% Cess + Rs 1.50 per unit Cess
        self.tax_code_luxury = create_purchase_tax_code(
            organisation=self.org,
            code="GST28_CESS",
            name="GST 28% + Cess",
            description="High Cess Goods",
            tax_regime=PurchaseTaxCode.REGIME_GST
        )
        self.rate_luxury = create_purchase_tax_code_rate(
            tax_code=self.tax_code_luxury,
            effective_from=date(2026, 1, 1),
            effective_to=None,
            gst_rate=Decimal('28.00'),
            cess_rate=Decimal('12.00'),
            cess_per_unit=Decimal('1.5000')
        )

        # Tax Code: Non-GST Petroleum VAT 20% + Additional Tax 5% + Fixed Cess Rs 2/litre
        self.tax_code_petro = create_purchase_tax_code(
            organisation=self.org,
            code="PETRO_VAT",
            name="Petroleum VAT & Cess",
            description="State Petroleum VAT & Levies",
            tax_regime=PurchaseTaxCode.REGIME_NON_GST_PETROLEUM
        )
        self.rate_petro = create_purchase_tax_code_rate(
            tax_code=self.tax_code_petro,
            effective_from=date(2026, 1, 1),
            effective_to=None,
            components_data=[
                {
                    'name': 'State VAT',
                    'component_type': PurchaseTaxCodeComponent.TYPE_VAT,
                    'calculation_base': PurchaseTaxCodeComponent.BASE_DISCOUNTED_LINE,
                    'calculation_type': PurchaseTaxCodeComponent.CALC_PERCENTAGE,
                    'rate_value': '20.0000',
                    'sequence': 1
                },
                {
                    'name': 'Road Cess',
                    'component_type': PurchaseTaxCodeComponent.TYPE_CESS,
                    'calculation_base': PurchaseTaxCodeComponent.BASE_QUANTITY,
                    'calculation_type': PurchaseTaxCodeComponent.CALC_PER_UNIT,
                    'rate_value': '2.0000',
                    'sequence': 2
                }
            ]
        )

        # Masters: Fuel Product (Diesel)
        self.fuel_diesel = FuelProduct.objects.create(
            organisation=self.org,
            code="HSD",
            name="High Speed Diesel",
            category="diesel",
            unit="litre"
        )
        create_or_update_product_tax_mapping(
            organisation=self.org,
            fuel_product=self.fuel_diesel,
            purchase_tax_treatment="non_gst_petroleum",
            purchase_tax_code=self.tax_code_petro,
            purchase_unit="Litre"
        )

        # Masters: PurchaseItem (Engine Lubricant, Filter, Maintenance Service)
        self.item_lube = create_purchase_item(
            organisation=self.org,
            code="LUBE-5W30",
            name="Castrol GTX 5W-30 5L",
            item_type=PurchaseItem.TYPE_GOODS,
            unit="CAN",
            hsn_sac="27101981",
            purchase_tax_treatment=PurchaseItem.TREATMENT_GST,
            default_purchase_tax_code=self.tax_code_gst18,
            default_itc_classification=PurchaseItem.ITC_ELIGIBLE_INPUTS
        )

        self.item_service = create_purchase_item(
            organisation=self.org,
            code="SRV-DISP-CALIB",
            name="Dispenser Meter Calibration Service",
            item_type=PurchaseItem.TYPE_SERVICE,
            unit="JOB",
            hsn_sac="998719",
            purchase_tax_treatment=PurchaseItem.TREATMENT_GST,
            default_purchase_tax_code=self.tax_code_gst18,
            default_itc_classification=PurchaseItem.ITC_ELIGIBLE_SERVICES
        )

        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_gst_exclusive_intra_state_calculation(self):
        """Intra-state purchase splits GST 18% into 9% CGST and 9% SGST with zero IGST."""
        bill = create_purchase_bill(
            organisation=self.org,
            outlet=self.outlet,
            supplier=self.supplier_local,
            supplier_invoice_number="INV-LOC-001",
            invoice_date=date(2026, 6, 1),
            due_date=date(2026, 6, 30),
            tax_price_mode=PurchaseBill.TAX_MODE_EXCLUSIVE,
            lines_data=[
                {
                    'purchase_item_id': str(self.item_lube.id),
                    'quantity': '10.0000',
                    'unit_rate': '1500.0000',
                    'discount_method': 'none',
                    'discount_amount': '0.00',
                    'tax_treatment': 'gst',
                    'tax_code_id': str(self.tax_code_gst18.id)
                }
            ],
            user=self.user
        )

        # 10 * 1500 = 15,000.00 base
        # CGST 9% = 1,350.00
        # SGST 9% = 1,350.00
        # Grand Total = 17,700.00
        self.assertEqual(bill.subtotal, Decimal('15000.00'))
        self.assertEqual(bill.taxable_value_total, Decimal('15000.00'))
        self.assertEqual(bill.cgst_total, Decimal('1350.00'))
        self.assertEqual(bill.sgst_total, Decimal('1350.00'))
        self.assertEqual(bill.igst_total, Decimal('0.00'))
        self.assertEqual(bill.grand_total, Decimal('17700.00'))
        self.assertFalse(bill.is_interstate)

    def test_gst_exclusive_inter_state_calculation(self):
        """Inter-state purchase charges 18% IGST with zero CGST/SGST."""
        bill = create_purchase_bill(
            organisation=self.org,
            outlet=self.outlet,
            supplier=self.supplier_interstate,
            supplier_invoice_number="INV-INT-001",
            invoice_date=date(2026, 6, 1),
            due_date=date(2026, 6, 30),
            tax_price_mode=PurchaseBill.TAX_MODE_EXCLUSIVE,
            lines_data=[
                {
                    'purchase_item_id': str(self.item_service.id),
                    'quantity': '1.0000',
                    'unit_rate': '25000.0000',
                    'discount_method': 'none',
                    'discount_amount': '0.00',
                    'tax_treatment': 'gst',
                    'tax_code_id': str(self.tax_code_gst18.id)
                }
            ],
            user=self.user
        )

        # 25,000 * 18% = 4,500.00 IGST
        self.assertEqual(bill.taxable_value_total, Decimal('25000.00'))
        self.assertEqual(bill.cgst_total, Decimal('0.00'))
        self.assertEqual(bill.sgst_total, Decimal('0.00'))
        self.assertEqual(bill.igst_total, Decimal('4500.00'))
        self.assertEqual(bill.grand_total, Decimal('29500.00'))
        self.assertTrue(bill.is_interstate)

    def test_place_of_supply_override_with_audit_and_validation(self):
        """Overriding Place of Supply switches tax treatment from intra to inter-state and records audit."""
        # Local supplier overridden to Tamil Nadu (33) -> interstate
        bill = create_purchase_bill(
            organisation=self.org,
            outlet=self.outlet,
            supplier=self.supplier_local,
            supplier_invoice_number="INV-POS-001",
            invoice_date=date(2026, 6, 1),
            due_date=date(2026, 6, 30),
            is_place_of_supply_overridden=True,
            place_of_supply_state_code="33",
            place_of_supply_override_reason="Goods delivered directly to Hosur branch in Tamil Nadu",
            lines_data=[
                {
                    'purchase_item_id': str(self.item_lube.id),
                    'quantity': '2.0000',
                    'unit_rate': '5000.0000',
                    'tax_treatment': 'gst',
                    'tax_code_id': str(self.tax_code_gst18.id)
                }
            ],
            user=self.user
        )

        self.assertTrue(bill.is_place_of_supply_overridden)
        self.assertTrue(bill.is_interstate)
        self.assertEqual(bill.place_of_supply_state_code, "33")
        self.assertEqual(bill.igst_total, Decimal('1800.00'))
        self.assertEqual(bill.cgst_total, Decimal('0.00'))
        self.assertEqual(bill.sgst_total, Decimal('0.00'))

        audit = bill.audit_logs.filter(event_type='place_of_supply_override').first()
        self.assertIsNotNone(audit)
        self.assertIn("Hosur branch", audit.reason)

        # Validation failure if reason is too short
        with self.assertRaises(ValidationError):
            create_purchase_bill(
                organisation=self.org,
                outlet=self.outlet,
                supplier=self.supplier_local,
                supplier_invoice_number="INV-POS-BAD",
                invoice_date=date(2026, 6, 1),
                due_date=date(2026, 6, 30),
                is_place_of_supply_overridden=True,
                place_of_supply_state_code="33",
                place_of_supply_override_reason="none",  # < 5 chars
                lines_data=[{'purchase_item_id': str(self.item_lube.id), 'quantity': '1', 'unit_rate': '1000'}],
                user=self.user
            )

    def test_gst_inclusive_pricing_with_per_unit_cess(self):
        """Inclusive pricing extracts base taxable amount after taking per-unit cess into account."""
        # 10 units @ 1100.00 inclusive
        # Total line inclusive = 11,000.00
        # Cess per unit = Rs 1.50 -> 10 * 1.50 = 15.00
        # Inclusive net before percentage = 11,000 - 15.00 = 10,985.00
        # Total tax percentage = 28% GST + 12% Cess = 40%
        # Taxable amount = 10,985 / 1.40 = 7,846.43
        # GST 28% = 2,197.00 (split CGST 1098.50, SGST 1098.50)
        # Cess percentage 12% = 941.57 + 15.00 per-unit = 956.57
        # Total = 7846.43 + 2197.00 + 956.57 = 11,000.00
        bill = create_purchase_bill(
            organisation=self.org,
            outlet=self.outlet,
            supplier=self.supplier_local,
            supplier_invoice_number="INV-INC-001",
            invoice_date=date(2026, 6, 1),
            due_date=date(2026, 6, 30),
            tax_price_mode=PurchaseBill.TAX_MODE_INCLUSIVE,
            lines_data=[
                {
                    'purchase_item_id': str(self.item_lube.id),
                    'quantity': '10.0000',
                    'unit_rate': '1100.0000',
                    'tax_treatment': 'gst',
                    'tax_code_id': str(self.tax_code_luxury.id)
                }
            ],
            user=self.user
        )

        self.assertEqual(bill.grand_total, Decimal('11000.00'))
        self.assertEqual(bill.taxable_value_total, Decimal('7846.43'))
        self.assertEqual(bill.cgst_total + bill.sgst_total, Decimal('2197.00'))
        self.assertEqual(bill.gst_cess_total, Decimal('956.57'))

    def test_transaction_discount_proportional_allocation_and_balancing(self):
        """Transaction discount is allocated across lines and residual cents are balanced on last line."""
        # Line 1: 10 * 100 = 1,000 (33.33%)
        # Line 2: 20 * 100 = 2,000 (66.67%)
        # Gross total = 3,000.00
        # Transaction discount = 100.00
        # Line 1 allocation: 100 * 1000/3000 = 33.33
        # Line 2 allocation (residual): 100 - 33.33 = 66.67
        bill = create_purchase_bill(
            organisation=self.org,
            outlet=self.outlet,
            supplier=self.supplier_local,
            supplier_invoice_number="INV-DISC-001",
            invoice_date=date(2026, 6, 1),
            due_date=date(2026, 6, 30),
            discount_mode=PurchaseBill.DISCOUNT_MODE_TRANSACTION,
            transaction_discount_method=PurchaseBill.DISCOUNT_METHOD_FIXED,
            transaction_discount_amount=Decimal('100.00'),
            lines_data=[
                {
                    'purchase_item_id': str(self.item_lube.id),
                    'quantity': '10.0000',
                    'unit_rate': '100.0000',
                    'tax_treatment': 'exempt'
                },
                {
                    'purchase_item_id': str(self.item_lube.id),
                    'quantity': '20.0000',
                    'unit_rate': '100.0000',
                    'tax_treatment': 'exempt'
                }
            ],
            user=self.user
        )

        lines = list(bill.lines.order_by('line_number'))
        self.assertEqual(lines[0].allocated_transaction_discount, Decimal('33.33'))
        self.assertEqual(lines[1].allocated_transaction_discount, Decimal('66.67'))
        self.assertEqual(bill.discount_total, Decimal('100.00'))
        self.assertEqual(bill.grand_total, Decimal('2900.00'))

    def test_discount_method_exclusivity_validation(self):
        """Cannot supply both amount and percentage on discount."""
        with self.assertRaises(ValidationError):
            calculate_bill_totals_v2(
                organisation=self.org,
                outlet=self.outlet,
                supplier=self.supplier_local,
                invoice_date=date(2026, 6, 1),
                lines_data=[
                    {
                        'purchase_item_id': str(self.item_lube.id),
                        'quantity': '1',
                        'unit_rate': '100',
                        'discount_method': 'fixed_amount',
                        'discount_amount': '10.00',
                        'discount_percentage': '5.00'  # Conflicting!
                    }
                ]
            )

    def test_petroleum_taxes_and_manual_override(self):
        """Petroleum multi-component levies calculate correctly; manual override requires reason and logs audit."""
        # 1000 litres @ 90 = 90,000.00
        # VAT 20% = 18,000.00
        # Road cess @ Rs 2/L = 2,000.00
        # Total petroleum tax = 20,000.00
        # Grand Total = 110,000.00
        bill = create_purchase_bill(
            organisation=self.org,
            outlet=self.outlet,
            supplier=self.supplier_local,
            supplier_invoice_number="INV-PETRO-001",
            invoice_date=date(2026, 6, 1),
            due_date=date(2026, 6, 30),
            lines_data=[
                {
                    'product_id': str(self.fuel_diesel.id),
                    'quantity': '1000.0000',
                    'unit_rate': '90.0000',
                    'tax_treatment': 'non_gst_petroleum',
                    'tax_code_id': str(self.tax_code_petro.id)
                }
            ],
            user=self.user
        )

        self.assertEqual(bill.petroleum_tax_total, Decimal('20000.00'))
        self.assertEqual(bill.grand_total, Decimal('110000.00'))

        # Now test manual petroleum tax override
        bill_override = create_purchase_bill(
            organisation=self.org,
            outlet=self.outlet,
            supplier=self.supplier_local,
            supplier_invoice_number="INV-PETRO-OVR",
            invoice_date=date(2026, 6, 1),
            due_date=date(2026, 6, 30),
            lines_data=[
                {
                    'product_id': str(self.fuel_diesel.id),
                    'quantity': '1000.0000',
                    'unit_rate': '90.0000',
                    'tax_treatment': 'non_gst_petroleum',
                    'tax_code_id': str(self.tax_code_petro.id),
                    'is_petroleum_manual_override': True,
                    'petroleum_tax_amount': '19543.21',
                    'petroleum_manual_override_reason': "Special concessional OMC invoice tax rate"
                }
            ],
            user=self.user
        )

        self.assertEqual(bill_override.petroleum_tax_total, Decimal('19543.21'))
        self.assertTrue(bill_override.lines.first().is_petroleum_manual_override)
        audit = bill_override.audit_logs.filter(event_type='tax_override').first()
        self.assertIsNotNone(audit)

    def test_tax_rate_version_resolved_strictly_by_invoice_date(self):
        """Calculations resolve rate versions active on invoice_date and reject dates with no version."""
        # Rate gst18 was effective 2026-01-01 to 2026-12-31
        # Invoice date in 2027 should be rejected
        with self.assertRaises(ValidationError) as cm:
            create_purchase_bill(
                organisation=self.org,
                outlet=self.outlet,
                supplier=self.supplier_local,
                supplier_invoice_number="INV-DATE-OUT",
                invoice_date=date(2027, 1, 15),
                due_date=date(2027, 1, 30),
                lines_data=[
                    {
                        'purchase_item_id': str(self.item_lube.id),
                        'quantity': '1.0000',
                        'unit_rate': '1000.0000',
                        'tax_treatment': 'gst',
                        'tax_code_id': str(self.tax_code_gst18.id)
                    }
                ],
                user=self.user
            )
        self.assertIn("No effective tax rate version found", str(cm.exception))

    def test_locked_tax_rate_version_mutation_protection(self):
        """A tax rate version used in a recorded bill cannot be modified or deleted."""
        create_purchase_bill(
            organisation=self.org,
            outlet=self.outlet,
            supplier=self.supplier_local,
            supplier_invoice_number="INV-LOCK-001",
            invoice_date=date(2026, 6, 1),
            due_date=date(2026, 6, 30),
            lines_data=[
                {
                    'purchase_item_id': str(self.item_lube.id),
                    'quantity': '1.0000',
                    'unit_rate': '1000.0000',
                    'tax_treatment': 'gst',
                    'tax_code_id': str(self.tax_code_gst18.id)
                }
            ],
            user=self.user
        )

        self.assertTrue(self.rate_gst18.is_locked())

        # Modification rejected
        self.rate_gst18.gst_rate = Decimal('12.00')
        with self.assertRaises(ValidationError):
            self.rate_gst18.clean()

        # Deletion rejected
        with self.assertRaises(ValidationError):
            self.rate_gst18.delete()

    def test_taxable_other_charges_and_double_count_prevention(self):
        """Taxable other charges calculate tax and add to taxable totals without double counting."""
        # Line: 10 * 100 = 1,000.00 exempt
        # Other charge: Freight Rs 500.00 taxable @ 18%
        # Charge GST = 90.00 (CGST 45, SGST 45)
        # Total charge = 590.00
        # Taxable value total = 0 (line is exempt) + 500 = 500.00
        # Subtotal = 1000.00
        # Tax total = 90.00
        # Additional charges total = 500.00
        # Grand total = 1000 + 500 + 90 = 1590.00
        bill = create_purchase_bill(
            organisation=self.org,
            outlet=self.outlet,
            supplier=self.supplier_local,
            supplier_invoice_number="INV-CHG-001",
            invoice_date=date(2026, 6, 1),
            due_date=date(2026, 6, 30),
            lines_data=[
                {
                    'purchase_item_id': str(self.item_lube.id),
                    'quantity': '10.0000',
                    'unit_rate': '100.0000',
                    'tax_treatment': 'exempt'
                }
            ],
            other_charges_data=[
                {
                    'charge_type': 'freight',
                    'description': 'Road Transportation',
                    'calculation_type': 'fixed_amount',
                    'amount': '500.00',
                    'tax_treatment': 'taxable',
                    'tax_code_id': str(self.tax_code_gst18.id)
                }
            ],
            user=self.user
        )

        self.assertEqual(bill.subtotal, Decimal('1000.00'))
        self.assertEqual(bill.additional_charges_total, Decimal('500.00'))
        self.assertEqual(bill.other_charges_subtotal, Decimal('500.00'))
        self.assertEqual(bill.other_charges_tax_total, Decimal('90.00'))
        self.assertEqual(bill.taxable_value_total, Decimal('500.00'))
        self.assertEqual(bill.cgst_total, Decimal('45.00'))
        self.assertEqual(bill.sgst_total, Decimal('45.00'))
        self.assertEqual(bill.grand_total, Decimal('1590.00'))

    def test_overseas_suppliers_blocked_from_normal_tax_calc(self):
        """Overseas suppliers are blocked until specialized import workflows exist."""
        with self.assertRaises(ValidationError) as cm:
            calculate_bill_totals_v2(
                organisation=self.org,
                outlet=self.outlet,
                supplier=self.supplier_overseas,
                invoice_date=date(2026, 6, 1),
                lines_data=[
                    {'purchase_item_id': str(self.item_lube.id), 'quantity': '1', 'unit_rate': '100'}
                ]
            )
        self.assertIn("Overseas / Import purchase bills are blocked", str(cm.exception))

    def test_calculate_preview_api_endpoint(self):
        """The /calculate-preview/ endpoint previews taxes without saving."""
        url = f"/api/v1/organisations/{self.org.id}/outlets/{self.outlet.id}/purchase-bills/calculate-preview/"
        payload = {
            'supplier_id': str(self.supplier_local.id),
            'invoice_date': '2026-06-01',
            'tax_price_mode': 'exclusive',
            'lines': [
                {
                    'purchase_item_id': str(self.item_lube.id),
                    'quantity': '5.0000',
                    'unit_rate': '2000.0000',
                    'tax_treatment': 'gst',
                    'tax_code_id': str(self.tax_code_gst18.id)
                }
            ]
        }
        res = self.client.post(url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()
        self.assertEqual(data['subtotal'], '10000.00')
        self.assertEqual(data['taxable_value_total'], '10000.00')
        self.assertEqual(data['cgst_total'], '900.00')
        self.assertEqual(data['sgst_total'], '900.00')
        self.assertEqual(data['grand_total'], '11800.00')
        # Ensure zero bills were saved
        self.assertEqual(PurchaseBill.objects.count(), 0)

    def test_gstin_validation_and_pending_review_default(self):
        """Supplier creation defaults to pending_review and validates GSTIN format + state code prefix."""
        sup = create_supplier(
            organisation=self.org,
            code="SUP-NEW",
            name="New Generic Supplier"
        )
        self.assertEqual(sup.gst_registration_type, 'pending_review')

        # Invalid format (wrong characters)
        with self.assertRaises(ValidationError) as cm:
            create_supplier(
                organisation=self.org,
                code="SUP-BAD1",
                name="Bad GSTIN",
                gstin="29ABCDE1234F123"  # invalid 14th/15th format
            )
        self.assertIn("Invalid GSTIN format", str(cm.exception))

        # State code prefix mismatch (prefix 27 != state_code 29)
        with self.assertRaises(ValidationError) as cm:
            create_supplier(
                organisation=self.org,
                code="SUP-BAD2",
                name="Mismatch State",
                state_code="29",
                gstin="27ABCDE1234F1Z2"
            )
        self.assertIn("does not match supplier state code", str(cm.exception))

    def test_mixed_bill_fuel_and_goods(self):
        """Purchase bill can contain both fuel lines with petroleum taxes and lubricant goods lines with GST."""
        bill = create_purchase_bill(
            organisation=self.org,
            outlet=self.outlet,
            supplier=self.supplier_local,
            supplier_invoice_number="INV-MIX-001",
            invoice_date=date(2026, 6, 1),
            due_date=date(2026, 6, 30),
            purchase_type=PurchaseBill.PURCHASE_TYPE_MIXED,
            lines_data=[
                {
                    # Line 1: Diesel fuel (1,000L @ 90 = 90,000. Petro VAT 20% = 18,000, Road cess Rs 2/L = 2,000 -> 20,000 tax)
                    'product_id': str(self.fuel_diesel.id),
                    'quantity': '1000.0000',
                    'unit_rate': '90.0000',
                    'tax_treatment': 'non_gst_petroleum',
                    'tax_code_id': str(self.tax_code_petro.id)
                },
                {
                    # Line 2: Engine oil (10 cans @ 1,000 = 10,000. GST 18% = 1,800)
                    'purchase_item_id': str(self.item_lube.id),
                    'quantity': '10.0000',
                    'unit_rate': '1000.0000',
                    'tax_treatment': 'gst',
                    'tax_code_id': str(self.tax_code_gst18.id)
                }
            ],
            user=self.user
        )

        self.assertEqual(bill.purchase_type, PurchaseBill.PURCHASE_TYPE_MIXED)
        self.assertEqual(bill.subtotal, Decimal('100000.00'))
        self.assertEqual(bill.taxable_value_total, Decimal('10000.00'))  # GST taxable
        self.assertEqual(bill.cgst_total, Decimal('900.00'))
        self.assertEqual(bill.sgst_total, Decimal('900.00'))
        self.assertEqual(bill.petroleum_tax_total, Decimal('20000.00'))
        # Grand total = 100,000 subtotal + 1,800 GST + 20,000 Petro Tax = 121,800.00
        self.assertEqual(bill.grand_total, Decimal('121800.00'))

    def test_update_purchase_bill_recalculates_v2(self):
        """Updating a V2 bill lines and other charges recalculates totals and Place of Supply."""
        bill = create_purchase_bill(
            organisation=self.org,
            outlet=self.outlet,
            supplier=self.supplier_local,
            supplier_invoice_number="INV-UPD-001",
            invoice_date=date(2026, 6, 1),
            due_date=date(2026, 6, 30),
            lines_data=[
                {
                    'purchase_item_id': str(self.item_lube.id),
                    'quantity': '5.0000',
                    'unit_rate': '1000.0000',
                    'tax_treatment': 'gst',
                    'tax_code_id': str(self.tax_code_gst18.id)
                }
            ],
            user=self.user
        )
        self.assertEqual(bill.grand_total, Decimal('5900.00'))

        # Update line quantity to 10 and add other charge of 1000 freight
        updated_bill = update_purchase_bill(
            bill_id=bill.id,
            user=self.user,
            data={
                'lines': [
                    {
                        'purchase_item_id': str(self.item_lube.id),
                        'quantity': '10.0000',
                        'unit_rate': '1000.0000',
                        'tax_treatment': 'gst',
                        'tax_code_id': str(self.tax_code_gst18.id)
                    }
                ],
                'other_charges': [
                    {
                        'charge_type': 'freight',
                        'description': 'Transport',
                        'calculation_type': 'fixed_amount',
                        'amount': '1000.00',
                        'tax_treatment': 'taxable',
                        'tax_code_id': str(self.tax_code_gst18.id)
                    }
                ]
            }
        )

        # 10 * 1000 = 10,000 + 1,800 GST = 11,800
        # Freight = 1,000 + 180 GST = 1,180
        # Grand total = 11,800 + 1,180 = 12,980.00
        self.assertEqual(updated_bill.grand_total, Decimal('12980.00'))
        self.assertEqual(updated_bill.taxable_value_total, Decimal('11000.00'))
        self.assertEqual(updated_bill.cgst_total, Decimal('990.00'))
        self.assertEqual(updated_bill.sgst_total, Decimal('990.00'))
