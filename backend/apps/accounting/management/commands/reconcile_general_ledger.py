from uuid import UUID

from django.core.management.base import BaseCommand, CommandError
from django.db.models import Exists, OuterRef

from apps.accounting.models import JournalEntry
from apps.accounting.posting import (
    post_customer_receipt,
    post_purchase_bill,
    post_sales_invoice,
    post_supplier_payment,
    post_supplier_payment_allocation,
)
from apps.finance.models import SupplierPayment, SupplierPaymentAllocation
from apps.organizations.models import Organisation
from apps.purchases.models import PurchaseBill
from apps.sales.models import CustomerReceipt, SalesInvoice


class Command(BaseCommand):
    help = 'Preview or repair active operational transactions that are missing General Ledger journals.'

    def add_arguments(self, parser):
        parser.add_argument('--organisation', required=True, help='Organisation UUID or code.')
        parser.add_argument('--outlet', help='Optional outlet UUID or code.')
        parser.add_argument(
            '--apply', action='store_true',
            help='Create missing journals. Without this flag the command is preview-only.',
        )

    def handle(self, *args, **options):
        organisation_ref = options['organisation']
        try:
            organisation = Organisation.objects.filter(id=UUID(organisation_ref)).first()
        except (TypeError, ValueError):
            organisation = None
        organisation = organisation or Organisation.objects.filter(code__iexact=organisation_ref).first()
        if not organisation:
            raise CommandError(f"Organisation '{organisation_ref}' was not found.")

        outlet_ref = options.get('outlet')
        outlet = None
        if outlet_ref:
            try:
                outlet = organisation.outlets.filter(id=UUID(outlet_ref)).first()
            except (TypeError, ValueError):
                outlet = None
            outlet = outlet or organisation.outlets.filter(code__iexact=outlet_ref).first()
            if not outlet:
                raise CommandError(f"Outlet '{outlet_ref}' was not found in {organisation.code}.")

        # Each queryset is separately annotated because source_type is a literal, not a model field.
        sources = [
            ('Sales Invoices', 'sales_invoice', SalesInvoice.objects.filter(
                organisation=organisation, status=SalesInvoice.STATUS_ACTIVE, grand_total__gt=0,
            ), post_sales_invoice),
            ('Purchase Bills', 'purchase_bill', PurchaseBill.objects.filter(
                organisation=organisation, status=PurchaseBill.STATUS_ACTIVE, grand_total__gt=0,
            ), post_purchase_bill),
            ('Customer Receipts', 'customer_receipt', CustomerReceipt.objects.filter(
                organisation=organisation, status=CustomerReceipt.STATUS_ACTIVE,
            ), post_customer_receipt),
            ('Supplier Payments', 'supplier_payment', SupplierPayment.objects.filter(
                organisation=organisation, status=SupplierPayment.STATUS_ACTIVE,
            ), post_supplier_payment),
        ]
        if outlet:
            sources = [(label, kind, qs.filter(outlet=outlet), poster) for label, kind, qs, poster in sources]

        apply_changes = options['apply']
        total_missing = 0
        posted = 0
        failed = 0
        self.stdout.write(
            self.style.WARNING('APPLY MODE: missing journals will be created.')
            if apply_changes else
            self.style.NOTICE('PREVIEW ONLY: no journals will be created. Add --apply to repair.')
        )

        for label, source_type, queryset, poster in sources:
            existing = JournalEntry.objects.filter(
                organisation=organisation,
                outlet_id=OuterRef('outlet_id'),
                source_type=source_type,
                source_id=OuterRef('pk'),
                reversal_of__isnull=True,
            )
            missing = queryset.annotate(has_journal=Exists(existing)).filter(has_journal=False)
            count = missing.count()
            total_missing += count
            self.stdout.write(f'{label}: {count} missing')
            if apply_changes:
                for source in missing.iterator():
                    try:
                        poster(source, user=None)
                        posted += 1
                    except Exception as exc:  # report every blocked historical record without hiding others
                        failed += 1
                        self.stderr.write(f'  {source_type} {source.pk}: {exc}')

        allocation_qs = SupplierPaymentAllocation.objects.filter(
            payment__organisation=organisation,
            payment__status=SupplierPayment.STATUS_ACTIVE,
            is_advance_application=True,
        )
        if outlet:
            allocation_qs = allocation_qs.filter(payment__outlet=outlet)
        allocation_existing = JournalEntry.objects.filter(
            organisation=organisation,
            outlet_id=OuterRef('payment__outlet_id'),
            source_type='supplier_payment_allocation',
            source_id=OuterRef('pk'),
            reversal_of__isnull=True,
        )
        missing_allocations = allocation_qs.annotate(has_journal=Exists(allocation_existing)).filter(has_journal=False)
        allocation_count = missing_allocations.count()
        total_missing += allocation_count
        self.stdout.write(f'Supplier Advance Applications: {allocation_count} missing')
        if apply_changes:
            for allocation in missing_allocations.select_related('payment', 'purchase_bill').iterator():
                try:
                    post_supplier_payment_allocation(allocation, user=None)
                    posted += 1
                except Exception as exc:
                    failed += 1
                    self.stderr.write(f'  supplier_payment_allocation {allocation.pk}: {exc}')

        if apply_changes:
            self.stdout.write(self.style.SUCCESS(f'Posted {posted}; failed {failed}; detected {total_missing}.'))
            if failed:
                raise CommandError('Some transactions could not be posted. Review the errors above.')
        else:
            self.stdout.write(self.style.SUCCESS(f'Preview complete: {total_missing} missing journal(s).'))
