# apps/inventory/tests.py
from datetime import date, time, datetime, timedelta
from decimal import Decimal
from django.test import TestCase
from django.urls import reverse
from django.core.exceptions import ValidationError, PermissionDenied
from django.db import IntegrityError
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

from apps.organizations.models import Organisation, Outlet, Role, PermissionDefinition, RolePermission, OrganisationMembership
from apps.organizations.services import create_organisation_with_owner, create_outlet, add_organisation_member, grant_outlet_access
from apps.employees.models import Employee, EmployeeDesignation
from apps.employees.services import create_employee, create_designation, assign_employee_to_outlets
from apps.forecourt.models import FuelProduct, Tank, Dispenser, Nozzle, ProductPrice
from apps.forecourt.services import create_fuel_product, create_tank, create_dispenser, create_nozzle, set_product_price
from apps.operations.models import OpeningBalanceBatch, TankOpeningBalance, NozzleOpeningBalance
from apps.operations.services import confirm_opening_balance_batch, commission_nozzle
from apps.shifts.models import ShiftDefinition, OperationalShift, EmployeeShiftCard
from apps.shifts.services import create_shift_definition, atomic_save_shift_card, void_shift_card
from apps.inventory.models import TankStockMovement, TankStockBalanceProjection, StockAdjustment
from apps.inventory.services import (
    post_tank_stock_movement, recalculate_tank_projection, get_or_create_tank_projection,
    record_stock_adjustment, reverse_stock_adjustment,
    sync_shift_card_stock_movements, reverse_shift_card_stock_movements,
    backfill_operational_stock_data
)
from apps.inventory.selectors import (
    get_tank_stock_summary, get_tank_movement_ledger,
    get_day_close_inventory_readiness
)

User = get_user_model()


