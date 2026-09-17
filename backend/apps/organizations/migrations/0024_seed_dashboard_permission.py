from django.db import migrations


def seed_permission(apps, schema_editor):
    Definition = apps.get_model('organizations', 'PermissionDefinition')
    Organisation = apps.get_model('organizations', 'Organisation')
    Role = apps.get_model('organizations', 'Role')
    RolePermission = apps.get_model('organizations', 'RolePermission')
    permission, _ = Definition.objects.update_or_create(
        code='dashboard.view',
        defaults={
            'name': 'View Management Dashboard', 'module': 'Dashboard',
            'description': 'Can view outlet management totals, stock indicators, outstanding balances, and alerts.',
            'is_active': True,
        },
    )
    for organisation in Organisation.objects.all():
        for role in Role.objects.filter(
            organisation=organisation, is_system=True,
            name__in=('Administrator', 'Manager', 'Accountant'),
        ):
            RolePermission.objects.get_or_create(role=role, permission=permission)


def reverse_permission(apps, schema_editor):
    apps.get_model('organizations', 'PermissionDefinition').objects.filter(code='dashboard.view').delete()


class Migration(migrations.Migration):
    dependencies = [('organizations', '0023_seed_report_permissions')]
    operations = [migrations.RunPython(seed_permission, reverse_permission)]
