# apps/shifts/serializers.py
import os
from decimal import Decimal
from rest_framework import serializers
from apps.employees.models import Employee
from apps.employees.serializers import EmployeeSerializer, EmployeeDesignationSerializer
from apps.forecourt.serializers import NozzleSerializer
from .models import (
    ShiftDefinition, ShiftRoster, ShiftStaffAssignment, ShiftNozzleAssignment,
    Customer, CustomerOutletAssignment, FuelCreditSlip,
    EmployeeShiftCollection, EmployeeCashDenomination,
    EmployeeShiftDeduction, EmployeeShiftSettlement,
    ShiftReconciliation, CollectionAuditLog, EmployeeShiftCard,
    OperationalShift
)

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
    source_employee_id = serializers.UUIDField(source='source_employee.id', read_only=True)
    employee_name = serializers.CharField(source='employee_name_snapshot', read_only=True)
    employee_code = serializers.CharField(source='employee_code_snapshot', read_only=True)
    designation_name = serializers.CharField(source='designation_snapshot', read_only=True)
    assigned_nozzles = serializers.SerializerMethodField()
    added_by_name = serializers.SerializerMethodField()
    is_active = serializers.SerializerMethodField()

    class Meta:
        model = OperationalShiftStaff
        fields = [
            'id', 'shift', 'source_employee', 'source_employee_id', 'duty_designation',
            'employee_code_snapshot', 'employee_name_snapshot', 'designation_snapshot',
            'employee_name', 'employee_code', 'designation_name',
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
    nozzle_id = serializers.UUIDField(source='nozzle.id', read_only=True)
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
    unit_price = serializers.SerializerMethodField()

    class Meta:
        model = ShiftNozzleMeter
        fields = [
            'id', 'shift', 'nozzle', 'nozzle_id', 'nozzle_code', 'nozzle_name',
            'dispenser_name', 'product_id', 'product_name', 'product_code',
            'staff_assignment', 'employee_id', 'employee_name',
            'opening_reading', 'closing_reading', 'opening_source',
            'opening_source_reference', 'manual_exception_type', 'manual_exception_reason',
            'gross_quantity', 'testing_quantity', 'sale_quantity',
            'stock_depletion_quantity', 'sale_amount', 'unit_price', 'price_segments',
            'shift_card', 'expected_opening_reading', 'continuity_status',
            'continuity_difference', 'continuity_reason', 'is_conflict_acknowledged',
            'conflict_acknowledged_by', 'conflict_acknowledged_at',
            'meter_events', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_sale_amount(self, obj) -> str:
        from decimal import Decimal
        total = sum((s.sale_amount for s in obj.price_segments.all()), Decimal('0.00'))
        return str(total)

    def get_unit_price(self, obj) -> str:
        active = obj.price_segments.filter(ends_at__isnull=True).first()
        if not active:
            active = obj.price_segments.order_by('sequence').last()
        return str(active.unit_price) if active else '0.00'


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

    shift_reconciliation_complete = serializers.BooleanField(read_only=True)
    reconciliation_status = serializers.SerializerMethodField()

    class Meta:
        model = OperationalShift
        fields = [
            'id', 'organisation', 'outlet', 'shift_definition',
            'shift_definition_name', 'business_date',
            'scheduled_starts_at', 'scheduled_ends_at',
            'opened_at', 'closed_at', 'status',
            'shift_reconciliation_complete', 'reconciliation_status',
            'opened_by_name', 'closed_by_name',
            'staff_count', 'totals', 'version',
            'created_at', 'updated_at'
        ]

    def get_reconciliation_status(self, obj) -> str:
        if hasattr(obj, 'reconciliation'):
            return obj.reconciliation.status
        return 'pending'

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

    shift_reconciliation_complete = serializers.BooleanField(read_only=True)

    class Meta:
        model = OperationalShift
        fields = [
            'id', 'organisation', 'outlet', 'shift_definition',
            'shift_definition_name', 'business_date',
            'scheduled_starts_at', 'scheduled_ends_at',
            'opened_at', 'closed_at', 'status',
            'shift_reconciliation_complete',
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


# =============================================================================
# Milestone 10 Serializers
# =============================================================================

class CustomerSerializer(serializers.ModelSerializer):
    outlet_ids = serializers.SerializerMethodField()

    class Meta:
        model = Customer
        fields = [
            'id', 'organisation', 'customer_code', 'display_name', 'customer_type',
            'phone_number', 'alternate_phone_number', 'email', 'billing_address',
            'GSTIN', 'credit_limit', 'credit_days', 'status', 'notes',
            'outlet_ids', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'organisation', 'created_at', 'updated_at']

    def get_outlet_ids(self, obj) -> list[str]:
        return [str(a.outlet_id) for a in obj.outlet_assignments.all()]


class FuelCreditSlipSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source='customer.display_name', read_only=True)
    customer_code = serializers.CharField(source='customer.customer_code', read_only=True)
    employee_name = serializers.CharField(source='employee.display_name', read_only=True)
    employee_code = serializers.CharField(source='employee.employee_code', read_only=True)
    nozzle_code = serializers.CharField(source='nozzle.code', read_only=True, default=None)
    product_name = serializers.CharField(source='product.name', read_only=True)
    product_code = serializers.CharField(source='product.code', read_only=True)
    voided_by_name = serializers.SerializerMethodField()

    class Meta:
        model = FuelCreditSlip
        fields = [
            'id', 'organisation', 'outlet', 'operational_shift', 'shift_card',
            'employee', 'employee_name', 'employee_code',
            'customer', 'customer_name', 'customer_code',
            'slip_number', 'occurred_at',
            'nozzle', 'nozzle_code',
            'product', 'product_name', 'product_code',
            'quantity', 'unit_price', 'amount',
            'vehicle_number', 'driver_name',
            'customer_reference', 'physical_slip_number', 'notes',
            'status', 'void_reason', 'voided_by_name', 'voided_at',
            'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'organisation', 'outlet', 'operational_shift',
            'amount', 'unit_price', 'created_at', 'updated_at'
        ]

    def get_voided_by_name(self, obj) -> str | None:
        if obj.voided_by:
            return obj.voided_by.display_name or obj.voided_by.email
        return None


class EmployeeCashDenominationSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmployeeCashDenomination
        fields = ['denomination_value', 'quantity', 'calculated_amount']
        read_only_fields = ['calculated_amount']


class EmployeeShiftCollectionSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source='employee.display_name', read_only=True)
    employee_code = serializers.CharField(source='employee.employee_code', read_only=True)
    denominations = EmployeeCashDenominationSerializer(many=True, read_only=True)
    voided_by_name = serializers.SerializerMethodField()

    class Meta:
        model = EmployeeShiftCollection
        fields = [
            'id', 'organisation', 'outlet', 'operational_shift', 'shift_card',
            'employee', 'employee_name', 'employee_code',
            'collection_method', 'amount', 'occurred_at',
            'reference_number', 'provider_name',
            'terminal_or_account_reference', 'notes',
            'status', 'void_reason', 'voided_by_name', 'voided_at',
            'denominations', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'organisation', 'outlet', 'operational_shift', 'created_at', 'updated_at']

    def get_voided_by_name(self, obj) -> str | None:
        if obj.voided_by:
            return obj.voided_by.display_name or obj.voided_by.email
        return None


class EmployeeShiftDeductionSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source='employee.display_name', read_only=True)
    employee_code = serializers.CharField(source='employee.employee_code', read_only=True)
    approved_by_name = serializers.SerializerMethodField()
    rejected_by_name = serializers.SerializerMethodField()
    voided_by_name = serializers.SerializerMethodField()

    class Meta:
        model = EmployeeShiftDeduction
        fields = [
            'id', 'organisation', 'outlet', 'operational_shift', 'shift_card',
            'employee', 'employee_name', 'employee_code',
            'deduction_type', 'direction', 'amount', 'occurred_at',
            'description', 'payee', 'reference_number',
            'approval_status', 'approval_reason', 'approved_by', 'approved_by_name', 'approved_at',
            'rejection_reason', 'rejected_by', 'rejected_by_name', 'rejected_at',
            'status', 'void_reason', 'voided_by_name', 'voided_at',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'organisation', 'outlet', 'operational_shift', 'approved_by', 'rejected_by', 'created_at', 'updated_at']

    def get_approved_by_name(self, obj) -> str | None:
        if obj.approved_by:
            return obj.approved_by.display_name or obj.approved_by.email
        return None

    def get_rejected_by_name(self, obj) -> str | None:
        if obj.rejected_by:
            return obj.rejected_by.display_name or obj.rejected_by.email
        return None

    def get_voided_by_name(self, obj) -> str | None:
        if obj.voided_by:
            return obj.voided_by.display_name or obj.voided_by.email
        return None


class EmployeeShiftSettlementSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source='employee.display_name', read_only=True)
    employee_code = serializers.CharField(source='employee.employee_code', read_only=True)
    shortage_amount = serializers.DecimalField(max_digits=15, decimal_places=2, read_only=True)
    excess_amount = serializers.DecimalField(max_digits=15, decimal_places=2, read_only=True)
    reconciled_by_name = serializers.SerializerMethodField()
    reopened_by_name = serializers.SerializerMethodField()

    class Meta:
        model = EmployeeShiftSettlement
        fields = [
            'id', 'organisation', 'outlet', 'operational_shift', 'shift_card',
            'employee', 'employee_name', 'employee_code',
            'expected_sale_amount',
            'cash_amount', 'card_amount', 'upi_amount', 'fleet_card_amount', 'credit_slip_amount',
            'approved_increase_adjustments', 'approved_decrease_adjustments',
            'total_accounted_amount', 'difference_amount',
            'shortage_amount', 'excess_amount',
            'shortage_acknowledged', 'shortage_acknowledged_notes',
            'result', 'status',
            'reconciled_by', 'reconciled_by_name', 'reconciled_at',
            'reconciliation_notes',
            'reopened_by', 'reopened_by_name', 'reopened_at', 'reopen_reason',
            'version', 'created_at', 'updated_at'
        ]
        read_only_fields = fields

    def get_reconciled_by_name(self, obj) -> str | None:
        if obj.reconciled_by:
            return obj.reconciled_by.display_name or obj.reconciled_by.email
        return None

    def get_reopened_by_name(self, obj) -> str | None:
        if obj.reopened_by:
            return obj.reopened_by.display_name or obj.reopened_by.email
        return None


