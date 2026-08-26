# apps/operations/views.py
from datetime import datetime
from decimal import Decimal
from django.http import Http404
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction, models
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser

from apps.organizations.views import get_organisation_membership
from apps.organizations.permissions import HasGranularPermission, require_permission, can_access_outlet
from apps.organizations.models import Outlet
from apps.forecourt.views import handle_django_validation_error
from apps.forecourt.models import Tank, Nozzle

from .models import DipCalibrationChart, TankCalibrationAssignment, OpeningBalanceBatch, NozzleOpeningBalance, TankOpeningBalance
from .serializers import (
    DipCalibrationChartSerializer, TankCalibrationAssignmentSerializer,
    OpeningBalanceBatchSerializer, NozzleOpeningBalanceSerializer, TankOpeningBalanceSerializer
)
from .services import (
    detect_excel_or_csv_columns, import_calibration_chart, activate_calibration_chart,
    assign_calibration_chart_to_tank, convert_dip_to_volume,
    create_opening_balance_batch, set_nozzle_opening_balance, set_tank_opening_balance,
    preview_opening_balance_confirmation, confirm_opening_balance_batch
)
from .selectors import check_outlet_operational_readiness

class CalibrationUploadPreviewView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]
    required_permission = 'dip_calibration.import'
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, org_id):
        # Simply read columns and preview data
        get_organisation_membership(request.user, org_id)
        
        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response({'detail': "No file uploaded."}, status=status.HTTP_400_BAD_REQUEST)
            
        # Restrict file extension
        filename = file_obj.name.lower()
        if not (filename.endswith('.csv') or filename.endswith('.xlsx')):
            return Response({'detail': "Invalid file format. Only .xlsx and .csv files are accepted."}, status=status.HTTP_400_BAD_REQUEST)

        # Restrict upload size (e.g. 5MB)
        if file_obj.size > 5 * 1024 * 1024:
            return Response({'detail': "File size exceeds 5MB limit."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            preview_data = detect_excel_or_csv_columns(file_obj, file_obj.name)
            return Response(preview_data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'detail': f"Failed to parse spreadsheet: {str(e)}"}, status=status.HTTP_400_BAD_REQUEST)


class CalibrationImportView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]
    required_permission = 'dip_calibration.import'
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, org_id):
        membership = get_organisation_membership(request.user, org_id)

        file_obj = request.FILES.get('file')
        name = request.data.get('name')
        nominal_capacity = request.data.get('nominal_capacity')
        lookup_mode = request.data.get('lookup_mode', DipCalibrationChart.LOOKUP_INTERPOLATE)
        original_height_unit = request.data.get('original_height_unit', DipCalibrationChart.UNIT_MM)
        
        dip_col_idx = request.data.get('dip_column_idx')
        vol_col_idx = request.data.get('volume_column_idx')

        if not file_obj or not name or not nominal_capacity or dip_col_idx is None or vol_col_idx is None:
            return Response({'detail': "Missing required parameters."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            nominal_capacity_dec = Decimal(str(nominal_capacity))
            dip_col_idx = int(dip_col_idx)
            vol_col_idx = int(vol_col_idx)
        except (ValueError, TypeError, ArithmeticError):
            return Response({'detail': "Invalid nominal capacity or column indices."}, status=status.HTTP_400_BAD_REQUEST)

        # Parse additional metadata fields
        kwargs = {}
        if 'tank_diameter' in request.data and request.data['tank_diameter']:
            kwargs['tank_diameter'] = Decimal(str(request.data['tank_diameter']))
        if 'tank_length' in request.data and request.data['tank_length']:
            kwargs['tank_length'] = Decimal(str(request.data['tank_length']))
        if 'manufacturer' in request.data:
            kwargs['manufacturer'] = request.data['manufacturer']

        try:
            with transaction.atomic():
                chart = import_calibration_chart(
                    organisation=membership.organisation,
                    name=name,
                    nominal_capacity=nominal_capacity_dec,
                    lookup_mode=lookup_mode,
                    original_height_unit=original_height_unit,
                    file_obj=file_obj,
                    dip_col_idx=dip_col_idx,
                    vol_col_idx=vol_col_idx,
                    user=request.user,
                    **kwargs
                )
            return Response(DipCalibrationChartSerializer(chart).data, status=status.HTTP_201_CREATED)
        except DjangoValidationError as e:
            return handle_django_validation_error(e)
        except Exception as e:
            return Response({'detail': f"Import failed: {str(e)}"}, status=status.HTTP_400_BAD_REQUEST)


class CalibrationChartListView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]
    required_permission = 'dip_calibration.view'

    def get(self, request, org_id):
        membership = get_organisation_membership(request.user, org_id)
        queryset = DipCalibrationChart.objects.filter(organisation=membership.organisation)
        
        status_filter = request.query_params.get('status', '').strip().lower()
        if status_filter in ['draft', 'active', 'archived']:
            queryset = queryset.filter(status=status_filter)

        serializer = DipCalibrationChartSerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class CalibrationChartDetailView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]
    required_permission = 'dip_calibration.view'

    def get_object(self, org_id, chart_id):
        try:
            return DipCalibrationChart.objects.get(organisation_id=org_id, id=chart_id)
        except DipCalibrationChart.DoesNotExist:
            raise Http404()

    def get(self, request, org_id, chart_id):
        chart = self.get_object(org_id, chart_id)
        serializer = DipCalibrationChartSerializer(chart)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request, org_id, chart_id):
        # Activation endpoint
        chart = self.get_object(org_id, chart_id)
        action = request.data.get('action')
        
        if action == 'activate':
            require_permission(request.user, org_id, 'dip_calibration.activate')
            try:
                activated = activate_calibration_chart(chart)
                return Response(DipCalibrationChartSerializer(activated).data, status=status.HTTP_200_OK)
            except DjangoValidationError as e:
                return handle_django_validation_error(e)
        else:
            return Response({'detail': "Invalid action. Supported actions: 'activate'."}, status=status.HTTP_400_BAD_REQUEST)


