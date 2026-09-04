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
from apps.employees.serializers import EmployeeSerializer

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
        assigned_employee_ids = []
        try:
            roster = ShiftRoster.objects.get(
                outlet=outlet,
                shift_definition=shift_def,
                business_date=business_date
            )
            assigned_employee_ids = list(roster.staff_assignments.values_list('employee_id', flat=True))
        except ShiftRoster.DoesNotExist:
            roster = None

        # Filter active employees assigned to this outlet on the business_date
        active_staff = Employee.objects.filter(
            models.Q(
                organisation=membership.organisation,
                status=Employee.STATUS_ACTIVE,
                outlet_assignments__outlet=outlet,
                outlet_assignments__effective_from__lte=business_date
            ) | models.Q(
                organisation=membership.organisation,
                status=Employee.STATUS_ACTIVE,
                outlet_assignments__outlet=outlet,
                outlet_assignments__effective_from__isnull=True
            )
        ).filter(
            models.Q(outlet_assignments__effective_to__gte=business_date) |
            models.Q(outlet_assignments__effective_to__isnull=True)
        )

        if assigned_employee_ids:
            active_staff = active_staff | Employee.objects.filter(id__in=assigned_employee_ids)

        active_staff = active_staff.distinct().select_related('designation')
        staff_serializer = EmployeeSerializer(active_staff, many=True)

        if roster:
            roster_details = get_roster_details(roster)
            serializer = ShiftRosterSerializer(roster)
            nozzles_data = roster_details['nozzles']
            
            return Response({
                'exists': True,
                'roster': serializer.data,
                'available_staff': staff_serializer.data,
                'nozzles': nozzles_data
            }, status=status.HTTP_200_OK)
        else:
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

        # Validate duplicate employees in the payload
        employee_ids = [a.get('employee_id') for a in assignments_data]
        if len(employee_ids) != len(set(employee_ids)):
            return Response({'detail': "An employee cannot be assigned multiple times in the same roster."}, status=status.HTTP_400_BAD_REQUEST)

        # Validate duplicate nozzle assignments in the payload
        all_nozzle_ids = []
        for a in assignments_data:
            all_nozzle_ids.extend(a.get('nozzle_ids', []))
        if len(all_nozzle_ids) != len(set(all_nozzle_ids)):
            return Response({'detail': "The same nozzle cannot be assigned to multiple employees in the same roster."}, status=status.HTTP_400_BAD_REQUEST)

        # Validate single primary cashier constraint in the payload
        primary_cashiers = [a for a in assignments_data if a.get('is_primary_cashier', False)]
        if len(primary_cashiers) > 1:
            return Response({'detail': "Only one primary cashier is allowed per roster."}, status=status.HTTP_400_BAD_REQUEST)

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
                passed_employee_ids = [a.get('employee_id') for a in assignments_data]
                ShiftStaffAssignment.objects.filter(roster=roster).exclude(employee_id__in=passed_employee_ids).delete()

                for assignment_item in assignments_data:
                    emp_id = assignment_item.get('employee_id')
                    desig_id = assignment_item.get('duty_designation_id')
                    is_primary_cashier = assignment_item.get('is_primary_cashier', False)
                    staff_notes = assignment_item.get('notes', '')
                    nozzle_ids = assignment_item.get('nozzle_ids', [])

                    if not emp_id:
                        raise DjangoValidationError("Each staff assignment must include a valid employee_id.")
                    if not desig_id:
                        raise DjangoValidationError("Each staff assignment must include a valid duty_designation_id.")

                    try:
                        employee = Employee.objects.get(id=emp_id, organisation=membership.organisation)
                    except (Employee.DoesNotExist, ValueError):
                        raise DjangoValidationError(f"Employee {emp_id} does not exist.")

                    try:
                        duty_designation = EmployeeDesignation.objects.get(id=desig_id, organisation=membership.organisation)
                    except (EmployeeDesignation.DoesNotExist, ValueError):
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
            
            # Retrieve active staff to return available_staff for updates after saving
            active_staff = Employee.objects.filter(
                models.Q(
                    organisation=membership.organisation,
                    status=Employee.STATUS_ACTIVE,
                    outlet_assignments__outlet=outlet,
                    outlet_assignments__effective_from__lte=business_date
                ) | models.Q(
                    organisation=membership.organisation,
                    status=Employee.STATUS_ACTIVE,
                    outlet_assignments__outlet=outlet,
                    outlet_assignments__effective_from__isnull=True
                )
            ).filter(
                models.Q(outlet_assignments__effective_to__gte=business_date) |
                models.Q(outlet_assignments__effective_to__isnull=True)
            )
            passed_employee_ids = list(roster.staff_assignments.values_list('employee_id', flat=True))
            if passed_employee_ids:
                active_staff = active_staff | Employee.objects.filter(id__in=passed_employee_ids)
            active_staff = active_staff.distinct().select_related('designation')
            staff_serializer = EmployeeSerializer(active_staff, many=True)

            return Response({
                'exists': True,
                'roster': serializer.data,
                'available_staff': staff_serializer.data,
                'nozzles': roster_details['nozzles']
            }, status=status.HTTP_200_OK)

        except DjangoValidationError as e:
            return handle_django_validation_error(e)


