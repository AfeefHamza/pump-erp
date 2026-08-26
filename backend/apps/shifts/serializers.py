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
    nozzle_id = serializers.UUIDField(write_only=True)

    class Meta:
        model = ShiftNozzleAssignment
        fields = ['id', 'nozzle_id', 'nozzle_details', 'created_at']
        read_only_fields = ['id', 'created_at']


class ShiftStaffAssignmentSerializer(serializers.ModelSerializer):
    employee_details = EmployeeSerializer(source='employee', read_only=True)
    employee_id = serializers.UUIDField(write_only=True)
    duty_designation_details = EmployeeDesignationSerializer(source='duty_designation', read_only=True)
    duty_designation_id = serializers.UUIDField(write_only=True)
    nozzle_assignments = ShiftNozzleAssignmentSerializer(many=True, read_only=True)

    class Meta:
        model = ShiftStaffAssignment
        fields = [
            'id', 'roster', 'employee_id', 'employee_details',
            'duty_designation_id', 'duty_designation_details',
            'is_primary_cashier', 'nozzle_assignments', 'notes', 'created_at'
        ]
        read_only_fields = ['id', 'roster', 'created_at']


class ShiftRosterSerializer(serializers.ModelSerializer):
    shift_definition_details = ShiftDefinitionSerializer(source='shift_definition', read_only=True)
    shift_definition_id = serializers.UUIDField(write_only=True)
    staff_assignments = ShiftStaffAssignmentSerializer(many=True, read_only=True)

    class Meta:
        model = ShiftRoster
        fields = [
            'id', 'organisation', 'outlet', 'shift_definition_id',
            'shift_definition_details', 'business_date', 'is_locked',
            'notes', 'staff_assignments', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'organisation', 'outlet', 'is_locked', 'created_at', 'updated_at']
