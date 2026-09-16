# apps/shifts/views.py
import os
from datetime import datetime, date
from decimal import Decimal
import json
from django.http import Http404, FileResponse
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

        assignments_data = request.data.get('assignments')
        if assignments_data is None:
            assignments_data = request.data.get('staff_assignments') or []
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

        # Reject legacy primary cashier field if passed in the payload
        for a in assignments_data:
            if 'is_primary_cashier' in a:
                return Response({'detail': "The field 'is_primary_cashier' has been retired and is not accepted."}, status=status.HTTP_400_BAD_REQUEST)

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
    ShiftTestingRecord, ShiftTankDipObservation, ShiftActivityLog,
    Customer, CustomerOutletAssignment, FuelCreditSlip,
    EmployeeShiftCollection, EmployeeCashDenomination,
    EmployeeShiftDeduction, EmployeeShiftSettlement,
    ShiftReconciliation, CollectionAuditLog, EmployeeShiftCard
)
from .serializers import (
    OperationalShiftListSerializer, OperationalShiftDetailSerializer,
    ShiftNozzleMeterSerializer, ShiftTestingRecordSerializer,
    ShiftTankDipObservationSerializer, ShiftActivityLogSerializer,
    OperationalShiftStaffSerializer, OperationalShiftNozzleAssignmentSerializer,
    ShiftStaffAddInputSerializer, ShiftNozzleHandoverInputSerializer,
    ShiftNozzleCorrectInputSerializer,
    ShiftNozzleActivateInputSerializer,
    ShiftMeterEventSerializer,
    CustomerSerializer, FuelCreditSlipSerializer,
    EmployeeShiftCollectionSerializer, EmployeeCashDenominationSerializer,
    EmployeeShiftDeductionSerializer, EmployeeShiftSettlementSerializer,
    ShiftReconciliationSerializer, CollectionAuditLogSerializer,
    ShiftCardAtomicSaveSerializer, EmployeeShiftCardSerializer,
    ShiftCardVoidSerializer, ShiftLockActionSerializer,
    ShiftUnlockActionSerializer, ShiftDeductionRejectActionSerializer
)
from .services import (
    prepare_shift_opening, open_operational_shift, update_open_shift_assignments,
    add_staff_to_open_shift, transfer_nozzle_assignment, correct_nozzle_assignment,
    activate_nozzle_midshift,
    record_closing_meter_reading, record_meter_event, record_testing,
    update_testing, delete_testing, record_shift_dip,
    apply_product_price_change_during_shift, recalculate_shift_totals,
    close_operational_shift, reopen_operational_shift, discard_open_operational_shift,
    create_customer, update_customer, deactivate_customer, get_customer_credit_position,
    create_credit_slip, update_credit_slip, void_credit_slip,
    create_employee_collection, update_employee_collection, void_employee_collection,
    create_employee_shift_deduction, void_employee_shift_deduction,
    calculate_employee_settlement, preview_employee_reconciliation,
    reconcile_employee_settlement, reopen_employee_settlement,
    calculate_shift_reconciliation, get_employee_accountability_summary,
    atomic_save_shift_card, void_shift_card, lock_shift, unlock_shift,
    approve_shift_deduction, reject_shift_deduction
)
from .selectors import (
    get_open_shift_for_outlet, derive_nozzle_opening_reading,
    calculate_shift_totals, preview_shift_closing_data, check_can_reopen_shift,
    get_shift_staff_history, get_shift_card_preparation_data,
    get_last_entered_business_date, get_parent_shift_summary
)


def _get_operational_shift(shift_id, outlet_id, org_id):
    try:
        return OperationalShift.objects.get(id=shift_id, outlet_id=outlet_id, organisation_id=org_id)
    except OperationalShift.DoesNotExist:
        raise Http404()


def _get_shift_card(card_id, outlet_id, org_id):
    try:
        return EmployeeShiftCard.objects.select_related(
            'parent_shift', 'parent_shift__shift_definition', 'parent_shift__locked_by',
            'employee', 'voided_by', 'created_by'
        ).prefetch_related(
            'meters', 'collections', 'credit_slips', 'deductions'
        ).get(id=card_id, outlet_id=outlet_id, organisation_id=org_id)
    except EmployeeShiftCard.DoesNotExist:
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
        return Response(
            {
                "detail": "This live operational shift opening endpoint has been retired. Please use the document-based Shift Card workflow.",
                "code": "ENDPOINT_RETIRED"
            },
            status=status.HTTP_410_GONE
        )


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
        return Response(
            {"detail": "This live assignment update endpoint has been retired. Please use the document-based Shift Card workflow.", "code": "ENDPOINT_RETIRED"},
            status=status.HTTP_410_GONE
        )


class OperationalShiftStaffAddView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]
    required_permission = 'shift.update_open'

    def post(self, request, org_id, outlet_id, shift_id):
        return Response(
            {"detail": "This live staff add endpoint has been retired. Please use the document-based Shift Card workflow.", "code": "ENDPOINT_RETIRED"},
            status=status.HTTP_410_GONE
        )


class OperationalShiftNozzleHandoverView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]
    required_permission = 'shift.nozzle_handover'

    def post(self, request, org_id, outlet_id, shift_id):
        return Response(
            {"detail": "This live nozzle handover endpoint has been retired. Please use the document-based Shift Card workflow.", "code": "ENDPOINT_RETIRED"},
            status=status.HTTP_410_GONE
        )


