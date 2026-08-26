# apps/operations/selectors.py
from django.utils import timezone
from django.db import models
from apps.organizations.models import Outlet
from apps.forecourt.models import FuelProduct, Tank, Dispenser, Nozzle, ProductPrice
from apps.shifts.models import ShiftDefinition
from apps.employees.models import Employee
from .models import TankCalibrationAssignment, OpeningBalanceBatch, NozzleOpeningBalance, TankOpeningBalance

def check_outlet_operational_readiness(outlet: Outlet) -> dict:
    """
    Evaluates whether an outlet is ready to begin operations.
    Returns completeness details, warnings, missing requirements.
    """
    now = timezone.now()

    # 1. Active fuel products exist
    active_products = FuelProduct.objects.filter(organisation=outlet.organisation, is_active=True)
    products_count = active_products.count()
    has_products = products_count > 0

    # 2. Current product prices exist
    # Check if every active product has at least one active price effective now
    prices_missing = []
    for prod in active_products:
        price_exists = ProductPrice.objects.filter(
            outlet=outlet,
            product=prod,
            effective_from__lte=now
        ).filter(
            models.Q(effective_to__isnull=True) | models.Q(effective_to__gt=now)
        ).exists()
        if not price_exists:
            prices_missing.append(prod.name)
    has_prices = len(prices_missing) == 0 if has_products else False

    # 3. Active tanks exist
    active_tanks = Tank.objects.filter(outlet=outlet, status=Tank.STATUS_ACTIVE)
    tanks_count = active_tanks.count()
    has_tanks = tanks_count > 0

    # 4. Active dispensers exist
    active_dispensers = Dispenser.objects.filter(outlet=outlet, status=Dispenser.STATUS_ACTIVE)
    dispensers_count = active_dispensers.count()
    has_dispensers = dispensers_count > 0

    # 5. Active nozzles exist
    active_nozzles = Nozzle.objects.filter(outlet=outlet, status=Nozzle.STATUS_ACTIVE)
    nozzles_count = active_nozzles.count()
    has_nozzles = nozzles_count > 0

    # 6. Every active nozzle is connected to a tank
    nozzles_without_tank = [n.code for n in active_nozzles if not n.tank_id]
    nozzles_connected = len(nozzles_without_tank) == 0 if has_nozzles else False

    # 7. Active shift definitions exist
    active_shifts = ShiftDefinition.objects.filter(outlet=outlet, is_active=True)
    shifts_count = active_shifts.count()
    has_shifts = shifts_count > 0

    # 8. Active employees exist
    # Employees work at the organisation and are assigned to this outlet
    active_employees = Employee.objects.filter(
        organisation=outlet.organisation,
        status=Employee.STATUS_ACTIVE,
        outlet_assignments__outlet=outlet
    ).distinct()
    employees_count = active_employees.count()
    has_employees = employees_count > 0

    # 9. Every active tank has an active/effective calibration assignment, or manual dip explicitly acknowledged
    tanks_missing_calibration = []
    for tank in active_tanks:
        has_assignment = TankCalibrationAssignment.objects.filter(
            tank=tank,
            effective_from__lte=now
        ).filter(
            models.Q(effective_to__isnull=True) | models.Q(effective_to__gt=now)
        ).exists()
        
        if not has_assignment and not tank.acknowledged_manual_dip:
            tanks_missing_calibration.append(tank.code)
    has_calibration = len(tanks_missing_calibration) == 0 if has_tanks else False

    # 10. Confirmed opening balance exists
    confirmed_batch = OpeningBalanceBatch.objects.filter(
        outlet=outlet,
        status=OpeningBalanceBatch.STATUS_CONFIRMED
    ).first()
    has_confirmed_balance = confirmed_batch is not None

    # 11 & 12. Every active nozzle has initial totalizer and every active tank has physical/book quantities in confirmed batch
    nozzles_missing_balance = []
    tanks_missing_balance = []
    
    if has_confirmed_balance:
        # Check nozzles
        nozzle_bal_ids = set(NozzleOpeningBalance.objects.filter(batch=confirmed_batch).values_list('nozzle_id', flat=True))
        for n in active_nozzles:
            if n.id not in nozzle_bal_ids:
                nozzles_missing_balance.append(n.code)
        
        # Check tanks
        tank_bal_ids = set(TankOpeningBalance.objects.filter(batch=confirmed_batch).values_list('tank_id', flat=True))
        for t in active_tanks:
            if t.id not in tank_bal_ids:
                tanks_missing_balance.append(t.code)

    has_nozzle_balances = len(nozzles_missing_balance) == 0 if (has_confirmed_balance and has_nozzles) else False
    has_tank_balances = len(tanks_missing_balance) == 0 if (has_confirmed_balance and has_tanks) else False

    # Overall readiness
    ready = (
        has_products and
        has_prices and
        has_tanks and
        has_dispensers and
        has_nozzles and
        nozzles_connected and
        has_shifts and
        has_employees and
        has_calibration and
        has_confirmed_balance and
        has_nozzle_balances and
        has_tank_balances
    )

    # Compile requirements check checklist
    checks = [
        {'id': 'fuel_products', 'name': 'Active fuel products exist', 'passed': has_products, 'details': f"{products_count} active product(s) found."},
        {'id': 'product_prices', 'name': 'Current product prices exist', 'passed': has_prices, 'details': 'All active products have pricing.' if has_prices else f"Missing prices for products: {', '.join(prices_missing)}."},
        {'id': 'tanks', 'name': 'Active tanks exist', 'passed': has_tanks, 'details': f"{tanks_count} active tank(s) found."},
        {'id': 'dispensers', 'name': 'Active dispensers exist', 'passed': has_dispensers, 'details': f"{dispensers_count} active dispenser(s) found."},
        {'id': 'nozzles', 'name': 'Active nozzles exist', 'passed': has_nozzles, 'details': f"{nozzles_count} active nozzle(s) found."},
        {'id': 'nozzles_connected', 'name': 'Every nozzle connected to a tank', 'passed': nozzles_connected, 'details': 'All nozzles connected.' if nozzles_connected else f"Nozzles not connected: {', '.join(nozzles_without_tank)}."},
        {'id': 'shifts', 'name': 'Active shift definitions exist', 'passed': has_shifts, 'details': f"{shifts_count} active shift(s) defined."},
        {'id': 'employees', 'name': 'Active employees assigned', 'passed': has_employees, 'details': f"{employees_count} active employee(s) assigned to this outlet."},
        {'id': 'calibration', 'name': 'Tank calibration assignments set', 'passed': has_calibration, 'details': 'All tanks calibrated or set to manual.' if has_calibration else f"Tanks missing calibration: {', '.join(tanks_missing_calibration)}."},
        {'id': 'opening_batch', 'name': 'Confirmed opening balance batch exists', 'passed': has_confirmed_balance, 'details': f"Effective date: {confirmed_batch.effective_at.strftime('%Y-%m-%d %H:%M')}" if has_confirmed_balance else "No confirmed opening balances."},
        {'id': 'nozzle_totalizers', 'name': 'Every active nozzle has opening totalizer', 'passed': has_nozzle_balances, 'details': 'All nozzles have opening readings.' if has_nozzle_balances else f"Nozzles missing reading: {', '.join(nozzles_missing_balance)}."},
        {'id': 'tank_opening_stock', 'name': 'Every active tank has book and physical stock', 'passed': has_tank_balances, 'details': 'All tanks have opening stock.' if has_tank_balances else f"Tanks missing opening stock: {', '.join(tanks_missing_balance)}."}
    ]

    # Gather warnings
    warnings = []
    if not has_employees:
        warnings.append("No active employees assigned to this outlet. Rostering will not be possible.")
    if not has_shifts:
        warnings.append("No shifts defined. Shift operations cannot be started.")

    missing_requirements = [c['name'] for c in checks if not c['passed']]

    return {
        'ready': ready,
        'checks': checks,
        'missing_requirements': missing_requirements,
        'warnings': warnings,
        # Supply navigation links/routes to correct missing configuration
        'resolution_links': {
            'fuel_products': '/app/settings/products',
            'product_prices': '/app/settings/product-prices',
            'tanks': '/app/settings/forecourt',
            'dispensers': '/app/settings/forecourt',
            'nozzles': '/app/settings/forecourt',
            'nozzles_connected': '/app/settings/forecourt',
            'shifts': '/app/settings/shifts',
            'employees': '/app/employees',
            'calibration': '/app/settings/dip-calibrations',
            'opening_batch': '/app/settings/opening-balances',
            'nozzle_totalizers': '/app/settings/opening-balances',
            'tank_opening_stock': '/app/settings/opening-balances'
        }
    }
