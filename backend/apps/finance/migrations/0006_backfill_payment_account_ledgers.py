from django.db import migrations


def backfill_payment_account_ledgers(apps, schema_editor):
    PaymentAccount = apps.get_model('finance', 'PaymentAccount')
    Account = apps.get_model('accounting', 'ChartOfAccount')
    for payment_account in PaymentAccount.objects.filter(ledger_account__isnull=True).iterator():
        parent = Account.objects.get(
            organisation_id=payment_account.organisation_id,
            system_key='cash_bank_group',
        )
        base_code = f'PA-{payment_account.code}'.strip().upper()[:30]
        code = base_code
        if Account.objects.filter(organisation_id=payment_account.organisation_id, code__iexact=code).exists():
            suffix = str(payment_account.id).split('-')[0].upper()
            code = f'{base_code[:21]}-{suffix}'
        ledger = Account.objects.create(
            organisation_id=payment_account.organisation_id,
            parent=parent,
            code=code,
            name=payment_account.name,
            account_type='asset',
            is_group=False,
            allow_manual_posting=True,
            system_key=f'payment_account:{payment_account.id}',
            description='Automatically mapped from Cash & Banking.',
        )
        payment_account.ledger_account = ledger
        payment_account.save(update_fields=['ledger_account'])


class Migration(migrations.Migration):
    dependencies = [
        ('accounting', '0003_seed_supplier_advances'),
        ('finance', '0005_paymentaccount_ledger_account'),
    ]
    operations = [migrations.RunPython(backfill_payment_account_ledgers, migrations.RunPython.noop)]