class OperationalShiftNozzleCorrectView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]
    required_permission = 'shift.update_open'

    def post(self, request, org_id, outlet_id, shift_id):
        return Response(
            {"detail": "This live assignment correction endpoint has been retired. Please use the document-based Shift Card workflow.", "code": "ENDPOINT_RETIRED"},
            status=status.HTTP_410_GONE
        )


class OperationalShiftCashierTransferView(APIView):
    def post(self, request, *args, **kwargs):
        return Response(
            {'detail': "The primary cashier transfer endpoint has been retired and decommissioned. Shift accountability is now employee-wise.", "code": "ENDPOINT_RETIRED"},
            status=status.HTTP_410_GONE
        )


class OperationalShiftNozzleActivateView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]
    required_permission = 'shift.update_open'

    def post(self, request, org_id, outlet_id, shift_id):
        return Response(
            {"detail": "This live nozzle activation endpoint has been retired. Please use the document-based Shift Card workflow.", "code": "ENDPOINT_RETIRED"},
            status=status.HTTP_410_GONE
        )


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
        return Response(
            {"detail": "This live meter reading endpoint has been retired. Please use the document-based Shift Card workflow.", "code": "ENDPOINT_RETIRED"},
            status=status.HTTP_410_GONE
        )


class ShiftMeterEventView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]
    required_permission = 'meter_event.record'

    def post(self, request, org_id, outlet_id, shift_id, nozzle_id):
        return Response(
            {"detail": "This live meter event endpoint has been retired. Please use the document-based Shift Card workflow.", "code": "ENDPOINT_RETIRED"},
            status=status.HTTP_410_GONE
        )


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
        return Response(
            {"detail": "This live shift closing endpoint has been retired. Please use the document-based Shift Card workflow.", "code": "ENDPOINT_RETIRED"},
            status=status.HTTP_410_GONE
        )


class ShiftReopenView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]
    required_permission = 'shift.reopen'

    def post(self, request, org_id, outlet_id, shift_id):
        return Response(
            {"detail": "This live shift reopening endpoint has been retired. Please use the document-based Shift Card workflow.", "code": "ENDPOINT_RETIRED"},
            status=status.HTTP_410_GONE
        )


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


# =====================================================================
# MILESTONE 10: CUSTOMERS, CREDIT SLIPS, COLLECTIONS & RECONCILIATION
# =====================================================================

def _get_customer(customer_id, org_id):
    try:
        return Customer.objects.get(id=customer_id, organisation_id=org_id)
    except Customer.DoesNotExist:
        raise Http404()


class CustomerListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id):
        require_permission(request.user, org_id, 'customer.view')
        membership = get_organisation_membership(request.user, org_id)

        queryset = Customer.objects.filter(organisation_id=org_id).prefetch_related('outlet_assignments')

        search = request.query_params.get('search')
        if search:
            queryset = queryset.filter(
                models.Q(display_name__icontains=search) |
                models.Q(customer_code__icontains=search) |
                models.Q(phone_number__icontains=search) |
                models.Q(GSTIN__icontains=search)
            )

        status_param = request.query_params.get('status')
        if status_param and status_param != 'all':
            queryset = queryset.filter(status=status_param)

        ctype = request.query_params.get('customer_type')
        if ctype and ctype != 'all':
            queryset = queryset.filter(customer_type=ctype)

        outlet_id = request.query_params.get('outlet_id')
        if outlet_id:
            queryset = queryset.filter(
                models.Q(outlet_assignments__outlet_id=outlet_id) |
                models.Q(outlet_assignments__isnull=True)
            ).distinct()

        serializer = CustomerSerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request, org_id):
        require_permission(request.user, org_id, 'customer.create')
        membership = get_organisation_membership(request.user, org_id)
        org = membership.organisation

        data = request.data.copy()
        customer_code = data.get('customer_code', '')
        display_name = data.get('display_name', '')
        customer_type = data.get('customer_type', Customer.TYPE_BUSINESS)
        outlet_ids = data.get('outlet_ids')

        try:
            customer = create_customer(
                organisation=org,
                customer_code=customer_code,
                display_name=display_name,
                customer_type=customer_type,
                user=request.user,
                outlet_ids=outlet_ids,
                phone_number=data.get('phone_number'),
                alternate_phone_number=data.get('alternate_phone_number'),
                email=data.get('email'),
                billing_address=data.get('billing_address'),
                GSTIN=data.get('GSTIN'),
                credit_limit=data.get('credit_limit'),
                credit_days=data.get('credit_days'),
                status=data.get('status', Customer.STATUS_ACTIVE),
                notes=data.get('notes')
            )
            return Response(CustomerSerializer(customer).data, status=status.HTTP_201_CREATED)
        except DjangoValidationError as e:
            return handle_django_validation_error(e)


class CustomerDetailUpdateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id, customer_id):
        require_permission(request.user, org_id, 'customer.view')
        customer = _get_customer(customer_id, org_id)
        return Response(CustomerSerializer(customer).data, status=status.HTTP_200_OK)

    def patch(self, request, org_id, customer_id):
        require_permission(request.user, org_id, 'customer.update')
        customer = _get_customer(customer_id, org_id)
        try:
            updated = update_customer(customer, user=request.user, **request.data)
            return Response(CustomerSerializer(updated).data, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            return handle_django_validation_error(e)


class CustomerDeactivateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, org_id, customer_id):
        require_permission(request.user, org_id, 'customer.deactivate')
        customer = _get_customer(customer_id, org_id)
        deactivated = deactivate_customer(customer, user=request.user)
        return Response(CustomerSerializer(deactivated).data, status=status.HTTP_200_OK)