class ShiftReconciliationSerializer(serializers.ModelSerializer):
    shift_reconciliation_complete = serializers.SerializerMethodField()
    completed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = ShiftReconciliation
        fields = [
            'id', 'organisation', 'outlet', 'operational_shift',
            'expected_sale_amount', 'total_accounted_amount',
            'shortage_amount', 'excess_amount', 'net_difference_amount',
            'required_employee_count', 'reconciled_employee_count',
            'status', 'shift_reconciliation_complete',
            'completed_by_name', 'completed_at',
            'created_at', 'updated_at'
        ]
        read_only_fields = fields

    def get_shift_reconciliation_complete(self, obj) -> bool:
        return obj.status == ShiftReconciliation.STATUS_RECONCILED

    def get_completed_by_name(self, obj) -> str | None:
        if obj.completed_by:
            return obj.completed_by.display_name or obj.completed_by.email
        return None


class CollectionAuditLogSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source='employee.display_name', read_only=True, default=None)
    customer_name = serializers.CharField(source='customer.display_name', read_only=True, default=None)
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = CollectionAuditLog
        fields = [
            'id', 'organisation', 'outlet', 'shift',
            'employee', 'employee_name',
            'customer', 'customer_name',
            'actor_name', 'event_type', 'occurred_at',
            'reason', 'metadata'
        ]
        read_only_fields = fields

    def get_actor_name(self, obj) -> str | None:
        if obj.actor:
            return obj.actor.display_name or obj.actor.email
        return None


