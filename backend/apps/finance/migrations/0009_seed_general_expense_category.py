from django.db import migrations


def seed_general_category(apps, schema_editor):
    ChartOfAccount = apps.get_model('accounting', 'ChartOfAccount')
    ExpenseCategory = apps.get_model('finance', 'ExpenseCategory')
    for ledger in ChartOfAccount.objects.filter(system_key='general_expenses'):
        ExpenseCategory.objects.get_or_create(
            organisation_id=ledger.organisation_id,
            code='GENERAL',
            defaults={
                'name': 'General Expense',
                'ledger_account_id': ledger.id,
                'description': 'Default category for routine operating expenses.',
                'display_order': 10,
                'is_active': True,
            },
        )


class Migration(migrations.Migration):
    dependencies = [('finance', '0008_expenses_cash_bank_transfers')]
    operations = [migrations.RunPython(seed_general_category, migrations.RunPython.noop)]
