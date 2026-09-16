from django.db import migrations


PERMISSIONS = [
    ('expense_category.view', 'View Expense Categories', 'Finance', 'Can view expense categories.'),
    ('expense_category.create', 'Create Expense Categories', 'Finance', 'Can create expense categories.'),
    ('expense_category.update', 'Update Expense Categories', 'Finance', 'Can update unused category mappings.'),
    ('expense_category.deactivate', 'Deactivate Expense Categories', 'Finance', 'Can deactivate expense categories.'),
    ('expense.view', 'View Expenses', 'Finance', 'Can view recorded expenses.'),
    ('expense.create', 'Create Expenses', 'Finance', 'Can record direct expenses.'),
    ('expense.void', 'Void Expenses', 'Finance', 'Can void expenses with exact reversals.'),
    ('cash_bank_transfer.view', 'View Cash/Bank Transfers', 'Finance', 'Can view cash and bank transfers.'),
    ('cash_bank_transfer.create', 'Create Cash/Bank Transfers', 'Finance', 'Can record deposits, withdrawals and transfers.'),
    ('cash_bank_transfer.void', 'Void Cash/Bank Transfers', 'Finance', 'Can void transfers with exact reversals.'),
    ('cash_bank_book.view', 'View Cash/Bank Books', 'Finance', 'Can view account movement books and balances.'),
]


def seed_permissions(apps, schema_editor):
    PermissionDefinition = apps.get_model('organizations', 'PermissionDefinition')
    Organisation = apps.get_model('organizations', 'Organisation')
    Role = apps.get_model('organizations', 'Role')
    RolePermission = apps.get_model('organizations', 'RolePermission')
    definitions = {}
    for code, name, module, description in PERMISSIONS:
        definitions[code], _ = PermissionDefinition.objects.update_or_create(
            code=code, defaults={'name': name, 'module': module, 'description': description, 'is_active': True},
        )
    all_codes = tuple(definitions)
    accountant_codes = all_codes
    operator_codes = ('expense_category.view', 'expense.view', 'expense.create', 'cash_bank_book.view')
    for organisation in Organisation.objects.all():
        for role in Role.objects.filter(organisation=organisation, is_system=True):
            if role.name in ('Administrator', 'Manager', 'Accountant'):
                codes = accountant_codes
            elif role.name == 'Shift Operator':
                codes = operator_codes
            else:
                codes = ()
            for code in codes:
                RolePermission.objects.get_or_create(role=role, permission=definitions[code])


def reverse_permissions(apps, schema_editor):
    apps.get_model('organizations', 'PermissionDefinition').objects.filter(
        code__in=[row[0] for row in PERMISSIONS],
    ).delete()


class Migration(migrations.Migration):
    dependencies = [
        ('organizations', '0020_seed_sales_and_item_stock_permissions'),
        ('finance', '0009_seed_general_expense_category'),
    ]
    operations = [migrations.RunPython(seed_permissions, reverse_permissions)]
