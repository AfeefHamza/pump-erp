# apps/shifts/views.py
from datetime import datetime
from django.http import Http404
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction, models
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from apps.organizations.views import get_organisation_membership
from apps.organizations.permissions import HasGranularPermission, require_permission, can_access_outlet
from apps.organizations.models import Outlet
from apps.forecourt.views import handle_django_validation_error
from apps.forecourt.models import Nozzle
from apps.employees.models import Employee, EmployeeDesignation

from .models import ShiftDefinition, ShiftRoster, ShiftStaffAssignment, ShiftNozzleAssignment
from .serializers import ShiftDefinitionSerializer, ShiftRosterSerializer
from .services import (
    create_shift_definition, update_shift_definition,
    create_or_update_roster, assign_employee_to_roster, assign_nozzles_to_employee
)
from .selectors import (
    shift_definitions_for_outlet, active_shift_definitions_for_outlet,
    check_shift_overlaps, get_roster_details
)

class ShiftDefinitionListCreateView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]
    required_permission = 'shift_definition.view'

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
        
        status_filter = request.query_params.get('status', 'all').strip().lower()
        if status_filter == 'active':
            queryset = active_shift_definitions_for_outlet(outlet)
        else:
            queryset = shift_definitions_for_outlet(outlet)

        serializer = ShiftDefinitionSerializer(queryset, many=True)
        # Check overlaps as a warning
        overlaps = check_shift_overlaps(outlet)
        
        return Response({
            'shifts': serializer.data,
            'warnings': overlaps
        }, status=status.HTTP_200_OK)

    def post(self, request, org_id, outlet_id):
        membership = get_organisation_membership(request.user, org_id)
        outlet = self.get_outlet(org_id, outlet_id, membership)
        require_permission(request.user, org_id, 'shift_definition.create')

        serializer = ShiftDefinitionSerializer(data=request.data)
        if serializer.is_valid():
            try:
                shift_def = create_shift_definition(
                    organisation=membership.organisation,
                    outlet=outlet,
                    **serializer.validated_data
                )
                
                # Check overlaps after creating
                overlaps = check_shift_overlaps(outlet)
                
                response_data = ShiftDefinitionSerializer(shift_def).data
                return Response({
                    'shift': response_data,
                    'warnings': overlaps
                }, status=status.HTTP_201_CREATED)
            except DjangoValidationError as e:
                return handle_django_validation_error(e)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ShiftDefinitionDetailView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]
    required_permission = 'shift_definition.view'

    def get_object(self, org_id, outlet_id, shift_id):
        try:
            return ShiftDefinition.objects.get(organisation_id=org_id, outlet_id=outlet_id, id=shift_id)
        except ShiftDefinition.DoesNotExist:
            raise Http404()

    def get(self, request, org_id, outlet_id, shift_id):
        shift_def = self.get_object(org_id, outlet_id, shift_id)
        serializer = ShiftDefinitionSerializer(shift_def)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request, org_id, outlet_id, shift_id):
        shift_def = self.get_object(org_id, outlet_id, shift_id)
        
        deactivating = 'is_active' in request.data and request.data['is_active'] is False and shift_def.is_active is True
        if deactivating:
            require_permission(request.user, org_id, 'shift_definition.deactivate')
        else:
            require_permission(request.user, org_id, 'shift_definition.update')

        serializer = ShiftDefinitionSerializer(shift_def, data=request.data, partial=True)
        if serializer.is_valid():
            try:
                updated = update_shift_definition(shift_def, **serializer.validated_data)
                
                # Overlaps check
                overlaps = check_shift_overlaps(shift_def.outlet)
                
                return Response({
                    'shift': ShiftDefinitionSerializer(updated).data,
                    'warnings': overlaps
                }, status=status.HTTP_200_OK)
            except DjangoValidationError as e:
                return handle_django_validation_error(e)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ShiftRosterWorkspaceView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]
    required_permission = 'shift_roster.view'

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

        date_str = request.query_params.get('business_date')
        shift_def_id = request.query_params.get('shift_definition_id')

        if not date_str or not shift_def_id:
            return Response(
                {'detail': "business_date and shift_definition_id query parameters are required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            business_date = datetime.strptime(date_str, '%Y-%m-%d').date()
        except ValueError:
            return Response({'detail': "Invalid date format. Use YYYY-MM-DD."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            shift_def = ShiftDefinition.objects.get(id=shift_def_id, outlet=outlet)
        except ShiftDefinition.DoesNotExist:
            return Response({'detail': "Shift definition not found for this outlet."}, status=status.HTTP_404_NOT_FOUND)

        # Retrieve or return blank roster structure
        try:
            roster = ShiftRoster.objects.get(
                outlet=outlet,
                shift_definition=shift_def,
                business_date=business_date
            )
            roster_details = get_roster_details(roster)
            serializer = ShiftRosterSerializer(roster)
            
            # Map nozzle assignments back cleanly
            nozzles_data = roster_details['nozzles']
            return Response({
                'exists': True,
                'roster': serializer.data,
                'nozzles': nozzles_data
            }, status=status.HTTP_200_OK)
        except ShiftRoster.DoesNotExist:
            # Roster does not exist yet. Return available components to let user build it.
            # Active employees assigned to outlet
            active_staff = Employee.objects.filter(
                organisation=membership.organisation,
                status=Employee.STATUS_ACTIVE,
                outlet_assignments__outlet=outlet
            ).select_related('designation')
            staff_serializer = EmployeeSerializer(active_staff, many=True)

            # Active nozzles
            active_nozzles = Nozzle.objects.filter(
                outlet=outlet,
                status=Nozzle.STATUS_ACTIVE
            ).select_related('dispenser', 'tank', 'tank__product')
            
            nozzles_data = [{
                'id': n.id,
                'code': n.code,
                'name': n.name,
                'dispenser_id': n.dispenser_id,
                'dispenser_name': n.dispenser.name,
                'product_name': n.product.name,
                'tank_code': n.tank.code,
                'assigned_to_staff_id': None,
                'is_assigned': False
            } for n in active_nozzles]

            return Response({
                'exists': False,
                'available_staff': staff_serializer.data,
                'nozzles': nozzles_data
            }, status=status.HTTP_200_OK)

    def post(self, request, org_id, outlet_id):
        membership = get_organisation_membership(request.user, org_id)
        outlet = self.get_outlet(org_id, outlet_id, membership)

        # Needs roster create/update permission
        date_str = request.data.get('business_date')
        shift_def_id = request.data.get('shift_definition_id')

        if not date_str or not shift_def_id:
            return Response({'detail': "business_date and shift_definition_id are required in the body."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            business_date = datetime.strptime(date_str, '%Y-%m-%d').date()
        except ValueError:
            return Response({'detail': "Invalid date format. Use YYYY-MM-DD."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            shift_def = ShiftDefinition.objects.get(id=shift_def_id, outlet=outlet)
        except ShiftDefinition.DoesNotExist:
            return Response({'detail': "Shift definition not found."}, status=status.HTTP_404_NOT_FOUND)

        # Check if roster exists to enforce permission
        exists = ShiftRoster.objects.filter(outlet=outlet, shift_definition=shift_def, business_date=business_date).exists()
        if exists:
            require_permission(request.user, org_id, 'shift_roster.update')
        else:
            require_permission(request.user, org_id, 'shift_roster.create')

        assignments_data = request.data.get('assignments', [])
        notes = request.data.get('notes', '')

        try:
            with transaction.atomic():
                roster = create_or_update_roster(
                    organisation=membership.organisation,
                    outlet=outlet,
                    shift_definition=shift_def,
                    business_date=business_date,
                    notes=notes,
                    user=request.user
                )

                # Clear existing staff assignments that are not present anymore
                # To make saving simple and atomic:
                # We can fetch employees passed in
                passed_employee_ids = [a.get('employee_id') for a in assignments_data]
                ShiftStaffAssignment.objects.filter(roster=roster).exclude(employee_id__in=passed_employee_ids).delete()

                for assignment_item in assignments_data:
                    emp_id = assignment_item.get('employee_id')
                    desig_id = assignment_item.get('duty_designation_id')
                    is_primary_cashier = assignment_item.get('is_primary_cashier', False)
                    staff_notes = assignment_item.get('notes', '')
                    nozzle_ids = assignment_item.get('nozzle_ids', [])

                    try:
                        employee = Employee.objects.get(id=emp_id, organisation=membership.organisation)
                    except Employee.DoesNotExist:
                        raise DjangoValidationError(f"Employee {emp_id} does not exist.")

                    try:
                        duty_designation = EmployeeDesignation.objects.get(id=desig_id, organisation=membership.organisation)
                    except EmployeeDesignation.DoesNotExist:
                        raise DjangoValidationError(f"Designation {desig_id} does not exist.")

                    # Assign employee to roster
                    staff_assignment = assign_employee_to_roster(
                        roster=roster,
                        employee=employee,
                        duty_designation=duty_designation,
                        is_primary_cashier=is_primary_cashier,
                        notes=staff_notes
                    )

                    # Assign nozzles to employee
                    nozzles = Nozzle.objects.filter(id__in=nozzle_ids, outlet=outlet)
                    if len(nozzles) != len(nozzle_ids):
                        raise DjangoValidationError("One or more nozzles are invalid for this outlet.")

                    assign_nozzles_to_employee(staff_assignment, nozzles)

            # Return updated roster details
            roster.refresh_from_db()
            roster_details = get_roster_details(roster)
            serializer = ShiftRosterSerializer(roster)
            return Response({
                'exists': True,
                'roster': serializer.data,
                'nozzles': roster_details['nozzles']
            }, status=status.HTTP_200_OK)

        except DjangoValidationError as e:
            return handle_django_validation_error(e)
