# Generated forward migration for removing Primary Cashier workflow

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('shifts', '0006_alter_shiftnozzlemeter_opening_source'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='shiftstaffassignment',
            name='is_primary_cashier',
        ),
        migrations.RemoveField(
            model_name='operationalshiftstaff',
            name='is_primary_cashier',
        ),
        migrations.DeleteModel(
            name='OperationalShiftCashierPeriod',
        ),
    ]
