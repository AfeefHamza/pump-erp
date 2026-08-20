# apps/organizations/serializers.py
from rest_framework import serializers
from django.core.exceptions import ValidationError as DjangoValidationError
from .models import Organisation, Outlet, FinancialYear

class FinancialYearSerializer(serializers.ModelSerializer):
    class Meta:
        model = FinancialYear
        fields = ['id', 'name', 'start_date', 'end_date', 'status', 'is_default', 'created_at', 'updated_at']
        read_only_fields = ['id', 'status', 'created_at', 'updated_at']


class OutletDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = Outlet
        fields = [
            'id', 'name', 'code', 'status',
            'address_line_1', 'address_line_2', 'city', 'district', 'state', 'postal_code', 'phone_number',
            'outlet_type', 'operating_brand_code', 'operating_brand_name', 'dealer_code', 'email',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'status', 'created_at', 'updated_at']


class OrganisationProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organisation
        fields = [
            'id', 'name', 'code', 'status', 'default_currency', 'timezone',
            'legal_name', 'trade_name', 'phone_number', 'email', 'gstin', 'pan',
            'address_line_1', 'address_line_2', 'city', 'district', 'state', 'postal_code',
            'onboarding_status', 'onboarding_completed_at', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'code', 'status', 'onboarding_status', 'onboarding_completed_at', 'created_at', 'updated_at']


class OnboardingCompleteSerializer(serializers.Serializer):
    org_data = serializers.DictField()
    outlet_data = serializers.DictField()
    fy_data = serializers.DictField()

    def validate_org_data(self, value):
        if 'name' not in value or not str(value['name']).strip():
            raise serializers.ValidationError("Organisation name is required.")
        return value

    def validate_outlet_data(self, value):
        if 'name' not in value or not str(value['name']).strip():
            raise serializers.ValidationError("Outlet name is required.")
        if 'code' not in value or not str(value['code']).strip():
            raise serializers.ValidationError("Outlet code is required.")
        return value

    def validate_fy_data(self, value):
        if 'name' not in value or not str(value['name']).strip():
            raise serializers.ValidationError("Financial year name is required.")
        if 'start_date' not in value or not value['start_date']:
            raise serializers.ValidationError("Start date is required.")
        if 'end_date' not in value or not value['end_date']:
            raise serializers.ValidationError("End date is required.")
        return value
