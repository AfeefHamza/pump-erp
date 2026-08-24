# apps/organizations/views.py
import hashlib
from django.http import Http404
from django.contrib.auth import login
from django.utils import timezone
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from .permissions import HasGranularPermission

from .models import (
    Organisation, Outlet, OrganisationMembership, FinancialYear,
    PermissionDefinition, Role, OrganisationUserActivation
)
from .selectors import organisations_for_user, outlets_for_user_in_organisation
from .serializers import (
    OrganisationProfileSerializer,
    OutletDetailSerializer,
    FinancialYearSerializer,
    OnboardingCompleteSerializer,
    PermissionDefinitionSerializer,
    RoleSerializer,
    OrganisationMembershipSerializer,
    OrganisationUserActivationSerializer,
    AddUserSerializer,
    UpdateMembershipAccessSerializer,
    PublicActivationInspectSerializer,
    PublicActivateSubmitSerializer
)
from .services import complete_onboarding, create_outlet, update_outlet, update_outlet_status


def get_organisation_membership(user, org_id):
    """
    Ensures tenant safety. Fetches membership for the given user and organisation.
    If membership does not exist or is inactive, raises Http404.
    """
    if not user.is_authenticated:
        raise Http404()
    try:
        return OrganisationMembership.objects.get(
            user=user,
            organisation_id=org_id,
            status=OrganisationMembership.STATUS_ACTIVE
        )
    except OrganisationMembership.DoesNotExist:
        raise Http404()


class OrganisationListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        orgs = organisations_for_user(request.user)
        serializer = OrganisationProfileSerializer(orgs, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class OrganisationDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id):
        membership = get_organisation_membership(request.user, org_id)
        serializer = OrganisationProfileSerializer(membership.organisation)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request, org_id):
        membership = get_organisation_membership(request.user, org_id)
        if membership.membership_type not in [OrganisationMembership.TYPE_OWNER, OrganisationMembership.TYPE_ADMINISTRATOR]:
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
        
        serializer = OrganisationProfileSerializer(
            membership.organisation,
            data=request.data,
            partial=True
        )
        if serializer.is_valid():
            try:
                serializer.save()
                return Response(serializer.data, status=status.HTTP_200_OK)
            except DjangoValidationError as e:
                return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class OutletListCreateView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]
    required_permission = 'outlet.view'

    def get(self, request, org_id):
        membership = get_organisation_membership(request.user, org_id)
        outlets = outlets_for_user_in_organisation(request.user, membership.organisation)
        serializer = OutletDetailSerializer(outlets, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request, org_id):
        membership = get_organisation_membership(request.user, org_id)
        from .permissions import require_permission
        require_permission(request.user, org_id, 'outlet.create')

        serializer = OutletDetailSerializer(data=request.data)
        if serializer.is_valid():
            # Check unique constraint manually to return clean field-level error
            code = serializer.validated_data.get('code')
            if Outlet.objects.filter(organisation=membership.organisation, code=code).exists():
                return Response({"code": ["An outlet with this code already exists in this organisation."]}, status=status.HTTP_400_BAD_REQUEST)
            try:
                outlet = create_outlet(
                    organisation=membership.organisation,
                    **serializer.validated_data
                )
                return Response(OutletDetailSerializer(outlet).data, status=status.HTTP_201_CREATED)
            except DjangoValidationError as e:
                return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class OutletDetailView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]
    required_permission = 'outlet.view'

    def get_object(self, org_id, outlet_id, membership):
        try:
            if membership.membership_type in [OrganisationMembership.TYPE_OWNER, OrganisationMembership.TYPE_ADMINISTRATOR]:
                return Outlet.objects.get(organisation_id=org_id, id=outlet_id)
            else:
                return Outlet.objects.get(
                    organisation_id=org_id,
                    id=outlet_id,
                    outlet_accesses__membership=membership
                )
        except Outlet.DoesNotExist:
            raise Http404()

    def get(self, request, org_id, outlet_id):
        membership = get_organisation_membership(request.user, org_id)
        outlet = self.get_object(org_id, outlet_id, membership)
        serializer = OutletDetailSerializer(outlet)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request, org_id, outlet_id):
        membership = get_organisation_membership(request.user, org_id)
        outlet = self.get_object(org_id, outlet_id, membership)

        data = request.data
        status_change = 'status' in data and data['status'] != outlet.status
        other_fields_changed = any(k != 'status' for k in data.keys())

        from .permissions import require_permission
        if status_change:
            require_permission(request.user, org_id, 'outlet.deactivate', outlet=outlet)
        if other_fields_changed:
            require_permission(request.user, org_id, 'outlet.update', outlet=outlet)

        # Check unique code if it's changing
        if 'code' in data and data['code'] != outlet.code:
            code = data['code']
            if Outlet.objects.filter(organisation_id=org_id, code=code).exclude(id=outlet_id).exists():
                return Response({"code": ["An outlet with this code already exists in this organisation."]}, status=status.HTTP_400_BAD_REQUEST)

        # Save using serializer for other fields
        serializer = OutletDetailSerializer(outlet, data=data, partial=True)
        if serializer.is_valid():
            try:
                # First save fields updated through serializer
                outlet = update_outlet(
                    outlet=outlet,
                    **serializer.validated_data
                )

                # Next update status if it changed
                if status_change:
                    from django.core.exceptions import ValidationError as DjangoValError
                    try:
                        outlet = update_outlet_status(outlet, data['status'])
                    except DjangoValError as ve:
                        return Response({"detail": str(ve.messages[0]) if hasattr(ve, 'messages') else str(ve)}, status=status.HTTP_400_BAD_REQUEST)

                return Response(OutletDetailSerializer(outlet).data, status=status.HTTP_200_OK)
            except DjangoValidationError as e:
                error_dict = {}
                if hasattr(e, 'message_dict'):
                    for k, v in e.message_dict.items():
                        error_dict[k] = v
                else:
                    error_dict['non_field_errors'] = e.messages
                return Response(error_dict, status=status.HTTP_400_BAD_REQUEST)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class OnboardingStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id):
        membership = get_organisation_membership(request.user, org_id)
        org = membership.organisation
        return Response({
            "organisation_id": org.id,
            "onboarding_status": org.onboarding_status,
            "onboarding_completed_at": org.onboarding_completed_at
        }, status=status.HTTP_200_OK)


