# apps/employees/serializers.py
from rest_framework import serializers
from apps.users.serializers import OutletSerializer
from .models import Employee, EmployeeDesignation, EmployeeOutletAssignment

class EmployeeDesignationSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmployeeDesignation
        fields = [
            'id', 'organisation', 'code', 'name', 'description',
            'requires_nozzle_assignment', 'is_system', 'is_active',
            'display_order', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'organisation', 'is_system', 'created_at', 'updated_at']


class EmployeeOutletAssignmentSerializer(serializers.ModelSerializer):
    outlet_details = OutletSerializer(source='outlet', read_only=True)
    outlet_id = serializers.UUIDField(write_only=True)

    class Meta:
        model = EmployeeOutletAssignment
        fields = [
            'id', 'employee', 'outlet_id', 'outlet_details', 'is_primary',
            'effective_from', 'effective_to', 'created_at'
        ]
        read_only_fields = ['id', 'employee', 'created_at']


class EmployeeSerializer(serializers.ModelSerializer):
    designation_details = EmployeeDesignationSerializer(source='designation', read_only=True)
    designation_id = serializers.UUIDField(write_only=True)
    outlet_assignments = EmployeeOutletAssignmentSerializer(many=True, read_only=True)

    class Meta:
        model = Employee
        fields = [
            'id', 'organisation', 'employee_code', 'display_name',
            'phone_number', 'alternate_phone_number', 'address',
            'date_of_birth', 'joined_on', 'left_on', 'designation_id',
            'designation_details', 'status', 'notes', 'outlet_assignments',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'organisation', 'created_at', 'updated_at']