class CustomerCreditPositionView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id, customer_id):
        require_permission(request.user, org_id, 'customer.view')
        customer = _get_customer(customer_id, org_id)
        outlet_id = request.query_params.get('outlet_id')
        outlet = None
        if outlet_id:
            try:
                outlet = Outlet.objects.get(id=outlet_id, organisation_id=org_id)
            except Outlet.DoesNotExist:
                raise Http404()
        position = get_customer_credit_position(customer, outlet=outlet)
        return Response(position, status=status.HTTP_200_OK)


class CustomerCreditSlipsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id, customer_id):
        require_permission(request.user, org_id, 'credit_slip.view')
        customer = _get_customer(customer_id, org_id)
        slips = customer.credit_slips.all().select_related(
            'product', 'nozzle', 'employee', 'operational_shift', 'voided_by'
        ).order_by('-occurred_at')
        serializer = FuelCreditSlipSerializer(slips, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class OutletCreditSlipListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id, outlet_id):
        require_permission(request.user, org_id, 'credit_slip.view', outlet=Outlet.objects.filter(id=outlet_id).first())
        membership = get_organisation_membership(request.user, org_id)
        try:
            outlet = Outlet.objects.get(id=outlet_id, organisation_id=org_id)
            if not can_access_outlet(membership, outlet):
                raise Http404()
        except Outlet.DoesNotExist:
            raise Http404()

        queryset = FuelCreditSlip.objects.filter(outlet=outlet).select_related(
            'customer', 'employee', 'nozzle', 'product', 'operational_shift', 'voided_by'
        ).order_by('-occurred_at')

        shift_id = request.query_params.get('shift_id')
        if shift_id:
            queryset = queryset.filter(operational_shift_id=shift_id)

        customer_id = request.query_params.get('customer_id')
        if customer_id:
            queryset = queryset.filter(customer_id=customer_id)

        employee_id = request.query_params.get('employee_id')
        if employee_id:
            queryset = queryset.filter(employee_id=employee_id)

        status_param = request.query_params.get('status')
        if status_param and status_param != 'all':
            queryset = queryset.filter(status=status_param)

        serializer = FuelCreditSlipSerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class ShiftCreditSlipListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id, outlet_id, shift_id):
        shift = _get_operational_shift(shift_id, outlet_id, org_id)
        require_permission(request.user, org_id, 'credit_slip.view', outlet=shift.outlet)

        queryset = shift.credit_slips.all().select_related(
            'customer', 'employee', 'nozzle', 'product', 'voided_by'
        ).order_by('-occurred_at')

        employee_id = request.query_params.get('employee_id')
        if employee_id:
            queryset = queryset.filter(employee_id=employee_id)

        serializer = FuelCreditSlipSerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request, org_id, outlet_id, shift_id):
        shift = _get_operational_shift(shift_id, outlet_id, org_id)
        require_permission(request.user, org_id, 'credit_slip.create', outlet=shift.outlet)

        data = request.data
        try:
            customer = Customer.objects.get(id=data['customer_id'], organisation_id=org_id)
            employee = Employee.objects.get(id=data['employee_id'], organisation_id=org_id)
            product = FuelProduct.objects.get(id=data['product_id'], organisation_id=org_id)
            nozzle = None
            if data.get('nozzle_id'):
                nozzle = Nozzle.objects.get(id=data['nozzle_id'], outlet=shift.outlet)

            slip = create_credit_slip(
                organisation=shift.organisation,
                outlet=shift.outlet,
                shift=shift,
                employee=employee,
                customer=customer,
                product=product,
                quantity=Decimal(str(data['quantity'])),
                user=request.user,
                nozzle=nozzle,
                occurred_at=data.get('occurred_at'),
                slip_number=data.get('slip_number'),
                vehicle_number=data.get('vehicle_number'),
                driver_name=data.get('driver_name'),
                customer_reference=data.get('customer_reference'),
                physical_slip_number=data.get('physical_slip_number'),
                notes=data.get('notes')
            )
            return Response(FuelCreditSlipSerializer(slip).data, status=status.HTTP_201_CREATED)
        except (Customer.DoesNotExist, Employee.DoesNotExist, FuelProduct.DoesNotExist, Nozzle.DoesNotExist):
            return Response({'detail': "Referenced entity does not exist."}, status=status.HTTP_400_BAD_REQUEST)
        except DjangoValidationError as e:
            return handle_django_validation_error(e)


class CreditSlipDetailUpdateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id, outlet_id, slip_id):
        require_permission(request.user, org_id, 'credit_slip.view')
        try:
            slip = FuelCreditSlip.objects.select_related(
                'customer', 'employee', 'nozzle', 'product', 'voided_by'
            ).get(id=slip_id, outlet_id=outlet_id, organisation_id=org_id)
        except FuelCreditSlip.DoesNotExist:
            raise Http404()
        return Response(FuelCreditSlipSerializer(slip).data, status=status.HTTP_200_OK)

    def patch(self, request, org_id, outlet_id, slip_id):
        require_permission(request.user, org_id, 'credit_slip.update')
        try:
            slip = FuelCreditSlip.objects.get(id=slip_id, outlet_id=outlet_id, organisation_id=org_id)
        except FuelCreditSlip.DoesNotExist:
            raise Http404()
        try:
            updated = update_credit_slip(slip, request.user, **request.data)
            return Response(FuelCreditSlipSerializer(updated).data, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            return handle_django_validation_error(e)


class CreditSlipVoidView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, org_id, outlet_id, slip_id):
        require_permission(request.user, org_id, 'credit_slip.void')
        try:
            slip = FuelCreditSlip.objects.get(id=slip_id, outlet_id=outlet_id, organisation_id=org_id)
        except FuelCreditSlip.DoesNotExist:
            raise Http404()

        reason = request.data.get('reason', '')
        if not reason or not reason.strip():
            return Response({'reason': ["A mandatory reason is required to void a credit slip."]}, status=status.HTTP_400_BAD_REQUEST)

        try:
            voided = void_credit_slip(slip, request.user, reason)
            return Response(FuelCreditSlipSerializer(voided).data, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            return handle_django_validation_error(e)


class ShiftCollectionListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id, outlet_id, shift_id):
        shift = _get_operational_shift(shift_id, outlet_id, org_id)
        require_permission(request.user, org_id, 'collection.view', outlet=shift.outlet)

        queryset = shift.collections.all().select_related(
            'employee', 'voided_by'
        ).prefetch_related('denominations').order_by('-occurred_at')

        emp_id = request.query_params.get('employee_id')
        if emp_id:
            queryset = queryset.filter(employee_id=emp_id)

        method = request.query_params.get('collection_method')
        if method:
            queryset = queryset.filter(collection_method=method)

        serializer = EmployeeShiftCollectionSerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request, org_id, outlet_id, shift_id):
        return Response(
            {
                "detail": "This live collection entry endpoint has been retired. Please record collections directly within the atomic Shift Card workflow.",
                "code": "ENDPOINT_RETIRED"
            },
            status=status.HTTP_410_GONE
        )


class CollectionDetailUpdateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id, outlet_id, collection_id):
        require_permission(request.user, org_id, 'collection.view')
        try:
            col = EmployeeShiftCollection.objects.select_related('employee', 'voided_by').prefetch_related('denominations').get(
                id=collection_id, outlet_id=outlet_id, organisation_id=org_id
            )
        except EmployeeShiftCollection.DoesNotExist:
            raise Http404()
        return Response(EmployeeShiftCollectionSerializer(col).data, status=status.HTTP_200_OK)

    def patch(self, request, org_id, outlet_id, collection_id):
        return Response(
            {
                "detail": "This collection update endpoint has been retired. Collections are managed atomically through Shift Cards.",
                "code": "ENDPOINT_RETIRED"
            },
            status=status.HTTP_410_GONE
        )


class CollectionVoidView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, org_id, outlet_id, collection_id):
        require_permission(request.user, org_id, 'collection.void')
        try:
            col = EmployeeShiftCollection.objects.get(id=collection_id, outlet_id=outlet_id, organisation_id=org_id)
        except EmployeeShiftCollection.DoesNotExist:
            raise Http404()

        reason = request.data.get('reason', '')
        if not reason or not reason.strip():
            return Response({'reason': ["A mandatory reason is required to void a collection."]}, status=status.HTTP_400_BAD_REQUEST)

        try:
            voided = void_employee_collection(col, request.user, reason)
            return Response(EmployeeShiftCollectionSerializer(voided).data, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            return handle_django_validation_error(e)


class ShiftDeductionListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id, outlet_id, shift_id):
        shift = _get_operational_shift(shift_id, outlet_id, org_id)
        require_permission(request.user, org_id, 'shift_deduction.view', outlet=shift.outlet)

        queryset = shift.deductions.all().select_related('employee', 'approved_by', 'voided_by').order_by('-occurred_at')
        emp_id = request.query_params.get('employee_id')
        if emp_id:
            queryset = queryset.filter(employee_id=emp_id)

        serializer = EmployeeShiftDeductionSerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request, org_id, outlet_id, shift_id):
        shift = _get_operational_shift(shift_id, outlet_id, org_id)
        require_permission(request.user, org_id, 'shift_deduction.approve', outlet=shift.outlet)

        data = request.data
        try:
            employee = Employee.objects.get(id=data['employee_id'], organisation_id=org_id)
            amount = Decimal(str(data['amount']))

            deduction = create_employee_shift_deduction(
                organisation=shift.organisation,
                outlet=shift.outlet,
                shift=shift,
                employee=employee,
                deduction_type=data['deduction_type'],
                direction=data['direction'],
                amount=amount,
                occurred_at=data.get('occurred_at'),
                description=data.get('description', ''),
                approval_reason=data.get('approval_reason', ''),
                approved_by=request.user,
                user=request.user,
                payee=data.get('payee'),
                reference_number=data.get('reference_number')
            )
            return Response(EmployeeShiftDeductionSerializer(deduction).data, status=status.HTTP_201_CREATED)
        except Employee.DoesNotExist:
            return Response({'employee_id': ["Employee does not exist."]}, status=status.HTTP_400_BAD_REQUEST)
        except DjangoValidationError as e:
            return handle_django_validation_error(e)


class DeductionVoidView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, org_id, outlet_id, deduction_id):
        require_permission(request.user, org_id, 'shift_deduction.void')
        try:
            ded = EmployeeShiftDeduction.objects.get(id=deduction_id, outlet_id=outlet_id, organisation_id=org_id)
        except EmployeeShiftDeduction.DoesNotExist:
            raise Http404()

        reason = request.data.get('reason', '')
        if not reason or not reason.strip():
            return Response({'reason': ["A mandatory reason is required to void a deduction."]}, status=status.HTTP_400_BAD_REQUEST)

        try:
            voided = void_employee_shift_deduction(ded, request.user, reason)
            return Response(EmployeeShiftDeductionSerializer(voided).data, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            return handle_django_validation_error(e)


class EmployeeAccountabilitySummaryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id, outlet_id, shift_id):
        shift = _get_operational_shift(shift_id, outlet_id, org_id)
        require_permission(request.user, org_id, 'reconciliation.view', outlet=shift.outlet)

        summaries = get_employee_accountability_summary(shift)
        recon = calculate_shift_reconciliation(shift)

        return Response({
            'shift_id': str(shift.id),
            'business_date': shift.business_date,
            'operational_status': shift.status,
            'reconciliation_status': recon.status,
            'shift_reconciliation_complete': recon.status == ShiftReconciliation.STATUS_RECONCILED,
            'employees': summaries,
            'reconciliation': ShiftReconciliationSerializer(recon).data
        }, status=status.HTTP_200_OK)


