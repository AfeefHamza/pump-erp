# apps/forecourt/views.py
from django.http import Http404
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from apps.organizations.views import get_organisation_membership
from apps.organizations.permissions import HasGranularPermission, require_permission, can_access_outlet
from apps.organizations.models import Outlet

from .models import FuelProduct, ProductPrice, Tank, Dispenser, Nozzle
from .serializers import (
    FuelProductSerializer, ProductPriceSerializer, BulkPriceEntrySerializer,
    TankSerializer, DispenserSerializer, NozzleSerializer
)
from .services import (
    create_fuel_product, update_fuel_product, deactivate_fuel_product, set_product_price,
    create_tank, update_tank, change_tank_status,
    create_dispenser, update_dispenser, change_dispenser_status,
    create_nozzle, update_nozzle, change_nozzle_status
)
from .selectors import (
    active_products_for_organisation, products_available_at_outlet,
    current_product_price, product_price_history,
    tanks_for_outlet, dispensers_for_outlet, nozzles_for_outlet,
    complete_forecourt_structure
)

def handle_django_validation_error(e):
    error_dict = {}
    if hasattr(e, 'message_dict'):
        for k, v in e.message_dict.items():
            error_dict[k] = v
    else:
        error_dict['non_field_errors'] = e.messages
    return Response(error_dict, status=status.HTTP_400_BAD_REQUEST)


