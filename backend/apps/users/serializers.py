# apps/users/serializers.py
from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from django.core.exceptions import ValidationError as DjangoValidationError
from apps.organizations.models import Organisation, OrganisationMembership, Outlet
from apps.organizations.selectors import organisations_for_user, outlets_for_user_in_organisation
from apps.organizations.services import create_organisation_with_owner

User = get_user_model()

class OutletSerializer(serializers.ModelSerializer):
    class Meta:
        model = Outlet
        fields = ['id', 'name', 'code']

class OrganisationDetailSerializer(serializers.ModelSerializer):
    membership_type = serializers.SerializerMethodField()
    outlets = serializers.SerializerMethodField()

    class Meta:
        model = Organisation
        fields = ['id', 'name', 'code', 'membership_type', 'outlets', 'onboarding_status']

    def get_membership_type(self, obj):
        user = self.context.get('request').user
        try:
            membership = OrganisationMembership.objects.get(user=user, organisation=obj)
            return membership.membership_type
        except OrganisationMembership.DoesNotExist:
            return None

    def get_outlets(self, obj):
        user = self.context.get('request').user
        outlets = outlets_for_user_in_organisation(user, obj)
        return OutletSerializer(outlets, many=True).data

class UserSerializer(serializers.ModelSerializer):
    organisations = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'email', 'display_name', 'phone_number', 'organisations']

    def get_organisations(self, obj):
        orgs = organisations_for_user(obj)
        return OrganisationDetailSerializer(orgs, many=True, context=self.context).data

class SignupSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=255)
    email = serializers.EmailField()
    phone_number = serializers.CharField(max_length=20, required=False, allow_blank=True, default='')
    password = serializers.CharField(write_only=True)
    password_confirm = serializers.CharField(write_only=True)
    organisation_name = serializers.CharField(max_length=255)
    organisation_code = serializers.CharField(max_length=50)

    def validate_email(self, value):
        email = value.strip().lower()
        if User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError("A user with this email address already exists.")
        return email

    def validate_organisation_code(self, value):
        code = value.strip().upper()
        if Organisation.objects.filter(code__iexact=code).exists():
            raise serializers.ValidationError("An organisation with this code already exists.")
        return code

    def validate(self, data):
        password = data.get('password')
        password_confirm = data.get('password_confirm')

        if password != password_confirm:
            raise serializers.ValidationError({"password_confirm": "Passwords do not match."})

        # Run Django password validators using a dummy User object
        user_dummy = User(
            email=data.get('email'),
            display_name=data.get('full_name'),
            phone_number=data.get('phone_number', '')
        )
        try:
            validate_password(password, user=user_dummy)
        except DjangoValidationError as e:
            raise serializers.ValidationError({"password": list(e.messages)})

        return data

    @transaction.atomic
    def create(self, validated_data):
        email = validated_data['email']
        password = validated_data['password']
        full_name = validated_data['full_name']
        phone_number = validated_data.get('phone_number', '')
        org_name = validated_data['organisation_name']
        org_code = validated_data['organisation_code']

        # Create user via UserManager
        user = User.objects.create_user(
            email=email,
            password=password,
            display_name=full_name,
            phone_number=phone_number
        )

        # Create organisation with owner
        create_organisation_with_owner(
            name=org_name,
            code=org_code,
            owner_user=user
        )

        return user

class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()

class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    password = serializers.CharField(write_only=True)
    password_confirm = serializers.CharField(write_only=True)

    def validate(self, data):
        password = data.get('password')
        password_confirm = data.get('password_confirm')

        if password != password_confirm:
            raise serializers.ValidationError({"password_confirm": "Passwords do not match."})

        return data
