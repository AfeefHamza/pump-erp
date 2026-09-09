# Generated for Milestone 11: Tanker Receipts and Fuel Stock Ledger

from django.db import migrations

def seed_milestone11_permissions(apps, schema_editor):
    PermissionDefinition = apps.get_model('organizations', 'PermissionDefinition')
    Organisation = apps.get_model('organizations', 'Organisation')
    Role = apps.get_model('organizations', 'Role')
    RolePermission = apps.get_model('organizations', 'RolePermission')

    permissions_to_seed = [
        {"code": "tanker_receipt.view", "name": "View Tanker Receipts", "module": "Purchases", "description": "Can view tanker receipts and attachments."},
        {"code": "tanker_receipt.create", "name": "Create Tanker Receipts", "module": "Purchases", "description": "Can record draft tanker receipts."},
        {"code": "tanker_receipt.update", "name": "Update Tanker Receipts", "module": "Purchases", "description": "Can edit unconfirmed tanker receipts."},
        {"code": "tanker_receipt.confirm", "name": "Confirm Tanker Receipts", "module": "Purchases", "description": "Can confirm tanker receipts and post immutable stock movements."},
        {"code": "tanker_receipt.void", "name": "Void Tanker Receipts", "module": "Purchases", "description": "Can void confirmed tanker receipts with mandatory reason."},
        {"code": "fuel_stock.view", "name": "View Fuel Stock", "module": "Inventory", "description": "Can view tank stock dashboard and movement ledger."},
        {"code": "fuel_stock.adjust", "name": "Adjust Fuel Stock", "module": "Inventory", "description": "Can record and reverse controlled stock adjustments."},
        {"code": "fuel_stock.override_book_quantity", "name": "Override Book Quantity", "module": "Purchases", "description": "Can override accepted book quantity from invoice quantity."},
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
        'tanker_receipt.view',
        'tanker_receipt.create',
        'tanker_receipt.update',
        'tanker_receipt.confirm',
        'fuel_stock.view'
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


def rollback_milestone11_permissions(apps, schema_editor):
    PermissionDefinition = apps.get_model('organizations', 'PermissionDefinition')
    codes = [
        'tanker_receipt.view', 'tanker_receipt.create', 'tanker_receipt.update',
        'tanker_receipt.confirm', 'tanker_receipt.void', 'fuel_stock.view',
        'fuel_stock.adjust', 'fuel_stock.override_book_quantity'
    ]
    PermissionDefinition.objects.filter(code__in=codes).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('organizations', '0012_seed_shift_card_permissions'),
    ]

    operations = [
        migrations.RunPython(seed_milestone11_permissions, rollback_milestone11_permissions),
    ]
