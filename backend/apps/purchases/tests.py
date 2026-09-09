# apps/purchases/tests.py
from datetime import date, datetime
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
    Organisation, Outlet, Role, PermissionDefinition,
    RolePermission, OrganisationMembership, MembershipRole
)
from apps.organizations.services import create_organisation_with_owner, create_outlet, add_organisation_member, grant_outlet_access
from apps.forecourt.models import FuelProduct, Tank, Dispenser, Nozzle
from apps.forecourt.services import create_fuel_product, create_tank, create_dispenser, create_nozzle
from apps.operations.models import DipCalibrationChart, DipCalibrationPoint, TankCalibrationAssignment
from apps.operations.services import activate_calibration_chart, assign_calibration_chart_to_tank
from apps.purchases.models import Supplier, TankerReceipt, TankerReceiptProductLine, TankerReceiptTankAllocation
from apps.purchases.services import (
    create_supplier, create_tanker_receipt, update_tanker_receipt,
    confirm_tanker_receipt, void_tanker_receipt, acknowledge_receipt_variance
)
from apps.inventory.models import TankStockMovement, TankStockBalanceProjection

User = get_user_model()


class PurchasesBaseTestCase(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(email="owner_purchases@example.com", password="password")
        self.org = create_organisation_with_owner(name="Purchases Org", code="PORG", owner_user=self.owner)
        self.outlet = create_outlet(self.org, name="Outlet 1", code="OUT1")

        # Products
        self.petrol = create_fuel_product(self.org, code="MS", name="Petrol", category="petrol", unit="litre")
        self.diesel = create_fuel_product(self.org, code="HSD", name="Diesel", category="diesel", unit="litre")

        # Tanks
        self.tank_ms_1 = create_tank(self.org, self.outlet, self.petrol, code="TK_MS1", name="Petrol Tank 1", capacity=15000)
        self.tank_ms_2 = create_tank(self.org, self.outlet, self.petrol, code="TK_MS2", name="Petrol Tank 2", capacity=15000)
        self.tank_hsd_1 = create_tank(self.org, self.outlet, self.diesel, code="TK_HSD1", name="Diesel Tank 1", capacity=20000)

        # Calibration chart for tank_ms_1
        self.chart = DipCalibrationChart.objects.create(
            organisation=self.org,
            name="Chart 15KL",
            nominal_capacity=Decimal('15000'),
            original_height_unit=DipCalibrationChart.UNIT_MM,
            lookup_mode=DipCalibrationChart.LOOKUP_INTERPOLATE,
            status=DipCalibrationChart.STATUS_DRAFT
        )
        DipCalibrationPoint.objects.create(chart=self.chart, height_mm=Decimal('0'), volume_litres=Decimal('0'), sequence=0)
        DipCalibrationPoint.objects.create(chart=self.chart, height_mm=Decimal('1000'), volume_litres=Decimal('7500'), sequence=1)
        DipCalibrationPoint.objects.create(chart=self.chart, height_mm=Decimal('2000'), volume_litres=Decimal('15000'), sequence=2)
        activate_calibration_chart(self.chart)

        self.assignment = assign_calibration_chart_to_tank(
            organisation=self.org,
            outlet=self.outlet,
            tank=self.tank_ms_1,
            chart=self.chart,
            effective_from=timezone.make_aware(datetime(2026, 1, 1, 0, 0)),
            user=self.owner
        )

        # Supplier
        self.supplier = create_supplier(
            organisation=self.org,
            code="ARAMCO",
            name="Saudi Aramco",
            contact_person="Ahmed",
            phone="0501234567"
        )

        # Standard manager user
        self.manager_user = User.objects.create_user(email="manager_purchases@example.com", password="password")
        self.manager_membership = add_organisation_member(
            self.org, self.manager_user,
            membership_type=OrganisationMembership.TYPE_ADMINISTRATOR
        )
        grant_outlet_access(self.manager_membership, self.outlet)

        # Regular member user (no override permissions)
        self.operator_user = User.objects.create_user(email="operator_purchases@example.com", password="password")
        self.operator_membership = add_organisation_member(
            self.org, self.operator_user,
            membership_type=OrganisationMembership.TYPE_MEMBER,
            status=OrganisationMembership.STATUS_ACTIVE
        )
        grant_outlet_access(self.operator_membership, self.outlet)

        # Assign role with tanker_receipt view/create/confirm but NO override_book_quantity
        self.operator_role = Role.objects.create(organisation=self.org, name="OperatorRole")
        for code in ['tanker_receipt.view', 'tanker_receipt.create', 'tanker_receipt.confirm']:
            perm = PermissionDefinition.objects.get(code=code)
            RolePermission.objects.create(role=self.operator_role, permission=perm)
        MembershipRole.objects.create(membership=self.operator_membership, role=self.operator_role)

        self.client = APIClient()
        self.client.force_authenticate(user=self.owner)


class TankerReceiptDomainTests(PurchasesBaseTestCase):

    def test_01_multi_product_tanker_receipt_and_allocations(self):
        """1. One receipt containing multiple fuel products, allocated across compatible tanks."""
        receipt = create_tanker_receipt(
            organisation=self.org,
            outlet=self.outlet,
            receipt_number="TR-2026-001",
            supplier=self.supplier,
            invoice_number="INV-1001",
            invoice_date=date(2026, 9, 1),
            vehicle_registration="KSA-9999",
            unloading_end_time=timezone.make_aware(datetime(2026, 9, 1, 10, 0)),
            product_lines_data=[
                {
                    'product': self.petrol,
                    'invoice_quantity': Decimal('10000.0000'),
                    'accepted_book_quantity': Decimal('10000.0000'),
                    'unit_rate': Decimal('2.30'),
                    'allocations': [
                        {'tank': self.tank_ms_1, 'allocated_book_quantity': Decimal('6000.0000')},
                        {'tank': self.tank_ms_2, 'allocated_book_quantity': Decimal('4000.0000')},
                    ]
                },
                {
                    'product': self.diesel,
                    'invoice_quantity': Decimal('5000.0000'),
                    'accepted_book_quantity': Decimal('5000.0000'),
                    'unit_rate': Decimal('1.15'),
                    'allocations': [
                        {'tank': self.tank_hsd_1, 'allocated_book_quantity': Decimal('5000.0000')},
                    ]
                }
            ],
            user=self.owner
        )

        self.assertEqual(receipt.status, TankerReceipt.STATUS_RECORDED)
        self.assertEqual(receipt.product_lines.count(), 2)

        # Check server-calculated total value
        ms_line = receipt.product_lines.get(product=self.petrol)
        self.assertEqual(ms_line.total_value, Decimal('23000.00'))
        self.assertEqual(ms_line.allocations.count(), 2)

        # Confirm receipt
        confirmed = confirm_tanker_receipt(receipt.id, self.owner)
        self.assertEqual(confirmed.status, TankerReceipt.STATUS_CONFIRMED)
        self.assertIsNotNone(confirmed.confirmed_at)

        # Check stock movements
        mvs = TankStockMovement.objects.filter(source_id=receipt.id)
        self.assertEqual(mvs.count(), 3)  # 2 for petrol tanks + 1 for diesel tank
        self.assertTrue(all(m.movement_type == TankStockMovement.TYPE_TANKER_RECEIPT for m in mvs))
        self.assertTrue(all(m.direction == TankStockMovement.DIR_IN for m in mvs))

        # Check projection updated
        proj1 = TankStockBalanceProjection.objects.get(tank=self.tank_ms_1)
        self.assertEqual(proj1.current_book_stock, Decimal('6000.0000'))
        proj2 = TankStockBalanceProjection.objects.get(tank=self.tank_ms_2)
        self.assertEqual(proj2.current_book_stock, Decimal('4000.0000'))

    def test_02_allocation_total_mismatch_rejection_on_confirmation(self):
        """2. Confirmation rejects when tank allocations do not sum to accepted quantity."""
        receipt = create_tanker_receipt(
            organisation=self.org,
            outlet=self.outlet,
            receipt_number="TR-MISMATCH",
            supplier=self.supplier,
            invoice_number="INV-1002",
            invoice_date=date(2026, 9, 2),
            vehicle_registration="KSA-1234",
            unloading_end_time=timezone.make_aware(datetime(2026, 9, 2, 10, 0)),
            product_lines_data=[
                {
                    'product': self.petrol,
                    'invoice_quantity': Decimal('10000.0000'),
                    'accepted_book_quantity': Decimal('10000.0000'),
                    'allocations': [
                        {'tank': self.tank_ms_1, 'allocated_book_quantity': Decimal('6000.0000')},
                        # Total 9000 != 10000
                        {'tank': self.tank_ms_2, 'allocated_book_quantity': Decimal('3000.0000')},
                    ]
                }
            ],
            user=self.owner
        )

        with self.assertRaises(ValidationError) as ctx:
            confirm_tanker_receipt(receipt.id, self.owner)
        self.assertIn("Allocation mismatch", str(ctx.exception))

    def test_03_cross_tenant_and_cross_outlet_rejection(self):
        """3. Cross-tenant and cross-outlet tank/supplier validation."""
        other_user = User.objects.create_user(email="other_owner@example.com", password="password")
        other_org = create_organisation_with_owner("Other Org", "OTH", other_user)
        other_outlet = create_outlet(other_org, "Other Outlet", "OTHOUT1")
        other_prod = create_fuel_product(other_org, code="MS_OTHER", name="Other Petrol", category="petrol", unit="litre")
        other_tank = create_tank(other_org, other_outlet, other_prod, code="TK_OTHER", name="Other Tank", capacity=10000)

        # Attempt to allocate to a tank from another outlet
        with self.assertRaises(ValidationError):
            create_tanker_receipt(
                organisation=self.org,
                outlet=self.outlet,
                receipt_number="TR-CROSSTENANT",
                supplier=self.supplier,
                invoice_number="INV-CROSS",
                invoice_date=date(2026, 9, 3),
                vehicle_registration="KSA-0000",
                unloading_end_time=timezone.make_aware(datetime(2026, 9, 3, 10, 0)),
                product_lines_data=[
                    {
                        'product': self.petrol,
                        'invoice_quantity': Decimal('5000.0000'),
                        'accepted_book_quantity': Decimal('5000.0000'),
                        'allocations': [
                            {'tank': other_tank, 'allocated_book_quantity': Decimal('5000.0000')},
                        ]
                    }
                ],
                user=self.owner
            )

    def test_04_product_and_tank_compatibility_enforcement(self):
        """4. Reject allocating a petrol line to a diesel tank."""
        with self.assertRaises(ValidationError):
            create_tanker_receipt(
                organisation=self.org,
                outlet=self.outlet,
                receipt_number="TR-PROD-MISMATCH",
                supplier=self.supplier,
                invoice_number="INV-PMISMATCH",
                invoice_date=date(2026, 9, 4),
                vehicle_registration="KSA-1111",
                unloading_end_time=timezone.make_aware(datetime(2026, 9, 4, 10, 0)),
                product_lines_data=[
                    {
                        'product': self.petrol,
                        'invoice_quantity': Decimal('5000.0000'),
                        'accepted_book_quantity': Decimal('5000.0000'),
                        'allocations': [
                            # tank_hsd_1 is Diesel!
                            {'tank': self.tank_hsd_1, 'allocated_book_quantity': Decimal('5000.0000')},
                        ]
                    }
                ],
                user=self.owner
            )

    def test_05_calibrated_dip_gain_and_variance_calculation(self):
        """5. Calibrated dip conversion, physical dip gain, and variance calculation."""
        # Pre-dip: 500mm -> 3750L (interpolated from 0-1000mm)
        # Post-dip: 1500mm -> 11250L (interpolated from 1000-2000mm)
        # Dip gain: 11250 - 3750 = 7500L
        # Allocated: 7600L
        # Variance: 7500 - 7600 = -100L (shortage)
        receipt = create_tanker_receipt(
            organisation=self.org,
            outlet=self.outlet,
            receipt_number="TR-DIP-VAR",
            supplier=self.supplier,
            invoice_number="INV-DIP-1",
            invoice_date=date(2026, 9, 5),
            vehicle_registration="KSA-5555",
            unloading_end_time=timezone.make_aware(datetime(2026, 9, 5, 12, 0)),
            product_lines_data=[
                {
                    'product': self.petrol,
                    'invoice_quantity': Decimal('7600.0000'),
                    'accepted_book_quantity': Decimal('7600.0000'),
                    'allocations': [
                        {
                            'tank': self.tank_ms_1,
                            'allocated_book_quantity': Decimal('7600.0000'),
                            'pre_unloading_dip_height': Decimal('500.0000'),
                            'pre_unloading_dip_unit': 'millimetre',
                            'post_unloading_dip_height': Decimal('1500.0000'),
                            'post_unloading_dip_unit': 'millimetre',
                        }
                    ]
                }
            ],
            user=self.owner
        )

        alloc = receipt.product_lines.first().allocations.first()
        self.assertEqual(alloc.pre_unloading_volume, Decimal('3750.0000'))
        self.assertEqual(alloc.post_unloading_volume, Decimal('11250.0000'))
        self.assertEqual(alloc.physical_dip_gain, Decimal('7500.0000'))
        self.assertEqual(alloc.variance, Decimal('-100.0000'))
        self.assertEqual(alloc.variance_status, TankerReceiptTankAllocation.STATUS_SHORTAGE)

        # Acknowledge variance
        acknowledged_alloc = acknowledge_receipt_variance(alloc.id, self.owner, "Transit evaporation acknowledged")
        self.assertEqual(acknowledged_alloc.variance_status, TankerReceiptTankAllocation.STATUS_ACKNOWLEDGED)
        self.assertEqual(acknowledged_alloc.variance, Decimal('-100.0000'))  # Not modified!

    def test_06_accepted_book_quantity_override_permission_and_reason(self):
        """6. Accepted book quantity override requires permission and reason."""
        # Without reason -> fails
        with self.assertRaises(ValidationError):
            create_tanker_receipt(
                organisation=self.org,
                outlet=self.outlet,
                receipt_number="TR-OVERRIDE-1",
                supplier=self.supplier,
                invoice_number="INV-OVR-1",
                invoice_date=date(2026, 9, 6),
                vehicle_registration="KSA-7777",
                unloading_end_time=timezone.make_aware(datetime(2026, 9, 6, 10, 0)),
                product_lines_data=[
                    {
                        'product': self.petrol,
                        'invoice_quantity': Decimal('10000.0000'),
                        'accepted_book_quantity': Decimal('9900.0000'),  # Differs!
                        'quantity_override_reason': None,  # Missing!
                        'allocations': [{'tank': self.tank_ms_1, 'allocated_book_quantity': Decimal('9900.0000')}]
                    }
                ],
                user=self.owner
            )

        # With reason but operator user without override permission -> confirm fails
        receipt = create_tanker_receipt(
            organisation=self.org,
            outlet=self.outlet,
            receipt_number="TR-OVERRIDE-2",
            supplier=self.supplier,
            invoice_number="INV-OVR-2",
            invoice_date=date(2026, 9, 6),
            vehicle_registration="KSA-7777",
            unloading_end_time=timezone.make_aware(datetime(2026, 9, 6, 10, 0)),
            product_lines_data=[
                {
                    'product': self.petrol,
                    'invoice_quantity': Decimal('10000.0000'),
                    'accepted_book_quantity': Decimal('9900.0000'),
                    'quantity_override_reason': "Short delivery at terminal",
                    'allocations': [{'tank': self.tank_ms_1, 'allocated_book_quantity': Decimal('9900.0000')}]
                }
            ],
            user=self.operator_user
        )

        with self.assertRaises(PermissionDenied):
            confirm_tanker_receipt(receipt.id, self.operator_user)

        # Owner has full permission -> confirm succeeds
        confirmed = confirm_tanker_receipt(receipt.id, self.owner)
        self.assertEqual(confirmed.status, TankerReceipt.STATUS_CONFIRMED)

    def test_07_confirmation_idempotency_and_immutable_ledger(self):
        """7. Confirmation is idempotent and posts immutable movements once."""
        receipt = create_tanker_receipt(
            organisation=self.org,
            outlet=self.outlet,
            receipt_number="TR-IDEMP-1",
            supplier=self.supplier,
            invoice_number="INV-IDEMP-1",
            invoice_date=date(2026, 9, 7),
            vehicle_registration="KSA-8888",
            unloading_end_time=timezone.make_aware(datetime(2026, 9, 7, 10, 0)),
            product_lines_data=[
                {
                    'product': self.petrol,
                    'invoice_quantity': Decimal('5000.0000'),
                    'accepted_book_quantity': Decimal('5000.0000'),
                    'allocations': [{'tank': self.tank_ms_1, 'allocated_book_quantity': Decimal('5000.0000')}]
                }
            ],
            user=self.owner
        )

        receipt = confirm_tanker_receipt(receipt.id, self.owner)
        mvs_count = TankStockMovement.objects.filter(source_id=receipt.id).count()
        self.assertEqual(mvs_count, 1)

        # Calling confirm again should be idempotent
        receipt = confirm_tanker_receipt(receipt.id, self.owner)
        mvs_count_after = TankStockMovement.objects.filter(source_id=receipt.id).count()
        self.assertEqual(mvs_count_after, 1)

        # Confirmed receipt cannot be edited
        with self.assertRaises(ValidationError):
            update_tanker_receipt(receipt, {'notes': "Attempted edit"}, self.owner)

        # Confirmed receipt cannot be hard-deleted
        with self.assertRaises(ValidationError):
            receipt.delete()

    def test_08_voiding_creates_reversal_movements(self):
        """8. Voiding creates reversal movements in the ledger."""
        receipt = create_tanker_receipt(
            organisation=self.org,
            outlet=self.outlet,
            receipt_number="TR-VOID-1",
            supplier=self.supplier,
            invoice_number="INV-VOID-1",
            invoice_date=date(2026, 9, 8),
            vehicle_registration="KSA-3333",
            unloading_end_time=timezone.make_aware(datetime(2026, 9, 8, 10, 0)),
            product_lines_data=[
                {
                    'product': self.petrol,
                    'invoice_quantity': Decimal('4000.0000'),
                    'accepted_book_quantity': Decimal('4000.0000'),
                    'allocations': [{'tank': self.tank_ms_1, 'allocated_book_quantity': Decimal('4000.0000')}]
                }
            ],
            user=self.owner
        )

        confirm_tanker_receipt(receipt.id, self.owner)
        proj_before = TankStockBalanceProjection.objects.get(tank=self.tank_ms_1)
        self.assertEqual(proj_before.current_book_stock, Decimal('4000.0000'))

        # Void receipt
        voided = void_tanker_receipt(receipt.id, self.owner, "Decanted into wrong station by mistake")
        self.assertEqual(voided.status, TankerReceipt.STATUS_VOIDED)

        # Check reversal movement
        mvs = TankStockMovement.objects.filter(source_id=receipt.id)
        self.assertEqual(mvs.count(), 2)  # Original IN + Reversal OUT
        rev = mvs.get(movement_type=TankStockMovement.TYPE_REVERSAL)
        self.assertEqual(rev.direction, TankStockMovement.DIR_OUT)
        self.assertEqual(rev.quantity, Decimal('4000.0000'))

        # Projection back to zero
        proj_after = TankStockBalanceProjection.objects.get(tank=self.tank_ms_1)
        self.assertEqual(proj_after.current_book_stock, Decimal('0.0000'))

    def test_09_secure_attachment_upload_and_download(self):
        """9. Secure attachment upload and authorized download."""
        receipt = create_tanker_receipt(
            organisation=self.org,
            outlet=self.outlet,
            receipt_number="TR-ATT-1",
            supplier=self.supplier,
            invoice_number="INV-ATT-1",
            invoice_date=date(2026, 9, 9),
            vehicle_registration="KSA-4444",
            unloading_end_time=timezone.make_aware(datetime(2026, 9, 9, 10, 0)),
            product_lines_data=[],
            user=self.owner
        )

        test_file = SimpleUploadedFile("invoice.pdf", b"%PDF-1.4 sample invoice content", content_type="application/pdf")
        upload_url = reverse('tanker_receipt_attachment_upload', kwargs={
            'org_id': self.org.id,
            'outlet_id': self.outlet.id,
            'receipt_id': receipt.id
        })

        resp = self.client.post(upload_url, {'file': test_file, 'attachment_type': 'invoice'}, format='multipart')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        att_id = resp.data['id']

        # Download attachment
        download_url = reverse('tanker_receipt_attachment_download', kwargs={
            'org_id': self.org.id,
            'outlet_id': self.outlet.id,
            'receipt_id': receipt.id,
            'att_id': att_id
        })
        dl_resp = self.client.get(download_url)
        self.assertEqual(dl_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(dl_resp['Content-Type'], 'application/pdf')

        # Cross-tenant unauthorized access attempt fails with 403 Forbidden
        other_user = User.objects.create_user(email="intruder_purchases@example.com", password="password")
        other_org = create_organisation_with_owner(name="Other Purchases Org", code="OTHERP", owner_user=other_user)
        other_client = APIClient()
        other_client.force_authenticate(user=other_user)

        dl_unauth_resp = other_client.get(download_url)
        self.assertEqual(dl_unauth_resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_10_historical_supplier_snapshot_preservation(self):
        """10. Renaming or deactivating a supplier does not mutate historical receipt presentation."""
        receipt = create_tanker_receipt(
            organisation=self.org,
            outlet=self.outlet,
            receipt_number="TR-SNAP-1",
            supplier=self.supplier,
            invoice_number="INV-SNAP-1",
            invoice_date=date(2026, 9, 9),
            vehicle_registration="KSA-8888",
            unloading_end_time=timezone.make_aware(datetime(2026, 9, 9, 10, 0)),
            product_lines_data=[],
            user=self.owner
        )

        self.assertEqual(receipt.supplier_name_snapshot, "Saudi Aramco")
        self.assertEqual(receipt.supplier_code_snapshot, "ARAMCO")

        # Rename and deactivate supplier
        self.supplier.name = "Aramco Distribution Commercial LLC"
        self.supplier.code = "ARAMCO_RENAMED"
        self.supplier.is_active = False
        self.supplier.save()

        # Receipt snapshot fields remain completely unchanged
        receipt.refresh_from_db()
        self.assertEqual(receipt.supplier_name_snapshot, "Saudi Aramco")
        self.assertEqual(receipt.supplier_code_snapshot, "ARAMCO")

        # API responses render the historical snapshot, not the modified supplier entity
        list_url = reverse('tanker_receipt_list_create', kwargs={'org_id': self.org.id, 'outlet_id': self.outlet.id})
        list_resp = self.client.get(list_url)
        self.assertEqual(list_resp.status_code, status.HTTP_200_OK)
        found = [r for r in list_resp.data if r['id'] == str(receipt.id)][0]
        self.assertEqual(found['supplier_name'], "Saudi Aramco")
        self.assertEqual(found['supplier_code_snapshot'], "ARAMCO")

    def test_11_variance_acknowledgement_api_safeguards(self):
        """11. Variance acknowledgement records actor, timestamp, and mandatory reason without altering calculated variance."""
        receipt = create_tanker_receipt(
            organisation=self.org,
            outlet=self.outlet,
            receipt_number="TR-ACK-API-1",
            supplier=self.supplier,
            invoice_number="INV-ACK-1",
            invoice_date=date(2026, 9, 9),
            vehicle_registration="KSA-9999",
            unloading_end_time=timezone.make_aware(datetime(2026, 9, 9, 10, 0)),
            product_lines_data=[{
                'product': self.petrol,
                'invoice_quantity': Decimal('4000.0000'),
                'accepted_book_quantity': Decimal('4000.0000'),
                'allocations': [{
                    'tank': self.tank_ms_1,
                    'allocated_book_quantity': Decimal('4000.0000'),
                    'pre_unloading_dip_height': Decimal('200.0000'),
                    'pre_unloading_dip_unit': 'millimetre',
                    'post_unloading_dip_height': Decimal('720.0000'),
                    'post_unloading_dip_unit': 'millimetre',  # 200mm->1500L, 720mm->5400L, gain=3900L, variance=-100L
                }]
            }],
            user=self.owner
        )

        alloc = receipt.product_lines.first().allocations.first()
        self.assertEqual(alloc.variance, Decimal('-100.0000'))
        self.assertEqual(alloc.variance_status, TankerReceiptTankAllocation.STATUS_SHORTAGE)

        # Acknowledge via API
        ack_url = reverse('variance_acknowledge', kwargs={
            'org_id': self.org.id,
            'outlet_id': self.outlet.id,
            'alloc_id': alloc.id
        })

        # Missing reason fails with 400
        fail_resp = self.client.post(ack_url, {'acknowledgement_reason': ''}, format='json')
        self.assertEqual(fail_resp.status_code, status.HTTP_400_BAD_REQUEST)

        # Valid acknowledgement succeeds
        ack_resp = self.client.post(ack_url, {'acknowledgement_reason': "Approved road transit loss within company tolerance"}, format='json')
        self.assertEqual(ack_resp.status_code, status.HTTP_200_OK)

        alloc.refresh_from_db()
        self.assertEqual(alloc.variance_status, TankerReceiptTankAllocation.STATUS_ACKNOWLEDGED)
        self.assertEqual(alloc.variance_acknowledged_by, self.owner)
        self.assertIsNotNone(alloc.variance_acknowledged_at)
        self.assertEqual(alloc.variance_acknowledgement_reason, "Approved road transit loss within company tolerance")
        # Calculated variance volume must remain exactly -100.0000 L!
        self.assertEqual(alloc.variance, Decimal('-100.0000'))