class EmployeeReconciliationPreviewView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id, outlet_id, shift_id, employee_id):
        shift = _get_operational_shift(shift_id, outlet_id, org_id)
        require_permission(request.user, org_id, 'reconciliation.view', outlet=shift.outlet)

        try:
            employee = Employee.objects.get(id=employee_id, organisation_id=org_id)
        except Employee.DoesNotExist:
            raise Http404()

        preview = preview_employee_reconciliation(shift, employee)
        return Response(preview, status=status.HTTP_200_OK)


class EmployeeReconcileView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, org_id, outlet_id, shift_id, employee_id):
        return Response(
            {"detail": "This live reconciliation endpoint has been retired. Please use the document-based Shift Card workflow.", "code": "ENDPOINT_RETIRED"},
            status=status.HTTP_410_GONE
        )


class EmployeeSettlementReopenView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, org_id, outlet_id, shift_id, settlement_id):
        return Response(
            {"detail": "This live settlement reopen endpoint has been retired. Please use the document-based Shift Card workflow.", "code": "ENDPOINT_RETIRED"},
            status=status.HTTP_410_GONE
        )


class ShiftReconciliationSummaryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id, outlet_id, shift_id):
        shift = _get_operational_shift(shift_id, outlet_id, org_id)
        require_permission(request.user, org_id, 'reconciliation.view', outlet=shift.outlet)

        recon = calculate_shift_reconciliation(shift)
        return Response(ShiftReconciliationSerializer(recon).data, status=status.HTTP_200_OK)


class CollectionActivityTimelineView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id, outlet_id, shift_id):
        shift = _get_operational_shift(shift_id, outlet_id, org_id)
        require_permission(request.user, org_id, 'reconciliation.view', outlet=shift.outlet)

        logs = CollectionAuditLog.objects.filter(shift=shift).select_related('employee', 'customer', 'actor').order_by('-occurred_at')
        serializer = CollectionAuditLogSerializer(logs, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


# =====================================================================
# SHIFT CARD DOCUMENT-BASED WORKFLOW VIEWS
# =====================================================================

class ShiftCardPreparationView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id, outlet_id):
        membership = get_organisation_membership(request.user, org_id)
        try:
            outlet = Outlet.objects.get(organisation_id=org_id, id=outlet_id)
            if not can_access_outlet(membership, outlet):
                raise Http404()
        except Outlet.DoesNotExist:
            raise Http404()

        require_permission(request.user, org_id, 'shift.view', outlet=outlet)

        business_date_str = request.query_params.get('business_date')
        shift_definition_id = request.query_params.get('shift_definition_id')
        employee_id = request.query_params.get('employee_id')

        last_business_date_str = get_last_entered_business_date(outlet, request.user)
        if isinstance(last_business_date_str, (date, datetime)):
            last_business_date_str = last_business_date_str.strftime('%Y-%m-%d')
        elif last_business_date_str:
            last_business_date_str = str(last_business_date_str)
        else:
            last_business_date_str = date.today().strftime('%Y-%m-%d')

        if business_date_str:
            try:
                b_date = datetime.strptime(business_date_str, '%Y-%m-%d').date()
            except ValueError:
                return Response({'detail': "Invalid business_date format. Expected YYYY-MM-DD."}, status=status.HTTP_400_BAD_REQUEST)
        else:
            try:
                b_date = datetime.strptime(last_business_date_str, '%Y-%m-%d').date()
            except ValueError:
                b_date = date.today()

        shift_defs = list(ShiftDefinition.objects.filter(outlet=outlet, is_active=True).order_by('display_order', 'starts_at'))
        shift_defs_data = [{
            'id': str(s.id),
            'code': s.code,
            'name': s.name,
            'starts_at': str(s.starts_at),
            'ends_at': str(s.ends_at),
            'crosses_midnight': s.crosses_midnight
        } for s in shift_defs]

        selected_shift_def = None
        if shift_definition_id:
            try:
                selected_shift_def = ShiftDefinition.objects.get(id=shift_definition_id, outlet=outlet)
            except ShiftDefinition.DoesNotExist:
                return Response({'detail': "Shift definition not found for this outlet."}, status=status.HTTP_400_BAD_REQUEST)
        elif shift_defs:
            selected_shift_def = shift_defs[0]

        if not selected_shift_def:
            return Response({
                'business_date': b_date.strftime('%Y-%m-%d'),
                'last_entered_business_date': last_business_date_str,
                'shift_definition_id': None,
                'shift_definitions': [],
                'historical_employees': [],
                'historical_nozzles': [],
                'parent_shift': None,
                'existing_cards': [],
                'missing_nozzle_ids': [],
                'is_ready': False
            }, status=status.HTTP_200_OK)

        prep_data = get_shift_card_preparation_data(
            organisation=membership.organisation,
            outlet=outlet,
            shift_definition=selected_shift_def,
            business_date=b_date,
            employee_id=employee_id
        )

        parent_shift_obj = OperationalShift.objects.filter(
            outlet=outlet,
            shift_definition=selected_shift_def,
            business_date=b_date
        ).first()

        parent_shift_data = None
        existing_cards_data = []
        covered_nozzle_ids = set()
        if parent_shift_obj:
            from .serializers import ShiftCardParentShiftSerializer, EmployeeShiftCardSerializer
            parent_shift_data = ShiftCardParentShiftSerializer(parent_shift_obj).data
            active_cards = list(
                parent_shift_obj.employee_cards.filter(status=EmployeeShiftCard.STATUS_ACTIVE)
                .select_related('employee', 'parent_shift', 'parent_shift__shift_definition', 'parent_shift__locked_by', 'voided_by', 'created_by')
                .prefetch_related('meters', 'collections', 'credit_slips', 'deductions')
            )
            existing_cards_data = EmployeeShiftCardSerializer(active_cards, many=True).data
            for c in active_cards:
                for m in c.meters.all():
                    covered_nozzle_ids.add(str(m.nozzle_id))

        historical_nozzles = []
        missing_nozzle_ids = []
        for n in prep_data.get('nozzles', []):
            nz_id = n['nozzle_id']
            if nz_id not in covered_nozzle_ids:
                missing_nozzle_ids.append(nz_id)
            reading_val = Decimal(n['derived_opening_reading']) if n['derived_opening_reading'] is not None else None
            price_val = Decimal(n['current_rate']) if n.get('current_rate') else Decimal('0.00')
            historical_nozzles.append({
                'id': nz_id,
                'code': n['nozzle_code'],
                'name': n['nozzle_name'],
                'dispenser_name': n['dispenser_name'],
                'product_id': n['product_id'],
                'product_name': n['product_name'],
                'current_selling_price': float(price_val),
                'opening_info': {
                    'reading': float(reading_val) if reading_val is not None else None,
                    'source': n['opening_source'],
                    'source_description': n['opening_source_description'],
                    'continuity_status': n['continuity_status'],
                    'requires_commissioning': n['requires_commissioning'],
                }
            })

        response_data = {
            'business_date': b_date.strftime('%Y-%m-%d'),
            'last_entered_business_date': last_business_date_str,
            'shift_definition_id': str(selected_shift_def.id),
            'shift_definitions': shift_defs_data,
            'historical_employees': prep_data.get('employees', []),
            'historical_nozzles': historical_nozzles,
            'parent_shift': parent_shift_data,
            'existing_cards': existing_cards_data,
            'missing_nozzle_ids': missing_nozzle_ids,
            'is_ready': True,
            **prep_data
        }
        return Response(response_data, status=status.HTTP_200_OK)


class ShiftCardListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id, outlet_id):
        membership = get_organisation_membership(request.user, org_id)
        try:
            outlet = Outlet.objects.get(organisation_id=org_id, id=outlet_id)
            if not can_access_outlet(membership, outlet):
                raise Http404()
        except Outlet.DoesNotExist:
            raise Http404()

        require_permission(request.user, org_id, 'shift.view', outlet=outlet)

        queryset = EmployeeShiftCard.objects.filter(
            organisation_id=org_id,
            outlet=outlet
        ).select_related(
            'employee', 'parent_shift', 'parent_shift__shift_definition',
            'parent_shift__locked_by', 'voided_by', 'created_by'
        ).prefetch_related(
            'meters', 'collections', 'credit_slips', 'deductions'
        ).order_by('-parent_shift__business_date', 'sequence', '-created_at')

        b_date = request.query_params.get('business_date')
        if b_date:
            queryset = queryset.filter(parent_shift__business_date=b_date)

        shift_def_id = request.query_params.get('shift_definition_id')
        if shift_def_id:
            queryset = queryset.filter(parent_shift__shift_definition_id=shift_def_id)

        emp_id = request.query_params.get('employee_id')
        if emp_id:
            queryset = queryset.filter(employee_id=emp_id)

        parent_shift_id = request.query_params.get('parent_shift_id')
        if parent_shift_id:
            queryset = queryset.filter(parent_shift_id=parent_shift_id)

        status_param = request.query_params.get('status', 'all')
        if status_param and status_param != 'all':
            queryset = queryset.filter(status=status_param)

        serializer = EmployeeShiftCardSerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request, org_id, outlet_id):
        membership = get_organisation_membership(request.user, org_id)
        try:
            outlet = Outlet.objects.get(organisation_id=org_id, id=outlet_id)
            if not can_access_outlet(membership, outlet):
                raise Http404()
        except Outlet.DoesNotExist:
            raise Http404()

        raw_data = request.data
        if 'payload' in raw_data and isinstance(raw_data['payload'], str):
            try:
                parsed_data = json.loads(raw_data['payload'])
            except Exception:
                return Response({'detail': "Invalid JSON payload string in multipart request."}, status=status.HTTP_400_BAD_REQUEST)
        else:
            parsed_data = raw_data.copy() if hasattr(raw_data, 'copy') else dict(raw_data)

        if 'mpd_slip_attachment' in request.FILES:
            parsed_data['mpd_slip_attachment'] = request.FILES['mpd_slip_attachment']

        card_id = parsed_data.get('card_id')
        if card_id:
            require_permission(request.user, org_id, 'shift.update_open', outlet=outlet)
        else:
            require_permission(request.user, org_id, 'shift.open', outlet=outlet)

        serializer = ShiftCardAtomicSaveSerializer(data=parsed_data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        v_data = serializer.validated_data

        try:
            shift_def = ShiftDefinition.objects.get(id=v_data['shift_definition_id'], outlet=outlet)
            emp = Employee.objects.get(id=v_data['employee_id'], organisation_id=org_id)
        except (ShiftDefinition.DoesNotExist, Employee.DoesNotExist):
            return Response({'detail': "Shift definition or employee not found."}, status=status.HTTP_404_NOT_FOUND)

        meters_input = (
            v_data.get('meters')
            or v_data.get('nozzle_meters')
            or parsed_data.get('nozzle_meters')
            or parsed_data.get('meters')
            or []
        )
        meters_data = []
        for m in meters_input:
            meters_data.append({
                'nozzle_id': m['nozzle_id'],
                'opening_reading': m['opening_reading'],
                'closing_reading': m.get('closing_reading'),
                'testing_quantity': m.get('testing_litres') or m.get('testing_quantity') or Decimal('0.000'),
                'returned_to_tank': m.get('returned_to_tank', True),
                'destination_tank_id': m.get('destination_tank_id'),
                'opening_source': m.get('opening_source') or None,
                'opening_source_reference': m.get('opening_source_reference') or None,
                'expected_opening_reading': m.get('expected_opening_reading'),
                'continuity_status': m.get('continuity_status') or None,
                'continuity_difference': m.get('continuity_difference'),
                'continuity_reason': m.get('continuity_reason'),
                'is_conflict_acknowledged': m.get('is_conflict_acknowledged', False),
                'price_segments': m.get('price_segments', [])
            })

        cash_amount = Decimal('0.00')
        denominations = []

        if 'cash' in parsed_data and isinstance(parsed_data['cash'], dict):
            cash_amount = Decimal(str(parsed_data['cash'].get('amount') or '0.00'))
            if 'denominations' in parsed_data['cash']:
                for d in parsed_data['cash']['denominations']:
                    denominations.append({
                        'denomination_value': d['denomination_value'],
                        'quantity': d.get('quantity', d.get('count', 0))
                    })
        elif 'cash_amount' in parsed_data and parsed_data['cash_amount'] is not None:
            cash_amount = Decimal(str(parsed_data.get('cash_amount') or '0.00'))
        elif 'cash_amount' in v_data and v_data['cash_amount'] is not None:
            cash_amount = Decimal(str(v_data.get('cash_amount') or '0.00'))

        for d in v_data.get('denominations', []):
            denominations.append({
                'denomination_value': d['denomination_value'],
                'quantity': d.get('count', d.get('quantity', 0))
            })

        cards_data = list(parsed_data.get('cards') or v_data.get('cards') or [])
        upi_data = list(parsed_data.get('upi') or v_data.get('upi') or [])
        fleet_data = list(parsed_data.get('fleet') or v_data.get('fleet') or [])

        for c in v_data.get('collections', []):
            m_type = c['collection_method']
            c_amt = c['amount']
            if m_type == 'cash':
                cash_amount += c_amt
            elif m_type == 'pos_card':
                cards_data.append({
                    'amount': c_amt,
                    'reference_number': c.get('reference_number'),
                    'provider_name': c.get('card_network'),
                    'terminal_or_account_reference': c.get('batch_number'),
                    'occurred_at': c.get('occurred_at'),
                    'notes': c.get('notes')
                })
            elif m_type == 'upi':
                upi_data.append({
                    'amount': c_amt,
                    'reference_number': c.get('reference_number'),
                    'provider_name': 'UPI',
                    'occurred_at': c.get('occurred_at'),
                    'notes': c.get('notes')
                })
            elif m_type == 'fleet_card':
                fleet_data.append({
                    'amount': c_amt,
                    'reference_number': c.get('reference_number'),
                    'provider_name': 'Fleet',
                    'occurred_at': c.get('occurred_at'),
                    'notes': c.get('notes')
                })

        cash_dict = {
            'amount': cash_amount,
            'denominations': denominations
        } if (cash_amount > Decimal('0.00') or denominations) else None

        credit_slips_data = list(parsed_data.get('credit_slips') or v_data.get('credit_slips', []))
        deductions_data = list(parsed_data.get('deductions') or v_data.get('deductions', []))

        is_shortage_ack = (
            v_data.get('is_shortage_excess_acknowledged')
            or v_data.get('shortage_acknowledged')
            or parsed_data.get('is_shortage_excess_acknowledged')
            or parsed_data.get('shortage_acknowledged')
            or False
        )
        shortage_note = (
            v_data.get('shortage_excess_acknowledgement_note')
            or v_data.get('shortage_notes')
            or parsed_data.get('shortage_excess_acknowledgement_note')
            or parsed_data.get('shortage_notes')
            or None
        )
        notes_val = (
            v_data.get('notes')
            or v_data.get('operator_notes')
            or parsed_data.get('notes')
            or parsed_data.get('operator_notes')
            or None
        )

        try:
            card = atomic_save_shift_card(
                organisation=membership.organisation,
                outlet=outlet,
                user=request.user,
                shift_definition=shift_def,
                business_date=v_data['business_date'],
                employee=emp,
                nozzle_meters_data=meters_data,
                cash_data=cash_dict,
                cards_data=cards_data,
                upi_data=upi_data,
                fleet_data=fleet_data,
                credit_slips_data=credit_slips_data,
                deductions_data=deductions_data,
                card_id=card_id,
                mpd_slip_number=v_data.get('mpd_slip_number'),
                mpd_slip_attachment=v_data.get('mpd_slip_attachment'),
                notes=notes_val,
                is_shortage_excess_acknowledged=is_shortage_ack,
                shortage_excess_acknowledgement_note=shortage_note
            )
            return Response(EmployeeShiftCardSerializer(card).data, status=status.HTTP_201_CREATED if not card_id else status.HTTP_200_OK)
        except DjangoValidationError as e:
            return handle_django_validation_error(e)


class ShiftCardDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id, outlet_id, card_id):
        require_permission(request.user, org_id, 'shift.view')
        card = _get_shift_card(card_id, outlet_id, org_id)
        return Response(EmployeeShiftCardSerializer(card).data, status=status.HTTP_200_OK)

    def put(self, request, org_id, outlet_id, card_id):
        return ShiftCardListCreateView.as_view()(request._request, org_id=org_id, outlet_id=outlet_id)

    def patch(self, request, org_id, outlet_id, card_id):
        return ShiftCardListCreateView.as_view()(request._request, org_id=org_id, outlet_id=outlet_id)


