from decimal import Decimal

from django.core.management.base import BaseCommand

from apps.purchases.models import PurchaseBill
from apps.finance.models import SupplierPayment, SupplierPaymentAllocation


class Command(BaseCommand):
    help = 'Rebuild Purchase Bill amount-paid and outstanding projections from active supplier-payment allocations.'

    def add_arguments(self, parser):
        parser.add_argument('--organisation')
        parser.add_argument('--outlet')
        parser.add_argument('--dry-run', action='store_true')

    def handle(self, *args, **options):
        bills = PurchaseBill.objects.filter(status=PurchaseBill.STATUS_ACTIVE)
        if options['organisation']:
            bills = bills.filter(organisation_id=options['organisation'])
        if options['outlet']:
            bills = bills.filter(outlet_id=options['outlet'])

        changed = 0
        for bill in bills.iterator():
            paid = sum(
                SupplierPaymentAllocation.objects.filter(
                    purchase_bill=bill, payment__status=SupplierPayment.STATUS_ACTIVE
                ).values_list('amount', flat=True),
                Decimal('0.00'),
            ).quantize(Decimal('0.01'))
            outstanding = max(Decimal('0.00'), bill.grand_total - paid).quantize(Decimal('0.01'))
            if bill.amount_paid == paid and bill.outstanding_amount == outstanding:
                continue
            changed += 1
            self.stdout.write(f'{bill.bill_number}: paid {bill.amount_paid} -> {paid}, outstanding {bill.outstanding_amount} -> {outstanding}')
            if not options['dry_run']:
                PurchaseBill.objects.filter(pk=bill.pk).update(amount_paid=paid, outstanding_amount=outstanding)
        self.stdout.write(self.style.SUCCESS(f'{"Would update" if options["dry_run"] else "Updated"} {changed} bill(s).'))
