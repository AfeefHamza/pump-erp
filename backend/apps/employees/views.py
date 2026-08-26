# apps/employees/views.py
from django.http import Http404
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction, models
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from apps.organizations.views import get_organisation_membership
from apps.organizations.permissions import HasGranularPermission, require_permission
from apps.forecourt.views import handle_django_validation_error

from .models import Employee, EmployeeDesignation, EmployeeOutletAssignment
from .serializers import (
    EmployeeSerializer, EmployeeDesignationSerializer, EmployeeOutletAssignmentSerializer
)
from .services import (
    create_employee, update_employee, deactivate_employee,
    assign_employee_to_outlets, create_designation
)

class EmployeeListCreateView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]
    required_permission = 'employee.view'

    def get(self, request, org_id):
        membership = get_organisation_membership(request.user, org_id)
        queryset = Employee.objects.filter(organisation=membership.organisation)

        search_query = request.query_params.get('search', '').strip()
        if search_query:
            queryset = queryset.filter(
                models.Q(display_name__icontains=search_query) | 
                models.Q(employee_code__icontains=search_query)
            )

        status_filter = request.query_params.get('status', '').strip().lower()
        if status_filter in ['active', 'inactive']:
            queryset = queryset.filter(status=status_filter)

        designation_filter = request.query_params.get('designation', '').strip()
        if designation_filter:
            queryset = queryset.filter(designation_id=designation_filter)

        outlet_filter = request.query_params.get('outlet', '').strip()
        if outlet_filter:
            queryset = queryset.filter(outlet_assignments__outlet_id=outlet_filter)

        serializer = EmployeeSerializer(queryset.distinct(), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request, org_id):
        membership = get_organisation_membership(request.user, org_id)
        require_permission(request.user, org_id, 'employee.create')

        serializer = EmployeeSerializer(data=request.data)
        if serializer.is_valid():
            desig_id = serializer.validated_data.pop('designation_id')
            try:
                designation = EmployeeDesignation.objects.get(id=desig_id, organisation=membership.organisation)
            except EmployeeDesignation.DoesNotExist:
                return Response({'designation_id': ["Designation not found in this organisation."]}, status=status.HTTP_400_BAD_REQUEST)

            try:
                with transaction.atomic():
                    employee = create_employee(
                        organisation=membership.organisation,
                        designation=designation,
                        created_by=request.user,
                        updated_by=request.user,
                        **serializer.validated_data
                    )

                    # Handle outlet assignments if passed in post data
                    assignments_data = request.data.get('outlet_assignments', [])
                    if assignments_data:
                        assign_employee_to_outlets(employee, assignments_data)

                return Response(EmployeeSerializer(employee).data, status=status.HTTP_201_CREATED)
            except DjangoValidationError as e:
                return handle_django_validation_error(e)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class EmployeeDetailView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]
    required_permission = 'employee.view'

    def get_object(self, org_id, employee_id):
        try:
            return Employee.objects.get(organisation_id=org_id, id=employee_id)
        except Employee.DoesNotExist:
            raise Http404()

    def get(self, request, org_id, employee_id):
        employee = self.get_object(org_id, employee_id)
        serializer = EmployeeSerializer(employee)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request, org_id, employee_id):
        employee = self.get_object(org_id, employee_id)
        
        data = request.data
        deactivating = 'status' in data and data['status'] == Employee.STATUS_INACTIVE and employee.status == Employee.STATUS_ACTIVE
        
        if deactivating:
            require_permission(request.user, org_id, 'employee.deactivate')
        else:
            require_permission(request.user, org_id, 'employee.update')

        serializer = EmployeeSerializer(employee, data=data, partial=True)
        if serializer.is_valid():
            kwargs = {}
            if 'designation_id' in serializer.validated_data:
                desig_id = serializer.validated_data.pop('designation_id')
                try:
                    kwargs['designation'] = EmployeeDesignation.objects.get(id=desig_id, organisation_id=org_id)
                except EmployeeDesignation.DoesNotExist:
                    return Response({'designation_id': ["Designation not found."]}, status=status.HTTP_400_BAD_REQUEST)

            kwargs.update(serializer.validated_data)
            kwargs['updated_by'] = request.user

            try:
                with transaction.atomic():
                    updated = update_employee(employee, **kwargs)

                    # Update outlet assignments if provided
                    if 'outlet_assignments' in request.data:
                        assignments_data = request.data['outlet_assignments']
                        # Clear existing assignments first for simplicity, or manage updates
                        EmployeeOutletAssignment.objects.filter(employee=updated).delete()
                        if assignments_data:
                            assign_employee_to_outlets(updated, assignments_data)

                # Fetch updated instance to return
                updated.refresh_from_db()
                return Response(EmployeeSerializer(updated).data, status=status.HTTP_200_OK)
            except DjangoValidationError as e:
                return handle_django_validation_error(e)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class EmployeeOutletAssignmentView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]
    required_permission = 'employee.update'

    def post(self, request, org_id, employee_id):
        try:
            employee = Employee.objects.get(organisation_id=org_id, id=employee_id)
        except Employee.DoesNotExist:
            raise Http404()

        assignments_data = request.data.get('assignments', [])
        try:
            with transaction.atomic():
                assignments = assign_employee_to_outlets(employee, assignments_data)
            serializer = EmployeeOutletAssignmentSerializer(assignments, many=True)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            return handle_django_validation_error(e)


