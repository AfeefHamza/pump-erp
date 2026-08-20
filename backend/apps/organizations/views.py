# apps/organizations/views.py
from django.http import Http404
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .models import Organisation, Outlet, OrganisationMembership, FinancialYear
from .selectors import organisations_for_user, outlets_for_user_in_organisation
from .serializers import (
    OrganisationProfileSerializer,
    OutletDetailSerializer,
    FinancialYearSerializer,
    OnboardingCompleteSerializer
)
from .services import complete_onboarding, create_outlet

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
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id):
        membership = get_organisation_membership(request.user, org_id)
        outlets = outlets_for_user_in_organisation(request.user, membership.organisation)
        serializer = OutletDetailSerializer(outlets, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request, org_id):
        membership = get_organisation_membership(request.user, org_id)
        if membership.membership_type not in [OrganisationMembership.TYPE_OWNER, OrganisationMembership.TYPE_ADMINISTRATOR]:
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        serializer = OutletDetailSerializer(data=request.data)
        if serializer.is_valid():
            try:
                outlet = create_outlet(
                    organisation=membership.organisation,
                    name=serializer.validated_data['name'],
                    code=serializer.validated_data['code'],
                    **serializer.validated_data
                )
                return Response(OutletDetailSerializer(outlet).data, status=status.HTTP_201_CREATED)
            except DjangoValidationError as e:
                return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class OutletDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id, outlet_id):
        membership = get_organisation_membership(request.user, org_id)
        
        try:
            if membership.membership_type in [OrganisationMembership.TYPE_OWNER, OrganisationMembership.TYPE_ADMINISTRATOR]:
                outlet = Outlet.objects.get(organisation=membership.organisation, id=outlet_id)
            else:
                outlet = Outlet.objects.get(
                    organisation=membership.organisation,
                    id=outlet_id,
                    outlet_accesses__membership=membership
                )
        except Outlet.DoesNotExist:
            raise Http404()

        serializer = OutletDetailSerializer(outlet)
        return Response(serializer.data, status=status.HTTP_200_OK)


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
