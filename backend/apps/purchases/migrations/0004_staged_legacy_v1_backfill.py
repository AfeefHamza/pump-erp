from django.db import migrations, models


def backfill_legacy_data(apps, schema_editor):
    PurchaseBill = apps.get_model('purchases', 'PurchaseBill')
    PurchaseBillLine = apps.get_model('purchases', 'PurchaseBillLine')
    Supplier = apps.get_model('purchases', 'Supplier')

    # Explicitly ensure all existing bills are marked as legacy_v1
    PurchaseBill.objects.all().update(calculation_version='legacy_v1')

    # Explicitly ensure all existing lines avoid being labeled non_gst_petroleum
    PurchaseBillLine.objects.all().update(
        tax_treatment='legacy',
        itc_classification='not_applicable'
    )

    # Ensure existing suppliers are set to pending_review
    Supplier.objects.filter(gst_registration_type__isnull=True).update(
        gst_registration_type='pending_review'
    )
    Supplier.objects.all().update(gst_registration_type='pending_review')


def reverse_backfill(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('purchases', '0003_purchasebill_purchasebilladjustmentcomponent_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='purchasebill',
            name='calculation_version',
            field=models.CharField(
                choices=[('legacy_v1', 'Legacy V1'), ('item_tax_v2', 'Item Tax V2')],
                db_index=True,
                default='legacy_v1',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='purchasebillline',
            name='tax_treatment',
            field=models.CharField(default='legacy', max_length=30),
        ),
        migrations.AddField(
            model_name='purchasebillline',
            name='itc_classification',
            field=models.CharField(default='not_applicable', max_length=30),
        ),
        migrations.AddField(
            model_name='supplier',
            name='gst_registration_type',
            field=models.CharField(
                choices=[
                    ('registered', 'Registered'),
                    ('unregistered', 'Unregistered'),
                    ('composition', 'Composition'),
                    ('overseas', 'Overseas / Import'),
                    ('pending_review', 'Pending Review'),
                ],
                default='pending_review',
                max_length=30,
            ),
        ),
        migrations.RunPython(backfill_legacy_data, reverse_backfill),
    ]
