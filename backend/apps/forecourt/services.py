# apps/forecourt/services.py
from django.db import transaction
from django.core.exceptions import ValidationError
from django.utils import timezone
from .models import FuelProduct, ProductPrice, Tank, Dispenser, Nozzle

@transaction.atomic
def create_fuel_product(organisation, code: str, name: str, **kwargs) -> FuelProduct:
    """
    Creates a new FuelProduct scoped to the organisation.
    """
    return FuelProduct.objects.create(
        organisation=organisation,
        code=code,
        name=name,
        short_name=kwargs.get('short_name'),
        category=kwargs.get('category', FuelProduct.CATEGORY_PETROL),
        custom_category_name=kwargs.get('custom_category_name'),
        unit=kwargs.get('unit', FuelProduct.UNIT_LITRE),
        display_order=kwargs.get('display_order', 0),
        is_active=kwargs.get('is_active', True)
    )


@transaction.atomic
def update_fuel_product(product: FuelProduct, **kwargs) -> FuelProduct:
    """
    Updates field values on an existing FuelProduct.
    """
    for field in ['code', 'name', 'short_name', 'category', 'custom_category_name', 'unit', 'display_order', 'is_active']:
        if field in kwargs:
            setattr(product, field, kwargs[field])
    product.save()
    return product


@transaction.atomic
def deactivate_fuel_product(product: FuelProduct) -> FuelProduct:
    """
    Sets a FuelProduct status to inactive.
    """
    product.is_active = False
    product.save()
    return product


@transaction.atomic
def set_product_price(organisation, outlet, product, selling_price, effective_from=None, created_by=None) -> ProductPrice:
    """
    Sets a product selling price at a specific effective time.
    Enforces non-overlapping time ranges by adjusting adjacent records.
    """
    from decimal import Decimal
    if not isinstance(selling_price, Decimal):
        selling_price = Decimal(str(selling_price))

    if effective_from is None:
        effective_from = timezone.now()

    # Double check tenant safety
    if outlet.organisation_id != organisation.id:
        raise ValidationError("The outlet does not belong to the organisation.")
    if product.organisation_id != organisation.id:
        raise ValidationError("The product does not belong to the organisation.")

    if selling_price <= 0:
        raise ValidationError("Price must be greater than zero.")

    # 1. Check for exact match of effective_from to avoid duplicate timestamp conflicts
    exact_match = ProductPrice.objects.filter(
        outlet=outlet,
        product=product,
        effective_from=effective_from
    ).first()
    if exact_match:
        raise ValidationError("A price starting at this exact time already exists.")

    # 2. Get next price (starts after effective_from)
    next_price = ProductPrice.objects.filter(
        outlet=outlet,
        product=product,
        effective_from__gt=effective_from
    ).order_by('effective_from').first()

    # 3. Get previous price (starts before effective_from)
    prev_price = ProductPrice.objects.filter(
        outlet=outlet,
        product=product,
        effective_from__lt=effective_from
    ).order_by('-effective_from').first()

    effective_to = next_price.effective_from if next_price else None

    # Update previous price to end when the new price starts
    if prev_price:
        prev_price.effective_to = effective_from
        prev_price.save()

    # Create the new price
    new_price = ProductPrice.objects.create(
        organisation=organisation,
        outlet=outlet,
        product=product,
        selling_price=selling_price,
        effective_from=effective_from,
        effective_to=effective_to,
        created_by=created_by
    )

    return new_price


@transaction.atomic
def create_tank(organisation, outlet, product, code: str, name: str, capacity, **kwargs) -> Tank:
    """
    Creates a new Tank scoped to an outlet and product.
    """
    if outlet.organisation_id != organisation.id:
        raise ValidationError("Outlet does not belong to the organisation.")
    if product.organisation_id != organisation.id:
        raise ValidationError("Product does not belong to the organisation.")

    return Tank.objects.create(
        organisation=organisation,
        outlet=outlet,
        product=product,
        code=code,
        name=name,
        capacity=capacity,
        safe_fill_capacity=kwargs.get('safe_fill_capacity'),
        dead_stock_level=kwargs.get('dead_stock_level'),
        low_stock_threshold=kwargs.get('low_stock_threshold'),
        manufacturer=kwargs.get('manufacturer'),
        serial_number=kwargs.get('serial_number'),
        commissioned_on=kwargs.get('commissioned_on'),
        status=kwargs.get('status', Tank.STATUS_ACTIVE),
        notes=kwargs.get('notes')
    )


@transaction.atomic
def update_tank(tank: Tank, **kwargs) -> Tank:
    """
    Updates field values on an existing Tank.
    """
    for field in ['code', 'name', 'capacity', 'safe_fill_capacity', 'dead_stock_level', 'low_stock_threshold', 
                  'manufacturer', 'serial_number', 'commissioned_on', 'status', 'notes']:
        if field in kwargs:
            setattr(tank, field, kwargs[field])
    
    # If product is also provided
    if 'product' in kwargs:
        change_tank_product(tank, kwargs['product'])
    else:
        tank.save()
    return tank


