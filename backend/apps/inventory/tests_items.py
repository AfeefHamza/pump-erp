# apps/inventory/tests_items.py
from datetime import date, timedelta
from decimal import Decimal
from django.test import TestCase
from django.core.exceptions import ValidationError
from rest_framework.test import APIClient
from rest_framework import status

from apps.users.models import User
from apps.organizations.models import Organisation, Outlet
from apps.organizations.services import create_organisation_with_owner, create_outlet
from apps.forecourt.models import FuelProduct, Tank, ProductPrice
from apps.forecourt.services import create_fuel_product
from apps.purchases.models import (
    Supplier, PurchaseTaxCode, PurchaseTaxCodeRate,
    ItemPurchaseTaxTreatment, PurchaseBill, PurchaseBillLine
)
from apps.purchases.services import (
    create_supplier, create_purchase_tax_code, create_purchase_tax_code_rate,
    create_purchase_bill, create_purchase_item
)
from apps.inventory.models import (
    UnitMaster, UnitConversion, Item,
    FuelItemProfile, StockItemProfile, ItemCodeAlias
)
from apps.inventory.services_item import (
    create_canonical_item, update_canonical_item,
    deactivate_canonical_item, resolve_legacy_item,
    create_unit_master, create_unit_conversion
)


class CanonicalItemMasterTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="owner@test.com",
            password="password123",
            display_name="Owner User"
        )
        self.org = create_organisation_with_owner(
            name="Alpha Petroleum",
            code="ALPHA",
            owner_user=self.user
        )
        self.outlet = create_outlet(self.org, name="Alpha Station", code="ST-01")

        # Second organisation for multi-tenant isolation tests
        self.other_user = User.objects.create_user(
            email="other@test.com",
            password="password123",
            display_name="Other User"
        )
        self.other_org = create_organisation_with_owner(
            name="Beta Petroleum",
            code="BETA",
            owner_user=self.other_user
        )

        # Standard units
        self.unit_ltr = UnitMaster.objects.get_or_create(
            organisation=self.org, code="LTR", defaults={'name': "Litre", 'symbol': "L"}
        )[0]
        self.unit_kl = UnitMaster.objects.get_or_create(
            organisation=self.org, code="KL", defaults={'name': "Kilolitre", 'symbol': "KL"}
        )[0]
        self.unit_pcs = UnitMaster.objects.get_or_create(
            organisation=self.org, code="PCS", defaults={'name': "Piece", 'symbol': "pcs"}
        )[0]
        self.unit_box = UnitMaster.objects.get_or_create(
            organisation=self.org, code="BOX", defaults={'name': "Box", 'symbol': "box"}
        )[0]

        # Units for other org
        self.other_unit_ltr = UnitMaster.objects.get_or_create(
            organisation=self.other_org, code="LTR", defaults={'name': "Litre", 'symbol': "L"}
        )[0]

        self.client = APIClient()

    def test_create_each_item_type(self):
        """1. Verify creation of fuel, stock_item, non_stock_item, and service items with appropriate profiles and tracking modes."""
        # Fuel
        fuel_item = create_canonical_item(
            organisation=self.org,
            code="MS-PETROL",
            name="Motor Spirit Normal",
            item_type=Item.ITEM_TYPE_FUEL,
            base_unit=self.unit_ltr,
            fuel_profile_data={'fuel_category': 'petrol', 'short_code': 'MS'}
        )
        self.assertEqual(fuel_item.inventory_tracking_mode, Item.TRACKING_TANK)
        self.assertTrue(hasattr(fuel_item, 'fuel_profile'))
        self.assertEqual(fuel_item.fuel_profile.fuel_category, 'petrol')
        # One-way bridge check
        self.assertTrue(FuelProduct.objects.filter(canonical_item=fuel_item).exists())

        # Stock item
        stock_item = create_canonical_item(
            organisation=self.org,
            code="LUBE-5W30",
            name="Engine Oil 5W-30",
            item_type=Item.ITEM_TYPE_STOCK,
            base_unit=self.unit_pcs,
            stock_profile_data={'brand': 'Servo', 'reorder_level': Decimal('10.0000')}
        )
        self.assertEqual(stock_item.inventory_tracking_mode, Item.TRACKING_QUANTITY)
        self.assertTrue(hasattr(stock_item, 'stock_profile'))
        self.assertEqual(stock_item.stock_profile.brand, 'Servo')

        # Non-stock item
        non_stock_item = create_canonical_item(
            organisation=self.org,
            code="CLEANING-RAG",
            name="Cotton Cleaning Rags",
            item_type=Item.ITEM_TYPE_NON_STOCK,
            base_unit=self.unit_pcs
        )
        self.assertEqual(non_stock_item.inventory_tracking_mode, Item.TRACKING_NONE)

        # Service
        service_item = create_canonical_item(
            organisation=self.org,
            code="AIR-CHECK",
            name="Tyre Air Pressure Check",
            item_type=Item.ITEM_TYPE_SERVICE,
            base_unit=self.unit_pcs
        )
        self.assertEqual(service_item.inventory_tracking_mode, Item.TRACKING_NONE)

    def test_unique_org_item_code(self):
        """2. Unique item code within organisation is enforced case-insensitively."""
        create_canonical_item(
            organisation=self.org,
            code="DIESEL-HSD",
            name="High Speed Diesel",
            item_type=Item.ITEM_TYPE_FUEL,
            base_unit=self.unit_ltr
        )
        with self.assertRaises(ValidationError):
            create_canonical_item(
                organisation=self.org,
                code="diesel-hsd",  # case-insensitive collision
                name="Another Diesel",
                item_type=Item.ITEM_TYPE_FUEL,
                base_unit=self.unit_ltr
            )

    def test_cross_org_access_rejected(self):
        """3. Base units or conversions from another organisation are strictly rejected."""
        with self.assertRaises(ValidationError):
            create_canonical_item(
                organisation=self.org,
                code="CROSS-TEST",
                name="Cross Org Test",
                item_type=Item.ITEM_TYPE_STOCK,
                base_unit=self.other_unit_ltr  # foreign unit
            )

    def test_service_inventory_tracking(self):
        """4. Service items always have inventory_tracking_mode='none'."""
        srv = create_canonical_item(
            organisation=self.org,
            code="CAR-WASH",
            name="Full Car Wash",
            item_type=Item.ITEM_TYPE_SERVICE,
            base_unit=self.unit_pcs,
            inventory_tracking_mode=Item.TRACKING_QUANTITY  # Should be overridden to 'none'
        )
        self.assertEqual(srv.inventory_tracking_mode, Item.TRACKING_NONE)

    def test_fuel_tank_ledger_tracking(self):
        """5. Fuel items always have inventory_tracking_mode='tank'."""
        fuel = create_canonical_item(
            organisation=self.org,
            code="XP-95",
            name="Extra Premium Petrol 95",
            item_type=Item.ITEM_TYPE_FUEL,
            base_unit=self.unit_ltr,
            inventory_tracking_mode=Item.TRACKING_NONE
        )
        self.assertEqual(fuel.inventory_tracking_mode, Item.TRACKING_TANK)

    def test_non_fuel_item_rejected_for_tank_and_nozzle(self):
        """6. Tank model enforces fuel-only item validation in clean() and save()."""
        lube = create_canonical_item(
            organisation=self.org,
            code="LUBE-20W40",
            name="4T Plus 20W40",
            item_type=Item.ITEM_TYPE_STOCK,
            base_unit=self.unit_pcs
        )
        tank = Tank(
            organisation=self.org,
            outlet=self.outlet,
            code="TK-TEST",
            name="Test Tank",
            item=lube,  # Non-fuel item
            capacity=Decimal('10000.00')
        )
        with self.assertRaises(ValidationError) as ctx:
            tank.save()
        self.assertIn("Only fuel items can be assigned to a tank.", str(ctx.exception))

    def test_non_fuel_item_rejected_for_price(self):
        """7. ProductPrice model enforces fuel-only item validation in clean() and save()."""
        service = create_canonical_item(
            organisation=self.org,
            code="OIL-CHANGE-SRV",
            name="Oil Change Service",
            item_type=Item.ITEM_TYPE_SERVICE,
            base_unit=self.unit_pcs
        )
        price = ProductPrice(
            organisation=self.org,
            outlet=self.outlet,
            item=service,  # Non-fuel item
            selling_price=Decimal('250.00'),
            effective_from=date.today()
        )
        with self.assertRaises(ValidationError) as ctx:
            price.save()
        self.assertIn("Only fuel items can have product prices configured.", str(ctx.exception))

    def test_unit_conversion_validation(self):
        """8. Unit conversion constraints: multiplier > 0, from != to, matching org, reverse conflict."""
        # Multiplier <= 0 rejected
        with self.assertRaises(ValidationError):
            create_unit_conversion(
                organisation=self.org,
                from_unit=self.unit_kl,
                to_unit=self.unit_ltr,
                multiplier=Decimal('0.000000')
            )

        # Same from and to rejected
        with self.assertRaises(ValidationError):
            create_unit_conversion(
                organisation=self.org,
                from_unit=self.unit_ltr,
                to_unit=self.unit_ltr,
                multiplier=Decimal('1.000000')
            )

        # Valid forward conversion (1 KL = 1000 LTR)
        conv1 = create_unit_conversion(
            organisation=self.org,
            from_unit=self.unit_kl,
            to_unit=self.unit_ltr,
            multiplier=Decimal('1000.000000')
        )
        self.assertIsNotNone(conv1.id)

        # Contradictory reverse conversion (expected ~0.001, given 0.5)
        with self.assertRaises(ValidationError):
            create_unit_conversion(
                organisation=self.org,
                from_unit=self.unit_ltr,
                to_unit=self.unit_kl,
                multiplier=Decimal('0.500000')
            )

    def test_duplicate_code_aliases_and_resolution(self):
        """9. Legacy code and ID lookups work through ItemCodeAlias and resolve_legacy_item."""
        item = create_canonical_item(
            organisation=self.org,
            code="DIESEL-CANONICAL",
            name="Diesel Canonical",
            item_type=Item.ITEM_TYPE_FUEL,
            base_unit=self.unit_ltr
        )
        # Register a legacy alias representing a migrated conflict
        ItemCodeAlias.objects.create(
            organisation=self.org,
            item=item,
            alias_code="DIESEL-OLD",
            source="legacy_fuel_product",
            is_conflict=True,
            notes="Migrated code conflict alias"
        )

        # Lookup by canonical code
        resolved_by_code = resolve_legacy_item(self.org, "DIESEL-CANONICAL")
        self.assertEqual(resolved_by_code.id, item.id)

        # Lookup by alias code
        resolved_by_alias = resolve_legacy_item(self.org, "DIESEL-OLD")
        self.assertEqual(resolved_by_alias.id, item.id)

        # Lookup by canonical ID
        resolved_by_id = resolve_legacy_item(self.org, str(item.id))
        self.assertEqual(resolved_by_id.id, item.id)

    def test_canonical_deactivation_in_legacy_selectors(self):
        """10. Deactivating a canonical Item immediately syncs deactivation to legacy FuelProduct."""
        item = create_canonical_item(
            organisation=self.org,
            code="CNG-TEST",
            name="Compressed Natural Gas",
            item_type=Item.ITEM_TYPE_FUEL,
            base_unit=self.unit_pcs
        )
        legacy_fp = FuelProduct.objects.get(canonical_item=item)
        self.assertTrue(legacy_fp.is_active)

        # Deactivate
        deactivate_canonical_item(item, user=self.user)
        item.refresh_from_db()
        legacy_fp.refresh_from_db()

        self.assertFalse(item.is_active)
        self.assertFalse(legacy_fp.is_active)

    def test_legacy_endpoints_cannot_independently_modify(self):
        """11. Legacy FuelProduct and PurchaseItem creation routes to canonical Item services atomically."""
        # Fuel product creation routes to canonical Item
        fp = create_fuel_product(
            organisation=self.org,
            code="SPEED-97",
            name="Speed 97 Octane Petrol",
            category="premium_petrol",
            unit="LTR"
        )
        self.assertIsNotNone(fp.canonical_item)
        self.assertEqual(fp.canonical_item.code, "SPEED-97")
        self.assertEqual(fp.canonical_item.item_type, Item.ITEM_TYPE_FUEL)

        # Purchase item creation routes to canonical Item
        pi = create_purchase_item(
            organisation=self.org,
            code="COOLANT-GREEN",
            name="Radiator Coolant 1L",
            item_type="goods",
            unit="NOS"
        )
        self.assertIsNotNone(pi.canonical_item)
        self.assertEqual(pi.canonical_item.code, "COOLANT-GREEN")
        self.assertEqual(pi.canonical_item.item_type, Item.ITEM_TYPE_STOCK)

    def test_item_options_api_and_permissions(self):
        """12. Items Options endpoint returns active items and is accessible with item.view permission."""
        self.client.force_authenticate(user=self.user)

        create_canonical_item(
            organisation=self.org,
            code="OPT-ACTIVE",
            name="Active Option Item",
            item_type=Item.ITEM_TYPE_STOCK,
            base_unit=self.unit_pcs,
            is_active=True
        )
        create_canonical_item(
            organisation=self.org,
            code="OPT-INACTIVE",
            name="Inactive Option Item",
            item_type=Item.ITEM_TYPE_STOCK,
            base_unit=self.unit_pcs,
            is_active=False
        )

        url = f"/api/v1/organisations/{self.org.id}/items/options/"
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        codes = [item['code'] for item in res.json()]
        self.assertIn("OPT-ACTIVE", codes)
        self.assertNotIn("OPT-INACTIVE", codes)

    def test_tax_treatment_and_purchase_bill_canonical_item(self):
        """13. Purchase bill creation using canonical item_id resolves tax treatment and snapshots properly."""
        self.client.force_authenticate(user=self.user)

        # Create Tax Treatment
        tax_treatment = create_purchase_tax_code(
            organisation=self.org,
            code="GST_18_STD",
            name="GST 18% Standard",
            tax_regime=PurchaseTaxCode.REGIME_GST
        )
        create_purchase_tax_code_rate(
            tax_code=tax_treatment,
            effective_from=date(2026, 1, 1),
            gst_rate=Decimal('18.00'),
            cess_rate=Decimal('0.00'),
            cess_per_unit=Decimal('0.0000')
        )

        # Create Item with attached Tax Treatment
        lube_item = create_canonical_item(
            organisation=self.org,
            code="CASTROL-GTX",
            name="Castrol GTX 20W-50",
            item_type=Item.ITEM_TYPE_STOCK,
            base_unit=self.unit_pcs,
            tax_treatment_id=str(tax_treatment.id),
            default_itc_classification=ItemPurchaseTaxTreatment.ITC_ELIGIBLE_INPUTS
        )

        # Create Supplier
        supplier = create_supplier(
            organisation=self.org,
            code="SUP-LUBE",
            name="Lubricant Distributors Inc",
            gstin="29AAAAA1234A1Z5",
            gst_registration_type="registered",
            state="Karnataka",
            state_code="29"
        )

        # Post Purchase Bill using item_id
        url = f"/api/v1/organisations/{self.org.id}/outlets/{self.outlet.id}/purchase-bills/"
        payload = {
            'supplier_id': str(supplier.id),
            'supplier_invoice_number': 'INV-CANONICAL-001',
            'invoice_date': '2026-09-11',
            'due_date': '2026-10-11',
            'tax_price_mode': 'exclusive',
            'discount_mode': 'line',
            'lines': [
                {
                    'line_number': 1,
                    'line_type': 'other',
                    'item_id': str(lube_item.id),
                    'quantity': '10.0000',
                    'unit': 'NOS',
                    'unit_rate': '200.0000',
                    'discount_method': 'none',
                }
            ]
        }
        res = self.client.post(url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)

        # Verify bill line snapshot
        bill = PurchaseBill.objects.get(id=res.json()['id'])
        line = bill.lines.first()
        self.assertEqual(line.item_id, lube_item.id)
        self.assertEqual(line.tax_treatment_id, tax_treatment.id)
        self.assertEqual(line.tax_treatment_name, "GST 18% Standard")
        self.assertEqual(line.tax_regime, "gst")
        self.assertEqual(line.taxable_amount, Decimal('2000.00'))
        self.assertEqual(line.cgst_amount, Decimal('180.00'))
        self.assertEqual(line.sgst_amount, Decimal('180.00'))
        self.assertEqual(line.line_total, Decimal('2360.00'))

    def test_tax_treatments_settings_crud_api(self):
        """14. Tax Treatments settings CRUD API (/tax-treatments/)."""
        self.client.force_authenticate(user=self.user)
        list_url = f"/api/v1/organisations/{self.org.id}/tax-treatments/"

        # POST
        payload = {
            'code': 'OUT_OF_SCOPE_FUEL',
            'name': 'Non-GST Fuel Treatment',
            'tax_regime': 'out_of_scope',
            'description': 'Out of scope non-GST petroleum supplies',
            'is_purchase_applicable': True,
            'is_sales_applicable': True
        }
        res = self.client.post(list_url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        treatment_id = res.json()['id']
        self.assertEqual(res.json()['code'], 'OUT_OF_SCOPE_FUEL')

        # GET detail
        detail_url = f"/api/v1/organisations/{self.org.id}/tax-treatments/{treatment_id}/"
        res = self.client.get(detail_url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.json()['name'], 'Non-GST Fuel Treatment')

        # PUT update
        res = self.client.put(detail_url, {'description': 'Updated description'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.json()['description'], 'Updated description')

        # POST deactivate
        deactivate_url = f"/api/v1/organisations/{self.org.id}/tax-treatments/{treatment_id}/deactivate/"
        res = self.client.post(deactivate_url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertFalse(res.json()['is_active'])