class ShiftCardMeterInputSerializer(serializers.Serializer):
    nozzle_id = serializers.UUIDField()
    opening_reading = serializers.DecimalField(max_digits=12, decimal_places=3)
    closing_reading = serializers.DecimalField(max_digits=12, decimal_places=3, required=False, allow_null=True)
    testing_litres = serializers.DecimalField(max_digits=10, decimal_places=3, required=False, default=Decimal('0.000'))
    testing_quantity = serializers.DecimalField(max_digits=10, decimal_places=3, required=False, default=Decimal('0.000'))
    returned_to_tank = serializers.BooleanField(required=False, default=True)
    destination_tank_id = serializers.UUIDField(required=False, allow_null=True)
    opening_source = serializers.CharField(required=False, allow_blank=True, default='previous_shift')
    expected_opening_reading = serializers.DecimalField(max_digits=12, decimal_places=3, required=False, allow_null=True)
    continuity_status = serializers.CharField(required=False, allow_blank=True, default='')
    continuity_difference = serializers.DecimalField(max_digits=12, decimal_places=3, required=False, default=Decimal('0.000'))
    continuity_reason = serializers.CharField(required=False, allow_blank=True, default='')
    is_conflict_acknowledged = serializers.BooleanField(required=False, default=False)
    price_segments = serializers.ListField(child=serializers.DictField(), required=False, default=list)

    def validate(self, data):
        if data.get('closing_reading') is not None and data['closing_reading'] < data['opening_reading']:
            raise serializers.ValidationError("Closing reading cannot be less than opening reading.")
        gross = (data['closing_reading'] - data['opening_reading']) if data.get('closing_reading') is not None else Decimal('0.000')
        testing = data.get('testing_litres') or data.get('testing_quantity') or Decimal('0.000')
        if testing > gross and data.get('closing_reading') is not None:
            raise serializers.ValidationError("Testing litres cannot exceed gross litres.")
        return data


class ShiftCardCollectionInputSerializer(serializers.Serializer):
    collection_method = serializers.ChoiceField(choices=['cash', 'pos_card', 'upi', 'fleet_card'])
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    pos_terminal_id = serializers.UUIDField(required=False, allow_null=True)
    upi_qr_id = serializers.UUIDField(required=False, allow_null=True)
    reference_number = serializers.CharField(required=False, allow_blank=True, default='')
    card_network = serializers.CharField(required=False, allow_blank=True, default='')
    batch_number = serializers.CharField(required=False, allow_blank=True, default='')
    slip_number = serializers.CharField(required=False, allow_blank=True, default='')
    occurred_at = serializers.DateTimeField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, default='')


class ShiftCardCreditSlipInputSerializer(serializers.Serializer):
    customer_id = serializers.UUIDField()
    vehicle_number = serializers.CharField(max_length=50)
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    slip_number = serializers.CharField(max_length=100)
    credit_limit_override = serializers.BooleanField(required=False, default=False)
    override_reason = serializers.CharField(required=False, allow_blank=True, default='')
    occurred_at = serializers.DateTimeField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, default='')


class ShiftCardDeductionInputSerializer(serializers.Serializer):
    deduction_type = serializers.CharField(required=False, default='cash_expense')
    direction = serializers.CharField(required=False, default='increases_accounted')
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    description = serializers.CharField(required=False, allow_blank=True, default='')
    payee = serializers.CharField(required=False, allow_blank=True, default='')
    reference_number = serializers.CharField(required=False, allow_blank=True, default='')
    receipt_number = serializers.CharField(required=False, allow_blank=True, default='')
    expense_claim_id = serializers.UUIDField(required=False, allow_null=True)
    occurred_at = serializers.DateTimeField(required=False, allow_null=True)


