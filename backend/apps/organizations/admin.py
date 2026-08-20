# apps/organizations/admin.py
from django.contrib import admin
from .models import Organisation, Outlet, OrganisationMembership, OutletAccess

@admin.register(Organisation)
class OrganisationAdmin(admin.ModelAdmin):
    list_display = ('name', 'code', 'status', 'default_currency', 'timezone', 'created_at', 'updated_at')
    list_filter = ('status', 'default_currency')
    search_fields = ('name', 'code', 'legal_name')
    readonly_fields = ('created_at', 'updated_at')


@admin.register(Outlet)
class OutletAdmin(admin.ModelAdmin):
    list_display = ('name', 'code', 'organisation', 'status', 'city', 'state', 'created_at', 'updated_at')
    list_filter = ('status', 'organisation', 'state')
    search_fields = ('name', 'code', 'city', 'state', 'organisation__name')
    readonly_fields = ('created_at', 'updated_at')


@admin.register(OrganisationMembership)
class OrganisationMembershipAdmin(admin.ModelAdmin):
    list_display = ('user', 'organisation', 'membership_type', 'status', 'joined_at', 'created_at', 'updated_at')
    list_filter = ('membership_type', 'status', 'organisation')
    search_fields = ('user__email', 'user__username', 'organisation__name', 'organisation__code')
    readonly_fields = ('created_at', 'updated_at')


@admin.register(OutletAccess)
class OutletAccessAdmin(admin.ModelAdmin):
    list_display = ('membership', 'outlet', 'get_organisation', 'created_at')
    list_filter = ('outlet__organisation', 'outlet')
    search_fields = ('membership__user__email', 'outlet__name', 'outlet__organisation__name')
    readonly_fields = ('created_at',)

    def get_organisation(self, obj):
        return obj.outlet.organisation.name
    get_organisation.short_description = 'Organisation'
