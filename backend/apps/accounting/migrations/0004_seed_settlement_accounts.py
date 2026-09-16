from django.db import migrations


def seed_accounts(apps, schema_editor):
    Organisation = apps.get_model('organizations', 'Organisation')
    Account = apps.get_model('accounting', 'ChartOfAccount')
    for organisation in Organisation.objects.all():
        assets = Account.objects.get(organisation=organisation, system_key='assets')
        expenses = Account.objects.get(organisation=organisation, system_key='operating_expenses')
        Account.objects.get_or_create(
            organisation=organisation, system_key='tds_receivable',
            defaults={'parent': assets, 'code': '1600', 'name': 'TDS Receivable', 'account_type': 'asset', 'is_group': False, 'allow_manual_posting': True},
        )
        Account.objects.get_or_create(
            organisation=organisation, system_key='payment_gateway_charges',
            defaults={'parent': expenses, 'code': '6200', 'name': 'Payment Gateway Charges', 'account_type': 'expense', 'is_group': False, 'allow_manual_posting': True},
        )


class Migration(migrations.Migration):
    dependencies = [('accounting', '0003_seed_supplier_advances')]
    operations = [migrations.RunPython(seed_accounts, migrations.RunPython.noop)]