@transaction.atomic
def change_tank_product(tank: Tank, product: FuelProduct) -> Tank:
    """
    Safely shifts the product stored in a tank.
    Ensures organisation consistency and product activation.
    """
    if product.organisation_id != tank.organisation_id:
        raise ValidationError("The new product must belong to the same organisation.")
    if not product.is_active:
        raise ValidationError("Cannot assign an inactive product.")
    
    tank.product = product
    tank.save()
    return tank


@transaction.atomic
def change_tank_status(tank: Tank, status: str) -> Tank:
    """
    Changes the status of a Tank (active, inactive, maintenance).
    """
    if status not in [Tank.STATUS_ACTIVE, Tank.STATUS_INACTIVE, Tank.STATUS_MAINTENANCE]:
        raise ValidationError("Invalid status.")
    tank.status = status
    tank.save()
    return tank


@transaction.atomic
def create_dispenser(organisation, outlet, code: str, name: str, **kwargs) -> Dispenser:
    """
    Creates a new Dispenser scoped to the outlet.
    """
    if outlet.organisation_id != organisation.id:
        raise ValidationError("Outlet does not belong to the organisation.")

    return Dispenser.objects.create(
        organisation=organisation,
        outlet=outlet,
        code=code,
        name=name,
        manufacturer=kwargs.get('manufacturer'),
        model_number=kwargs.get('model_number'),
        serial_number=kwargs.get('serial_number'),
        commissioned_on=kwargs.get('commissioned_on'),
        status=kwargs.get('status', Dispenser.STATUS_ACTIVE),
        notes=kwargs.get('notes')
    )


@transaction.atomic
def update_dispenser(dispenser: Dispenser, **kwargs) -> Dispenser:
    """
    Updates field values on an existing Dispenser.
    """
    for field in ['code', 'name', 'manufacturer', 'model_number', 'serial_number', 'commissioned_on', 'status', 'notes']:
        if field in kwargs:
            setattr(dispenser, field, kwargs[field])
    dispenser.save()
    return dispenser


@transaction.atomic
def change_dispenser_status(dispenser: Dispenser, status: str) -> Dispenser:
    """
    Changes the status of a Dispenser (active, inactive, maintenance).
    """
    if status not in [Dispenser.STATUS_ACTIVE, Dispenser.STATUS_INACTIVE, Dispenser.STATUS_MAINTENANCE]:
        raise ValidationError("Invalid status.")
    dispenser.status = status
    dispenser.save()
    return dispenser


@transaction.atomic
def create_nozzle(organisation, outlet, dispenser, tank, code: str, name: str, **kwargs) -> Nozzle:
    """
    Creates a new Nozzle scoped to the outlet, dispenser, and tank.
    """
    if outlet.organisation_id != organisation.id:
        raise ValidationError("Outlet does not belong to the organisation.")
    if dispenser.outlet_id != outlet.id:
        raise ValidationError("Dispenser does not belong to the same outlet.")
    if tank.outlet_id != outlet.id:
        raise ValidationError("Tank does not belong to the same outlet.")

    return Nozzle.objects.create(
        organisation=organisation,
        outlet=outlet,
        dispenser=dispenser,
        tank=tank,
        code=code,
        name=name,
        nozzle_number=kwargs.get('nozzle_number'),
        status=kwargs.get('status', Nozzle.STATUS_ACTIVE),
        notes=kwargs.get('notes')
    )


@transaction.atomic
def update_nozzle(nozzle: Nozzle, **kwargs) -> Nozzle:
    """
    Updates field values on an existing Nozzle.
    """
    for field in ['code', 'name', 'nozzle_number', 'status', 'notes']:
        if field in kwargs:
            setattr(nozzle, field, kwargs[field])
    
    if 'tank' in kwargs:
        connect_nozzle_to_tank(nozzle, kwargs['tank'])
    
    if 'dispenser' in kwargs:
        dispenser = kwargs['dispenser']
        if dispenser.outlet_id != nozzle.outlet_id:
            raise ValidationError("Dispenser must belong to the same outlet.")
        nozzle.dispenser = dispenser
        
    nozzle.save()
    return nozzle


@transaction.atomic
def connect_nozzle_to_tank(nozzle: Nozzle, tank: Tank) -> Nozzle:
    """
    Safely changes the tank connection for a nozzle.
    Enforces tenant and outlet consistency.
    """
    if tank.outlet_id != nozzle.outlet_id:
        raise ValidationError("The nozzle and the connected tank must belong to the same outlet.")
    
    nozzle.tank = tank
    nozzle.save()
    return nozzle


@transaction.atomic
def change_nozzle_status(nozzle: Nozzle, status: str) -> Nozzle:
    """
    Changes nozzle status (active, inactive, maintenance).
    """
    if status not in [Nozzle.STATUS_ACTIVE, Nozzle.STATUS_INACTIVE, Nozzle.STATUS_MAINTENANCE]:
        raise ValidationError("Invalid status.")
    nozzle.status = status
    nozzle.save()
    return nozzle
