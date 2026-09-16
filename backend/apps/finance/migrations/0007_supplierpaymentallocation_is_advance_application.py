from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('finance', '0006_backfill_payment_account_ledgers'),
    ]

    operations = [
        migrations.AddField(
            model_name='supplierpaymentallocation',
            name='is_advance_application',
            field=models.BooleanField(
                default=False,
                help_text='True when an existing supplier advance was allocated after the original payment was posted.',
            ),
        ),
    ]
