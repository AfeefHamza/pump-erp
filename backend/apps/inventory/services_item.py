# apps/inventory/services_item.py
"""
Canonical Item Master Services.
Authoritative source for all Item Master records across Pump ERP.
Zero dependencies on apps.purchases to ensure strict acyclic architecture.
"""
from datetime import date
from decimal import Decimal
from typing import Optional, Dict, Any
from django.apps import apps
from django.db import transaction
from django.core.exceptions import ValidationError
from django.utils.dateparse import parse_date

from apps.organizations.models import Organisation
from .models import (
    UnitMaster, UnitConversion, Item,
    FuelItemProfile, StockItemProfile, ItemCodeAlias
)


def _normalise_effective_date(value) -> date:
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        parsed = parse_date(value)
        if parsed:
            return parsed
    return date.today()


def _default_itc_classification(item_type: str, tax_regime: str) -> str:
    if tax_regime != 'gst':
        return 'not_applicable'
    if item_type == Item.ITEM_TYPE_SERVICE:
        return 'eligible_input_services'
    return 'eligible_inputs'


@transaction.atomic
def create_canonical_item(
    organisation: Organisation,
    code: str,
    name: str,
    item_type: str,
    base_unit: UnitMaster,
    short_name: Optional[str] = None,
    category: Optional[str] = None,
    description: Optional[str] = None,
    hsn_sac: Optional[str] = None,
    barcode: Optional[str] = None,
    is_purchasable: bool = True,
    is_sellable: bool = True,
    inventory_tracking_mode: Optional[str] = None,
    is_active: bool = True,
    display_order: int = 0,
    created_by=None,
    fuel_profile_data: Optional[Dict[str, Any]] = None,
    stock_profile_data: Optional[Dict[str, Any]] = None,
    tax_treatment_id: Optional[str] = None,
    default_itc_classification: Optional[str] = None,
    effective_from: Optional[date] = None,
) -> Item:
    """
    Creates a canonical Item Master record, its profile, and synchronously
    syncs a one-way backward compatibility record (FuelProduct or PurchaseItem).
    """
    code = (code or '').strip()
    name = (name or '').strip()

    if not code:
        raise ValidationError({'code': "Item code is required."})
    if not name:
        raise ValidationError({'name': "Item name is required."})
    if not base_unit:
        raise ValidationError({'base_unit': "Base unit is required."})
    if base_unit.organisation_id != organisation.id:
        raise ValidationError({'base_unit': "Base unit must belong to the same organisation."})

    # Check unique code within organisation (case-insensitive)
    if Item.objects.filter(organisation=organisation, code__iexact=code).exists():
        raise ValidationError({'code': f"Item with code '{code}' already exists in this organisation."})

    # Check barcode uniqueness
    if barcode and barcode.strip():
        barcode = barcode.strip()
        if Item.objects.filter(organisation=organisation, barcode=barcode).exists():
            raise ValidationError({'barcode': f"Item with barcode '{barcode}' already exists in this organisation."})
    else:
        barcode = None

    # Derive tracking mode
    if item_type == Item.ITEM_TYPE_FUEL:
        tracking_mode = Item.TRACKING_TANK
    elif item_type == Item.ITEM_TYPE_STOCK:
        tracking_mode = inventory_tracking_mode or Item.TRACKING_QUANTITY
    else:
        tracking_mode = Item.TRACKING_NONE

    item = Item(
        organisation=organisation,
        code=code,
        name=name,
        short_name=short_name.strip() if short_name else None,
        item_type=item_type,
        category=category.strip() if category else None,
        description=description,
        base_unit=base_unit,
        hsn_sac=hsn_sac.strip() if hsn_sac else None,
        barcode=barcode,
        is_purchasable=is_purchasable,
        is_sellable=is_sellable,
        inventory_tracking_mode=tracking_mode,
        is_active=is_active,
        display_order=display_order,
        created_by=created_by,
        updated_by=created_by,
    )
    item.full_clean()
    item.save()

    # Create Item Profile
    if item_type == Item.ITEM_TYPE_FUEL:
        fp_data = fuel_profile_data or {}
        stock_unit = fp_data.get('stock_unit') or base_unit
        profile = FuelItemProfile(
            item=item,
            fuel_category=fp_data.get('fuel_category', 'petrol'),
            custom_category_name=fp_data.get('custom_category_name'),
            short_code=fp_data.get('short_code') or item.short_name,
            stock_unit=stock_unit,
            density_std=fp_data.get('density_std'),
            density_min=fp_data.get('density_min'),
            density_max=fp_data.get('density_max'),
            price_configuration_eligible=fp_data.get('price_configuration_eligible', True),
            forecourt_display_order=fp_data.get('forecourt_display_order', 0),
        )
        profile.full_clean()
        profile.save()

        # One-way backward-compatibility sync to FuelProduct
        try:
            FuelProduct = apps.get_model('forecourt', 'FuelProduct')
            legacy_unit = FuelProduct.UNIT_KILOGRAM if item.base_unit.code.upper() == 'KG' else FuelProduct.UNIT_LITRE
            FuelProduct.objects.create(
                organisation=organisation,
                code=item.code,
                name=item.name,
                short_name=item.short_name,
                category=profile.fuel_category,
                custom_category_name=profile.custom_category_name,
                unit=legacy_unit,
                display_order=profile.forecourt_display_order,
                is_active=item.is_active,
                canonical_item=item,
            )
        except Exception:
            pass

    elif item_type == Item.ITEM_TYPE_STOCK:
        sp_data = stock_profile_data or {}
        profile = StockItemProfile(
            item=item,
            brand=sp_data.get('brand'),
            reorder_level=sp_data.get('reorder_level') or Decimal('0.0000'),
            preferred_purchase_unit=sp_data.get('preferred_purchase_unit') or base_unit,
            sales_unit=sp_data.get('sales_unit') or base_unit,
            valuation_method=sp_data.get('valuation_method', StockItemProfile.VALUATION_FIFO),
        )
        profile.full_clean()
        profile.save()

    # One-way backward-compatibility sync to PurchaseItem (for non-fuel items)
    if item_type != Item.ITEM_TYPE_FUEL:
        try:
            PurchaseItem = apps.get_model('purchases', 'PurchaseItem')
            legacy_item_type = 'service' if item_type == Item.ITEM_TYPE_SERVICE else 'goods'
            # Check if legacy item code conflicts
            existing_legacy = PurchaseItem.objects.filter(organisation=organisation, code__iexact=item.code).first()
            if not existing_legacy:
                PurchaseItem.objects.create(
                    organisation=organisation,
                    code=item.code,
                    name=item.name,
                    item_type=legacy_item_type,
                    category=item.category,
                    description=item.description,
                    default_unit=item.base_unit.code,
                    hsn_sac=item.hsn_sac,
                    is_active=item.is_active,
                    canonical_item=item,
                )
            else:
                existing_legacy.canonical_item = item
                existing_legacy.save(update_fields=['canonical_item'])
        except Exception:
            pass

    # Create canonical code alias
    ItemCodeAlias.objects.get_or_create(
        organisation=organisation,
        alias_code=item.code,
        defaults={
            'item': item,
            'source': 'canonical',
            'is_conflict': False,
            'notes': 'Created with canonical item',
        }
    )

    # Attach the selected default purchase tax treatment. The item endpoint owns
    # this operation so the ERP form can save the item and its tax default once.
    if tax_treatment_id:
        ItemPurchaseTaxTreatment = apps.get_model('purchases', 'ItemPurchaseTaxTreatment')
        PurchaseTaxCode = apps.get_model('purchases', 'PurchaseTaxCode')
        try:
            tax_treatment = PurchaseTaxCode.objects.get(
                id=tax_treatment_id,
                organisation=organisation,
                is_active=True,
            )
        except PurchaseTaxCode.DoesNotExist as exc:
            raise ValidationError({'tax_treatment_id': "Select a valid active tax treatment."}) from exc

        ItemPurchaseTaxTreatment.objects.create(
            organisation=organisation,
            item=item,
            tax_treatment=tax_treatment,
            default_itc_classification=(
                default_itc_classification
                or _default_itc_classification(item_type, tax_treatment.tax_regime)
            ),
            effective_from=_normalise_effective_date(effective_from),
        )

    return item


