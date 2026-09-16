from django.db import migrations


ACCOUNTS = [
    ('1700', 'Digital Collection Receivable', 'asset', 'digital_collection_clearing', 'assets'),
    ('1800', 'Employee Shortage Receivable', 'asset', 'employee_shortage_receivable', 'assets'),
    ('4900', 'Shift Excess Income', 'income', 'shift_excess_income', 'income'),
    ('4950', 'Shift Adjustment Income', 'income', 'shift_adjustment_income', 'income'),
    ('6300', 'Shift Cash Expenses & Adjustments', 'expense', 'shift_adjustment_expense', 'operating_expenses'),
]


def seed_accounts(apps, schema_editor):
    Organisation = apps.get_model('organizations', 'Organisation')
    Account = apps.get_model('accounting', 'ChartOfAccount')
    for organisation in Organisation.objects.all():
        parents = {
            key: Account.objects.get(organisation=organisation, system_key=key)
            for key in {'assets', 'income', 'operating_expenses'}
        }
        for code, name, account_type, system_key, parent_key in ACCOUNTS:
            Account.objects.get_or_create(
                organisation=organisation,
                system_key=system_key,
                defaults={
                    'parent': parents[parent_key], 'code': code, 'name': name,
                    'account_type': account_type, 'is_group': False, 'allow_manual_posting': True,
                },
            )


class Migration(migrations.Migration):
    dependencies = [('accounting', '0005_shiftaccountingposting')]
    operations = [migrations.RunPython(seed_accounts, migrations.RunPython.noop)]
