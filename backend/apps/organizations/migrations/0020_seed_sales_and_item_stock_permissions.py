from django.db import migrations


def seed_permissions(apps, schema_editor):
    PermissionDefinition = apps.get_model('organizations', 'PermissionDefinition')
    Organisation = apps.get_model('organizations', 'Organisation')
    Role = apps.get_model('organizations', 'Role')
    RolePermission = apps.get_model('organizations', 'RolePermission')
    definitions = [
        ('sales_invoice.view', 'View Sales Invoices', 'Sales', 'Can view sales invoices.'),
        ('sales_invoice.create', 'Create Sales Invoices', 'Sales', 'Can create cash and credit sales invoices.'),
        ('sales_invoice.void', 'Void Sales Invoices', 'Sales', 'Can void sales invoices with reversal.'),
        ('customer_outstanding.view', 'View Customer Outstanding', 'Sales', 'Can view customer receivables and statements.'),
        ('customer_receipt.view', 'View Customer Receipts', 'Sales', 'Can view customer receipts and allocations.'),
        ('customer_receipt.create', 'Create Customer Receipts', 'Sales', 'Can record and allocate customer receipts.'),
        ('customer_receipt.void', 'Void Customer Receipts', 'Sales', 'Can reverse customer receipts and allocations.'),
        ('item_stock.view', 'View Item Stock', 'Inventory', 'Can view ordinary item balances and movements.'),
        ('item_stock.adjust', 'Adjust Item Stock', 'Inventory', 'Can create ordinary item stock adjustments.'),
        ('item_stock.reverse', 'Reverse Item Stock Adjustments', 'Inventory', 'Can reverse ordinary item stock adjustments.'),
    ]
    permission_objects = {}
    for code, name, module, description in definitions:
        permission_objects[code], _ = PermissionDefinition.objects.update_or_create(code=code, defaults={'name': name, 'module': module, 'description': description, 'is_active': True})
    for organisation in Organisation.objects.all():
        for role in Role.objects.filter(organisation=organisation, is_system=True):
            if role.name in ('Administrator', 'Manager'):
                codes = permission_objects.keys()
            elif role.name == 'Accountant':
                codes = ('sales_invoice.view', 'sales_invoice.create', 'sales_invoice.void', 'customer_outstanding.view', 'customer_receipt.view', 'customer_receipt.create', 'customer_receipt.void', 'item_stock.view')
            elif role.name == 'Shift Operator':
                codes = ('sales_invoice.view', 'sales_invoice.create', 'customer_receipt.view', 'customer_receipt.create', 'item_stock.view')
            else:
                codes = ()
            for code in codes:
                RolePermission.objects.get_or_create(role=role, permission=permission_objects[code])


def reverse_permissions(apps, schema_editor):
    apps.get_model('organizations', 'PermissionDefinition').objects.filter(code__in=[
        'sales_invoice.view', 'sales_invoice.create', 'sales_invoice.void', 'customer_outstanding.view',
        'customer_receipt.view', 'customer_receipt.create', 'customer_receipt.void',
        'item_stock.view', 'item_stock.adjust', 'item_stock.reverse',
    ]).delete()


class Migration(migrations.Migration):
    dependencies = [('organizations', '0019_seed_supplier_payment_permissions'), ('sales', '0001_initial')]
    operations = [migrations.RunPython(seed_permissions, reverse_permissions)]