# =====================================================================
# MILESTONE 9: LIVE SHIFT OPERATIONS VIEWS
# =====================================================================

from decimal import Decimal
from apps.forecourt.models import Tank, FuelProduct
from .models import (
    OperationalShift, OperationalShiftStaff, OperationalShiftNozzleAssignment,
    ShiftNozzleMeter, ShiftNozzlePriceSegment, ShiftMeterEvent,
    ShiftTestingRecord, ShiftTankDipObservation, ShiftActivityLog
)
from .serializers import (
    OperationalShiftListSerializer, OperationalShiftDetailSerializer,
    ShiftNozzleMeterSerializer, ShiftTestingRecordSerializer,
    ShiftTankDipObservationSerializer, ShiftActivityLogSerializer,
    OperationalShiftStaffSerializer, OperationalShiftNozzleAssignmentSerializer,
    OperationalShiftCashierPeriodSerializer,
    ShiftStaffAddInputSerializer, ShiftNozzleHandoverInputSerializer,
    ShiftNozzleCorrectInputSerializer, ShiftCashierTransferInputSerializer,
    ShiftNozzleActivateInputSerializer,
    ShiftMeterEventSerializer
)
from .services import (
    prepare_shift_opening, open_operational_shift, update_open_shift_assignments,
    add_staff_to_open_shift, transfer_nozzle_assignment, correct_nozzle_assignment,
    transfer_primary_cashier, activate_nozzle_midshift,
    record_closing_meter_reading, record_meter_event, record_testing,
    update_testing, delete_testing, record_shift_dip,
    apply_product_price_change_during_shift, recalculate_shift_totals,
    close_operational_shift, reopen_operational_shift, discard_open_operational_shift
)
from .selectors import (
    get_open_shift_for_outlet, derive_nozzle_opening_reading,
    calculate_shift_totals, preview_shift_closing_data, check_can_reopen_shift,
    get_shift_staff_history
)


def _get_operational_shift(shift_id, outlet_id, org_id):
    try:
        return OperationalShift.objects.get(id=shift_id, outlet_id=outlet_id, organisation_id=org_id)
    except OperationalShift.DoesNotExist:
        raise Http404()


class OperationalShiftListView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]
    required_permission = 'shift.view'

    def get(self, request, org_id, outlet_id):
        membership = get_organisation_membership(request.user, org_id)
        try:
            outlet = Outlet.objects.get(organisation_id=org_id, id=outlet_id)
            if not can_access_outlet(membership, outlet):
                raise Http404()
        except Outlet.DoesNotExist:
            raise Http404()

        queryset = OperationalShift.objects.filter(outlet=outlet).select_related(
            'shift_definition', 'opened_by', 'closed_by'
        ).prefetch_related('staff_members', 'meters', 'meters__price_segments')

        # Filter by status
        status_param = request.query_params.get('status')
        if status_param and status_param != 'all':
            queryset = queryset.filter(status=status_param)

        # Filter by shift definition
        shift_def_id = request.query_params.get('shift_definition_id')
        if shift_def_id:
            queryset = queryset.filter(shift_definition_id=shift_def_id)

        # Filter by business date
        from_date = request.query_params.get('from_date')
        if from_date:
            queryset = queryset.filter(business_date__gte=from_date)

        to_date = request.query_params.get('to_date')
        if to_date:
            queryset = queryset.filter(business_date__lte=to_date)

        queryset = queryset.order_by('-business_date', '-opened_at')

        # Current open shift for the outlet
        open_shift = get_open_shift_for_outlet(outlet)
        open_shift_data = None
        if open_shift:
            open_shift_data = OperationalShiftListSerializer(open_shift).data

        serializer = OperationalShiftListSerializer(queryset, many=True)
        return Response({
            'current_open_shift': open_shift_data,
            'shifts': serializer.data
        }, status=status.HTTP_200_OK)


