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


from django.contrib.auth import get_user_model
from .models import PermissionDefinition, Role, OrganisationMembership, OrganisationUserActivation

User = get_user_model()

class PermissionDefinitionSerializer(serializers.ModelSerializer):
    class Meta:
        model = PermissionDefinition
        fields = ['id', 'code', 'name', 'module', 'description', 'is_active']


class RoleSerializer(serializers.ModelSerializer):
    permissions = serializers.SlugRelatedField(
        many=True,
        slug_field='code',
        queryset=PermissionDefinition.objects.filter(is_active=True)
    )

    class Meta:
        model = Role
        fields = ['id', 'name', 'description', 'is_system', 'is_active', 'permissions', 'created_at', 'updated_at']
        read_only_fields = ['id', 'is_system', 'created_at', 'updated_at']

    def validate_name(self, value):
        org = self.context.get('organisation')
        if not org:
            return value
        qs = Role.objects.filter(organisation=org, name__iexact=value)
        if self.instance:
            qs = qs.exclude(id=self.instance.id)
        if qs.exists():
            raise serializers.ValidationError("A role with this name already exists in the organisation.")
        return value


class UserMiniSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'email', 'display_name', 'phone_number']


class OrganisationMembershipSerializer(serializers.ModelSerializer):
    user = UserMiniSerializer(read_only=True)
    roles = RoleSerializer(many=True, read_only=True)
    outlets = OutletDetailSerializer(many=True, read_only=True)

    class Meta:
        model = OrganisationMembership
        fields = ['id', 'user', 'membership_type', 'status', 'joined_at', 'roles', 'outlets', 'created_at', 'updated_at']
        read_only_fields = ['id', 'user', 'status', 'joined_at', 'created_at', 'updated_at']


class OrganisationUserActivationSerializer(serializers.ModelSerializer):
    roles = RoleSerializer(many=True, read_only=True)
    outlets = OutletDetailSerializer(many=True, read_only=True)
    invited_by = UserMiniSerializer(read_only=True)

    class Meta:
        model = OrganisationUserActivation
        fields = [
            'id', 'email', 'display_name', 'phone_number', 'membership_type',
            'status', 'expires_at', 'activated_at', 'created_at', 'roles', 'outlets', 'invited_by'
        ]
        read_only_fields = ['id', 'status', 'expires_at', 'activated_at', 'created_at', 'invited_by']


class AddUserSerializer(serializers.Serializer):
    email = serializers.EmailField()
    display_name = serializers.CharField(max_length=255)
    phone_number = serializers.CharField(max_length=20, required=False, allow_blank=True, allow_null=True)
    membership_type = serializers.ChoiceField(choices=[('administrator', 'Administrator'), ('member', 'Member')])
    roles = serializers.ListField(child=serializers.UUIDField(), required=False, default=list)
    outlets = serializers.ListField(child=serializers.UUIDField(), required=False, default=list)


class UpdateMembershipAccessSerializer(serializers.Serializer):
    roles = serializers.ListField(child=serializers.UUIDField(), required=False, default=list)
    outlets = serializers.ListField(child=serializers.UUIDField(), required=False, default=list)


class PublicActivationInspectSerializer(serializers.Serializer):
    token = serializers.CharField()


class PublicActivateSubmitSerializer(serializers.Serializer):
    token = serializers.CharField()
    password = serializers.CharField(required=False, allow_blank=True, allow_null=True)

