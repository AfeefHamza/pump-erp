# apps/operations/serializers.py
from rest_framework import serializers
from apps.forecourt.serializers import TankSerializer, NozzleSerializer
from .models import (
    DipCalibrationChart, DipCalibrationPoint, TankCalibrationAssignment,
    OpeningBalanceBatch, NozzleOpeningBalance, TankOpeningBalance,
    NozzleCommissioning
)

class DipCalibrationPointSerializer(serializers.ModelSerializer):
    class Meta:
        model = DipCalibrationPoint
        fields = ['id', 'chart', 'height_mm', 'volume_litres', 'sequence']
        read_only_fields = ['id', 'chart', 'sequence']


class DipCalibrationChartSerializer(serializers.ModelSerializer):
    points = DipCalibrationPointSerializer(many=True, read_only=True)
    point_count = serializers.SerializerMethodField()

    class Meta:
        model = DipCalibrationChart
        fields = [
            'id', 'organisation', 'name', 'description', 'nominal_capacity',
            'tank_diameter', 'tank_length', 'manufacturer_or_source',
            'source_filename', 'source_file', 'source_checksum',
            'original_height_unit', 'normalized_height_unit', 'volume_unit',
            'lookup_mode', 'status', 'points', 'point_count', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'organisation', 'source_filename', 'source_file',
            'source_checksum', 'normalized_height_unit', 'volume_unit',
            'points', 'point_count', 'created_at', 'updated_at'
        ]

    def get_point_count(self, obj) -> int:
        return obj.points.count()


class TankCalibrationAssignmentSerializer(serializers.ModelSerializer):
    tank_details = TankSerializer(source='tank', read_only=True)
    tank_id = serializers.UUIDField(write_only=True)
    chart_details = DipCalibrationChartSerializer(source='chart', read_only=True)
    chart_id = serializers.UUIDField(write_only=True)

    class Meta:
        model = TankCalibrationAssignment
        fields = [
            'id', 'organisation', 'outlet', 'tank_id', 'tank_details',
            'chart_id', 'chart_details', 'effective_from', 'effective_to',
            'assigned_by', 'created_at'
        ]
        read_only_fields = ['id', 'organisation', 'outlet', 'assigned_by', 'created_at']


class NozzleOpeningBalanceSerializer(serializers.ModelSerializer):
    nozzle_details = NozzleSerializer(source='nozzle', read_only=True)
    nozzle_id = serializers.UUIDField(write_only=True)

    class Meta:
        model = NozzleOpeningBalance
        fields = ['id', 'batch', 'nozzle_id', 'nozzle_details', 'totalizer_reading', 'notes', 'created_at']
        read_only_fields = ['id', 'batch', 'created_at']


class TankOpeningBalanceSerializer(serializers.ModelSerializer):
    tank_details = TankSerializer(source='tank', read_only=True)
    tank_id = serializers.UUIDField(write_only=True)
    calibration_assignment_details = TankCalibrationAssignmentSerializer(source='calibration_assignment', read_only=True)

    class Meta:
        model = TankOpeningBalance
        fields = [
            'id', 'batch', 'tank_id', 'tank_details', 'book_quantity',
            'physical_quantity', 'raw_dip_value', 'raw_dip_unit',
            'calibration_assignment', 'calibration_assignment_details',
            'density', 'conversion_method', 'manual_quantity_reason',
            'notes', 'created_at'
        ]
        read_only_fields = ['id', 'batch', 'calibration_assignment', 'calibration_assignment_details', 'created_at']


class OpeningBalanceBatchSerializer(serializers.ModelSerializer):
    nozzle_balances = NozzleOpeningBalanceSerializer(many=True, read_only=True)
    tank_balances = TankOpeningBalanceSerializer(many=True, read_only=True)

    class Meta:
        model = OpeningBalanceBatch
        fields = [
            'id', 'organisation', 'outlet', 'effective_at', 'status',
            'notes', 'nozzle_balances', 'tank_balances', 'created_by',
            'confirmed_by', 'created_at', 'confirmed_at'
        ]
        read_only_fields = [
            'id', 'organisation', 'outlet', 'status', 'nozzle_balances',
            'tank_balances', 'created_by', 'confirmed_by', 'created_at',
            'confirmed_at'
        ]


class NozzleCommissioningSerializer(serializers.ModelSerializer):
    commissioned_by_name = serializers.SerializerMethodField()

    class Meta:
        model = NozzleCommissioning
        fields = [
            'id', 'organisation', 'outlet', 'nozzle', 'effective_at',
            'initial_totalizer', 'reason', 'notes', 'commissioned_by',
            'commissioned_by_name', 'created_at', 'dispenser_code_snapshot',
            'nozzle_code_snapshot', 'product_id_snapshot', 'product_name_snapshot'
        ]
        read_only_fields = [
            'id', 'organisation', 'outlet', 'commissioned_by',
            'commissioned_by_name', 'created_at', 'dispenser_code_snapshot',
            'nozzle_code_snapshot', 'product_id_snapshot', 'product_name_snapshot'
        ]

    def get_commissioned_by_name(self, obj) -> str | None:
        if obj.commissioned_by:
            name = obj.commissioned_by.get_full_name()
            return name if name else obj.commissioned_by.username
        return None

