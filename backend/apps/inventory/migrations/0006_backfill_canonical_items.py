# Generated data migration
from datetime import date
from decimal import Decimal
from django.db import migrations
from django.db.models.functions import Lower


def backfill_canonical_items(apps, schema_editor):
    Organisation = apps.get_model('organizations', 'Organisation')
    UnitMaster = apps.get_model('inventory', 'UnitMaster')
    Item = apps.get_model('inventory', 'Item')
    FuelItemProfile = apps.get_model('inventory', 'FuelItemProfile')
    StockItemProfile = apps.get_model('inventory', 'StockItemProfile')
    ItemCodeAlias = apps.get_model('inventory', 'ItemCodeAlias')

    FuelProduct = apps.get_model('forecourt', 'FuelProduct')
    Tank = apps.get_model('forecourt', 'Tank')
    ProductPrice = apps.get_model('forecourt', 'ProductPrice')

    PurchaseItem = apps.get_model('purchases', 'PurchaseItem')
    PurchaseTaxCode = apps.get_model('purchases', 'PurchaseTaxCode')
    ItemPurchaseTaxTreatment = apps.get_model('purchases', 'ItemPurchaseTaxTreatment')
    TankerReceiptProductLine = apps.get_model('purchases', 'TankerReceiptProductLine')
    PurchaseBillLine = apps.get_model('purchases', 'PurchaseBillLine')
    ProductPurchaseTaxMapping = apps.get_model('purchases', 'ProductPurchaseTaxMapping')
    TankStockMovement = apps.get_model('inventory', 'TankStockMovement')

    STANDARD_UNITS = [
        {'code': 'LTR', 'name': 'Litre', 'symbol': 'L'},
        {'code': 'KL', 'name': 'Kilolitre', 'symbol': 'KL'},
        {'code': 'PCS', 'name': 'Piece', 'symbol': 'pcs'},
        {'code': 'BOX', 'name': 'Box', 'symbol': 'box'},
        {'code': 'DRUM', 'name': 'Drum', 'symbol': 'drm'},
        {'code': 'KG', 'name': 'Kilogram', 'symbol': 'kg'},
        {'code': 'SRV', 'name': 'Service', 'symbol': 'srv'},
    ]

    for org in Organisation.objects.all():
        # 1. Ensure Standard Units
        unit_map = {}
        for u in STANDARD_UNITS:
            obj, _ = UnitMaster.objects.get_or_create(
                organisation=org,
                code=u['code'],
                defaults={'name': u['name'], 'symbol': u['symbol'], 'is_active': True}
            )
            unit_map[u['code']] = obj
            unit_map[u['name'].lower()] = obj

        ltr_unit = unit_map['LTR']
        pcs_unit = unit_map['PCS']
        srv_unit = unit_map['SRV']

        # 2. Backfill Fuel Products
        for fp in FuelProduct.objects.filter(organisation=org):
            if fp.canonical_item_id:
                continue

            # Unit mapping
            base_unit = ltr_unit
            if fp.unit and fp.unit.lower() in ('kilogram', 'kg'):
                base_unit = unit_map.get('KG', ltr_unit)

            # Check code collision
            is_conflict = False
            code_candidate = fp.code.strip()
            if Item.objects.filter(organisation=org, code__iexact=code_candidate).exists():
                is_conflict = True
                code_candidate = f"FUEL_{fp.code.strip()}"

            canonical_item = Item.objects.create(
                organisation=org,
                code=code_candidate,
                name=fp.name.strip(),
                short_name=fp.short_name,
                item_type='fuel',
                category='Fuel',
                base_unit=base_unit,
                inventory_tracking_mode='tank',
                is_purchasable=True,
                is_sellable=True,
                is_active=fp.is_active,
                display_order=fp.display_order
            )

            FuelItemProfile.objects.create(
                item=canonical_item,
                fuel_category=fp.category,
                custom_category_name=fp.custom_category_name,
                short_code=fp.short_name,
                stock_unit=base_unit,
                price_configuration_eligible=True,
                forecourt_display_order=fp.display_order
            )

            ItemCodeAlias.objects.create(
                organisation=org,
                item=canonical_item,
                alias_code=fp.code.strip(),
                source='legacy_fuel_product',
                is_conflict=is_conflict,
                notes='Legacy fuel product code' if not is_conflict else 'Conflict detected during migration'
            )

            fp.canonical_item = canonical_item
            fp.save(update_fields=['canonical_item'])

            # Default tax treatment for fuel (non-gst petroleum)
            petro_tax = PurchaseTaxCode.objects.filter(organisation=org, tax_regime='non_gst_petroleum').first()
            if petro_tax:
                ItemPurchaseTaxTreatment.objects.get_or_create(
                    organisation=org,
                    item=canonical_item,
                    tax_treatment=petro_tax,
                    defaults={
                        'default_itc_classification': 'not_applicable',
                        'effective_from': date(2000, 1, 1)
                    }
                )

        # 3. Backfill Purchase Items
        for pi in PurchaseItem.objects.filter(organisation=org):
            if pi.canonical_item_id:
                continue

            raw_unit = (pi.unit or '').strip().lower()
            base_unit = unit_map.get(raw_unit.upper(), unit_map.get(raw_unit, pcs_unit))
            item_type = 'stock_item' if pi.item_type == 'goods' else 'service'
            tracking_mode = 'quantity' if item_type == 'stock_item' else 'none'
            if item_type == 'service':
                base_unit = srv_unit

            # Check code collision
            is_conflict = False
            code_candidate = pi.code.strip()
            if Item.objects.filter(organisation=org, code__iexact=code_candidate).exists():
                is_conflict = True
                code_candidate = f"ITEM_{pi.code.strip()}"

            canonical_item = Item.objects.create(
                organisation=org,
                code=code_candidate,
                name=pi.name.strip(),
                item_type=item_type,
                base_unit=base_unit,
                hsn_sac=pi.hsn_sac,
                inventory_tracking_mode=tracking_mode,
                is_purchasable=True,
                is_sellable=True,
                is_active=pi.is_active
            )

            if item_type == 'stock_item':
                StockItemProfile.objects.create(
                    item=canonical_item,
                    reorder_level=Decimal('0.0000'),
                    preferred_purchase_unit=base_unit,
                    sales_unit=base_unit,
                    valuation_method='fifo'
                )

            ItemCodeAlias.objects.create(
                organisation=org,
                item=canonical_item,
                alias_code=pi.code.strip(),
                source='legacy_purchase_item',
                is_conflict=is_conflict,
                notes='Legacy purchase item code' if not is_conflict else 'Conflict detected during migration'
            )

            pi.canonical_item = canonical_item
            pi.save(update_fields=['canonical_item'])

            if pi.default_purchase_tax_code:
                ItemPurchaseTaxTreatment.objects.get_or_create(
                    organisation=org,
                    item=canonical_item,
                    tax_treatment=pi.default_purchase_tax_code,
                    defaults={
                        'default_itc_classification': pi.default_itc_classification or 'pending_review',
                        'effective_from': date(2000, 1, 1)
                    }
                )

    # 4. Backfill Forecourt references
    for tank in Tank.objects.filter(item__isnull=True, product__canonical_item__isnull=False):
        tank.item = tank.product.canonical_item
        tank.save(update_fields=['item'])

    for pp in ProductPrice.objects.filter(item__isnull=True, product__canonical_item__isnull=False):
        pp.item = pp.product.canonical_item
        pp.save(update_fields=['item'])

    # 5. Backfill Purchases references
    for trl in TankerReceiptProductLine.objects.filter(item__isnull=True, product__canonical_item__isnull=False):
        trl.item = trl.product.canonical_item
        trl.save(update_fields=['item'])

    for pbl in PurchaseBillLine.objects.filter(item__isnull=True):
        updated = False
        if pbl.product and pbl.product.canonical_item:
            pbl.item = pbl.product.canonical_item
            updated = True
        elif pbl.purchase_item and pbl.purchase_item.canonical_item:
            pbl.item = pbl.purchase_item.canonical_item
            updated = True

        if pbl.tax_code:
            pbl.tax_treatment_id = pbl.tax_code.id
            pbl.tax_treatment_name = pbl.tax_code.name
            pbl.tax_regime = pbl.tax_code.tax_regime
            updated = True

        if pbl.tax_code_rate_version_id:
            pbl.effective_rate_version_id = pbl.tax_code_rate_version_id
            updated = True

        if updated:
            pbl.save(update_fields=['item', 'tax_treatment_id', 'tax_treatment_name', 'tax_regime', 'effective_rate_version_id'])

    for mapping in ProductPurchaseTaxMapping.objects.filter(item__isnull=True):
        if mapping.fuel_product and mapping.fuel_product.canonical_item:
            mapping.item = mapping.fuel_product.canonical_item
            mapping.save(update_fields=['item'])
        elif mapping.purchase_item and mapping.purchase_item.canonical_item:
            mapping.item = mapping.purchase_item.canonical_item
            mapping.save(update_fields=['item'])

    # 6. Backfill Inventory stock movements
    for movement in TankStockMovement.objects.filter(item__isnull=True, fuel_product__canonical_item__isnull=False):
        movement.item = movement.fuel_product.canonical_item
        movement.save(update_fields=['item'])


def reverse_backfill(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0005_item_tankstockmovement_item_unitmaster_and_more'),
        ('forecourt', '0003_fuelproduct_canonical_item_productprice_item_and_more'),
        ('purchases', '0006_productpurchasetaxmapping_item_and_more'),
    ]

    operations = [
        migrations.RunPython(backfill_canonical_items, reverse_backfill),
    ]
