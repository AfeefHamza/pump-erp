# apps/shifts/serializers.py
from rest_framework import serializers
from apps.employees.serializers import EmployeeSerializer, EmployeeDesignationSerializer
from apps.forecourt.serializers import NozzleSerializer
from .models import ShiftDefinition, ShiftRoster, ShiftStaffAssignment, ShiftNozzleAssignment

class ShiftDefinitionSerializer(serializers.ModelSerializer):
    duration_display = serializers.SerializerMethodField()

    class Meta:
        model = ShiftDefinition
        fields = [
            'id', 'organisation', 'outlet', 'code', 'name', 'starts_at', 'ends_at',
            'crosses_midnight', 'display_order', 'is_active', 'notes',
            'duration_display', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'organisation', 'outlet', 'crosses_midnight', 'created_at', 'updated_at']

    def get_duration_display(self, obj) -> str:
        if not obj.starts_at or not obj.ends_at:
            return ""
        # Calculate duration in hours and minutes
        from datetime import datetime, date, timedelta
        d1 = datetime.combine(date.today(), obj.starts_at)
        d2 = datetime.combine(date.today(), obj.ends_at)
        if obj.ends_at < obj.starts_at:
            d2 += timedelta(days=1)
        diff = d2 - d1
        hours, remainder = divmod(diff.seconds, 3600)
        minutes = remainder // 60
        if minutes == 0:
            return f"{hours}h"
        return f"{hours}h {minutes}m"


class ShiftNozzleAssignmentSerializer(serializers.ModelSerializer):
    nozzle_details = NozzleSerializer(source='nozzle', read_only=True)
    nozzle_id = serializers.UUIDField()

    class Meta:
        model = ShiftNozzleAssignment
        fields = ['id', 'nozzle_id', 'nozzle_details', 'created_at']
        read_only_fields = ['id', 'created_at']


class ShiftStaffAssignmentSerializer(serializers.ModelSerializer):
    employee_details = EmployeeSerializer(source='employee', read_only=True)
    employee_id = serializers.UUIDField()
    duty_designation_details = EmployeeDesignationSerializer(source='duty_designation', read_only=True)
    duty_designation_id = serializers.UUIDField()
    nozzle_assignments = ShiftNozzleAssignmentSerializer(many=True, read_only=True)

    class Meta:
        model = ShiftStaffAssignment
        fields = [
            'id', 'roster', 'employee_id', 'employee_details',
            'duty_designation_id', 'duty_designation_details',
            'nozzle_assignments', 'notes', 'created_at'
        ]
        read_only_fields = ['id', 'roster', 'created_at']


class ShiftRosterSerializer(serializers.ModelSerializer):
    shift_definition_details = ShiftDefinitionSerializer(source='shift_definition', read_only=True)
    shift_definition_id = serializers.UUIDField()
    staff_assignments = ShiftStaffAssignmentSerializer(many=True, read_only=True)

    class Meta:
        model = ShiftRoster
        fields = [
            'id', 'organisation', 'outlet', 'shift_definition_id',
            'shift_definition_details', 'business_date', 'is_locked',
            'notes', 'staff_assignments', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'organisation', 'outlet', 'is_locked', 'created_at', 'updated_at']


from .models import (
    OperationalShift, OperationalShiftStaff, OperationalShiftNozzleAssignment,
    ShiftNozzleMeter, ShiftNozzlePriceSegment, ShiftMeterEvent,
    ShiftTestingRecord, ShiftTankDipObservation, ShiftActivityLog
)


