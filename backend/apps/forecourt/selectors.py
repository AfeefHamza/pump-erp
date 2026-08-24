# apps/forecourt/selectors.py
from django.utils import timezone
from django.db import models
from .models import FuelProduct, ProductPrice, Tank, Dispenser, Nozzle

def active_products_for_organisation(organisation):
    """
    Returns all active fuel products for the organisation.
    """
    return FuelProduct.objects.filter(organisation=organisation, is_active=True)


def products_available_at_outlet(outlet):
    """
    Returns all fuel products available at the outlet (same as active products in the organisation).
    """
    return FuelProduct.objects.filter(organisation=outlet.organisation, is_active=True)


def current_product_price(outlet, product, datetime_val=None) -> ProductPrice | None:
    """
    Finds the active selling price of a product at a specific datetime.
    """
    if datetime_val is None:
        datetime_val = timezone.now()
        
    return ProductPrice.objects.filter(
        outlet=outlet,
        product=product,
        effective_from__lte=datetime_val
    ).filter(
        models.Q(effective_to__gt=datetime_val) | models.Q(effective_to__isnull=True)
    ).order_by('-effective_from').first()


def product_price_history(outlet, product):
    """
    Returns the list of all pricing modifications for a product in an outlet.
    """
    return ProductPrice.objects.filter(
        outlet=outlet,
        product=product
    ).select_related('created_by').order_by('-effective_from')


def tanks_for_outlet(outlet):
    """
    Returns all tanks configured for an outlet, with product pre-fetched.
    """
    return Tank.objects.filter(outlet=outlet).select_related('product')


def tanks_for_product(outlet, product):
    """
    Returns all tanks configured for a product in an outlet.
    """
    return Tank.objects.filter(outlet=outlet, product=product).select_related('product')


def dispensers_for_outlet(outlet):
    """
    Returns all dispensers configured for an outlet.
    """
    return Dispenser.objects.filter(outlet=outlet)


def nozzles_for_outlet(outlet):
    """
    Returns all nozzles for an outlet, pre-fetching dispenser and tank details.
    """
    return Nozzle.objects.filter(outlet=outlet).select_related('dispenser', 'tank', 'tank__product')


def nozzles_for_dispenser(dispenser):
    """
    Returns all nozzles linked to a specific dispenser.
    """
    return Nozzle.objects.filter(dispenser=dispenser).select_related('tank', 'tank__product')


def nozzles_supplied_by_tank(tank):
    """
    Returns all nozzles connected to a specific tank.
    """
    return Nozzle.objects.filter(tank=tank).select_related('dispenser')


def complete_forecourt_structure(outlet) -> dict:
    """
    Returns a unified representation of the forecourt hierarchy for an outlet:
    Tanks, Dispensers, Nozzles, and their relationships.
    Executes exactly 3 queries to avoid N+1 issues.
    """
    tanks = list(Tank.objects.filter(outlet=outlet).select_related('product'))
    dispensers = list(Dispenser.objects.filter(outlet=outlet))
    nozzles = list(Nozzle.objects.filter(outlet=outlet).select_related('dispenser', 'tank', 'tank__product'))

    # Build tanks map
    tanks_data = []
    for tank in tanks:
        tanks_data.append({
            'id': str(tank.id),
            'code': tank.code,
            'name': tank.name,
            'capacity': str(tank.capacity),
            'safe_fill_capacity': str(tank.safe_fill_capacity) if tank.safe_fill_capacity else None,
            'status': tank.status,
            'product': {
                'id': str(tank.product.id),
                'code': tank.product.code,
                'name': tank.product.name,
                'category': tank.product.category,
                'unit': tank.product.unit,
            }
        })

    # Group nozzles by dispenser id
    nozzles_by_dispenser = {}
    for nozzle in nozzles:
        disp_id = str(nozzle.dispenser_id)
        if disp_id not in nozzles_by_dispenser:
            nozzles_by_dispenser[disp_id] = []
        
        nozzles_by_dispenser[disp_id].append({
            'id': str(nozzle.id),
            'code': nozzle.code,
            'name': nozzle.name,
            'nozzle_number': nozzle.nozzle_number,
            'status': nozzle.status,
            'notes': nozzle.notes,
            'tank': {
                'id': str(nozzle.tank.id),
                'code': nozzle.tank.code,
                'name': nozzle.tank.name,
                'product': {
                    'id': str(nozzle.tank.product.id),
                    'code': nozzle.tank.product.code,
                    'name': nozzle.tank.product.name,
                    'category': nozzle.tank.product.category,
                }
            }
        })

    # Build dispensers data structure
    dispensers_data = []
    for dispenser in dispensers:
        disp_id = str(dispenser.id)
        disp_nozzles = nozzles_by_dispenser.get(disp_id, [])
        dispensers_data.append({
            'id': disp_id,
            'code': dispenser.code,
            'name': dispenser.name,
            'status': dispenser.status,
            'manufacturer': dispenser.manufacturer,
            'model_number': dispenser.model_number,
            'serial_number': dispenser.serial_number,
            'nozzles': disp_nozzles
        })

    return {
        'outlet_id': str(outlet.id),
        'outlet_name': outlet.name,
        'tanks': tanks_data,
        'dispensers': dispensers_data
    }