class OnboardingCompleteView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, org_id):
        membership = get_organisation_membership(request.user, org_id)
        if membership.membership_type not in [OrganisationMembership.TYPE_OWNER, OrganisationMembership.TYPE_ADMINISTRATOR]:
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        serializer = OnboardingCompleteSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        try:
            org, outlet, fy = complete_onboarding(
                user=request.user,
                organisation_id=str(org_id),
                org_data=serializer.validated_data['org_data'],
                outlet_data=serializer.validated_data['outlet_data'],
                fy_data=serializer.validated_data['fy_data']
            )
            
            return Response({
                "organisation": OrganisationProfileSerializer(org).data,
                "outlet": OutletDetailSerializer(outlet).data,
                "financial_year": FinancialYearSerializer(fy).data
            }, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            error_dict = {}
            if hasattr(e, 'message_dict'):
                for k, v in e.message_dict.items():
                    error_dict[k] = v
            else:
                error_dict['non_field_errors'] = e.messages
            return Response(error_dict, status=status.HTTP_400_BAD_REQUEST)


class FinancialYearListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id):
        membership = get_organisation_membership(request.user, org_id)
        fys = FinancialYear.objects.filter(organisation=membership.organisation)
        serializer = FinancialYearSerializer(fys, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class PermissionListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id):
        # Tenant safety check
        get_organisation_membership(request.user, org_id)
        
        # Return PermissionDefinitions grouped by module
        permissions = PermissionDefinition.objects.filter(is_active=True)
        grouped = {}
        for perm in permissions:
            mod = perm.module
            if mod not in grouped:
                grouped[mod] = []
            grouped[mod].append(PermissionDefinitionSerializer(perm).data)
        return Response(grouped, status=status.HTTP_200_OK)


class UserEffectivePermissionsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id):
        membership = get_organisation_membership(request.user, org_id)
        from .permissions import permissions_for_membership
        perms = permissions_for_membership(membership)
        return Response({"permissions": list(perms)}, status=status.HTTP_200_OK)