class ShiftOpenPreparationView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]
    required_permission = 'shift.open'

    def get(self, request, org_id, outlet_id):
        membership = get_organisation_membership(request.user, org_id)
        try:
            outlet = Outlet.objects.get(organisation_id=org_id, id=outlet_id)
            if not can_access_outlet(membership, outlet):
                raise Http404()
        except Outlet.DoesNotExist:
            raise Http404()

        shift_def_id = request.query_params.get('shift_definition_id')
        business_date_str = request.query_params.get('business_date')

        if not shift_def_id or not business_date_str:
            return Response(
                {'detail': "shift_definition_id and business_date query parameters are required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            shift_def = ShiftDefinition.objects.get(id=shift_def_id, outlet=outlet)
        except ShiftDefinition.DoesNotExist:
            raise Http404()

        try:
            b_date = datetime.strptime(business_date_str, '%Y-%m-%d').date()
        except ValueError:
            return Response({'detail': "Invalid business_date format. Use YYYY-MM-DD."}, status=status.HTTP_400_BAD_REQUEST)

        prep_data = prepare_shift_opening(
            organisation=membership.organisation,
            outlet=outlet,
            shift_definition=shift_def,
            business_date=b_date
        )
        return Response(prep_data, status=status.HTTP_200_OK)


class ShiftOpenView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]
    required_permission = 'shift.open'

    def post(self, request, org_id, outlet_id):
        membership = get_organisation_membership(request.user, org_id)
        try:
            outlet = Outlet.objects.get(organisation_id=org_id, id=outlet_id)
            if not can_access_outlet(membership, outlet):
                raise Http404()
        except Outlet.DoesNotExist:
            raise Http404()

        shift_def_id = request.data.get('shift_definition_id')
        business_date_str = request.data.get('business_date')
        import json
        staff_assignments = request.data.get('staff_assignments', [])
        if isinstance(staff_assignments, str):
            try:
                staff_assignments = json.loads(staff_assignments)
            except Exception:
                pass

        manual_exceptions = request.data.get('manual_exceptions', {})
        if isinstance(manual_exceptions, str):
            try:
                manual_exceptions = json.loads(manual_exceptions)
            except Exception:
                pass

        notes = request.data.get('notes', '')

        if not shift_def_id or not business_date_str:
            return Response({'detail': "shift_definition_id and business_date are required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            shift_def = ShiftDefinition.objects.get(id=shift_def_id, outlet=outlet)
        except ShiftDefinition.DoesNotExist:
            raise Http404()

        try:
            b_date = datetime.strptime(business_date_str, '%Y-%m-%d').date()
        except ValueError:
            return Response({'detail': "Invalid business_date format. Use YYYY-MM-DD."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            shift = open_operational_shift(
                organisation=membership.organisation,
                outlet=outlet,
                shift_definition=shift_def,
                business_date=b_date,
                staff_assignments_data=staff_assignments,
                manual_exceptions_data=manual_exceptions,
                notes=notes,
                user=request.user
            )
            return Response(OperationalShiftDetailSerializer(shift).data, status=status.HTTP_201_CREATED)
        except DjangoValidationError as e:
            return handle_django_validation_error(e)


class OperationalShiftDetailView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]
    required_permission = 'shift.view'

    def get(self, request, org_id, outlet_id, shift_id):
        membership = get_organisation_membership(request.user, org_id)
        shift = _get_operational_shift(shift_id, outlet_id, org_id)
        if not can_access_outlet(membership, shift.outlet):
            raise Http404()

        totals = calculate_shift_totals(shift)
        serializer = OperationalShiftDetailSerializer(shift)
        can_reopen, _ = check_can_reopen_shift(shift)

        return Response({
            'shift': serializer.data,
            'totals': totals,
            'can_reopen': can_reopen
        }, status=status.HTTP_200_OK)

    def delete(self, request, org_id, outlet_id, shift_id):
        membership = get_organisation_membership(request.user, org_id)
        shift = _get_operational_shift(shift_id, outlet_id, org_id)
        if not can_access_outlet(membership, shift.outlet):
            raise Http404()

        require_permission(request.user, membership.organisation, 'shift.open', outlet=shift.outlet)

        reason = request.data.get('reason', '') if isinstance(request.data, dict) else ''
        try:
            discard_open_operational_shift(shift, request.user, reason=reason)
            return Response({'detail': 'Operational shift discarded successfully.'}, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            return handle_django_validation_error(e)



class ShiftAssignmentsUpdateView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]
    required_permission = 'shift.update_open'

    def post(self, request, org_id, outlet_id, shift_id):
        membership = get_organisation_membership(request.user, org_id)
        shift = _get_operational_shift(shift_id, outlet_id, org_id)
        if not can_access_outlet(membership, shift.outlet):
            raise Http404()

        staff_assignments = request.data.get('staff_assignments', [])
        try:
            updated_shift = update_open_shift_assignments(shift, staff_assignments, request.user)
            return Response(OperationalShiftDetailSerializer(updated_shift).data, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            return handle_django_validation_error(e)


class OperationalShiftStaffAddView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]
    required_permission = 'shift.update_open'

    def post(self, request, org_id, outlet_id, shift_id):
        membership = get_organisation_membership(request.user, org_id)
        shift = _get_operational_shift(shift_id, outlet_id, org_id)
        if not can_access_outlet(membership, shift.outlet):
            raise Http404()

        ser = ShiftStaffAddInputSerializer(data=request.data)
        if not ser.is_valid():
            return Response(ser.errors, status=status.HTTP_400_BAD_REQUEST)

        try:
            staff_member = add_staff_to_open_shift(
                shift=shift,
                employee_id=ser.validated_data['employee_id'],
                duty_designation_id=ser.validated_data.get('duty_designation_id'),
                is_primary_cashier=ser.validated_data.get('is_primary_cashier', False),
                notes=ser.validated_data.get('notes'),
                assigned_nozzle_ids=ser.validated_data.get('assigned_nozzle_ids'),
                user=request.user
            )
            return Response(OperationalShiftStaffSerializer(staff_member).data, status=status.HTTP_201_CREATED)
        except DjangoValidationError as e:
            return handle_django_validation_error(e)


class OperationalShiftNozzleHandoverView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]
    required_permission = 'shift.nozzle_handover'

    def post(self, request, org_id, outlet_id, shift_id):
        membership = get_organisation_membership(request.user, org_id)
        shift = _get_operational_shift(shift_id, outlet_id, org_id)
        if not can_access_outlet(membership, shift.outlet):
            raise Http404()

        ser = ShiftNozzleHandoverInputSerializer(data=request.data)
        if not ser.is_valid():
            return Response(ser.errors, status=status.HTTP_400_BAD_REQUEST)

        try:
            assignment = transfer_nozzle_assignment(
                shift=shift,
                nozzle_id=ser.validated_data['nozzle_id'],
                new_employee_id=ser.validated_data['new_employee_id'],
                handover_reading=ser.validated_data['handover_reading'],
                handover_time=ser.validated_data.get('handover_time'),
                reason=ser.validated_data['reason'],
                user=request.user
            )
            return Response(OperationalShiftNozzleAssignmentSerializer(assignment).data, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            return handle_django_validation_error(e)


class OperationalShiftNozzleCorrectView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]
    required_permission = 'shift.update_open'

    def post(self, request, org_id, outlet_id, shift_id):
        membership = get_organisation_membership(request.user, org_id)
        shift = _get_operational_shift(shift_id, outlet_id, org_id)
        if not can_access_outlet(membership, shift.outlet):
            raise Http404()

        ser = ShiftNozzleCorrectInputSerializer(data=request.data)
        if not ser.is_valid():
            return Response(ser.errors, status=status.HTTP_400_BAD_REQUEST)

        try:
            assignment = correct_nozzle_assignment(
                shift=shift,
                nozzle_id=ser.validated_data['nozzle_id'],
                new_employee_id=ser.validated_data['new_employee_id'],
                reason=ser.validated_data['reason'],
                user=request.user
            )
            return Response(OperationalShiftNozzleAssignmentSerializer(assignment).data, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            return handle_django_validation_error(e)


class OperationalShiftCashierTransferView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]
    required_permission = 'shift.cashier_transfer'

    def post(self, request, org_id, outlet_id, shift_id):
        membership = get_organisation_membership(request.user, org_id)
        shift = _get_operational_shift(shift_id, outlet_id, org_id)
        if not can_access_outlet(membership, shift.outlet):
            raise Http404()

        ser = ShiftCashierTransferInputSerializer(data=request.data)
        if not ser.is_valid():
            return Response(ser.errors, status=status.HTTP_400_BAD_REQUEST)

        try:
            period = transfer_primary_cashier(
                shift=shift,
                new_staff_id=ser.validated_data['new_staff_id'],
                reason=ser.validated_data['reason'],
                user=request.user
            )
            return Response(OperationalShiftCashierPeriodSerializer(period).data, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            return handle_django_validation_error(e)


class OperationalShiftNozzleActivateView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]
    required_permission = 'shift.update_open'

    def post(self, request, org_id, outlet_id, shift_id):
        membership = get_organisation_membership(request.user, org_id)
        shift = _get_operational_shift(shift_id, outlet_id, org_id)
        if not can_access_outlet(membership, shift.outlet):
            raise Http404()

        ser = ShiftNozzleActivateInputSerializer(data=request.data)
        if not ser.is_valid():
            return Response(ser.errors, status=status.HTTP_400_BAD_REQUEST)

        try:
            meter = activate_nozzle_midshift(
                shift=shift,
                nozzle_id=ser.validated_data['nozzle_id'],
                employee_id=ser.validated_data['employee_id'],
                starting_reading=ser.validated_data['starting_reading'],
                reason=ser.validated_data['reason'],
                user=request.user
            )
            return Response(ShiftNozzleMeterSerializer(meter).data, status=status.HTTP_201_CREATED)
        except DjangoValidationError as e:
            return handle_django_validation_error(e)


class OperationalShiftStaffHistoryView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]
    required_permission = 'shift.view'

    def get(self, request, org_id, outlet_id, shift_id):
        membership = get_organisation_membership(request.user, org_id)
        shift = _get_operational_shift(shift_id, outlet_id, org_id)
        if not can_access_outlet(membership, shift.outlet):
            raise Http404()

        data = get_shift_staff_history(shift)
        return Response(data, status=status.HTTP_200_OK)



class ShiftMeterReadingView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]
    required_permission = 'meter_reading.record'

    def post(self, request, org_id, outlet_id, shift_id, nozzle_id):
        membership = get_organisation_membership(request.user, org_id)
        shift = _get_operational_shift(shift_id, outlet_id, org_id)
        if not can_access_outlet(membership, shift.outlet):
            raise Http404()

        try:
            nozzle = Nozzle.objects.get(id=nozzle_id, outlet=shift.outlet)
        except Nozzle.DoesNotExist:
            raise Http404()

        closing_reading = request.data.get('closing_reading')
        reason = request.data.get('reason')

        if closing_reading is None:
            return Response({'detail': "closing_reading is required."}, status=status.HTTP_400_BAD_REQUEST)

        # Check if meter already has closing reading and requires correction permission
        meter = ShiftNozzleMeter.objects.filter(shift=shift, nozzle=nozzle).first()
        if meter and meter.closing_reading is not None:
            require_permission(request.user, org_id, 'meter_reading.correct')

        try:
            updated_meter = record_closing_meter_reading(
                shift=shift,
                nozzle=nozzle,
                closing_reading=Decimal(str(closing_reading)),
                user=request.user,
                reason=reason
            )
            totals = calculate_shift_totals(shift)
            return Response({
                'meter': ShiftNozzleMeterSerializer(updated_meter).data,
                'totals': totals
            }, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            return handle_django_validation_error(e)


class ShiftMeterEventView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]
    required_permission = 'meter_event.record'

    def post(self, request, org_id, outlet_id, shift_id, nozzle_id):
        membership = get_organisation_membership(request.user, org_id)
        shift = _get_operational_shift(shift_id, outlet_id, org_id)
        if not can_access_outlet(membership, shift.outlet):
            raise Http404()

        try:
            nozzle = Nozzle.objects.get(id=nozzle_id, outlet=shift.outlet)
        except Nozzle.DoesNotExist:
            raise Http404()

        event_type = request.data.get('event_type')
        reading_before = request.data.get('reading_before')
        reading_after = request.data.get('reading_after')
        reason = request.data.get('reason')

        if not event_type or reading_before is None or reading_after is None or not reason:
            return Response(
                {'detail': "event_type, reading_before, reading_after, and reason are required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            event = record_meter_event(
                shift=shift,
                nozzle=nozzle,
                event_type=event_type,
                reading_before=Decimal(str(reading_before)),
                reading_after=Decimal(str(reading_after)),
                reason=reason,
                user=request.user
            )
            meter = ShiftNozzleMeter.objects.get(shift=shift, nozzle=nozzle)
            totals = calculate_shift_totals(shift)
            return Response({
                'event': ShiftMeterEventSerializer(event).data,
                'meter': ShiftNozzleMeterSerializer(meter).data,
                'totals': totals
            }, status=status.HTTP_201_CREATED)
        except DjangoValidationError as e:
            return handle_django_validation_error(e)


class ShiftTestingListCreateView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]

    def get_permissions(self):
        if self.request.method == 'GET':
            self.required_permission = 'testing.view'
        else:
            self.required_permission = 'testing.record'
        return super().get_permissions()

    def get(self, request, org_id, outlet_id, shift_id):
        membership = get_organisation_membership(request.user, org_id)
        shift = _get_operational_shift(shift_id, outlet_id, org_id)
        if not can_access_outlet(membership, shift.outlet):
            raise Http404()

        records = shift.testing_records.all().select_related(
            'shift_nozzle_meter__nozzle', 'destination_tank', 'created_by'
        ).order_by('-occurred_at')
        serializer = ShiftTestingRecordSerializer(records, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request, org_id, outlet_id, shift_id):
        membership = get_organisation_membership(request.user, org_id)
        shift = _get_operational_shift(shift_id, outlet_id, org_id)
        if not can_access_outlet(membership, shift.outlet):
            raise Http404()

        nozzle_id = request.data.get('nozzle_id')
        quantity = request.data.get('quantity')
        returned_to_tank = request.data.get('returned_to_tank', True)
        destination_tank_id = request.data.get('destination_tank_id')
        occurred_at_str = request.data.get('occurred_at')
        notes = request.data.get('notes')

        if not nozzle_id or quantity is None:
            return Response({'detail': "nozzle_id and quantity are required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            nozzle = Nozzle.objects.get(id=nozzle_id, outlet=shift.outlet)
        except Nozzle.DoesNotExist:
            raise Http404()

        destination_tank = None
        if destination_tank_id:
            try:
                destination_tank = Tank.objects.get(id=destination_tank_id, outlet=shift.outlet)
            except Tank.DoesNotExist:
                return Response({'detail': "Destination tank not found at this outlet."}, status=status.HTTP_400_BAD_REQUEST)

        occurred_at = None
        if occurred_at_str:
            try:
                occurred_at = datetime.fromisoformat(occurred_at_str)
            except ValueError:
                return Response({'detail': "Invalid occurred_at datetime format."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            record = record_testing(
                shift=shift,
                nozzle=nozzle,
                quantity=Decimal(str(quantity)),
                returned_to_tank=returned_to_tank,
                destination_tank=destination_tank,
                occurred_at=occurred_at,
                notes=notes,
                user=request.user
            )
            totals = calculate_shift_totals(shift)
            return Response({
                'testing': ShiftTestingRecordSerializer(record).data,
                'totals': totals
            }, status=status.HTTP_201_CREATED)
        except DjangoValidationError as e:
            return handle_django_validation_error(e)


class ShiftTestingDetailView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]

    def get_permissions(self):
        if self.request.method == 'DELETE':
            self.required_permission = 'testing.delete'
        else:
            self.required_permission = 'testing.update'
        return super().get_permissions()

    def patch(self, request, org_id, outlet_id, shift_id, testing_id):
        membership = get_organisation_membership(request.user, org_id)
        shift = _get_operational_shift(shift_id, outlet_id, org_id)
        if not can_access_outlet(membership, shift.outlet):
            raise Http404()

        try:
            testing_record = ShiftTestingRecord.objects.get(id=testing_id, shift=shift)
        except ShiftTestingRecord.DoesNotExist:
            raise Http404()

        quantity = request.data.get('quantity', testing_record.quantity)
        returned_to_tank = request.data.get('returned_to_tank', testing_record.returned_to_tank)
        destination_tank_id = request.data.get('destination_tank_id')
        notes = request.data.get('notes', testing_record.notes)

        destination_tank = testing_record.destination_tank
        if destination_tank_id:
            try:
                destination_tank = Tank.objects.get(id=destination_tank_id, outlet=shift.outlet)
            except Tank.DoesNotExist:
                return Response({'detail': "Destination tank not found."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            updated = update_testing(
                testing_record=testing_record,
                quantity=Decimal(str(quantity)),
                returned_to_tank=returned_to_tank,
                destination_tank=destination_tank,
                notes=notes,
                user=request.user
            )
            totals = calculate_shift_totals(shift)
            return Response({
                'testing': ShiftTestingRecordSerializer(updated).data,
                'totals': totals
            }, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            return handle_django_validation_error(e)

    def delete(self, request, org_id, outlet_id, shift_id, testing_id):
        membership = get_organisation_membership(request.user, org_id)
        shift = _get_operational_shift(shift_id, outlet_id, org_id)
        if not can_access_outlet(membership, shift.outlet):
            raise Http404()

        try:
            testing_record = ShiftTestingRecord.objects.get(id=testing_id, shift=shift)
        except ShiftTestingRecord.DoesNotExist:
            raise Http404()

        try:
            delete_testing(testing_record, user=request.user)
            totals = calculate_shift_totals(shift)
            return Response({'detail': "Testing record deleted.", 'totals': totals}, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            return handle_django_validation_error(e)


class ShiftDipListCreateView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]

    def get_permissions(self):
        if self.request.method == 'GET':
            self.required_permission = 'dip_reading.view'
        else:
            self.required_permission = 'dip_reading.record'
        return super().get_permissions()

    def get(self, request, org_id, outlet_id, shift_id):
        membership = get_organisation_membership(request.user, org_id)
        shift = _get_operational_shift(shift_id, outlet_id, org_id)
        if not can_access_outlet(membership, shift.outlet):
            raise Http404()

        observations = shift.dip_observations.all().select_related(
            'tank', 'tank__product', 'calibration_chart', 'recorded_by'
        ).order_by('tank__code', 'observation_type')
        serializer = ShiftTankDipObservationSerializer(observations, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request, org_id, outlet_id, shift_id):
        membership = get_organisation_membership(request.user, org_id)
        shift = _get_operational_shift(shift_id, outlet_id, org_id)
        if not can_access_outlet(membership, shift.outlet):
            raise Http404()

        tank_id = request.data.get('tank_id')
        obs_type = request.data.get('observation_type')
        raw_dip = request.data.get('raw_dip_value')
        raw_unit = request.data.get('raw_dip_unit', 'millimetre')
        density = request.data.get('density')
        manual_quantity = request.data.get('manual_quantity')
        manual_reason = request.data.get('manual_quantity_reason')
        notes = request.data.get('notes')

        if manual_quantity is not None:
            require_permission(request.user, org_id, 'dip_reading.correct')

        if not tank_id or not obs_type or raw_dip is None:
            return Response(
                {'detail': "tank_id, observation_type, and raw_dip_value are required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            tank = Tank.objects.get(id=tank_id, outlet=shift.outlet)
        except Tank.DoesNotExist:
            raise Http404()

        try:
            dip_obs = record_shift_dip(
                shift=shift,
                tank=tank,
                observation_type=obs_type,
                raw_dip_value=Decimal(str(raw_dip)),
                raw_dip_unit=raw_unit,
                density=Decimal(str(density)) if density is not None else None,
                manual_quantity=Decimal(str(manual_quantity)) if manual_quantity is not None else None,
                manual_quantity_reason=manual_reason,
                notes=notes,
                user=request.user
            )
            return Response(ShiftTankDipObservationSerializer(dip_obs).data, status=status.HTTP_201_CREATED)
        except DjangoValidationError as e:
            return handle_django_validation_error(e)


class ShiftPriceChangePreviewView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]
    required_permission = 'product_price.update'

    def post(self, request, org_id, outlet_id, shift_id):
        membership = get_organisation_membership(request.user, org_id)
        shift = _get_operational_shift(shift_id, outlet_id, org_id)
        if not can_access_outlet(membership, shift.outlet):
            raise Http404()

        if shift.status != OperationalShift.STATUS_OPEN:
            return Response({'detail': "Price change during shift requires an open shift."}, status=status.HTTP_400_BAD_REQUEST)

        product_id = request.data.get('product_id')
        new_price = request.data.get('new_price')
        nozzle_snapshots = request.data.get('nozzle_snapshot_readings', {})

        if not product_id or new_price is None:
            return Response({'detail': "product_id and new_price are required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            product = FuelProduct.objects.get(id=product_id, organisation=membership.organisation)
        except FuelProduct.DoesNotExist:
            raise Http404()

        meters = list(
            ShiftNozzleMeter.objects.filter(shift=shift, nozzle__tank__product=product)
            .select_related('nozzle')
        )

        preview_nozzles = []
        errors = []
        new_price_dec = Decimal(str(new_price))

        for m in meters:
            nid = str(m.nozzle_id)
            active_seg = m.price_segments.filter(ends_at__isnull=True).order_by('-sequence').first()
            if not active_seg:
                active_seg = m.price_segments.order_by('-sequence').first()

            snap = nozzle_snapshots.get(nid) or nozzle_snapshots.get(m.nozzle.code)
            snap_val = None
            diff = Decimal('0.000')
            if snap is not None:
                try:
                    snap_val = Decimal(str(snap))
                    if active_seg and snap_val < active_seg.opening_reading:
                        errors.append(f"Snapshot ({snap_val}) lower than opening ({active_seg.opening_reading}) on {m.nozzle.code}")
                    elif active_seg:
                        diff = max(Decimal('0.000'), snap_val - active_seg.opening_reading)
                except ValueError:
                    errors.append(f"Invalid reading value for nozzle {m.nozzle.code}")
            else:
                errors.append(f"Snapshot reading missing for nozzle {m.nozzle.code}")

            preview_nozzles.append({
                'nozzle_id': nid,
                'nozzle_code': m.nozzle.code,
                'nozzle_name': m.nozzle.name,
                'current_opening_reading': str(active_seg.opening_reading) if active_seg else '0.000',
                'current_unit_price': str(active_seg.unit_price) if active_seg else '0.0000',
                'snapshot_reading': str(snap_val) if snap_val is not None else None,
                'current_segment_dispensed': str(diff),
                'new_unit_price': str(new_price_dec)
            })

        return Response({
            'product_id': str(product.id),
            'product_name': product.name,
            'new_price': str(new_price_dec),
            'nozzles': preview_nozzles,
            'is_valid': len(errors) == 0,
            'errors': errors
        }, status=status.HTTP_200_OK)


class ShiftPriceChangeConfirmView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]
    required_permission = 'product_price.update'

    def post(self, request, org_id, outlet_id, shift_id):
        membership = get_organisation_membership(request.user, org_id)
        shift = _get_operational_shift(shift_id, outlet_id, org_id)
        if not can_access_outlet(membership, shift.outlet):
            raise Http404()

        product_id = request.data.get('product_id')
        new_price = request.data.get('new_price')
        effective_at_str = request.data.get('effective_at')
        nozzle_snapshots = request.data.get('nozzle_snapshot_readings', {})

        if not product_id or new_price is None:
            return Response({'detail': "product_id and new_price are required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            product = FuelProduct.objects.get(id=product_id, organisation=membership.organisation)
        except FuelProduct.DoesNotExist:
            raise Http404()

        effective_at = None
        if effective_at_str:
            try:
                effective_at = datetime.fromisoformat(effective_at_str)
            except ValueError:
                return Response({'detail': "Invalid effective_at datetime format."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            new_price_record = apply_product_price_change_during_shift(
                outlet=shift.outlet,
                product=product,
                new_price=Decimal(str(new_price)),
                effective_at=effective_at,
                nozzle_snapshot_readings=nozzle_snapshots,
                actor=request.user
            )
            shift.refresh_from_db()
            totals = calculate_shift_totals(shift)
            return Response({
                'detail': "Price change applied successfully.",
                'shift': OperationalShiftDetailSerializer(shift).data,
                'totals': totals
            }, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            return handle_django_validation_error(e)


class ShiftClosingPreviewView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]
    required_permission = 'shift.view'

    def get(self, request, org_id, outlet_id, shift_id):
        membership = get_organisation_membership(request.user, org_id)
        shift = _get_operational_shift(shift_id, outlet_id, org_id)
        if not can_access_outlet(membership, shift.outlet):
            raise Http404()

        preview = preview_shift_closing_data(shift)
        return Response(preview, status=status.HTTP_200_OK)


class ShiftCloseView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]
    required_permission = 'shift.close'

    def post(self, request, org_id, outlet_id, shift_id):
        membership = get_organisation_membership(request.user, org_id)
        shift = _get_operational_shift(shift_id, outlet_id, org_id)
        if not can_access_outlet(membership, shift.outlet):
            raise Http404()

        try:
            closed_shift = close_operational_shift(shift, request.user)
            return Response(OperationalShiftDetailSerializer(closed_shift).data, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            return handle_django_validation_error(e)


class ShiftReopenView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]
    required_permission = 'shift.reopen'

    def post(self, request, org_id, outlet_id, shift_id):
        membership = get_organisation_membership(request.user, org_id)
        shift = _get_operational_shift(shift_id, outlet_id, org_id)
        if not can_access_outlet(membership, shift.outlet):
            raise Http404()

        reason = request.data.get('reason')
        if not reason or not reason.strip():
            return Response({'detail': "A mandatory reason is required to reopen a shift."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            reopened_shift = reopen_operational_shift(shift, request.user, reason)
            return Response(OperationalShiftDetailSerializer(reopened_shift).data, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            return handle_django_validation_error(e)


class ShiftActivityLogView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]
    required_permission = 'shift.view'

    def get(self, request, org_id, outlet_id, shift_id):
        membership = get_organisation_membership(request.user, org_id)
        shift = _get_operational_shift(shift_id, outlet_id, org_id)
        if not can_access_outlet(membership, shift.outlet):
            raise Http404()

        logs = shift.activity_logs.all().select_related('actor').order_by('occurred_at')
        serializer = ShiftActivityLogSerializer(logs, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class ShiftTotalsView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]
    required_permission = 'shift.view'

    def get(self, request, org_id, outlet_id, shift_id):
        membership = get_organisation_membership(request.user, org_id)
        shift = _get_operational_shift(shift_id, outlet_id, org_id)
        if not can_access_outlet(membership, shift.outlet):
            raise Http404()

        totals = calculate_shift_totals(shift)
        return Response(totals, status=status.HTTP_200_OK)