@transaction.atomic
def update_canonical_item(
    item: Item,
    user=None,
    **data
) -> Item:
    """
    Updates canonical Item and its profile, enforcing type immutability
    and propagating updates one-way to legacy compatibility records.
    """
    # 1. Type immutability check
    new_type = data.get('item_type')
    if new_type and new_type != item.item_type:
        if item.item_type == Item.ITEM_TYPE_FUEL:
            if hasattr(item, 'tanks') and item.tanks.exists():
                raise ValidationError("Cannot change item type of fuel assigned to tanks.")
            if hasattr(item, 'stock_movements') and item.stock_movements.exists():
                raise ValidationError("Cannot change item type of fuel with tank stock movements.")
        elif item.item_type == Item.ITEM_TYPE_STOCK and new_type in (Item.ITEM_TYPE_SERVICE, Item.ITEM_TYPE_NON_STOCK):
            if hasattr(item, 'stock_movements') and item.stock_movements.exists():
                raise ValidationError("Cannot change stock item to service or non-stock when inventory ledger history exists.")
        item.item_type = new_type

    # 2. Code uniqueness check if modified
    new_code = data.get('code')
    if new_code:
        new_code = new_code.strip()
        if new_code.lower() != item.code.lower():
            if Item.objects.filter(organisation=item.organisation, code__iexact=new_code).exclude(pk=item.pk).exists():
                raise ValidationError({'code': f"Item with code '{new_code}' already exists in this organisation."})
            # Preserve old code as alias
            ItemCodeAlias.objects.get_or_create(
                organisation=item.organisation,
                alias_code=item.code,
                defaults={
                    'item': item,
                    'source': 'historical_code_change',
                    'is_conflict': False,
                    'notes': f"Previous code before renaming to {new_code}",
                }
            )
            item.code = new_code

    # 3. Barcode check
    if 'barcode' in data:
        bc = (data['barcode'] or '').strip()
        if bc:
            if Item.objects.filter(organisation=item.organisation, barcode=bc).exclude(pk=item.pk).exists():
                raise ValidationError({'barcode': f"Item with barcode '{bc}' already exists."})
            item.barcode = bc
        else:
            item.barcode = None

    # 4. Standard fields
    for field in ['name', 'short_name', 'category', 'description', 'hsn_sac', 'is_purchasable', 'is_sellable', 'is_active', 'display_order']:
        if field in data:
            val = data[field]
            if isinstance(val, str) and field in ('name', 'short_name', 'category', 'hsn_sac'):
                val = val.strip() or (None if field != 'name' else '')
            setattr(item, field, val)

    if 'base_unit' in data and data['base_unit']:
        unit = data['base_unit']
        if unit.organisation_id != item.organisation_id:
            raise ValidationError({'base_unit': "Base unit must belong to the same organisation."})
        item.base_unit = unit

    if 'inventory_tracking_mode' in data and data['inventory_tracking_mode']:
        item.inventory_tracking_mode = data['inventory_tracking_mode']

    item.updated_by = user
    item.full_clean()
    item.save()

    # 5. Profile updates
    if item.item_type == Item.ITEM_TYPE_FUEL and 'fuel_profile' in data:
        fp_data = data['fuel_profile']
        profile, _ = FuelItemProfile.objects.get_or_create(item=item)
        if 'fuel_category' in fp_data:
            profile.fuel_category = fp_data['fuel_category']
        if 'custom_category_name' in fp_data:
            profile.custom_category_name = fp_data['custom_category_name']
        if 'short_code' in fp_data:
            profile.short_code = fp_data['short_code']
        if 'stock_unit' in fp_data:
            profile.stock_unit = fp_data['stock_unit']
        if 'density_std' in fp_data:
            profile.density_std = fp_data['density_std']
        if 'density_min' in fp_data:
            profile.density_min = fp_data['density_min']
        if 'density_max' in fp_data:
            profile.density_max = fp_data['density_max']
        if 'price_configuration_eligible' in fp_data:
            profile.price_configuration_eligible = fp_data['price_configuration_eligible']
        if 'forecourt_display_order' in fp_data:
            profile.forecourt_display_order = fp_data['forecourt_display_order']
        profile.full_clean()
        profile.save()

    elif item.item_type == Item.ITEM_TYPE_STOCK and 'stock_profile' in data:
        sp_data = data['stock_profile']
        profile, _ = StockItemProfile.objects.get_or_create(item=item)
        if 'brand' in sp_data:
            profile.brand = sp_data['brand']
        if 'reorder_level' in sp_data:
            profile.reorder_level = sp_data['reorder_level']
        if 'preferred_purchase_unit' in sp_data:
            profile.preferred_purchase_unit = sp_data['preferred_purchase_unit']
        if 'sales_unit' in sp_data:
            profile.sales_unit = sp_data['sales_unit']
        if 'valuation_method' in sp_data:
            profile.valuation_method = sp_data['valuation_method']
        profile.full_clean()
        profile.save()

    # 6. One-way backward compatibility sync to legacy record
    try:
        if item.item_type == Item.ITEM_TYPE_FUEL:
            FuelProduct = apps.get_model('forecourt', 'FuelProduct')
            legacy_fp = FuelProduct.objects.filter(canonical_item=item).first()
            if legacy_fp:
                legacy_fp.name = item.name
                legacy_fp.code = item.code
                legacy_fp.short_name = item.short_name
                legacy_fp.is_active = item.is_active
                if hasattr(item, 'fuel_profile'):
                    legacy_fp.category = item.fuel_profile.fuel_category
                    legacy_fp.custom_category_name = item.fuel_profile.custom_category_name
                    legacy_fp.density_std = item.fuel_profile.density_std
                    legacy_fp.density_min = item.fuel_profile.density_min
                    legacy_fp.density_max = item.fuel_profile.density_max
                    legacy_fp.price_configuration_eligible = item.fuel_profile.price_configuration_eligible
                    legacy_fp.forecourt_display_order = item.fuel_profile.forecourt_display_order
                legacy_fp.save()
        else:
            PurchaseItem = apps.get_model('purchases', 'PurchaseItem')
            legacy_pi = PurchaseItem.objects.filter(canonical_item=item).first()
            if legacy_pi:
                legacy_pi.name = item.name
                legacy_pi.code = item.code
                legacy_pi.is_active = item.is_active
                legacy_pi.category = item.category
                legacy_pi.description = item.description
                legacy_pi.hsn_sac = item.hsn_sac
                legacy_pi.default_unit = item.base_unit.code
                legacy_pi.save()
    except Exception:
        pass

    # 7. Update the current item tax default when explicitly supplied.
    if 'tax_treatment_id' in data and data['tax_treatment_id']:
        ItemPurchaseTaxTreatment = apps.get_model('purchases', 'ItemPurchaseTaxTreatment')
        PurchaseTaxCode = apps.get_model('purchases', 'PurchaseTaxCode')
        try:
            tax_treatment = PurchaseTaxCode.objects.get(
                id=data['tax_treatment_id'],
                organisation=item.organisation,
                is_active=True,
            )
        except PurchaseTaxCode.DoesNotExist as exc:
            raise ValidationError({'tax_treatment_id': "Select a valid active tax treatment."}) from exc

        eff_from = _normalise_effective_date(data.get('tax_treatment_effective_from'))
        itc_class = (
            data.get('default_itc_classification')
            or _default_itc_classification(item.item_type, tax_treatment.tax_regime)
        )
        existing_mapping = ItemPurchaseTaxTreatment.objects.filter(
            organisation=item.organisation,
            item=item,
            effective_to__isnull=True,
        ).order_by('-effective_from').first()

        if existing_mapping:
            existing_mapping.tax_treatment = tax_treatment
            existing_mapping.default_itc_classification = itc_class
            existing_mapping.save(update_fields=[
                'tax_treatment', 'default_itc_classification', 'updated_at'
            ])
        else:
            ItemPurchaseTaxTreatment.objects.create(
                organisation=item.organisation,
                item=item,
                tax_treatment=tax_treatment,
                default_itc_classification=itc_class,
                effective_from=eff_from,
            )

    return item