class ShiftCardDenominationInputSerializer(serializers.Serializer):
    denomination_value = serializers.DecimalField(max_digits=8, decimal_places=2)
    count = serializers.IntegerField(min_value=0, required=False, default=0)
    quantity = serializers.IntegerField(min_value=0, required=False, default=0)


class ShiftCardAtomicSaveSerializer(serializers.Serializer):
    card_id = serializers.UUIDField(required=False, allow_null=True)
    parent_shift_id = serializers.UUIDField(required=False, allow_null=True)
    business_date = serializers.DateField()
    shift_definition_id = serializers.UUIDField()
    employee_id = serializers.UUIDField()
    mpd_slip_number = serializers.CharField(required=False, allow_blank=True, default='')
    mpd_slip_notes = serializers.CharField(required=False, allow_blank=True, default='')
    mpd_slip_attachment = serializers.FileField(required=False, allow_null=True)
    operator_notes = serializers.CharField(required=False, allow_blank=True, default='')
    manager_notes = serializers.CharField(required=False, allow_blank=True, default='')
    acknowledged_by_operator = serializers.BooleanField(required=False, default=False)
    meters = ShiftCardMeterInputSerializer(many=True, required=False, default=list)
    nozzle_meters = ShiftCardMeterInputSerializer(many=True, required=False, default=list)
    collections = ShiftCardCollectionInputSerializer(many=True, required=False, default=list)
    cards = serializers.ListField(child=serializers.DictField(), required=False, default=list)
    upi = serializers.ListField(child=serializers.DictField(), required=False, default=list)
    fleet = serializers.ListField(child=serializers.DictField(), required=False, default=list)
    credit_slips = ShiftCardCreditSlipInputSerializer(many=True, required=False, default=list)
    deductions = serializers.ListField(child=serializers.DictField(), required=False, default=list)
    denominations = ShiftCardDenominationInputSerializer(many=True, required=False, default=list)
    cash = serializers.DictField(required=False, default=dict)
    cash_amount = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, default=Decimal('0.00'))
    is_shortage_excess_acknowledged = serializers.BooleanField(required=False, default=False)
    shortage_excess_acknowledgement_note = serializers.CharField(required=False, allow_blank=True, default='')
    shortage_acknowledged = serializers.BooleanField(required=False, default=False)
    shortage_notes = serializers.CharField(required=False, allow_blank=True, default='')
    notes = serializers.CharField(required=False, allow_blank=True, default='')

    def validate_mpd_slip_attachment(self, value):
        if not value:
            return value
        if value.size > 5 * 1024 * 1024:
            raise serializers.ValidationError("Attachment exceeds maximum allowed size of 5MB.")
        ext = os.path.splitext(value.name)[1].lower()
        if ext not in ['.pdf', '.png', '.jpg', '.jpeg']:
            raise serializers.ValidationError(f"Unsupported file extension '{ext}'. Allowed: .pdf, .png, .jpg, .jpeg")
        if hasattr(value, 'content_type') and value.content_type:
            allowed_mime = ['application/pdf', 'image/png', 'image/jpeg', 'image/pjpeg']
            if value.content_type.lower() not in allowed_mime:
                raise serializers.ValidationError(f"Invalid MIME type '{value.content_type}'.")
        return value


class ShiftCardParentShiftSerializer(serializers.ModelSerializer):
    shift_definition = ShiftDefinitionSerializer(read_only=True)
    locked_by_name = serializers.SerializerMethodField()

    class Meta:
        model = OperationalShift
        fields = [
            'id', 'business_date', 'shift_definition',
            'is_locked', 'locked_at', 'locked_by', 'locked_by_name',
            'lock_source', 'status'
        ]

    def get_locked_by_name(self, obj):
        return obj.locked_by.display_name if obj.locked_by else None


class ShiftCardEmployeeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Employee
        fields = ['id', 'display_name', 'employee_code']