class TankCalibrationAssignmentView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]
    required_permission = 'dip_calibration.assign'

    def get_outlet(self, org_id, outlet_id, membership):
        try:
            outlet = Outlet.objects.get(organisation_id=org_id, id=outlet_id)
            if not can_access_outlet(membership, outlet):
                raise Http404()
            return outlet
        except Outlet.DoesNotExist:
            raise Http404()

    def post(self, request, org_id, outlet_id):
        membership = get_organisation_membership(request.user, org_id)
        outlet = self.get_outlet(org_id, outlet_id, membership)

        serializer = TankCalibrationAssignmentSerializer(data=request.data)
        if serializer.is_valid():
            tank_id = serializer.validated_data.get('tank_id')
            chart_id = serializer.validated_data.get('chart_id')
            effective_from = serializer.validated_data.get('effective_from')

            try:
                tank = Tank.objects.get(id=tank_id, outlet=outlet)
                chart = DipCalibrationChart.objects.get(id=chart_id, organisation=membership.organisation)
            except (Tank.DoesNotExist, DipCalibrationChart.DoesNotExist):
                return Response({'detail': "Tank or Calibration Chart not found."}, status=status.HTTP_404_NOT_FOUND)

            try:
                with transaction.atomic():
                    assignment = assign_calibration_chart_to_tank(
                        organisation=membership.organisation,
                        outlet=outlet,
                        tank=tank,
                        chart=chart,
                        effective_from=effective_from,
                        user=request.user
                    )
                return Response(TankCalibrationAssignmentSerializer(assignment).data, status=status.HTTP_201_CREATED)
            except DjangoValidationError as e:
                return handle_django_validation_error(e)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class TankCalibrationHistoryView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]
    required_permission = 'dip_calibration.view'

    def get(self, request, org_id, outlet_id, tank_id):
        get_organisation_membership(request.user, org_id)
        # Fetch history
        assignments = TankCalibrationAssignment.objects.filter(
            organisation_id=org_id,
            outlet_id=outlet_id,
            tank_id=tank_id
        ).select_related('chart', 'assigned_by')
        serializer = TankCalibrationAssignmentSerializer(assignments, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class DipConversionPreviewView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]
    required_permission = 'dip_calibration.view'

    def get(self, request, org_id, outlet_id):
        get_organisation_membership(request.user, org_id)
        
        tank_id = request.query_params.get('tank_id')
        height_str = request.query_params.get('height')
        unit = request.query_params.get('unit', DipCalibrationChart.UNIT_MM)
        date_str = request.query_params.get('measured_at')

        if not tank_id or not height_str:
            return Response({'detail': "tank_id and height parameters are required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            tank = Tank.objects.get(id=tank_id, outlet_id=outlet_id)
        except Tank.DoesNotExist:
            raise Http404()

        try:
            height = Decimal(str(height_str))
        except (ValueError, TypeError, ArithmeticError):
            return Response({'detail': "Invalid height value."}, status=status.HTTP_400_BAD_REQUEST)

        measured_at = timezone.now()
        if date_str:
            try:
                measured_at = datetime.fromisoformat(date_str)
            except ValueError:
                return Response({'detail': "Invalid date format. Use ISO 8601 string."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            result = convert_dip_to_volume(tank, height, unit, measured_at)
            
            # Form response
            return Response({
                'volume_litres': result['volume'],
                'chart_id': result['chart'].id,
                'chart_name': result['chart'].name,
                'assignment_id': result['assignment'].id,
                'method': result['method'],
                'surrounding_points': result['surrounding_points']
            }, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            return handle_django_validation_error(e)


class OpeningBalanceBatchView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]
    required_permission = 'opening_balance.view'

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

        # Get latest batch (prefer confirmed, otherwise preparing)
        batch = OpeningBalanceBatch.objects.filter(outlet=outlet).order_by('-status', '-created_at').first()
        if not batch:
            return Response({'exists': False}, status=status.HTTP_200_OK)

        serializer = OpeningBalanceBatchSerializer(batch)
        return Response({
            'exists': True,
            'batch': serializer.data
        }, status=status.HTTP_200_OK)

    def post(self, request, org_id, outlet_id):
        membership = get_organisation_membership(request.user, org_id)
        outlet = self.get_outlet(org_id, outlet_id, membership)
        require_permission(request.user, org_id, 'opening_balance.configure')

        effective_at_str = request.data.get('effective_at')
        notes = request.data.get('notes', '')

        if not effective_at_str:
            return Response({'detail': "effective_at is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            effective_at = datetime.fromisoformat(effective_at_str)
        except ValueError:
            return Response({'detail': "Invalid datetime format. Use ISO 8601 string."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            batch = create_opening_balance_batch(
                organisation=membership.organisation,
                outlet=outlet,
                effective_at=effective_at,
                user=request.user,
                notes=notes
            )
            return Response(OpeningBalanceBatchSerializer(batch).data, status=status.HTTP_201_CREATED)
        except DjangoValidationError as e:
            return handle_django_validation_error(e)


class OpeningBalanceEntryView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]
    required_permission = 'opening_balance.configure'

    def post(self, request, org_id, outlet_id):
        membership = get_organisation_membership(request.user, org_id)
        batch_id = request.data.get('batch_id')
        
        try:
            batch = OpeningBalanceBatch.objects.get(id=batch_id, outlet_id=outlet_id, organisation=membership.organisation)
        except OpeningBalanceBatch.DoesNotExist:
            raise Http404()

        if batch.status == OpeningBalanceBatch.STATUS_CONFIRMED:
            return Response({'detail': "Cannot modify balances of a confirmed batch."}, status=status.HTTP_400_BAD_REQUEST)

        nozzle_entries = request.data.get('nozzles', [])
        tank_entries = request.data.get('tanks', [])

        try:
            with transaction.atomic():
                # Save nozzles readings
                for n_entry in nozzle_entries:
                    nozzle_id = n_entry.get('nozzle_id')
                    reading = Decimal(str(n_entry.get('totalizer_reading')))
                    notes = n_entry.get('notes', '')

                    try:
                        nozzle = Nozzle.objects.get(id=nozzle_id, outlet=batch.outlet)
                    except Nozzle.DoesNotExist:
                        raise DjangoValidationError(f"Nozzle {nozzle_id} not found at this outlet.")

                    set_nozzle_opening_balance(batch, nozzle, reading, notes)

                # Save tanks readings
                for t_entry in tank_entries:
                    tank_id = t_entry.get('tank_id')
                    book_qty = Decimal(str(t_entry.get('book_quantity')))
                    phys_qty = Decimal(str(t_entry.get('physical_quantity')))
                    
                    raw_dip = t_entry.get('raw_dip_value')
                    raw_dip_val = Decimal(str(raw_dip)) if raw_dip is not None else None
                    raw_dip_unit = t_entry.get('raw_dip_unit')
                    
                    density = t_entry.get('density')
                    density_val = Decimal(str(density)) if density is not None else None
                    
                    conv_method = t_entry.get('conversion_method', TankOpeningBalance.METHOD_MANUAL)
                    manual_reason = t_entry.get('manual_quantity_reason', '')
                    notes = t_entry.get('notes', '')

                    try:
                        tank = Tank.objects.get(id=tank_id, outlet=batch.outlet)
                    except Tank.DoesNotExist:
                        raise DjangoValidationError(f"Tank {tank_id} not found at this outlet.")

                    # Try to fetch current calibration assignment if not manual
                    calibration_assignment = None
                    if conv_method != TankOpeningBalance.METHOD_MANUAL:
                        # Find assignment effective at batch.effective_at
                        calibration_assignment = TankCalibrationAssignment.objects.filter(
                            tank=tank,
                            effective_from__lte=batch.effective_at
                        ).filter(
                            models.Q(effective_to__isnull=True) | models.Q(effective_to__gt=batch.effective_at)
                        ).first()

                    set_tank_opening_balance(
                        batch=batch,
                        tank=tank,
                        book_quantity=book_qty,
                        physical_quantity=phys_qty,
                        raw_dip_value=raw_dip_val,
                        raw_dip_unit=raw_dip_unit,
                        calibration_assignment=calibration_assignment,
                        density=density_val,
                        conversion_method=conv_method,
                        manual_quantity_reason=manual_reason,
                        notes=notes
                    )

            batch.refresh_from_db()
            return Response(OpeningBalanceBatchSerializer(batch).data, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            return handle_django_validation_error(e)


class OpeningBalancePreviewView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]
    required_permission = 'opening_balance.view'

    def get(self, request, org_id, outlet_id, batch_id):
        try:
            batch = OpeningBalanceBatch.objects.get(id=batch_id, outlet_id=outlet_id)
        except OpeningBalanceBatch.DoesNotExist:
            raise Http404()

        preview = preview_opening_balance_confirmation(batch)
        return Response(preview, status=status.HTTP_200_OK)


class OpeningBalanceConfirmView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]
    required_permission = 'opening_balance.confirm'

    def post(self, request, org_id, outlet_id, batch_id):
        try:
            batch = OpeningBalanceBatch.objects.get(id=batch_id, outlet_id=outlet_id)
        except OpeningBalanceBatch.DoesNotExist:
            raise Http404()

        try:
            confirmed = confirm_opening_balance_batch(batch, request.user)
            return Response(OpeningBalanceBatchSerializer(confirmed).data, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            return handle_django_validation_error(e)


class OutletOperationalReadinessView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]
    # Accessible to anyone who has outlet view permission
    required_permission = 'outlet.view'

    def get(self, request, org_id, outlet_id):
        membership = get_organisation_membership(request.user, org_id)
        try:
            outlet = Outlet.objects.get(organisation_id=org_id, id=outlet_id)
            if not can_access_outlet(membership, outlet):
                raise Http404()
        except Outlet.DoesNotExist:
            raise Http404()

        readiness = check_outlet_operational_readiness(outlet)
        return Response(readiness, status=status.HTTP_200_OK)