class OperationalShiftStaffSerializer(serializers.ModelSerializer):
    assigned_nozzles = serializers.SerializerMethodField()
    added_by_name = serializers.SerializerMethodField()
    is_active = serializers.SerializerMethodField()

    class Meta:
        model = OperationalShiftStaff
        fields = [
            'id', 'shift', 'source_employee', 'duty_designation',
            'employee_code_snapshot', 'employee_name_snapshot', 'designation_snapshot',
            'effective_from', 'effective_to', 'is_active',
            'added_by', 'added_by_name', 'assigned_nozzles', 'notes', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']

    def get_assigned_nozzles(self, obj) -> list[str]:
        return list(obj.nozzle_assignments.filter(effective_to__isnull=True).values_list('nozzle__code', flat=True))

    def get_added_by_name(self, obj) -> str | None:
        if obj.added_by:
            return obj.added_by.get_full_name() or obj.added_by.email
        return None

    def get_is_active(self, obj) -> bool:
        return obj.effective_to is None


class OperationalShiftNozzleAssignmentSerializer(serializers.ModelSerializer):
    nozzle_code = serializers.CharField(source='nozzle.code', read_only=True)
    employee_name = serializers.CharField(source='shift_staff.employee_name_snapshot', read_only=True)
    employee_code = serializers.CharField(source='shift_staff.employee_code_snapshot', read_only=True)
    is_active = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = OperationalShiftNozzleAssignment
        fields = [
            'id', 'shift', 'shift_staff', 'nozzle', 'nozzle_code',
            'employee_name', 'employee_code',
            'dispenser_name_snapshot', 'nozzle_name_snapshot',
            'product', 'product_name_snapshot',
            'effective_from', 'effective_to', 'is_active',
            'opening_reading', 'closing_reading', 'assignment_type',
            'reason', 'created_by', 'created_by_name', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']

    def get_is_active(self, obj) -> bool:
        return obj.effective_to is None

    def get_created_by_name(self, obj) -> str | None:
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.email
        return None


class ShiftStaffAddInputSerializer(serializers.Serializer):
    employee_id = serializers.UUIDField(required=True)
    duty_designation_id = serializers.UUIDField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, default='')
    assigned_nozzle_ids = serializers.ListField(child=serializers.UUIDField(), required=False, default=list)

    def validate(self, attrs):
        if 'is_primary_cashier' in self.initial_data:
            raise serializers.ValidationError({"is_primary_cashier": "The field 'is_primary_cashier' has been retired and is not accepted."})
        return attrs


class ShiftNozzleHandoverInputSerializer(serializers.Serializer):
    nozzle_id = serializers.UUIDField(required=True)
    new_employee_id = serializers.UUIDField(required=True)
    handover_reading = serializers.DecimalField(max_digits=15, decimal_places=3, required=True)
    handover_time = serializers.DateTimeField(required=False, allow_null=True)
    reason = serializers.CharField(required=True, min_length=3)


class ShiftNozzleCorrectInputSerializer(serializers.Serializer):
    nozzle_id = serializers.UUIDField(required=True)
    new_employee_id = serializers.UUIDField(required=True)
    reason = serializers.CharField(required=True, min_length=3)


class ShiftNozzleActivateInputSerializer(serializers.Serializer):
    nozzle_id = serializers.UUIDField(required=True)
    employee_id = serializers.UUIDField(required=True)
    starting_reading = serializers.DecimalField(max_digits=15, decimal_places=3, required=True)
    reason = serializers.CharField(required=True, min_length=3)



class ShiftNozzlePriceSegmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShiftNozzlePriceSegment
        fields = [
            'id', 'sequence', 'starts_at', 'ends_at',
            'opening_reading', 'closing_reading', 'unit_price',
            'gross_quantity', 'testing_quantity', 'sale_quantity',
            'sale_amount', 'price_history_reference', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']


class ShiftMeterEventSerializer(serializers.ModelSerializer):
    recorded_by_name = serializers.SerializerMethodField()

    class Meta:
        model = ShiftMeterEvent
        fields = [
            'id', 'shift_nozzle_meter', 'event_type',
            'reading_before', 'reading_after', 'occurred_at',
            'reason', 'recorded_by', 'recorded_by_name', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']

    def get_recorded_by_name(self, obj) -> str | None:
        if obj.recorded_by:
            return obj.recorded_by.display_name or obj.recorded_by.email
        return None


class ShiftNozzleMeterSerializer(serializers.ModelSerializer):
    nozzle_code = serializers.CharField(source='nozzle.code', read_only=True)
    nozzle_name = serializers.CharField(source='nozzle.name', read_only=True)
    dispenser_name = serializers.CharField(source='nozzle.dispenser.name', read_only=True)
    product_id = serializers.UUIDField(source='nozzle.tank.product.id', read_only=True)
    product_name = serializers.CharField(source='nozzle.tank.product.name', read_only=True)
    product_code = serializers.CharField(source='nozzle.tank.product.code', read_only=True)
    employee_name = serializers.CharField(source='staff_assignment.employee_name_snapshot', read_only=True)
    employee_id = serializers.UUIDField(source='staff_assignment.source_employee_id', read_only=True)
    price_segments = ShiftNozzlePriceSegmentSerializer(many=True, read_only=True)
    meter_events = ShiftMeterEventSerializer(many=True, read_only=True)
    sale_amount = serializers.SerializerMethodField()

    class Meta:
        model = ShiftNozzleMeter
        fields = [
            'id', 'shift', 'nozzle', 'nozzle_code', 'nozzle_name',
            'dispenser_name', 'product_id', 'product_name', 'product_code',
            'staff_assignment', 'employee_id', 'employee_name',
            'opening_reading', 'closing_reading', 'opening_source',
            'opening_source_reference', 'manual_exception_type', 'manual_exception_reason',
            'gross_quantity', 'testing_quantity', 'sale_quantity',
            'stock_depletion_quantity', 'sale_amount', 'price_segments',
            'meter_events', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_sale_amount(self, obj) -> str:
        from decimal import Decimal
        total = sum((s.sale_amount for s in obj.price_segments.all()), Decimal('0.00'))
        return str(total)


class ShiftTestingRecordSerializer(serializers.ModelSerializer):
    nozzle_code = serializers.CharField(source='shift_nozzle_meter.nozzle.code', read_only=True)
    nozzle_name = serializers.CharField(source='shift_nozzle_meter.nozzle.name', read_only=True)
    destination_tank_name = serializers.CharField(source='destination_tank.name', read_only=True)
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = ShiftTestingRecord
        fields = [
            'id', 'organisation', 'outlet', 'shift',
            'shift_nozzle_meter', 'nozzle_code', 'nozzle_name',
            'price_segment', 'quantity', 'returned_to_tank',
            'destination_tank', 'destination_tank_name',
            'occurred_at', 'notes', 'created_by_name',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_created_by_name(self, obj) -> str | None:
        if obj.created_by:
            return obj.created_by.display_name or obj.created_by.email
        return None


class ShiftTankDipObservationSerializer(serializers.ModelSerializer):
    tank_code = serializers.CharField(source='tank.code', read_only=True)
    tank_name = serializers.CharField(source='tank.name', read_only=True)
    product_name = serializers.CharField(source='tank.product.name', read_only=True)
    tank_capacity = serializers.DecimalField(source='tank.capacity', max_digits=12, decimal_places=4, read_only=True)
    calibration_chart_name = serializers.CharField(source='calibration_chart.name', read_only=True)
    recorded_by_name = serializers.SerializerMethodField()

    class Meta:
        model = ShiftTankDipObservation
        fields = [
            'id', 'organisation', 'outlet', 'shift',
            'tank', 'tank_code', 'tank_name', 'product_name', 'tank_capacity',
            'observation_type', 'measured_at', 'raw_dip_value',
            'raw_dip_unit', 'converted_quantity', 'calibration_assignment',
            'calibration_chart', 'calibration_chart_name',
            'conversion_method', 'density', 'manual_quantity_reason',
            'notes', 'recorded_by_name', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_recorded_by_name(self, obj) -> str | None:
        if obj.recorded_by:
            return obj.recorded_by.display_name or obj.recorded_by.email
        return None


class ShiftActivityLogSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = ShiftActivityLog
        fields = [
            'id', 'organisation', 'outlet', 'shift',
            'event_type', 'actor', 'actor_name', 'occurred_at',
            'reason', 'metadata'
        ]
        read_only_fields = ['id', 'occurred_at']

    def get_actor_name(self, obj) -> str | None:
        if obj.actor:
            return obj.actor.display_name or obj.actor.email
        return "System"


class OperationalShiftListSerializer(serializers.ModelSerializer):
    shift_definition_name = serializers.CharField(source='shift_definition.name', read_only=True)
    opened_by_name = serializers.SerializerMethodField()
    closed_by_name = serializers.SerializerMethodField()
    staff_count = serializers.SerializerMethodField()
    totals = serializers.SerializerMethodField()

    class Meta:
        model = OperationalShift
        fields = [
            'id', 'organisation', 'outlet', 'shift_definition',
            'shift_definition_name', 'business_date',
            'scheduled_starts_at', 'scheduled_ends_at',
            'opened_at', 'closed_at', 'status',
            'opened_by_name', 'closed_by_name',
            'staff_count', 'totals', 'version',
            'created_at', 'updated_at'
        ]

    def get_opened_by_name(self, obj) -> str | None:
        if obj.opened_by:
            return obj.opened_by.display_name or obj.opened_by.email
        return None

    def get_closed_by_name(self, obj) -> str | None:
        if obj.closed_by:
            return obj.closed_by.display_name or obj.closed_by.email
        return None

    def get_staff_count(self, obj) -> int:
        return obj.staff_members.count()

    def get_totals(self, obj) -> dict:
        from decimal import Decimal
        meters = obj.meters.all()
        total_sale_qty = sum((m.sale_quantity for m in meters), Decimal('0.000'))
        total_gross = sum((m.gross_quantity for m in meters), Decimal('0.000'))
        total_testing = sum((m.testing_quantity for m in meters), Decimal('0.000'))
        
        # Calculate sale amount from segments
        total_amount = Decimal('0.00')
        for m in meters:
            for seg in m.price_segments.all():
                total_amount += seg.sale_amount

        return {
            'total_gross_quantity': str(total_gross),
            'total_testing_quantity': str(total_testing),
            'total_sale_quantity': str(total_sale_qty),
            'total_fuel_sale_amount': str(total_amount)
        }


class OperationalShiftDetailSerializer(serializers.ModelSerializer):
    shift_definition_name = serializers.CharField(source='shift_definition.name', read_only=True)
    opened_by_name = serializers.SerializerMethodField()
    closed_by_name = serializers.SerializerMethodField()
    reopened_by_name = serializers.SerializerMethodField()
    staff_members = OperationalShiftStaffSerializer(many=True, read_only=True)
    meters = ShiftNozzleMeterSerializer(many=True, read_only=True)
    testing_records = ShiftTestingRecordSerializer(many=True, read_only=True)
    dip_observations = ShiftTankDipObservationSerializer(many=True, read_only=True)

    class Meta:
        model = OperationalShift
        fields = [
            'id', 'organisation', 'outlet', 'shift_definition',
            'shift_definition_name', 'business_date',
            'scheduled_starts_at', 'scheduled_ends_at',
            'opened_at', 'closed_at', 'status',
            'opened_by_name', 'closed_by_name',
            'reopened_by_name', 'reopened_at', 'reopen_reason',
            'notes', 'version', 'staff_members', 'meters',
            'testing_records', 'dip_observations',
            'created_at', 'updated_at'
        ]

    def get_opened_by_name(self, obj) -> str | None:
        if obj.opened_by:
            return obj.opened_by.display_name or obj.opened_by.email
        return None

    def get_closed_by_name(self, obj) -> str | None:
        if obj.closed_by:
            return obj.closed_by.display_name or obj.closed_by.email
        return None

    def get_reopened_by_name(self, obj) -> str | None:
        if obj.reopened_by:
            return obj.reopened_by.display_name or obj.reopened_by.email
        return None