class RoleListCreateView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]
    required_permission = 'role.view'

    def get(self, request, org_id):
        membership = get_organisation_membership(request.user, org_id)
        roles = Role.objects.filter(organisation=membership.organisation)
        serializer = RoleSerializer(roles, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request, org_id):
        membership = get_organisation_membership(request.user, org_id)
        from .permissions import require_permission
        require_permission(request.user, org_id, 'role.create')

        serializer = RoleSerializer(data=request.data, context={'organisation': membership.organisation})
        if serializer.is_valid():
            role = serializer.save(organisation=membership.organisation)
            return Response(RoleSerializer(role).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class RoleDetailView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]
    required_permission = 'role.view'

    def get_object(self, org_id, role_id):
        try:
            return Role.objects.get(organisation_id=org_id, id=role_id)
        except Role.DoesNotExist:
            raise Http404()

    def get(self, request, org_id, role_id):
        role = self.get_object(org_id, role_id)
        serializer = RoleSerializer(role)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request, org_id, role_id):
        from .permissions import require_permission
        require_permission(request.user, org_id, 'role.update')
        
        role = self.get_object(org_id, role_id)
        serializer = RoleSerializer(role, data=request.data, partial=True, context={'organisation': role.organisation})
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, org_id, role_id):
        from .permissions import require_permission
        require_permission(request.user, org_id, 'role.delete')
        
        role = self.get_object(org_id, role_id)
        if role.is_system:
            return Response({"detail": "System roles cannot be deleted."}, status=status.HTTP_400_BAD_REQUEST)
        role.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MembershipListDetailView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]
    required_permission = 'user.view'

    def get(self, request, org_id):
        membership = get_organisation_membership(request.user, org_id)
        memberships = OrganisationMembership.objects.filter(organisation=membership.organisation)
        
        status_filter = request.query_params.get('status')
        if status_filter:
            memberships = memberships.filter(status=status_filter)
            
        serializer = OrganisationMembershipSerializer(memberships, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class MembershipDetailView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]
    required_permission = 'user.view'

    def get_object(self, org_id, membership_id):
        try:
            return OrganisationMembership.objects.get(organisation_id=org_id, id=membership_id)
        except OrganisationMembership.DoesNotExist:
            raise Http404()

    def get(self, request, org_id, membership_id):
        membership = self.get_object(org_id, membership_id)
        serializer = OrganisationMembershipSerializer(membership)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request, org_id, membership_id):
        from .permissions import require_permission
        require_permission(request.user, org_id, 'user.update')
        
        membership = self.get_object(org_id, membership_id)
        serializer = UpdateMembershipAccessSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
            
        from .services import update_membership_access
        try:
            update_membership_access(
                membership=membership,
                role_ids=serializer.validated_data['roles'],
                outlet_ids=serializer.validated_data['outlets'],
                actor=request.user
            )
            return Response(OrganisationMembershipSerializer(membership).data, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class MembershipSuspendReactivateView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]
    required_permission = 'user.suspend'

    def get_object(self, org_id, membership_id):
        try:
            return OrganisationMembership.objects.get(organisation_id=org_id, id=membership_id)
        except OrganisationMembership.DoesNotExist:
            raise Http404()

    def post(self, request, org_id, membership_id):
        action = request.data.get('action')
        membership = self.get_object(org_id, membership_id)
        
        from .services import suspend_membership, reactivate_membership
        try:
            if action == 'suspend':
                suspend_membership(membership, actor=request.user)
            elif action == 'reactivate':
                from .permissions import require_permission
                require_permission(request.user, org_id, 'user.update')
                reactivate_membership(membership, actor=request.user)
            else:
                return Response({"detail": "Invalid action."}, status=status.HTTP_400_BAD_REQUEST)
                
            return Response(OrganisationMembershipSerializer(membership).data, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class ActivationListCreateView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]
    required_permission = 'user.view'

    def get(self, request, org_id):
        membership = get_organisation_membership(request.user, org_id)
        activations = OrganisationUserActivation.objects.filter(organisation=membership.organisation)
        serializer = OrganisationUserActivationSerializer(activations, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request, org_id):
        from .permissions import require_permission
        require_permission(request.user, org_id, 'user.add')
        
        membership = get_organisation_membership(request.user, org_id)
        serializer = AddUserSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
            
        membership_type = serializer.validated_data['membership_type']
        
        if membership.membership_type == OrganisationMembership.TYPE_ADMINISTRATOR:
            if membership_type != 'member':
                return Response(
                    {"detail": "Administrators can only add Member users."},
                    status=status.HTTP_403_FORBIDDEN
                )
                
        from .services import add_user
        try:
            activation, token = add_user(
                organisation=membership.organisation,
                email=serializer.validated_data['email'],
                display_name=serializer.validated_data['display_name'],
                phone_number=serializer.validated_data.get('phone_number'),
                membership_type=membership_type,
                role_ids=serializer.validated_data.get('roles', []),
                outlet_ids=serializer.validated_data.get('outlets', []),
                invited_by=request.user
            )
            return Response(
                OrganisationUserActivationSerializer(activation).data,
                status=status.HTTP_201_CREATED
            )
        except DjangoValidationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class ActivationResendRevokeView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]
    required_permission = 'user.add'

    def post(self, request, org_id, activation_id):
        action = request.data.get('action')
        membership = get_organisation_membership(request.user, org_id)
        
        from .services import resend_or_replace_activation, revoke_activation
        try:
            if action == 'resend':
                activation, token = resend_or_replace_activation(
                    activation_id=activation_id,
                    organisation=membership.organisation,
                    actor=request.user
                )
                return Response(OrganisationUserActivationSerializer(activation).data, status=status.HTTP_200_OK)
            elif action == 'revoke':
                activation = revoke_activation(
                    activation_id=activation_id,
                    organisation=membership.organisation,
                    actor=request.user
                )
                return Response(OrganisationUserActivationSerializer(activation).data, status=status.HTTP_200_OK)
            else:
                return Response({"detail": "Invalid action."}, status=status.HTTP_400_BAD_REQUEST)
        except DjangoValidationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class PublicActivationInspectView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        token = request.query_params.get('token')
        if not token:
            return Response({"detail": "Token is required."}, status=status.HTTP_400_BAD_REQUEST)
            
        token_hash = hashlib.sha256(token.encode('utf-8')).hexdigest()
        try:
            activation = OrganisationUserActivation.objects.get(token_hash=token_hash)
        except OrganisationUserActivation.DoesNotExist:
            return Response({"detail": "Invalid activation token."}, status=status.HTTP_400_BAD_REQUEST)
            
        if activation.status != OrganisationUserActivation.STATUS_PENDING:
            return Response({"detail": "This activation token is no longer pending."}, status=status.HTTP_400_BAD_REQUEST)
            
        if activation.expires_at < timezone.now():
            activation.status = OrganisationUserActivation.STATUS_EXPIRED
            activation.save()
            return Response({"detail": "This activation token has expired."}, status=status.HTTP_400_BAD_REQUEST)
            
        email = activation.email
        try:
            parts = email.split('@')
            name = parts[0]
            domain = parts[1]
            if len(name) > 2:
                masked_name = name[0] + "*" * (len(name) - 2) + name[-1]
            else:
                masked_name = name[0] + "*"
            masked_email = f"{masked_name}@{domain}"
        except Exception:
            masked_email = email
            
        return Response({
            "organisation_name": activation.organisation.name,
            "email": masked_email,
            "display_name": activation.display_name,
            "phone_number": activation.phone_number,
            "membership_type": activation.membership_type,
            "status": activation.status
        }, status=status.HTTP_200_OK)


class PublicActivateSubmitView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PublicActivateSubmitSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
            
        token = serializer.validated_data['token']
        password = serializer.validated_data.get('password')
        
        logged_in_user = request.user if request.user.is_authenticated else None
        
        from .services import activate_user
        try:
            user, membership = activate_user(
                token=token,
                password=password,
                logged_in_user=logged_in_user
            )
            
            if not logged_in_user:
                login(request, user, backend='apps.users.auth_backends.CaseInsensitiveModelBackend')
                
            from apps.users.serializers import UserSerializer
            return Response(
                UserSerializer(user, context={'request': request}).data,
                status=status.HTTP_200_OK
            )
        except DjangoValidationError as e:
            error_dict = {}
            if hasattr(e, 'message_dict'):
                for k, v in e.message_dict.items():
                    error_dict[k] = v
            else:
                error_dict['non_field_errors'] = e.messages
            return Response(error_dict, status=status.HTTP_400_BAD_REQUEST)