class EmployeeDesignationListCreateView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]
    required_permission = 'employee_designation.view'

    def get(self, request, org_id):
        membership = get_organisation_membership(request.user, org_id)
        queryset = EmployeeDesignation.objects.filter(organisation=membership.organisation)

        search_query = request.query_params.get('search', '').strip()
        if search_query:
            queryset = queryset.filter(
                models.Q(name__icontains=search_query) |
                models.Q(code__icontains=search_query)
            )

        serializer = EmployeeDesignationSerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request, org_id):
        membership = get_organisation_membership(request.user, org_id)
        require_permission(request.user, org_id, 'employee_designation.create')

        serializer = EmployeeDesignationSerializer(data=request.data)
        if serializer.is_valid():
            code = serializer.validated_data.get('code')
            name = serializer.validated_data.get('name')

            # Uniqueness checks
            if EmployeeDesignation.objects.filter(organisation=membership.organisation, code__iexact=code).exists():
                return Response({'code': ["A designation with this code already exists."]}, status=status.HTTP_400_BAD_REQUEST)
            if EmployeeDesignation.objects.filter(organisation=membership.organisation, name__iexact=name).exists():
                return Response({'name': ["A designation with this name already exists."]}, status=status.HTTP_400_BAD_REQUEST)

            try:
                designation = create_designation(
                    organisation=membership.organisation,
                    **serializer.validated_data
                )
                return Response(EmployeeDesignationSerializer(designation).data, status=status.HTTP_201_CREATED)
            except DjangoValidationError as e:
                return handle_django_validation_error(e)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class EmployeeDesignationDetailView(APIView):
    permission_classes = [IsAuthenticated, HasGranularPermission]
    required_permission = 'employee_designation.view'

    def get_object(self, org_id, designation_id):
        try:
            return EmployeeDesignation.objects.get(organisation_id=org_id, id=designation_id)
        except EmployeeDesignation.DoesNotExist:
            raise Http404()

    def get(self, request, org_id, designation_id):
        designation = self.get_object(org_id, designation_id)
        serializer = EmployeeDesignationSerializer(designation)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request, org_id, designation_id):
        designation = self.get_object(org_id, designation_id)
        
        deactivating = 'is_active' in request.data and request.data['is_active'] is False and designation.is_active is True
        if deactivating:
            require_permission(request.user, org_id, 'employee_designation.deactivate')
        else:
            require_permission(request.user, org_id, 'employee_designation.update')

        serializer = EmployeeDesignationSerializer(designation, data=request.data, partial=True)
        if serializer.is_valid():
            code = serializer.validated_data.get('code')
            name = serializer.validated_data.get('name')

            # Uniqueness check excluding self
            if code and EmployeeDesignation.objects.filter(organisation_id=org_id, code__iexact=code).exclude(id=designation_id).exists():
                return Response({'code': ["A designation with this code already exists."]}, status=status.HTTP_400_BAD_REQUEST)
            if name and EmployeeDesignation.objects.filter(organisation_id=org_id, name__iexact=name).exclude(id=designation_id).exists():
                return Response({'name': ["A designation with this name already exists."]}, status=status.HTTP_400_BAD_REQUEST)

            try:
                for attr, val in serializer.validated_data.items():
                    setattr(designation, attr, val)
                designation.save()
                return Response(EmployeeDesignationSerializer(designation).data, status=status.HTTP_200_OK)
            except DjangoValidationError as e:
                return handle_django_validation_error(e)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, org_id, designation_id):
        designation = self.get_object(org_id, designation_id)
        require_permission(request.user, org_id, 'employee_designation.deactivate') # Or direct deletion permission

        try:
            designation.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except DjangoValidationError as e:
            return handle_django_validation_error(e)