@transaction.atomic
def deactivate_canonical_item(item: Item, user=None) -> Item:
    """
    Deactivates canonical Item and immediately reflects deactivation
    in legacy selectors and compatibility models.
    """
    item.is_active = False
    item.updated_by = user
    item.save(update_fields=['is_active', 'updated_by', 'updated_at'])

    # Synchronously deactivate legacy record
    try:
        FuelProduct = apps.get_model('forecourt', 'FuelProduct')
        FuelProduct.objects.filter(canonical_item=item).update(is_active=False)
    except Exception:
        pass

    try:
        PurchaseItem = apps.get_model('purchases', 'PurchaseItem')
        PurchaseItem.objects.filter(canonical_item=item).update(is_active=False)
    except Exception:
        pass

    return item


def resolve_legacy_item(organisation: Organisation, identifier: Any) -> Optional[Item]:
    """
    Resolves an item identifier (canonical UUID, legacy FuelProduct UUID,
    legacy PurchaseItem UUID, canonical code, or legacy alias code) to a canonical Item.
    """
    if not identifier:
        return None

    str_ident = str(identifier).strip()

    is_uuid = False
    try:
        import uuid
        uuid.UUID(str_ident)
        is_uuid = True
    except (ValueError, AttributeError):
        is_uuid = False

    if is_uuid:
        # 1. Try UUID lookup directly on Item
        item = Item.objects.filter(organisation=organisation, id=str_ident).first()
        if item:
            return item

        # 2. Try legacy FuelProduct ID
        try:
            FuelProduct = apps.get_model('forecourt', 'FuelProduct')
            fp = FuelProduct.objects.filter(organisation=organisation, id=str_ident).select_related('canonical_item').first()
            if fp and fp.canonical_item:
                return fp.canonical_item
        except Exception:
            pass

        # 3. Try legacy PurchaseItem ID
        try:
            PurchaseItem = apps.get_model('purchases', 'PurchaseItem')
            pi = PurchaseItem.objects.filter(organisation=organisation, id=str_ident).select_related('canonical_item').first()
            if pi and pi.canonical_item:
                return pi.canonical_item
        except Exception:
            pass

    # 4. Try Item Code directly (case-insensitive)
    item = Item.objects.filter(organisation=organisation, code__iexact=str_ident).first()
    if item:
        return item

    # 5. Try ItemCodeAlias (handles preserved legacy codes during migration conflict)
    alias = ItemCodeAlias.objects.filter(organisation=organisation, alias_code__iexact=str_ident).select_related('item').first()
    if alias:
        return alias.item

    # 6. Try legacy FuelProduct code
    try:
        FuelProduct = apps.get_model('forecourt', 'FuelProduct')
        fp = FuelProduct.objects.filter(organisation=organisation, code__iexact=str_ident).select_related('canonical_item').first()
        if fp and fp.canonical_item:
            return fp.canonical_item
    except Exception:
        pass

    # 7. Try legacy PurchaseItem code
    try:
        PurchaseItem = apps.get_model('purchases', 'PurchaseItem')
        pi = PurchaseItem.objects.filter(organisation=organisation, code__iexact=str_ident).select_related('canonical_item').first()
        if pi and pi.canonical_item:
            return pi.canonical_item
    except Exception:
        pass

    return None


def create_unit_master(
    organisation: Organisation,
    code: str,
    name: str,
    symbol: Optional[str] = None,
    is_active: bool = True
) -> UnitMaster:
    """
    Creates and validates an organization-scoped UnitMaster record.
    """
    unit = UnitMaster(
        organisation=organisation,
        code=(code or '').strip(),
        name=(name or '').strip(),
        symbol=(symbol or '').strip() if symbol else None,
        is_active=is_active
    )
    unit.full_clean()
    unit.save()
    return unit


def create_unit_conversion(
    organisation: Organisation,
    from_unit: UnitMaster,
    to_unit: UnitMaster,
    multiplier: Decimal,
    item: Optional[Item] = None,
    is_active: bool = True
) -> UnitConversion:
    """
    Creates and validates a UnitConversion with tenant and multiplier constraints.
    """
    conversion = UnitConversion(
        organisation=organisation,
        item=item,
        from_unit=from_unit,
        to_unit=to_unit,
        multiplier=multiplier,
        is_active=is_active
    )
    conversion.full_clean()
    conversion.save()
    return conversion
