from django.db import migrations


def seed_supplier_advances(apps, schema_editor):
    Organisation = apps.get_model('organizations', 'Organisation')
    Account = apps.get_model('accounting', 'ChartOfAccount')
    for organisation in Organisation.objects.all():
        assets = Account.objects.get(organisation=organisation, system_key='assets')
        Account.objects.get_or_create(
            organisation=organisation,
            system_key='supplier_advances',
            defaults={
                'parent': assets,
                'code': '1500',
                'name': 'Supplier Advances',
                'account_type': 'asset',
                'is_group': False,
                'allow_manual_posting': True,
            },
        )


class Migration(migrations.Migration):
    dependencies = [('accounting', '0002_seed_chart_and_permissions')]
    operations = [migrations.RunPython(seed_supplier_advances, migrations.RunPython.noop)]
