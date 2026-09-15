from django.db import migrations


def seed_permissions(apps, schema_editor):
    PermissionDefinition = apps.get_model('organizations', 'PermissionDefinition')
    Organisation = apps.get_model('organizations', 'Organisation')
    Role = apps.get_model('organizations', 'Role')
    RolePermission = apps.get_model('organizations', 'RolePermission')

    definitions = [
        ('payment_account.view', 'View Payment Accounts', 'Finance', 'Can view cash and bank payment accounts.'),
        ('payment_account.create', 'Create Payment Accounts', 'Finance', 'Can create cash and bank payment accounts.'),
        ('payment_account.update', 'Update Payment Accounts', 'Finance', 'Can update unused account details.'),
        ('payment_account.deactivate', 'Deactivate Payment Accounts', 'Finance', 'Can deactivate payment accounts.'),
        ('supplier_payment.view', 'View Supplier Payments', 'Purchases', 'Can view supplier payments and allocations.'),
        ('supplier_payment.create', 'Create Supplier Payments', 'Purchases', 'Can record supplier payments.'),
        ('supplier_payment.allocate', 'Allocate Supplier Payments', 'Purchases', 'Can allocate remaining supplier advances.'),
        ('supplier_payment.void', 'Void Supplier Payments', 'Purchases', 'Can void supplier payments with a reason.'),
    ]
    permission_objects = {}
    for code, name, module, description in definitions:
        permission_objects[code], _ = PermissionDefinition.objects.update_or_create(
            code=code,
            defaults={'name': name, 'module': module, 'description': description, 'is_active': True},
        )

    for organisation in Organisation.objects.all():
        for role in Role.objects.filter(organisation=organisation, is_system=True):
            if role.name in ('Administrator', 'Accountant'):
                codes = permission_objects.keys()
            elif role.name == 'Manager':
                codes = ('payment_account.view', 'supplier_payment.view', 'supplier_payment.create')
            else:
                codes = ()
            for code in codes:
                RolePermission.objects.get_or_create(role=role, permission=permission_objects[code])


def reverse_permissions(apps, schema_editor):
    PermissionDefinition = apps.get_model('organizations', 'PermissionDefinition')
    PermissionDefinition.objects.filter(code__in=[
        'payment_account.view', 'payment_account.create', 'payment_account.update', 'payment_account.deactivate',
        'supplier_payment.view', 'supplier_payment.create', 'supplier_payment.allocate', 'supplier_payment.void',
    ]).delete()


class Migration(migrations.Migration):
    dependencies = [('organizations', '0018_seed_unified_item_and_tax_treatment_permissions')]
    operations = [migrations.RunPython(seed_permissions, reverse_permissions)]
