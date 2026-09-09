# apps/inventory/management/commands/backfill_fuel_stock.py
from django.core.management.base import BaseCommand
from apps.inventory.services import backfill_operational_stock_data


class Command(BaseCommand):
    help = "Idempotently backfills stock ledger movements for existing confirmed opening balances and active shift cards."

    def handle(self, *args, **options):
        self.stdout.write("Starting fuel stock backfill...")
        result = backfill_operational_stock_data()
        self.stdout.write(
            self.style.SUCCESS(
                f"Backfill complete! Processed {result['opening_balance_movements_processed']} opening balance movements, "
                f"{result['shift_card_movements_processed']} shift card movements across {result['tanks_recalculated']} tanks."
            )
        )
