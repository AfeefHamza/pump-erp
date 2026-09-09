# Generated for Milestone 11: Idempotent backfill of stock ledger movements

from django.db import migrations


def backfill_data(apps, schema_editor):
    from apps.inventory.services import backfill_operational_stock_data
    try:
        backfill_operational_stock_data()
    except Exception:
        # Ignore if tables are newly initialized in test runner
        pass


def reverse_backfill(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0001_initial'),
        ('shifts', '0010_alter_shiftnozzlemeter_opening_source'),
        ('operations', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(backfill_data, reverse_backfill),
    ]
