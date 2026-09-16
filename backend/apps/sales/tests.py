from datetime import date
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.test import TestCase
from rest_framework.test import APIClient

from apps.finance.models import PaymentAccountMovement
from apps.accounting.models import JournalEntry
from apps.accounting.services import reverse_journal
from apps.finance.services import create_payment_account
from apps.inventory.models import Item, ItemStockBalanceProjection, ItemStockMovement, UnitMaster
from apps.inventory.services import create_item_stock_adjustment
from apps.inventory.services_item import create_canonical_item
from apps.organizations.models import FinancialYear
from apps.organizations.services import create_organisation_with_owner, create_outlet
from apps.purchases.models import ItemPurchaseTaxTreatment, PurchaseTaxCode
from apps.purchases.services import create_purchase_tax_code, create_purchase_tax_code_rate
from apps.shifts.services import create_customer
from apps.users.models import User

from .models import CustomerReceipt, SalesInvoice
from .selectors import customer_outstanding
from .services import create_customer_receipt, create_sales_invoice, void_customer_receipt, void_sales_invoice


class SalesInvoiceTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email='sales-owner@example.com', password='secret')
        self.org = create_organisation_with_owner(name='Sales Fuels', code='SF', owner_user=self.user)
        self.org.state_code = '32'; self.org.save()
        self.outlet = create_outlet(self.org, name='Main Outlet', code='MAIN')
        FinancialYear.objects.create(
            organisation=self.org, name='FY 2026', start_date=date(2026, 1, 1),
            end_date=date(2026, 12, 31), status=FinancialYear.STATUS_OPEN, is_default=True,
        )
        self.outlet.state_code = '32'; self.outlet.save()
        self.unit = UnitMaster.objects.create(organisation=self.org, code='PCS', name='Piece', symbol='pc')
        self.item = create_canonical_item(organisation=self.org, code='OIL-1L', name='Engine Oil 1L', item_type=Item.ITEM_TYPE_STOCK, base_unit=self.unit)
        self.service = create_canonical_item(organisation=self.org, code='WASH', name='Car Wash', item_type=Item.ITEM_TYPE_SERVICE, base_unit=self.unit)
        self.tax = create_purchase_tax_code(organisation=self.org, code='GST18', name='GST 18%', tax_regime=PurchaseTaxCode.REGIME_GST)
        self.rate = create_purchase_tax_code_rate(tax_code=self.tax, effective_from=date(2026, 1, 1), gst_rate=Decimal('18.00'))
        ItemPurchaseTaxTreatment.objects.create(organisation=self.org, item=self.item, tax_treatment=self.tax, effective_from=date(2026, 1, 1))
        ItemPurchaseTaxTreatment.objects.create(organisation=self.org, item=self.service, tax_treatment=self.tax, effective_from=date(2026, 1, 1))
        self.customer = create_customer(organisation=self.org, customer_code='C001', display_name='ABC Travels', user=self.user, outlet_ids=[self.outlet.id], credit_days=15)
        self.cash = create_payment_account(organisation=self.org, outlet=self.outlet, user=self.user, code='CASH', name='Cash Counter', account_type='cash', opening_balance=Decimal('1000.00'))
        create_item_stock_adjustment(organisation=self.org, outlet=self.outlet, item=self.item, adjustment_date=date(2026, 9, 1), direction='IN', quantity='10', reason='Opening stock', user=self.user)
        self.client = APIClient()

    def invoice(self, invoice_type='credit', quantity='2', item=None, **kwargs):
        return create_sales_invoice(
            organisation=self.org, outlet=self.outlet, customer=self.customer,
            invoice_date=date(2026, 9, 15), invoice_type=invoice_type,
            payment_account=self.cash if invoice_type == 'cash' else None,
            payment_method='cash' if invoice_type == 'cash' else '', user=self.user,
            lines=[{'item_id': (item or self.item).id, 'quantity': quantity, 'unit_price': '100.00', 'discount_amount': '0.00'}],
            **kwargs,
        )

    def test_stock_item_invoice_posts_stock_and_receivable(self):
        invoice = self.invoice()
        projection = ItemStockBalanceProjection.objects.get(outlet=self.outlet, item=self.item)
        self.assertEqual(projection.current_quantity, Decimal('8.0000'))
        self.assertEqual(invoice.grand_total, Decimal('236.00'))
        self.assertEqual(invoice.outstanding_amount, Decimal('236.00'))
        self.assertEqual(invoice.lines.get().tax_components_snapshot[0]['name'], 'CGST')
        journal = JournalEntry.objects.get(source_type='sales_invoice', source_id=invoice.id)
        self.assertEqual(journal.total_debit, Decimal('236.00'))
        with self.assertRaises(ValidationError):
            reverse_journal(journal, 'Do not bypass source voiding', self.user)

    def test_cash_invoice_posts_account_receipt(self):
        invoice = self.invoice(invoice_type='cash', quantity='1')
        movement = PaymentAccountMovement.objects.get(source_type='sales_invoice', source_id=invoice.id)
        self.assertEqual(movement.signed_amount, Decimal('118.00'))
        self.assertEqual(invoice.amount_paid, Decimal('118.00'))
        self.cash.refresh_from_db()
        self.assertEqual(self.cash.current_balance, Decimal('1118.00'))
        self.assertEqual(JournalEntry.objects.get(source_type='sales_invoice', source_id=invoice.id).total_credit, Decimal('118.00'))

    def test_service_invoice_has_no_stock_movement(self):
        invoice = self.invoice(item=self.service, quantity='1')
        self.assertEqual(invoice.grand_total, Decimal('118.00'))
        self.assertFalse(ItemStockMovement.objects.filter(source_id=invoice.id).exists())

    def test_fuel_cannot_be_entered_as_direct_invoice_line(self):
        fuel = create_canonical_item(
            organisation=self.org, code='MS', name='Petrol', item_type=Item.ITEM_TYPE_FUEL,
            base_unit=self.unit, fuel_profile_data={'fuel_category': 'petrol'},
        )
        with self.assertRaises(ValidationError) as error:
            self.invoice(item=fuel, quantity='1')
        self.assertIn('Credit Slip', str(error.exception))
        self.assertFalse(ItemStockMovement.objects.filter(item=fuel).exists())

    def test_insufficient_stock_rolls_back_invoice(self):
        with self.assertRaises(ValidationError):
            self.invoice(quantity='11')
        self.assertFalse(SalesInvoice.objects.exists())
        self.assertEqual(ItemStockBalanceProjection.objects.get(outlet=self.outlet, item=self.item).current_quantity, Decimal('10.0000'))

    def test_void_reverses_stock_cash_and_releases_outstanding(self):
        invoice = self.invoice(invoice_type='cash', quantity='2')
        void_sales_invoice(invoice, 'Incorrect customer', self.user)
        invoice.refresh_from_db(); self.cash.refresh_from_db()
        self.assertEqual(invoice.status, SalesInvoice.STATUS_VOIDED)
        self.assertEqual(ItemStockBalanceProjection.objects.get(outlet=self.outlet, item=self.item).current_quantity, Decimal('10.0000'))
        self.assertEqual(self.cash.current_balance, Decimal('1000.00'))

    def test_customer_outstanding_summary(self):
        self.invoice(quantity='2')
        summary = customer_outstanding(self.org, self.outlet)
        self.assertEqual(summary['total_outstanding'], '236.00')

    def test_api_contract(self):
        self.client.force_authenticate(self.user)
        response = self.client.post(f'/api/v1/organisations/{self.org.id}/outlets/{self.outlet.id}/sales-invoices/', {
            'client_request_id': '8d395a6e-af30-46e6-a23c-4790443f59f1', 'customer_id': str(self.customer.id),
            'invoice_date': '2026-09-15', 'invoice_type': 'credit',
            'lines': [{'item_id': str(self.item.id), 'quantity': '1.0000', 'unit_price': '100.0000'}],
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['grand_total'], '118.00')
        self.assertIsNotNone(response.data['accounting_journal_id'])

    def test_client_request_is_idempotent(self):
        request_id = '5af64dbd-08b3-4bde-bf14-65236bbc5ef5'
        first = self.invoice(quantity='1', client_request_id=request_id)
        second = self.invoice(quantity='1', client_request_id=request_id)
        self.assertEqual(first.id, second.id)
        self.assertEqual(SalesInvoice.objects.count(), 1)
        self.assertEqual(ItemStockBalanceProjection.objects.get(outlet=self.outlet, item=self.item).current_quantity, Decimal('9.0000'))

    def test_tax_inclusive_invoice_uses_server_calculation(self):
        invoice = create_sales_invoice(
            organisation=self.org, outlet=self.outlet, customer=self.customer,
            invoice_date=date(2026, 9, 15), invoice_type='credit', user=self.user,
            lines=[{'item_id': self.item.id, 'quantity': '1', 'unit_price': '118.00', 'tax_inclusive': True}],
        )
        self.assertEqual(invoice.grand_total, Decimal('118.00'))
        self.assertEqual(invoice.taxable_total, Decimal('100.00'))
        self.assertEqual(invoice.tax_total, Decimal('18.00'))

    def test_customer_receipt_allocates_and_void_restores_invoice(self):
        invoice = self.invoice(quantity='2')
        receipt = create_customer_receipt(
            organisation=self.org, outlet=self.outlet, customer=self.customer,
            receipt_date=date(2026, 9, 15), amount='250.00', payment_account=self.cash,
            payment_method='cash', allocations=[{'sales_invoice_id': invoice.id, 'amount': '200.00'}],
            user=self.user,
        )
        invoice.refresh_from_db(); self.cash.refresh_from_db()
        self.assertEqual(invoice.outstanding_amount, Decimal('36.00'))
        self.assertEqual(receipt.unallocated_amount, Decimal('50.00'))
        self.assertTrue(JournalEntry.objects.filter(source_type='customer_receipt', source_id=receipt.id).exists())
        self.assertEqual(self.cash.current_balance, Decimal('1250.00'))
        with self.assertRaises(ValidationError):
            void_sales_invoice(invoice, 'Wrong invoice', self.user)
        void_customer_receipt(receipt, 'Wrong allocation', self.user)
        invoice.refresh_from_db(); self.cash.refresh_from_db(); receipt.refresh_from_db()
        self.assertEqual(invoice.outstanding_amount, Decimal('236.00'))
        self.assertEqual(self.cash.current_balance, Decimal('1000.00'))
        self.assertEqual(receipt.status, CustomerReceipt.STATUS_VOIDED)
        original = JournalEntry.objects.get(source_type='customer_receipt', source_id=receipt.id, reversal_of__isnull=True)
        self.assertEqual(original.status, JournalEntry.STATUS_REVERSED)

    def test_item_stock_adjustment_api(self):
        self.client.force_authenticate(self.user)
        response = self.client.post(f'/api/v1/organisations/{self.org.id}/outlets/{self.outlet.id}/item-stock/adjustments/', {
            'item_id': str(self.item.id), 'adjustment_date': '2026-09-15', 'direction': 'IN',
            'quantity': '2.0000', 'reason': 'Physical count correction',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(ItemStockBalanceProjection.objects.get(outlet=self.outlet, item=self.item).current_quantity, Decimal('12.0000'))
