from django.db import migrations


PERMISSIONS = [
    ('report.view', 'View Reports', 'Reports', 'Can view operational and financial reports for permitted outlets.'),
]


def seed_permissions(apps, schema_editor):
    Definition = apps.get_model('organizations', 'PermissionDefinition')
    Organisation = apps.get_model('organizations', 'Organisation')
    Role = apps.get_model('organizations', 'Role')
    RolePermission = apps.get_model('organizations', 'RolePermission')
    permission, _ = Definition.objects.update_or_create(
        code='report.view',
        defaults={
            'name': 'View Reports', 'module': 'Reports',
            'description': 'Can view operational and financial reports for permitted outlets.',
            'is_active': True,
        },
    )
    for organisation in Organisation.objects.all():
        for role in Role.objects.filter(
            organisation=organisation, is_system=True,
            name__in=('Administrator', 'Manager', 'Accountant'),
        ):
            RolePermission.objects.get_or_create(role=role, permission=permission)


def reverse_permissions(apps, schema_editor):
    apps.get_model('organizations', 'PermissionDefinition').objects.filter(code='report.view').delete()


class Migration(migrations.Migration):
    dependencies = [
        ('organizations', '0022_seed_digital_settlement_permissions'),
        ('accounting', '0006_seed_shift_accounting_accounts'),
    ]
    operations = [migrations.RunPython(seed_permissions, reverse_permissions)]