class ShiftCardVoidView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, org_id, outlet_id, card_id):
        require_permission(request.user, org_id, 'shift.void')
        card = _get_shift_card(card_id, outlet_id, org_id)

        serializer = ShiftCardVoidSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        try:
            voided_card = void_shift_card(
                card=card,
                user=request.user,
                reason=serializer.validated_data['reason']
            )
            return Response(EmployeeShiftCardSerializer(voided_card).data, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            return handle_django_validation_error(e)


class ShiftLockView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, org_id, outlet_id, shift_id):
        shift = _get_operational_shift(shift_id, outlet_id, org_id)
        require_permission(request.user, org_id, 'shift.lock', outlet=shift.outlet)

        serializer = ShiftLockActionSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        try:
            cash_account = None
            cash_account_id = serializer.validated_data.get('cash_account_id')
            if cash_account_id:
                from apps.finance.models import PaymentAccount
                cash_account = PaymentAccount.objects.filter(
                    id=cash_account_id, organisation_id=org_id,
                ).first()
                if not cash_account:
                    return Response({'cash_account_id': ['Cash account was not found.']}, status=status.HTTP_400_BAD_REQUEST)
            locked = lock_shift(
                shift=shift,
                user=request.user,
                reason=serializer.validated_data.get('reason', ''),
                lock_source=serializer.validated_data.get('lock_source', 'manual'),
                cash_account=cash_account,
            )
            return Response({
                'detail': "Shift locked successfully.",
                'is_locked': True,
                'locked_at': locked.locked_at.isoformat() if locked.locked_at else None
            }, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            return handle_django_validation_error(e)


class ShiftUnlockView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, org_id, outlet_id, shift_id):
        shift = _get_operational_shift(shift_id, outlet_id, org_id)
        require_permission(request.user, org_id, 'shift.unlock', outlet=shift.outlet)

        serializer = ShiftUnlockActionSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        try:
            unlocked = unlock_shift(
                shift=shift,
                user=request.user,
                reason=serializer.validated_data['reason']
            )
            return Response({
                'detail': "Shift unlocked successfully.",
                'is_locked': False
            }, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            return handle_django_validation_error(e)


class ShiftDeductionApproveView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, org_id, outlet_id, deduction_id):
        require_permission(request.user, org_id, 'shift_deduction.approve')
        try:
            deduction = EmployeeShiftDeduction.objects.get(
                id=deduction_id,
                organisation_id=org_id,
                outlet_id=outlet_id
            )
        except EmployeeShiftDeduction.DoesNotExist:
            raise Http404()

        try:
            deduction = approve_shift_deduction(
                deduction=deduction,
                user=request.user
            )
            return Response(EmployeeShiftDeductionSerializer(deduction).data, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            return handle_django_validation_error(e)


class ShiftDeductionRejectView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, org_id, outlet_id, deduction_id):
        require_permission(request.user, org_id, 'shift_deduction.approve')
        try:
            deduction = EmployeeShiftDeduction.objects.get(
                id=deduction_id,
                organisation_id=org_id,
                outlet_id=outlet_id
            )
        except EmployeeShiftDeduction.DoesNotExist:
            raise Http404()

        serializer = ShiftDeductionRejectActionSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        try:
            deduction = reject_shift_deduction(
                deduction=deduction,
                user=request.user,
                reason=serializer.validated_data['reason']
            )
            return Response(EmployeeShiftDeductionSerializer(deduction).data, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            return handle_django_validation_error(e)


class ShiftCardAttachmentDownloadView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id, outlet_id, card_id):
        require_permission(request.user, org_id, 'shift.view')
        card = _get_shift_card(card_id, outlet_id, org_id)
        if not card.mpd_slip_attachment:
            raise Http404("No attachment found for this Shift Card.")

        file_handle = card.mpd_slip_attachment.open('rb')
        filename = os.path.basename(card.mpd_slip_attachment.name)
        ext = os.path.splitext(filename)[1].lower()
        content_type = 'application/pdf' if ext == '.pdf' else ('image/png' if ext == '.png' else 'image/jpeg')

        response = FileResponse(file_handle, content_type=content_type)
        response['Content-Disposition'] = f'inline; filename="{filename}"'
        return response


class ParentShiftSummaryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id, outlet_id, shift_id):
        shift = _get_operational_shift(shift_id, outlet_id, org_id)
        require_permission(request.user, org_id, 'shift.view', outlet=shift.outlet)

        summary = get_parent_shift_summary(shift)
        return Response(summary, status=status.HTTP_200_OK)

