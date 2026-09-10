# apps/organizations/migrations/0017_seed_purchase_tax_permissions.py
from django.db import migrations


def seed_purchase_tax_permissions(apps, schema_editor):
    PermissionDefinition = apps.get_model('organizations', 'PermissionDefinition')
    Organisation = apps.get_model('organizations', 'Organisation')
    Role = apps.get_model('organizations', 'Role')
    RolePermission = apps.get_model('organizations', 'RolePermission')

    permissions_to_seed = [
        {
            "code": "purchase_tax_code.view",
            "name": "View Purchase Tax Codes",
            "module": "Purchases",
            "description": "Can view purchase tax codes, tax regimes, and effective-dated rate versions."
        },
        {
            "code": "purchase_tax_code.create",
            "name": "Create Purchase Tax Codes",
            "module": "Purchases",
            "description": "Can create purchase tax codes and effective rate versions."
        },
        {
            "code": "purchase_tax_code.update",
            "name": "Update Purchase Tax Codes",
            "module": "Purchases",
            "description": "Can edit purchase tax codes and add new rate versions."
        },
        {
            "code": "purchase_item.view",
            "name": "View Purchase Items",
            "module": "Purchases",
            "description": "Can view purchase goods and service items."
        },
        {
            "code": "purchase_item.create",
            "name": "Create Purchase Items",
            "module": "Purchases",
            "description": "Can create purchase goods and service items."
        },
        {
            "code": "purchase_item.update",
            "name": "Update Purchase Items",
            "module": "Purchases",
            "description": "Can edit purchase goods and service items."
        },
        {
            "code": "purchase_bill.tax_override",
            "name": "Override Purchase Bill Taxes",
            "module": "Purchases",
            "description": "Can override place of supply, petroleum tax amounts, and statutory tax calculations."
        },
    ]

    for p_data in permissions_to_seed:
        PermissionDefinition.objects.update_or_create(
            code=p_data['code'],
            defaults={
                'name': p_data['name'],
                'module': p_data['module'],
                'description': p_data['description'],
                'is_active': True
            }
        )

    admin_perms = [p['code'] for p in permissions_to_seed]
    manager_perms = [
        'purchase_tax_code.view',
        'purchase_item.view',
        'purchase_item.create',
        'purchase_item.update',
    ]
    accountant_perms = [
        'purchase_tax_code.view',
        'purchase_tax_code.create',
        'purchase_tax_code.update',
        'purchase_item.view',
        'purchase_bill.tax_override',
    ]

    for org in Organisation.objects.all():
        try:
            admin_role = Role.objects.get(organisation=org, name='Administrator', is_system=True)
            for perm in PermissionDefinition.objects.filter(code__in=admin_perms, is_active=True):
                RolePermission.objects.get_or_create(role=admin_role, permission=perm)
        except Role.DoesNotExist:
            pass

        try:
            manager_role = Role.objects.get(organisation=org, name='Manager', is_system=True)
            for perm in PermissionDefinition.objects.filter(code__in=manager_perms, is_active=True):
                RolePermission.objects.get_or_create(role=manager_role, permission=perm)
        except Role.DoesNotExist:
            pass

        try:
            accountant_role = Role.objects.get(organisation=org, name='Accountant', is_system=True)
            for perm in PermissionDefinition.objects.filter(code__in=accountant_perms, is_active=True):
                RolePermission.objects.get_or_create(role=accountant_role, permission=perm)
        except Role.DoesNotExist:
            pass


def rollback_purchase_tax_permissions(apps, schema_editor):
    PermissionDefinition = apps.get_model('organizations', 'PermissionDefinition')
    codes = [
        'purchase_tax_code.view',
        'purchase_tax_code.create',
        'purchase_tax_code.update',
        'purchase_item.view',
        'purchase_item.create',
        'purchase_item.update',
        'purchase_bill.tax_override',
    ]
    PermissionDefinition.objects.filter(code__in=codes).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('organizations', '0016_organisation_state_code_outlet_gstin_and_more'),
    ]

    operations = [
        migrations.RunPython(seed_purchase_tax_permissions, rollback_purchase_tax_permissions),
    ]