class EmployeeShiftCardSerializer(serializers.ModelSerializer):
    parent_shift = ShiftCardParentShiftSerializer(read_only=True)
    employee = ShiftCardEmployeeSerializer(read_only=True)
    employee_name = serializers.CharField(source='employee.display_name', read_only=True)
    employee_code = serializers.CharField(source='employee.employee_code', read_only=True)
    business_date = serializers.DateField(source='parent_shift.business_date', read_only=True)
    shift_code = serializers.CharField(source='parent_shift.shift_definition.code', read_only=True)
    shift_name = serializers.CharField(source='parent_shift.shift_definition.name', read_only=True)
    shift_definition_id = serializers.UUIDField(source='parent_shift.shift_definition.id', read_only=True)
    is_locked = serializers.BooleanField(source='parent_shift.is_locked', read_only=True)
    locked_at = serializers.DateTimeField(source='parent_shift.locked_at', read_only=True)
    locked_by_name = serializers.CharField(source='parent_shift.locked_by.display_name', read_only=True, default=None)
    lock_reason = serializers.CharField(source='parent_shift.lock_source', read_only=True, default='')
    acknowledged_by_operator = serializers.BooleanField(source='is_shortage_excess_acknowledged', read_only=True)
    operator_notes = serializers.CharField(source='shortage_excess_acknowledgement_note', read_only=True)
    mpd_slip_notes = serializers.CharField(source='notes', read_only=True)
    voided_by_name = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    meters = ShiftNozzleMeterSerializer(many=True, read_only=True)
    collections = EmployeeShiftCollectionSerializer(many=True, read_only=True)
    credit_slips = FuelCreditSlipSerializer(many=True, read_only=True)
    deductions = EmployeeShiftDeductionSerializer(many=True, read_only=True)
    settlement = EmployeeShiftSettlementSerializer(read_only=True)
    discrepancy_status = serializers.SerializerMethodField()
    has_attachment = serializers.SerializerMethodField()

    class Meta:
        model = EmployeeShiftCard
        fields = [
            'id', 'organisation', 'outlet', 'parent_shift',
            'business_date', 'shift_code', 'shift_name', 'shift_definition_id',
            'employee', 'employee_name', 'employee_code',
            'sequence', 'status',
            'actual_starts_at', 'actual_ends_at',
            'total_litres_sold', 'total_sale_amount', 'total_collected_amount', 'difference_amount',
            'discrepancy_status',
            'mpd_slip_number', 'mpd_slip_attachment', 'has_attachment', 'mpd_slip_notes',
            'is_shortage_excess_acknowledged', 'acknowledged_by_operator',
            'shortage_excess_acknowledgement_note', 'operator_notes',
            'notes',
            'is_locked', 'locked_at', 'locked_by_name', 'lock_reason',
            'voided_at', 'voided_by', 'voided_by_name', 'void_reason',
            'created_by', 'created_by_name', 'created_at', 'updated_at',
            'meters', 'collections', 'credit_slips', 'deductions', 'settlement'
        ]
        read_only_fields = fields

    def get_voided_by_name(self, obj):
        return obj.voided_by.display_name if obj.voided_by else None

    def get_created_by_name(self, obj):
        return obj.created_by.display_name if obj.created_by else None

    def get_has_attachment(self, obj):
        return bool(obj.mpd_slip_attachment)

    def get_discrepancy_status(self, obj):
        diff = obj.difference_amount or Decimal('0.00')
        if diff == Decimal('0.00'):
            return 'balanced'
        elif diff < Decimal('0.00'):
            return 'shortage'
        else:
            return 'excess'


class ShiftCardVoidSerializer(serializers.Serializer):
    reason = serializers.CharField(min_length=5, required=True)


class ShiftLockActionSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True, default='')
    lock_source = serializers.CharField(required=False, default='manual')
    cash_account_id = serializers.UUIDField(required=False, allow_null=True)


class ShiftUnlockActionSerializer(serializers.Serializer):
    reason = serializers.CharField(min_length=5, required=True)


class ShiftDeductionRejectActionSerializer(serializers.Serializer):
    reason = serializers.CharField(min_length=5, required=True)

