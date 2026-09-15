from django.db import migrations


STANDARD_ACCOUNTS = [
    ('1000', 'Assets', 'asset', True, 'assets', None),
    ('1100', 'Cash & Bank', 'asset', True, 'cash_bank_group', 'assets'),
    ('1200', 'Accounts Receivable', 'asset', False, 'accounts_receivable', 'assets'),
    ('1300', 'Inventory', 'asset', False, 'inventory', 'assets'),
    ('1400', 'Input Tax', 'asset', False, 'input_tax', 'assets'),
    ('2000', 'Liabilities', 'liability', True, 'liabilities', None),
    ('2100', 'Accounts Payable', 'liability', False, 'accounts_payable', 'liabilities'),
    ('2200', 'Output Tax', 'liability', False, 'output_tax', 'liabilities'),
    ('2300', 'Customer Advances', 'liability', False, 'customer_advances', 'liabilities'),
    ('3000', 'Equity', 'equity', True, 'equity', None),
    ('3100', 'Opening Balance Equity', 'equity', False, 'opening_balance_equity', 'equity'),
    ('4000', 'Income', 'income', True, 'income', None),
    ('4100', 'Fuel Sales', 'income', False, 'fuel_sales', 'income'),
    ('4200', 'Product Sales', 'income', False, 'product_sales', 'income'),
    ('4300', 'Service Income', 'income', False, 'service_income', 'income'),
    ('5000', 'Cost of Sales', 'expense', True, 'cost_of_sales', None),
    ('5100', 'Purchases', 'expense', False, 'purchases', 'cost_of_sales'),
    ('5200', 'Cost of Goods Sold', 'expense', False, 'cost_of_goods_sold', 'cost_of_sales'),
    ('6000', 'Operating Expenses', 'expense', True, 'operating_expenses', None),
    ('6100', 'General Expenses', 'expense', False, 'general_expenses', 'operating_expenses'),
]

PERMISSIONS = [
    ('chart_of_accounts.view', 'View Chart of Accounts', 'Finance', 'Can view ledger accounts.'),
    ('chart_of_accounts.create', 'Create Ledger Accounts', 'Finance', 'Can create ledger accounts.'),
    ('chart_of_accounts.update', 'Update Ledger Accounts', 'Finance', 'Can update unused ledger accounts and descriptions.'),
    ('chart_of_accounts.deactivate', 'Deactivate Ledger Accounts', 'Finance', 'Can deactivate eligible ledger accounts.'),
    ('journal_voucher.view', 'View Journal Vouchers', 'Finance', 'Can view posted journal vouchers.'),
    ('journal_voucher.create', 'Create Journal Vouchers', 'Finance', 'Can post balanced journal vouchers.'),
    ('journal_voucher.reverse', 'Reverse Journal Vouchers', 'Finance', 'Can reverse a posted journal voucher with a reason.'),
    ('general_ledger.view', 'View General Ledger', 'Finance', 'Can view the trial balance and account ledgers.'),
    ('accounting_period.view', 'View Accounting Periods', 'Finance', 'Can view accounting period locks.'),
    ('accounting_period.lock', 'Lock Accounting Periods', 'Finance', 'Can lock an accounting month.'),
    ('accounting_period.unlock', 'Unlock Accounting Periods', 'Finance', 'Can reopen a locked accounting month with a reason.'),
]


def seed_chart_and_permissions(apps, schema_editor):
    Organisation = apps.get_model('organizations', 'Organisation')
    Account = apps.get_model('accounting', 'ChartOfAccount')
    PermissionDefinition = apps.get_model('organizations', 'PermissionDefinition')
    Role = apps.get_model('organizations', 'Role')
    RolePermission = apps.get_model('organizations', 'RolePermission')

    permission_objects = {}
    for code, name, module, description in PERMISSIONS:
        permission_objects[code], _ = PermissionDefinition.objects.update_or_create(
            code=code,
            defaults={'name': name, 'module': module, 'description': description, 'is_active': True},
        )

    for organisation in Organisation.objects.all():
        accounts = {}
        for code, name, account_type, is_group, system_key, parent_key in STANDARD_ACCOUNTS:
            account, _ = Account.objects.get_or_create(
                organisation=organisation,
                system_key=system_key,
                defaults={
                    'code': code,
                    'name': name,
                    'account_type': account_type,
                    'is_group': is_group,
                    'allow_manual_posting': not is_group,
                    'parent': accounts.get(parent_key),
                },
            )
            accounts[system_key] = account

        for role in Role.objects.filter(organisation=organisation, is_system=True):
            if role.name in ('Administrator', 'Manager', 'Accountant'):
                codes = permission_objects.keys()
            else:
                codes = ()
            for code in codes:
                RolePermission.objects.get_or_create(role=role, permission=permission_objects[code])


def reverse_seed(apps, schema_editor):
    codes = [row[0] for row in PERMISSIONS]
    apps.get_model('organizations', 'RolePermission').objects.filter(permission__code__in=codes).delete()
    apps.get_model('organizations', 'PermissionDefinition').objects.filter(code__in=codes).delete()


class Migration(migrations.Migration):
    dependencies = [
        ('accounting', '0001_initial'),
        ('organizations', '0020_seed_sales_and_item_stock_permissions'),
    ]
    operations = [migrations.RunPython(seed_chart_and_permissions, reverse_seed)]
