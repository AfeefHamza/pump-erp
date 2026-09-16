from django.db import migrations


PERMISSIONS = [
    ('digital_settlement.view', 'View Digital Settlements', 'Finance', 'Can view pending digital collections and settlements.'),
    ('digital_settlement.create', 'Create Digital Settlements', 'Finance', 'Can record card, UPI and fleet-card settlements.'),
    ('digital_settlement.void', 'Void Digital Settlements', 'Finance', 'Can void digital settlements with exact reversals.'),
]


def seed_permissions(apps, schema_editor):
    Definition = apps.get_model('organizations', 'PermissionDefinition')
    Organisation = apps.get_model('organizations', 'Organisation')
    Role = apps.get_model('organizations', 'Role')
    RolePermission = apps.get_model('organizations', 'RolePermission')
    definitions = {}
    for code, name, module, description in PERMISSIONS:
        definitions[code], _ = Definition.objects.update_or_create(
            code=code, defaults={'name': name, 'module': module, 'description': description, 'is_active': True},
        )
    for organisation in Organisation.objects.all():
        for role in Role.objects.filter(organisation=organisation, is_system=True):
            codes = tuple(definitions) if role.name in ('Administrator', 'Manager', 'Accountant') else ()
            for code in codes:
                RolePermission.objects.get_or_create(role=role, permission=definitions[code])


def reverse_permissions(apps, schema_editor):
    apps.get_model('organizations', 'PermissionDefinition').objects.filter(code__in=[row[0] for row in PERMISSIONS]).delete()


class Migration(migrations.Migration):
    dependencies = [('organizations', '0021_seed_expense_cash_bank_permissions'), ('finance', '0010_digital_settlements')]
    operations = [migrations.RunPython(seed_permissions, reverse_permissions)]