class FuelProductListCreateView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]
    required_permission = 'fuel_product.view'

    def get(self, request, org_id):
        membership = get_organisation_membership(request.user, org_id)
        
        # Search & filters
        queryset = FuelProduct.objects.filter(organisation=membership.organisation)
        
        search_query = request.query_params.get('search', '').strip()
        if search_query:
            queryset = queryset.filter(
                models.Q(name__icontains=search_query) | 
                models.Q(code__icontains=search_query)
            )
            
        status_filter = request.query_params.get('status', 'all').strip().lower()
        if status_filter == 'active':
            queryset = queryset.filter(is_active=True)
        elif status_filter == 'inactive':
            queryset = queryset.filter(is_active=False)

        serializer = FuelProductSerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request, org_id):
        membership = get_organisation_membership(request.user, org_id)
        require_permission(request.user, org_id, 'fuel_product.create')

        serializer = FuelProductSerializer(data=request.data)
        if serializer.is_valid():
            code = serializer.validated_data.get('code')
            name = serializer.validated_data.get('name')
            
            # Uniqueness checks within organisation
            if FuelProduct.objects.filter(organisation=membership.organisation, code__iexact=code).exists():
                return Response({'code': ["A product with this code already exists."]}, status=status.HTTP_400_BAD_REQUEST)
            if FuelProduct.objects.filter(organisation=membership.organisation, name__iexact=name).exists():
                return Response({'name': ["A product with this name already exists."]}, status=status.HTTP_400_BAD_REQUEST)
                
            try:
                product = create_fuel_product(
                    organisation=membership.organisation,
                    **serializer.validated_data
                )
                return Response(FuelProductSerializer(product).data, status=status.HTTP_201_CREATED)
            except DjangoValidationError as e:
                return handle_django_validation_error(e)
                
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class FuelProductDetailView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]
    required_permission = 'fuel_product.view'

    def get_object(self, org_id, product_id):
        try:
            return FuelProduct.objects.get(organisation_id=org_id, id=product_id)
        except FuelProduct.DoesNotExist:
            raise Http404()

    def get(self, request, org_id, product_id):
        product = self.get_object(org_id, product_id)
        serializer = FuelProductSerializer(product)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request, org_id, product_id):
        product = self.get_object(org_id, product_id)
        
        data = request.data
        deactivating = 'is_active' in data and data['is_active'] is False and product.is_active is True
        
        if deactivating:
            require_permission(request.user, org_id, 'fuel_product.deactivate')
        else:
            require_permission(request.user, org_id, 'fuel_product.update')

        serializer = FuelProductSerializer(product, data=data, partial=True)
        if serializer.is_valid():
            code = serializer.validated_data.get('code')
            name = serializer.validated_data.get('name')
            
            # Uniqueness check excluding self
            if code and FuelProduct.objects.filter(organisation_id=org_id, code__iexact=code).exclude(id=product_id).exists():
                return Response({'code': ["A product with this code already exists."]}, status=status.HTTP_400_BAD_REQUEST)
            if name and FuelProduct.objects.filter(organisation_id=org_id, name__iexact=name).exclude(id=product_id).exists():
                return Response({'name': ["A product with this name already exists."]}, status=status.HTTP_400_BAD_REQUEST)

            try:
                updated = update_fuel_product(product, **serializer.validated_data)
                return Response(FuelProductSerializer(updated).data, status=status.HTTP_200_OK)
            except DjangoValidationError as e:
                return handle_django_validation_error(e)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ProductPriceListCreateView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]
    required_permission = 'product_price.view'

    def get_outlet(self, org_id, outlet_id, membership):
        try:
            outlet = Outlet.objects.get(organisation_id=org_id, id=outlet_id)
            if not can_access_outlet(membership, outlet):
                raise Http404()
            return outlet
        except Outlet.DoesNotExist:
            raise Http404()

    def get(self, request, org_id, outlet_id):
        membership = get_organisation_membership(request.user, org_id)
        outlet = self.get_outlet(org_id, outlet_id, membership)
        
        # Returns current pricing for all active fuel products in organisation
        products = active_products_for_organisation(membership.organisation)
        pricing_data = []
        for prod in products:
            curr_price = current_product_price(outlet, prod)
            
            # Find the previous price to calculate the rate variation
            prev_price = None
            if curr_price:
                prev_price = ProductPrice.objects.filter(
                    outlet=outlet,
                    product=prod,
                    effective_from__lt=curr_price.effective_from
                ).order_by('-effective_from').first()

            pricing_data.append({
                'product_id': str(prod.id),
                'product_name': prod.name,
                'product_code': prod.code,
                'selling_price': str(curr_price.selling_price) if curr_price else None,
                'effective_from': curr_price.effective_from if curr_price else None,
                'previous_price': str(prev_price.selling_price) if prev_price else None,
                'price_id': str(curr_price.id) if curr_price else None
            })

        return Response(pricing_data, status=status.HTTP_200_OK)

    def post(self, request, org_id, outlet_id):
        membership = get_organisation_membership(request.user, org_id)
        outlet = self.get_outlet(org_id, outlet_id, membership)
        
        require_permission(request.user, org_id, 'product_price.update', outlet=outlet)

        serializer = BulkPriceEntrySerializer(data=request.data)
        if serializer.is_valid():
            effective_from = serializer.validated_data.get('effective_from') or timezone.now()
            prices = serializer.validated_data.get('prices', [])
            
            created_prices = []
            try:
                with transaction.atomic():
                    for price_item in prices:
                        prod_id = price_item['product_id']
                        selling_price = price_item['selling_price']
                        
                        try:
                            product = FuelProduct.objects.get(organisation=membership.organisation, id=prod_id, is_active=True)
                        except FuelProduct.DoesNotExist:
                            raise DjangoValidationError(f"Active product with ID {prod_id} does not exist.")

                        p_price = set_product_price(
                            organisation=membership.organisation,
                            outlet=outlet,
                            product=product,
                            selling_price=selling_price,
                            effective_from=effective_from,
                            created_by=request.user
                        )
                        created_prices.append(p_price)
                        
                return Response(ProductPriceSerializer(created_prices, many=True).data, status=status.HTTP_201_CREATED)
            except DjangoValidationError as e:
                return handle_django_validation_error(e)
                
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ProductPriceHistoryView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]
    required_permission = 'product_price.view'

    def get(self, request, org_id, outlet_id, product_id):
        membership = get_organisation_membership(request.user, org_id)
        try:
            outlet = Outlet.objects.get(organisation_id=org_id, id=outlet_id)
            if not can_access_outlet(membership, outlet):
                raise Http404()
            product = FuelProduct.objects.get(organisation_id=org_id, id=product_id)
        except (Outlet.DoesNotExist, FuelProduct.DoesNotExist):
            raise Http404()

        history = product_price_history(outlet, product)
        serializer = ProductPriceSerializer(history, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class TankListCreateView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]
    required_permission = 'tank.view'

    def get_outlet(self, org_id, outlet_id, membership):
        try:
            outlet = Outlet.objects.get(organisation_id=org_id, id=outlet_id)
            if not can_access_outlet(membership, outlet):
                raise Http404()
            return outlet
        except Outlet.DoesNotExist:
            raise Http404()

    def get(self, request, org_id, outlet_id):
        membership = get_organisation_membership(request.user, org_id)
        outlet = self.get_outlet(org_id, outlet_id, membership)

        queryset = Tank.objects.filter(outlet=outlet).select_related('product')
        
        search_query = request.query_params.get('search', '').strip()
        if search_query:
            queryset = queryset.filter(
                models.Q(name__icontains=search_query) |
                models.Q(code__icontains=search_query)
            )

        status_filter = request.query_params.get('status', '').strip().lower()
        if status_filter in ['active', 'inactive', 'maintenance']:
            queryset = queryset.filter(status=status_filter)

        serializer = TankSerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request, org_id, outlet_id):
        membership = get_organisation_membership(request.user, org_id)
        outlet = self.get_outlet(org_id, outlet_id, membership)
        
        require_permission(request.user, org_id, 'tank.create', outlet=outlet)

        serializer = TankSerializer(data=request.data)
        if serializer.is_valid():
            code = serializer.validated_data.get('code')
            prod_id = request.data.get('product')
            
            try:
                product = FuelProduct.objects.get(organisation=membership.organisation, id=prod_id)
            except FuelProduct.DoesNotExist:
                return Response({'product': ["Product does not exist."]}, status=status.HTTP_400_BAD_REQUEST)

            if Tank.objects.filter(outlet=outlet, code__iexact=code).exists():
                return Response({'code': ["A tank with this code already exists at this outlet."]}, status=status.HTTP_400_BAD_REQUEST)

            try:
                tank = create_tank(
                    organisation=membership.organisation,
                    outlet=outlet,
                    product=product,
                    **serializer.validated_data
                )
                return Response(TankSerializer(tank).data, status=status.HTTP_201_CREATED)
            except DjangoValidationError as e:
                return handle_django_validation_error(e)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class TankDetailView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]
    required_permission = 'tank.view'

    def get_object(self, org_id, outlet_id, tank_id, membership):
        try:
            tank = Tank.objects.get(organisation_id=org_id, outlet_id=outlet_id, id=tank_id)
            if not can_access_outlet(membership, tank.outlet):
                raise Http404()
            return tank
        except Tank.DoesNotExist:
            raise Http404()

    def get(self, request, org_id, outlet_id, tank_id):
        membership = get_organisation_membership(request.user, org_id)
        tank = self.get_object(org_id, outlet_id, tank_id, membership)
        serializer = TankSerializer(tank)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request, org_id, outlet_id, tank_id):
        membership = get_organisation_membership(request.user, org_id)
        tank = self.get_object(org_id, outlet_id, tank_id, membership)

        data = request.data
        status_change = 'status' in data and data['status'] != tank.status
        other_change = any(k != 'status' for k in data.keys())

        if status_change:
            require_permission(request.user, org_id, 'tank.deactivate', outlet=tank.outlet)
        if other_change:
            require_permission(request.user, org_id, 'tank.update', outlet=tank.outlet)

        serializer = TankSerializer(tank, data=data, partial=True)
        if serializer.is_valid():
            code = serializer.validated_data.get('code')
            if code and Tank.objects.filter(outlet=tank.outlet, code__iexact=code).exclude(id=tank_id).exists():
                return Response({'code': ["A tank with this code already exists at this outlet."]}, status=status.HTTP_400_BAD_REQUEST)

            validated_data = serializer.validated_data
            
            # If product is being updated
            if 'product' in request.data:
                prod_id = request.data['product']
                try:
                    product = FuelProduct.objects.get(organisation_id=org_id, id=prod_id)
                    validated_data['product'] = product
                except FuelProduct.DoesNotExist:
                    return Response({'product': ["Product does not exist."]}, status=status.HTTP_400_BAD_REQUEST)

            try:
                updated = update_tank(tank, **validated_data)
                return Response(TankSerializer(updated).data, status=status.HTTP_200_OK)
            except DjangoValidationError as e:
                return handle_django_validation_error(e)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class DispenserListCreateView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]
    required_permission = 'dispenser.view'

    def get_outlet(self, org_id, outlet_id, membership):
        try:
            outlet = Outlet.objects.get(organisation_id=org_id, id=outlet_id)
            if not can_access_outlet(membership, outlet):
                raise Http404()
            return outlet
        except Outlet.DoesNotExist:
            raise Http404()

    def get(self, request, org_id, outlet_id):
        membership = get_organisation_membership(request.user, org_id)
        outlet = self.get_outlet(org_id, outlet_id, membership)

        queryset = Dispenser.objects.filter(outlet=outlet)
        
        search_query = request.query_params.get('search', '').strip()
        if search_query:
            queryset = queryset.filter(
                models.Q(name__icontains=search_query) |
                models.Q(code__icontains=search_query)
            )

        status_filter = request.query_params.get('status', '').strip().lower()
        if status_filter in ['active', 'inactive', 'maintenance']:
            queryset = queryset.filter(status=status_filter)

        serializer = DispenserSerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request, org_id, outlet_id):
        membership = get_organisation_membership(request.user, org_id)
        outlet = self.get_outlet(org_id, outlet_id, membership)
        
        require_permission(request.user, org_id, 'dispenser.create', outlet=outlet)

        serializer = DispenserSerializer(data=request.data)
        if serializer.is_valid():
            code = serializer.validated_data.get('code')
            
            if Dispenser.objects.filter(outlet=outlet, code__iexact=code).exists():
                return Response({'code': ["A dispenser with this code already exists at this outlet."]}, status=status.HTTP_400_BAD_REQUEST)

            try:
                dispenser = create_dispenser(
                    organisation=membership.organisation,
                    outlet=outlet,
                    **serializer.validated_data
                )
                return Response(DispenserSerializer(dispenser).data, status=status.HTTP_201_CREATED)
            except DjangoValidationError as e:
                return handle_django_validation_error(e)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class DispenserDetailView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]
    required_permission = 'dispenser.view'

    def get_object(self, org_id, outlet_id, dispenser_id, membership):
        try:
            dispenser = Dispenser.objects.get(organisation_id=org_id, outlet_id=outlet_id, id=dispenser_id)
            if not can_access_outlet(membership, dispenser.outlet):
                raise Http404()
            return dispenser
        except Dispenser.DoesNotExist:
            raise Http404()

    def get(self, request, org_id, outlet_id, dispenser_id):
        membership = get_organisation_membership(request.user, org_id)
        dispenser = self.get_object(org_id, outlet_id, dispenser_id, membership)
        serializer = DispenserSerializer(dispenser)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request, org_id, outlet_id, dispenser_id):
        membership = get_organisation_membership(request.user, org_id)
        dispenser = self.get_object(org_id, outlet_id, dispenser_id, membership)

        data = request.data
        status_change = 'status' in data and data['status'] != dispenser.status
        other_change = any(k != 'status' for k in data.keys())

        if status_change:
            require_permission(request.user, org_id, 'dispenser.deactivate', outlet=dispenser.outlet)
        if other_change:
            require_permission(request.user, org_id, 'dispenser.update', outlet=dispenser.outlet)

        serializer = DispenserSerializer(dispenser, data=data, partial=True)
        if serializer.is_valid():
            code = serializer.validated_data.get('code')
            if code and Dispenser.objects.filter(outlet=dispenser.outlet, code__iexact=code).exclude(id=dispenser_id).exists():
                return Response({'code': ["A dispenser with this code already exists at this outlet."]}, status=status.HTTP_400_BAD_REQUEST)

            try:
                updated = update_dispenser(dispenser, **serializer.validated_data)
                return Response(DispenserSerializer(updated).data, status=status.HTTP_200_OK)
            except DjangoValidationError as e:
                return handle_django_validation_error(e)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class NozzleListCreateView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]
    required_permission = 'nozzle.view'

    def get_outlet(self, org_id, outlet_id, membership):
        try:
            outlet = Outlet.objects.get(organisation_id=org_id, id=outlet_id)
            if not can_access_outlet(membership, outlet):
                raise Http404()
            return outlet
        except Outlet.DoesNotExist:
            raise Http404()

    def get(self, request, org_id, outlet_id):
        membership = get_organisation_membership(request.user, org_id)
        outlet = self.get_outlet(org_id, outlet_id, membership)

        queryset = Nozzle.objects.filter(outlet=outlet).select_related('dispenser', 'tank', 'tank__product')
        
        search_query = request.query_params.get('search', '').strip()
        if search_query:
            queryset = queryset.filter(
                models.Q(name__icontains=search_query) |
                models.Q(code__icontains=search_query)
            )

        status_filter = request.query_params.get('status', '').strip().lower()
        if status_filter in ['active', 'inactive', 'maintenance']:
            queryset = queryset.filter(status=status_filter)

        serializer = NozzleSerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request, org_id, outlet_id):
        membership = get_organisation_membership(request.user, org_id)
        outlet = self.get_outlet(org_id, outlet_id, membership)
        
        require_permission(request.user, org_id, 'nozzle.create', outlet=outlet)

        serializer = NozzleSerializer(data=request.data)
        if serializer.is_valid():
            code = serializer.validated_data.get('code')
            disp_id = request.data.get('dispenser')
            tank_id = request.data.get('tank')
            
            try:
                dispenser = Dispenser.objects.get(outlet=outlet, id=disp_id)
            except Dispenser.DoesNotExist:
                return Response({'dispenser': ["Dispenser does not exist or does not belong to this outlet."]}, status=status.HTTP_400_BAD_REQUEST)
                
            try:
                tank = Tank.objects.get(outlet=outlet, id=tank_id)
            except Tank.DoesNotExist:
                return Response({'tank': ["Tank does not exist or does not belong to this outlet."]}, status=status.HTTP_400_BAD_REQUEST)

            if Nozzle.objects.filter(outlet=outlet, code__iexact=code).exists():
                return Response({'code': ["A nozzle with this code already exists at this outlet."]}, status=status.HTTP_400_BAD_REQUEST)

            try:
                nozzle = create_nozzle(
                    organisation=membership.organisation,
                    outlet=outlet,
                    dispenser=dispenser,
                    tank=tank,
                    **serializer.validated_data
                )
                return Response(NozzleSerializer(nozzle).data, status=status.HTTP_201_CREATED)
            except DjangoValidationError as e:
                return handle_django_validation_error(e)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class NozzleDetailView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]
    required_permission = 'nozzle.view'

    def get_object(self, org_id, outlet_id, nozzle_id, membership):
        try:
            nozzle = Nozzle.objects.get(organisation_id=org_id, outlet_id=outlet_id, id=nozzle_id)
            if not can_access_outlet(membership, nozzle.outlet):
                raise Http404()
            return nozzle
        except Nozzle.DoesNotExist:
            raise Http404()

    def get(self, request, org_id, outlet_id, nozzle_id):
        membership = get_organisation_membership(request.user, org_id)
        nozzle = self.get_object(org_id, outlet_id, nozzle_id, membership)
        serializer = NozzleSerializer(nozzle)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request, org_id, outlet_id, nozzle_id):
        membership = get_organisation_membership(request.user, org_id)
        nozzle = self.get_object(org_id, outlet_id, nozzle_id, membership)

        data = request.data
        status_change = 'status' in data and data['status'] != nozzle.status
        other_change = any(k != 'status' for k in data.keys())

        if status_change:
            require_permission(request.user, org_id, 'nozzle.deactivate', outlet=nozzle.outlet)
        if other_change:
            require_permission(request.user, org_id, 'nozzle.update', outlet=nozzle.outlet)

        serializer = NozzleSerializer(nozzle, data=data, partial=True)
        if serializer.is_valid():
            code = serializer.validated_data.get('code')
            if code and Nozzle.objects.filter(outlet=nozzle.outlet, code__iexact=code).exclude(id=nozzle_id).exists():
                return Response({'code': ["A nozzle with this code already exists at this outlet."]}, status=status.HTTP_400_BAD_REQUEST)

            validated_data = serializer.validated_data

            # If connected tank is being updated
            if 'tank' in request.data:
                tank_id = request.data['tank']
                try:
                    tank = Tank.objects.get(outlet=nozzle.outlet, id=tank_id)
                    validated_data['tank'] = tank
                except Tank.DoesNotExist:
                    return Response({'tank': ["Tank does not exist or does not belong to this outlet."]}, status=status.HTTP_400_BAD_REQUEST)

            # If dispenser is being updated
            if 'dispenser' in request.data:
                disp_id = request.data['dispenser']
                try:
                    dispenser = Dispenser.objects.get(outlet=nozzle.outlet, id=disp_id)
                    validated_data['dispenser'] = dispenser
                except Dispenser.DoesNotExist:
                    return Response({'dispenser': ["Dispenser does not exist or does not belong to this outlet."]}, status=status.HTTP_400_BAD_REQUEST)

            try:
                updated = update_nozzle(nozzle, **validated_data)
                return Response(NozzleSerializer(updated).data, status=status.HTTP_200_OK)
            except DjangoValidationError as e:
                return handle_django_validation_error(e)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ForecourtStructureView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]
    required_permission = 'tank.view' # Baseline access check

    def get(self, request, org_id, outlet_id):
        membership = get_organisation_membership(request.user, org_id)
        try:
            outlet = Outlet.objects.get(organisation_id=org_id, id=outlet_id)
            if not can_access_outlet(membership, outlet):
                raise Http404()
        except Outlet.DoesNotExist:
            raise Http404()

        structure = complete_forecourt_structure(outlet)
        return Response(structure, status=status.HTTP_200_OK)
