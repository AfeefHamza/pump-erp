from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.finance.services import create_payment_account
from apps.organizations.models import FinancialYear
from apps.shifts.services import atomic_save_shift_card, lock_shift
from apps.shifts.tests_shift_cards import ShiftCardBaseTestCase


class ReportingApiTests(ShiftCardBaseTestCase):
    def setUp(self):
        super().setUp()
        FinancialYear.objects.create(
            organisation=self.org, name='FY 2026', start_date=date(2026, 1, 1),
            end_date=date(2026, 12, 31), status=FinancialYear.STATUS_OPEN, is_default=True,
        )
        self.cash_account = create_payment_account(
            organisation=self.org, outlet=self.outlet, user=self.owner,
            code='REPORT-CASH', name='Report Cash', account_type='cash',
        )
        self.card = atomic_save_shift_card(
            organisation=self.org, outlet=self.outlet, user=self.owner,
            shift_definition=self.shift_def, business_date=date(2026, 9, 1), employee=self.emp1,
            nozzle_meters_data=[{
                'nozzle_id': self.nozzle1.id,
                'opening_reading': Decimal('1000.000'),
                'closing_reading': Decimal('1100.000'),
            }],
            cash_data={'amount': Decimal('4000.00')},
            cards_data=[{'amount': '2500.00', 'provider_name': 'HDFC', 'reference_number': 'CARD-R1'}],
            upi_data=[{'amount': '2000.00', 'provider_name': 'PhonePe', 'reference_number': 'UPI-R1'}],
            fleet_data=[{'amount': '1500.00', 'provider_name': 'FleetCo', 'reference_number': 'FLEET-R1'}],
        )
        lock_shift(self.card.parent_shift, self.owner, cash_account=self.cash_account)
        self.client = APIClient()
        self.client.force_authenticate(self.owner)

    def test_daily_summary_uses_recorded_shift_posting_and_product_breakdown(self):
        response = self.client.get(
            f'/api/v1/organisations/{self.org.id}/outlets/{self.outlet.id}/reports/daily-business-summary/',
            {'from_date': '2026-09-01', 'to_date': '2026-09-01'},
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['basis'], 'Recorded and financially locked shifts only')
        self.assertEqual(response.data['summary']['recorded_shift_count'], 1)
        self.assertEqual(response.data['summary']['fuel_sales'], '10000.00')
        self.assertEqual(response.data['summary']['cash_collections'], '4000.00')
        self.assertEqual(response.data['summary']['digital_collections'], '6000.00')
        self.assertEqual(response.data['fuel_products'][0]['quantity'], '100.000')
        self.assertEqual(response.data['fuel_products'][0]['amount'], '10000.00')
        self.assertEqual(response.data['shifts'][0]['shift_id'], str(self.card.parent_shift_id))

    def test_employee_accountability_includes_fleet_and_drilldown_ids(self):
        response = self.client.get(
            f'/api/v1/organisations/{self.org.id}/outlets/{self.outlet.id}/reports/employee-accountability/',
            {'from_date': '2026-09-01', 'to_date': '2026-09-01', 'employee_id': str(self.emp1.id)},
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['summary']['employee_count'], 1)
        employee = response.data['employees'][0]
        self.assertEqual(employee['expected_sales'], '10000.00')
        self.assertEqual(employee['fleet_card'], '1500.00')
        self.assertEqual(employee['digital'], '6000.00')
        self.assertEqual(employee['shortage'], '0.00')
        detail = response.data['details'][0]
        self.assertEqual(detail['shift_id'], str(self.card.parent_shift_id))
        self.assertEqual(detail['shift_card_id'], str(self.card.id))

    def test_unlocked_shift_is_not_reported(self):
        atomic_save_shift_card(
            organisation=self.org, outlet=self.outlet, user=self.owner,
            shift_definition=self.shift_def, business_date=date(2026, 9, 2), employee=self.emp1,
            nozzle_meters_data=[{
                'nozzle_id': self.nozzle1.id,
                'opening_reading': Decimal('1100.000'),
                'closing_reading': Decimal('1150.000'),
            }],
            cash_data={'amount': Decimal('5000.00')},
        )
        response = self.client.get(
            f'/api/v1/organisations/{self.org.id}/outlets/{self.outlet.id}/reports/daily-business-summary/',
            {'from_date': '2026-09-01', 'to_date': '2026-09-02'},
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['summary']['recorded_shift_count'], 1)
        self.assertEqual(response.data['summary']['fuel_sales'], '10000.00')

    def test_invalid_or_excessive_date_ranges_are_rejected(self):
        url = f'/api/v1/organisations/{self.org.id}/outlets/{self.outlet.id}/reports/daily-business-summary/'
        reversed_range = self.client.get(url, {'from_date': '2026-09-02', 'to_date': '2026-09-01'})
        self.assertEqual(reversed_range.status_code, 400)
        invalid = self.client.get(url, {'from_date': 'not-a-date'})
        self.assertEqual(invalid.status_code, 400)
        excessive = self.client.get(url, {'from_date': '2025-01-01', 'to_date': '2026-09-01'})
        self.assertEqual(excessive.status_code, 400)

    def test_report_requires_membership_permission_and_outlet_access(self):
        outsider = get_user_model().objects.create_user(
            email='report-outsider@example.com', password='password',
        )
        self.client.force_authenticate(outsider)
        response = self.client.get(
            f'/api/v1/organisations/{self.org.id}/outlets/{self.outlet.id}/reports/daily-business-summary/',
            {'from_date': '2026-09-01', 'to_date': '2026-09-01'},
        )
        self.assertEqual(response.status_code, 403)
