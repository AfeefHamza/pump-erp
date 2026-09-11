# apps/organizations/migrations/0018_seed_unified_item_and_tax_treatment_permissions.py
from django.db import migrations


def seed_item_and_tax_treatment_permissions(apps, schema_editor):
    PermissionDefinition = apps.get_model('organizations', 'PermissionDefinition')
    Organisation = apps.get_model('organizations', 'Organisation')
    Role = apps.get_model('organizations', 'Role')
    RolePermission = apps.get_model('organizations', 'RolePermission')

    permissions_to_seed = [
        {
            "code": "item.view",
            "name": "View Items",
            "module": "Inventory",
            "description": "Can view unified item catalog and item details."
        },
        {
            "code": "item.create",
            "name": "Create Items",
            "module": "Inventory",
            "description": "Can create fuel, stock items, non-stock items, and services."
        },
        {
            "code": "item.update",
            "name": "Update Items",
            "module": "Inventory",
            "description": "Can edit item details, profiles, and unit conversions."
        },
        {
            "code": "item.deactivate",
            "name": "Deactivate Items",
            "module": "Inventory",
            "description": "Can activate or deactivate items in the item master."
        },
        {
            "code": "tax_treatment.view",
            "name": "View Tax Treatments",
            "module": "Settings",
            "description": "Can view tax treatments, regimes, and rate versions."
        },
        {
            "code": "tax_treatment.create",
            "name": "Create Tax Treatments",
            "module": "Settings",
            "description": "Can create tax treatments and new rate versions."
        },
        {
            "code": "tax_treatment.update",
            "name": "Update Tax Treatments",
            "module": "Settings",
            "description": "Can edit tax treatments and add rate versions/components."
        },
        {
            "code": "tax_treatment.deactivate",
            "name": "Deactivate Tax Treatments",
            "module": "Settings",
            "description": "Can deactivate or activate tax treatments."
        },
    ]

    perm_objects = {}
    for p_data in permissions_to_seed:
        obj, _ = PermissionDefinition.objects.update_or_create(
            code=p_data['code'],
            defaults={
                'name': p_data['name'],
                'module': p_data['module'],
                'description': p_data['description'],
                'is_active': True
            }
        )
        perm_objects[p_data['code']] = obj

    for org in Organisation.objects.all():
        roles = Role.objects.filter(organisation=org)
        for role in roles:
            existing_codes = set(
                RolePermission.objects.filter(role=role).values_list('permission__code', flat=True)
            )

            # Administrator gets all
            if role.name == 'Administrator' and role.is_system:
                for p_code, p_obj in perm_objects.items():
                    RolePermission.objects.get_or_create(role=role, permission=p_obj)
                continue

            # Migrate from fuel_product and purchase_item
            if 'fuel_product.view' in existing_codes or 'purchase_item.view' in existing_codes:
                RolePermission.objects.get_or_create(role=role, permission=perm_objects['item.view'])

            if 'fuel_product.create' in existing_codes or 'purchase_item.create' in existing_codes:
                RolePermission.objects.get_or_create(role=role, permission=perm_objects['item.create'])

            if 'fuel_product.update' in existing_codes or 'purchase_item.update' in existing_codes:
                RolePermission.objects.get_or_create(role=role, permission=perm_objects['item.update'])

            if 'fuel_product.deactivate' in existing_codes:
                RolePermission.objects.get_or_create(role=role, permission=perm_objects['item.deactivate'])

            # Migrate from purchase_tax_code
            if 'purchase_tax_code.view' in existing_codes:
                RolePermission.objects.get_or_create(role=role, permission=perm_objects['tax_treatment.view'])

            if 'purchase_tax_code.create' in existing_codes:
                RolePermission.objects.get_or_create(role=role, permission=perm_objects['tax_treatment.create'])

            if 'purchase_tax_code.update' in existing_codes:
                RolePermission.objects.get_or_create(role=role, permission=perm_objects['tax_treatment.update'])


def reverse_seed(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('organizations', '0017_seed_purchase_tax_permissions'),
    ]

    operations = [
        migrations.RunPython(seed_item_and_tax_treatment_permissions, reverse_seed),
    ]