class InventoryBaseTestCase(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(email="owner_inv@example.com", password="password")
        self.org = create_organisation_with_owner(name="Inventory Org", code="INVORG", owner_user=self.owner)
        self.outlet = create_outlet(self.org, name="Outlet Inv", code="INVOUT1")

        self.product = create_fuel_product(self.org, code="MS", name="Petrol", category="petrol", unit="litre")
        self.tank = create_tank(self.org, self.outlet, self.product, code="TK1", name="Main Tank", capacity=15000)

        self.dispenser = create_dispenser(self.org, self.outlet, code="D1", name="Dispenser 1")
        self.nozzle1 = create_nozzle(self.org, self.outlet, self.dispenser, self.tank, code="NZ1", name="Nozzle 1")

        self.designation = create_designation(self.org, code="DSM", name="Pump Attendant", requires_nozzle_assignment=True)
        self.emp1 = create_employee(self.org, employee_code="E01", display_name="Ali DSM", designation=self.designation)
        self.emp2 = create_employee(self.org, employee_code="E02", display_name="Hassan DSM", designation=self.designation)
        assign_employee_to_outlets(self.emp1, [{'outlet_id': self.outlet.id, 'is_primary': True}])
        assign_employee_to_outlets(self.emp2, [{'outlet_id': self.outlet.id, 'is_primary': True}])

        set_product_price(
            self.org, self.outlet, self.product,
            selling_price=Decimal('100.00'),
            effective_from=timezone.make_aware(datetime(2026, 1, 1, 0, 0)),
            created_by=self.owner
        )

        self.shift_def = create_shift_definition(
            self.org, self.outlet, code="S1", name="Day Shift",
            starts_at=time(6, 0), ends_at=time(14, 0)
        )

        commission_nozzle(
            organisation=self.org,
            outlet=self.outlet,
            nozzle=self.nozzle1,
            initial_totalizer=Decimal('1000.000'),
            effective_at=timezone.make_aware(datetime(2026, 8, 1, 0, 0)),
            reason="Initial commissioning NZ1",
            actor=self.owner
        )

        # Standard client
        self.client = APIClient()
        self.client.force_authenticate(user=self.owner)


class InventoryLedgerTests(InventoryBaseTestCase):

    def test_01_append_only_ledger_invariants(self):
        """1. TankStockMovement rejects updates and hard deletion."""
        mv = post_tank_stock_movement(
            organisation=self.org,
            outlet=self.outlet,
            tank=self.tank,
            fuel_product=self.product,
            product_code_snapshot=self.product.code,
            product_name_snapshot=self.product.name,
            movement_type=TankStockMovement.TYPE_INITIAL_OPENING_BALANCE,
            direction=TankStockMovement.DIR_IN,
            quantity=Decimal('5000.0000'),
            effective_at=timezone.now(),
            source_type='test',
            source_id=self.tank.id,
            idempotency_key="test_invar_1",
            created_by=self.owner
        )

        # Cannot edit
        mv.quantity = Decimal('6000.0000')
        with self.assertRaises(ValidationError):
            mv.save()

        # Cannot delete
        with self.assertRaises(ValidationError):
            mv.delete()

    def test_02_opening_balance_confirmation_posts_in_movement(self):
        """2. Confirming an OpeningBalanceBatch creates initial_opening_balance movement."""
        batch = OpeningBalanceBatch.objects.create(
            organisation=self.org,
            outlet=self.outlet,
            effective_at=timezone.make_aware(datetime(2026, 8, 1, 6, 0)),
            status=OpeningBalanceBatch.STATUS_PREPARING,
            created_by=self.owner
        )
        NozzleOpeningBalance.objects.create(batch=batch, nozzle=self.nozzle1, totalizer_reading=Decimal('1000.000'))
        TankOpeningBalance.objects.create(batch=batch, tank=self.tank, book_quantity=Decimal('8000.0000'), physical_quantity=Decimal('8000.0000'), manual_quantity_reason="Initial manual setup")

        confirm_opening_balance_batch(batch, self.owner)

        mvs = TankStockMovement.objects.filter(source_id=batch.id)
        self.assertEqual(mvs.count(), 1)
        mv = mvs.first()
        self.assertEqual(mv.movement_type, TankStockMovement.TYPE_INITIAL_OPENING_BALANCE)
        self.assertEqual(mv.quantity, Decimal('8000.0000'))
        self.assertEqual(mv.direction, TankStockMovement.DIR_IN)

        # Projection check
        proj = TankStockBalanceProjection.objects.get(tank=self.tank)
        self.assertEqual(proj.current_book_stock, Decimal('8000.0000'))

    def test_03_shift_card_gross_dispensing_and_testing_returns(self):
        """3. Shift Card gross dispensing posts OUT movement, returned testing posts IN movement, unreturned testing creates no IN movement."""
        # Initial stock 5000L
        post_tank_stock_movement(
            organisation=self.org,
            outlet=self.outlet,
            tank=self.tank,
            fuel_product=self.product,
            product_code_snapshot=self.product.code,
            product_name_snapshot=self.product.name,
            movement_type=TankStockMovement.TYPE_INITIAL_OPENING_BALANCE,
            direction=TankStockMovement.DIR_IN,
            quantity=Decimal('5000.0000'),
            effective_at=timezone.make_aware(datetime(2026, 9, 1, 0, 0)),
            source_type='test',
            source_id=self.tank.id,
            idempotency_key="open_test_3",
            created_by=self.owner
        )

        # Shift card with 100L gross dispensing, 5L testing returned, 2L testing unreturned (total testing 7L)
        b_date = date(2026, 9, 1)
        card = atomic_save_shift_card(
            organisation=self.org,
            outlet=self.outlet,
            user=self.owner,
            shift_definition=self.shift_def,
            business_date=b_date,
            employee=self.emp1,
            nozzle_meters_data=[
                {
                    'nozzle_id': str(self.nozzle1.id),
                    'opening_reading': '1000.000',
                    'closing_reading': '1100.000',  # Gross = 100L
                    'testing_quantity': '5.000',     # 5L returned to tank
                    'returned_to_tank': True,
                    'destination_tank_id': str(self.tank.id)
                }
            ],
            cash_data={'amount': '9500.00', 'denominations': []}
        )

        mvs = TankStockMovement.objects.filter(source_id=card.id)
        self.assertEqual(mvs.count(), 2)

        disp_mv = mvs.get(movement_type=TankStockMovement.TYPE_NOZZLE_DISPENSING)
        self.assertEqual(disp_mv.direction, TankStockMovement.DIR_OUT)
        self.assertEqual(disp_mv.quantity, Decimal('100.000'))

        test_mv = mvs.get(movement_type=TankStockMovement.TYPE_TESTING_RETURN)
        self.assertEqual(test_mv.direction, TankStockMovement.DIR_IN)
        self.assertEqual(test_mv.quantity, Decimal('5.000'))

        # Net stock: 5000 - 100 + 5 = 4905L
        proj = TankStockBalanceProjection.objects.get(tank=self.tank)
        self.assertEqual(proj.current_book_stock, Decimal('4905.0000'))

    def test_04_voiding_shift_card_reverses_movements(self):
        """4. Voiding an active Shift Card creates reversal movements."""
        post_tank_stock_movement(
            organisation=self.org,
            outlet=self.outlet,
            tank=self.tank,
            fuel_product=self.product,
            product_code_snapshot=self.product.code,
            product_name_snapshot=self.product.name,
            movement_type=TankStockMovement.TYPE_INITIAL_OPENING_BALANCE,
            direction=TankStockMovement.DIR_IN,
            quantity=Decimal('2000.0000'),
            effective_at=timezone.make_aware(datetime(2026, 9, 2, 0, 0)),
            source_type='test',
            source_id=self.tank.id,
            idempotency_key="open_test_4",
            created_by=self.owner
        )

        card = atomic_save_shift_card(
            organisation=self.org,
            outlet=self.outlet,
            user=self.owner,
            shift_definition=self.shift_def,
            business_date=date(2026, 9, 2),
            employee=self.emp1,
            nozzle_meters_data=[
                {
                    'nozzle_id': str(self.nozzle1.id),
                    'opening_reading': '1000.000',
                    'closing_reading': '1050.000',  # 50L
                    'testing_quantity': '0.000',
                }
            ],
            cash_data={'amount': '5000.00', 'denominations': []}
        )

        proj_before = TankStockBalanceProjection.objects.get(tank=self.tank)
        self.assertEqual(proj_before.current_book_stock, Decimal('1950.0000'))

        void_shift_card(card, self.owner, "Erroneous duplicate entry")

        reversals = TankStockMovement.objects.filter(
            source_id=card.id,
            movement_type=TankStockMovement.TYPE_REVERSAL
        )
        self.assertEqual(reversals.count(), 1)
        self.assertEqual(reversals.first().direction, TankStockMovement.DIR_IN)
        self.assertEqual(reversals.first().quantity, Decimal('50.000'))

        # Restored to 2000L
        proj_after = TankStockBalanceProjection.objects.get(tank=self.tank)
        self.assertEqual(proj_after.current_book_stock, Decimal('2000.0000'))

    def test_05_backdated_entry_and_chronology_conflict_detection(self):
        """5. Backdated entries recalculate running balances and flag negative history."""
        # 1. On Sept 3, 500L dispensed
        post_tank_stock_movement(
            organisation=self.org,
            outlet=self.outlet,
            tank=self.tank,
            fuel_product=self.product,
            product_code_snapshot=self.product.code,
            product_name_snapshot=self.product.name,
            movement_type=TankStockMovement.TYPE_NOZZLE_DISPENSING,
            direction=TankStockMovement.DIR_OUT,
            quantity=Decimal('500.0000'),
            effective_at=timezone.make_aware(datetime(2026, 9, 3, 10, 0)),
            source_type='test',
            source_id=self.tank.id,
            idempotency_key="disp_sept3",
            created_by=self.owner
        )

        # Projection is negative (-500L) and has chronology conflict
        proj = TankStockBalanceProjection.objects.get(tank=self.tank)
        self.assertEqual(proj.current_book_stock, Decimal('-500.0000'))
        self.assertTrue(proj.has_negative_balance_history)
        self.assertTrue(proj.has_chronology_conflict)

        # 2. Backdated delivery entered later, physically occurred on Sept 1 for 1000L
        post_tank_stock_movement(
            organisation=self.org,
            outlet=self.outlet,
            tank=self.tank,
            fuel_product=self.product,
            product_code_snapshot=self.product.code,
            product_name_snapshot=self.product.name,
            movement_type=TankStockMovement.TYPE_TANKER_RECEIPT,
            direction=TankStockMovement.DIR_IN,
            quantity=Decimal('1000.0000'),
            effective_at=timezone.make_aware(datetime(2026, 9, 1, 10, 0)),
            source_type='test',
            source_id=self.tank.id,
            idempotency_key="rcpt_sept1_backdated",
            created_by=self.owner
        )

        # Recalculates: +1000 on Sept 1, -500 on Sept 3 -> current balance = +500L, negative resolved!
        proj_updated = TankStockBalanceProjection.objects.get(tank=self.tank)
        self.assertEqual(proj_updated.current_book_stock, Decimal('500.0000'))
        self.assertFalse(proj_updated.has_negative_balance_history)
        self.assertFalse(proj_updated.has_chronology_conflict)

    def test_06_controlled_stock_adjustment_and_reversal(self):
        """6. Controlled stock adjustment creates immutable movements and can be reversed."""
        adj = record_stock_adjustment(
            organisation=self.org,
            outlet=self.outlet,
            tank=self.tank,
            adjustment_type=StockAdjustment.TYPE_INCREASE,
            quantity=Decimal('350.0000'),
            effective_at=timezone.make_aware(datetime(2026, 9, 4, 12, 0)),
            reason_category=StockAdjustment.REASON_CALIBRATION,
            explanation="Recalibrated tank baseline increase",
            user=self.owner
        )

        self.assertFalse(adj.is_reversed)
        proj = TankStockBalanceProjection.objects.get(tank=self.tank)
        self.assertEqual(proj.current_book_stock, Decimal('350.0000'))

        # Reverse adjustment
        reverse_stock_adjustment(adj, self.owner, "Entered incorrect calibration variance")
        self.assertTrue(adj.is_reversed)

        proj_after = TankStockBalanceProjection.objects.get(tank=self.tank)
        self.assertEqual(proj_after.current_book_stock, Decimal('0.0000'))

    def test_07_stock_ledger_query_and_day_close_readiness(self):
        """7. Ledger selector computes dynamic running balance and Day Close readiness exposes checks."""
        post_tank_stock_movement(
            organisation=self.org,
            outlet=self.outlet,
            tank=self.tank,
            fuel_product=self.product,
            product_code_snapshot=self.product.code,
            product_name_snapshot=self.product.name,
            movement_type=TankStockMovement.TYPE_INITIAL_OPENING_BALANCE,
            direction=TankStockMovement.DIR_IN,
            quantity=Decimal('1000.0000'),
            effective_at=timezone.make_aware(datetime(2026, 9, 5, 8, 0)),
            source_type='test',
            source_id=self.tank.id,
            idempotency_key="ledger_test_open",
            created_by=self.owner
        )
        post_tank_stock_movement(
            organisation=self.org,
            outlet=self.outlet,
            tank=self.tank,
            fuel_product=self.product,
            product_code_snapshot=self.product.code,
            product_name_snapshot=self.product.name,
            movement_type=TankStockMovement.TYPE_NOZZLE_DISPENSING,
            direction=TankStockMovement.DIR_OUT,
            quantity=Decimal('200.0000'),
            effective_at=timezone.make_aware(datetime(2026, 9, 5, 12, 0)),
            source_type='test',
            source_id=self.tank.id,
            idempotency_key="ledger_test_disp",
            created_by=self.owner
        )

        ledger = get_tank_movement_ledger(self.org, self.outlet, self.tank.id)
        self.assertEqual(ledger['total_movements'], 2)
        # First entry in reversed list is the latest (dispensing), running balance 800
        self.assertEqual(ledger['movements'][0]['running_balance'], Decimal('800.0000'))
        # Second entry is opening balance, running balance 1000
        self.assertEqual(ledger['movements'][1]['running_balance'], Decimal('1000.0000'))

        readiness = get_day_close_inventory_readiness(self.org, self.outlet)
        self.assertTrue(readiness['ready'])

    def test_08_database_level_idempotency_constraint(self):
        """8. Database unique constraint prevents duplicate active movements even with different idempotency keys."""
        import uuid
        from django.db import IntegrityError

        dummy_source_id = uuid.uuid4()
        dummy_line_id = uuid.uuid4()

        # Insert first movement
        TankStockMovement.objects.create(
            organisation=self.org,
            outlet=self.outlet,
            tank=self.tank,
            fuel_product=self.product,
            product_code_snapshot=self.product.code,
            product_name_snapshot=self.product.name,
            movement_type=TankStockMovement.TYPE_NOZZLE_DISPENSING,
            direction=TankStockMovement.DIR_OUT,
            quantity=Decimal('50.0000'),
            effective_at=timezone.now(),
            source_type='shift_card_meter',
            source_id=dummy_source_id,
            source_line_id=dummy_line_id,
            idempotency_key="key_attempt_1"
        )

        # Attempt to insert second movement with same (source_type, source_id, source_line_id, movement_type, tank)
        with self.assertRaises((ValidationError, IntegrityError)):
            TankStockMovement.objects.create(
                organisation=self.org,
                outlet=self.outlet,
                tank=self.tank,
                fuel_product=self.product,
                product_code_snapshot=self.product.code,
                product_name_snapshot=self.product.name,
                movement_type=TankStockMovement.TYPE_NOZZLE_DISPENSING,
                direction=TankStockMovement.DIR_OUT,
                quantity=Decimal('75.0000'),
                effective_at=timezone.now(),
                source_type='shift_card_meter',
                source_id=dummy_source_id,
                source_line_id=dummy_line_id,
                idempotency_key="key_attempt_2_different_key"
            )

    def test_09_historical_nozzle_to_tank_mapping_after_reassignment(self):
        """9. Shift Cards use the immutable tank snapshot at shift time, not nozzle's current assignment."""
        tank2 = create_tank(self.org, self.outlet, self.product, code="TK2", name="Tank 2", capacity=20000)

        # Day 1: nozzle1 is connected to tank1
        card1 = atomic_save_shift_card(
            organisation=self.org,
            outlet=self.outlet,
            user=self.owner,
            shift_definition=self.shift_def,
            business_date=date(2026, 9, 1),
            employee=self.emp1,
            nozzle_meters_data=[{
                'nozzle_id': self.nozzle1.id,
                'opening_reading': Decimal('1000.000'),
                'closing_reading': Decimal('1100.000')
            }],
            cash_data={'amount': Decimal('10000.00')}
        )

        meter1 = card1.meters.get(nozzle=self.nozzle1)
        self.assertEqual(meter1.tank_id, self.tank.id)

        mv1 = TankStockMovement.objects.get(
            source_id=card1.id,
            source_line_id=meter1.id,
            movement_type=TankStockMovement.TYPE_NOZZLE_DISPENSING
        )
        self.assertEqual(mv1.tank_id, self.tank.id)

        # Now reassign nozzle1 to tank2
        self.nozzle1.tank = tank2
        self.nozzle1.save()

        # Day 2: nozzle1 is now connected to tank2
        card2 = atomic_save_shift_card(
            organisation=self.org,
            outlet=self.outlet,
            user=self.owner,
            shift_definition=self.shift_def,
            business_date=date(2026, 9, 2),
            employee=self.emp1,
            nozzle_meters_data=[{
                'nozzle_id': self.nozzle1.id,
                'opening_reading': Decimal('1100.000'),
                'closing_reading': Decimal('1250.000')
            }],
            cash_data={'amount': Decimal('15000.00')}
        )

        meter2 = card2.meters.get(nozzle=self.nozzle1)
        self.assertEqual(meter2.tank_id, tank2.id)

        mv2 = TankStockMovement.objects.get(
            source_id=card2.id,
            source_line_id=meter2.id,
            movement_type=TankStockMovement.TYPE_NOZZLE_DISPENSING
        )
        self.assertEqual(mv2.tank_id, tank2.id)

        # Re-sync card1: historical movement MUST remain on tank1!
        sync_shift_card_stock_movements(card1, self.owner)
        mv1_rechecked = TankStockMovement.objects.get(
            source_id=card1.id,
            source_line_id=meter1.id,
            movement_type=TankStockMovement.TYPE_NOZZLE_DISPENSING
        )
        self.assertEqual(mv1_rechecked.tank_id, self.tank.id)

    def test_10_synchronous_projection_freshness(self):
        """10. TankStockBalanceProjection updates synchronously after every movement and adjustment."""
        proj = get_or_create_tank_projection(self.tank)
        initial_stock = proj.current_book_stock

        # Record adjustment
        adj = record_stock_adjustment(
            organisation=self.org,
            outlet=self.outlet,
            tank=self.tank,
            adjustment_type=StockAdjustment.TYPE_INCREASE,
            quantity=Decimal('420.0000'),
            effective_at=timezone.now(),
            reason_category=StockAdjustment.REASON_CALIBRATION,
            explanation="Calibration baseline increase",
            user=self.owner
        )

        proj.refresh_from_db()
        self.assertEqual(proj.current_book_stock, initial_stock + Decimal('420.0000'))

        # Reverse adjustment
        reverse_stock_adjustment(adj, self.owner, "Reversing calibration baseline")
        proj.refresh_from_db()
        self.assertEqual(proj.current_book_stock, initial_stock)

    def test_11_attachment_tenant_authorization_security(self):
        """11. Stock adjustment attachments cannot be accessed by unauthorized / other-tenant users."""
        adj = record_stock_adjustment(
            organisation=self.org,
            outlet=self.outlet,
            tank=self.tank,
            adjustment_type=StockAdjustment.TYPE_INCREASE,
            quantity=Decimal('100.0000'),
            effective_at=timezone.now(),
            reason_category=StockAdjustment.REASON_OTHER,
            explanation="Adjustment with document",
            user=self.owner,
            attachment_file=SimpleUploadedFile("memo.pdf", b"%PDF-1.4 test memo content", content_type="application/pdf")
        )

        # Authorized download succeeds
        url = reverse('stock_adjustment_attachment_download', kwargs={
            'org_id': self.org.id,
            'outlet_id': self.outlet.id,
            'adj_id': adj.id
        })
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        # Unauthorized user from another organisation
        other_user = User.objects.create_user(email="intruder@example.com", password="password")
        other_org = create_organisation_with_owner(name="Other Org", code="OTHER", owner_user=other_user)
        other_client = APIClient()
        other_client.force_authenticate(user=other_user)

        # Cross-tenant access fails with 403 Forbidden
        resp_unauth = other_client.get(url)
        self.assertEqual(resp_unauth.status_code, status.HTTP_403_FORBIDDEN)

    def test_12_backfill_idempotent_double_run(self):
        """12. Running the backfill twice results in exactly zero new movements on the second run."""
        # Setup active shift card
        atomic_save_shift_card(
            organisation=self.org,
            outlet=self.outlet,
            user=self.owner,
            shift_definition=self.shift_def,
            business_date=date(2026, 9, 3),
            employee=self.emp1,
            nozzle_meters_data=[{
                'nozzle_id': self.nozzle1.id,
                'opening_reading': Decimal('1000.000'),
                'closing_reading': Decimal('1080.000')
            }],
            cash_data={'amount': Decimal('8000.00')}
        )

        # First backfill run
        res1 = backfill_operational_stock_data(self.org, self.outlet)
        count_after_run1 = TankStockMovement.objects.count()

        # Second backfill run
        res2 = backfill_operational_stock_data(self.org, self.outlet)
        count_after_run2 = TankStockMovement.objects.count()

        self.assertEqual(count_after_run1, count_after_run2)
        self.assertEqual(res2['new_movements_created'], 0)
