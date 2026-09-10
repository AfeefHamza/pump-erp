# apps/organizations/migrations/0015_seed_milestone12_permissions.py
from django.db import migrations


def seed_milestone12_permissions(apps, schema_editor):
    PermissionDefinition = apps.get_model('organizations', 'PermissionDefinition')
    Organisation = apps.get_model('organizations', 'Organisation')
    Role = apps.get_model('organizations', 'Role')
    RolePermission = apps.get_model('organizations', 'RolePermission')

    permissions_to_seed = [
        {
            "code": "purchase_bill.view",
            "name": "View Purchase Bills",
            "module": "Purchases",
            "description": "Can view purchase bills, lines, attachments, and audit history."
        },
        {
            "code": "purchase_bill.create",
            "name": "Create Purchase Bills",
            "module": "Purchases",
            "description": "Can record purchase bills and upload attachments."
        },
        {
            "code": "purchase_bill.update",
            "name": "Update Purchase Bills",
            "module": "Purchases",
            "description": "Can edit active unpaid purchase bills."
        },
        {
            "code": "purchase_bill.void",
            "name": "Void Purchase Bills",
            "module": "Purchases",
            "description": "Can void active purchase bills with mandatory reason."
        },
        {
            "code": "purchase_bill.override_receipt_quantity",
            "name": "Override Receipt Quantity",
            "module": "Purchases",
            "description": "Can override purchase bill quantity from tanker receipt invoice quantity."
        },
        {
            "code": "supplier_outstanding.view",
            "name": "View Supplier Outstanding",
            "module": "Purchases",
            "description": "Can view supplier outstanding summary, statements, and ageing buckets."
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
        'purchase_bill.view',
        'purchase_bill.create',
        'purchase_bill.update',
        'supplier_outstanding.view'
    ]
    accountant_perms = [
        'purchase_bill.view',
        'purchase_bill.create',
        'purchase_bill.update',
        'supplier_outstanding.view'
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


def rollback_milestone12_permissions(apps, schema_editor):
    PermissionDefinition = apps.get_model('organizations', 'PermissionDefinition')
    codes = [
        'purchase_bill.view',
        'purchase_bill.create',
        'purchase_bill.update',
        'purchase_bill.void',
        'purchase_bill.override_receipt_quantity',
        'supplier_outstanding.view',
    ]
    PermissionDefinition.objects.filter(code__in=codes).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('organizations', '0014_outlet_timezone'),
    ]

    operations = [
        migrations.RunPython(seed_milestone12_permissions, rollback_milestone12_permissions),
    ]
