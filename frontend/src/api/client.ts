// frontend/src/api/client.ts

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api/v1';

let cachedCsrfToken: string | null = null;

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
  return null;
}

export function setCachedCsrfToken(token: string) {
  cachedCsrfToken = token;
}

export function getCachedCsrfToken(): string | null {
  return getCookie('csrftoken') || cachedCsrfToken;
}

export interface ApiErrorDetail {
  [key: string]: string[] | string | undefined;
}

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export interface HealthResponse {
  status: 'ok' | 'unavailable';
  service: string;
  database?: 'connected' | 'unavailable';
}

export interface OutletResponse {
  id: string;
  name: string;
  code: string;
}

export interface OrganisationResponse {
  id: string;
  name: string;
  code: string;
  membership_type: 'owner' | 'administrator' | 'member';
  outlets: OutletResponse[];
  onboarding_status: 'not_started' | 'in_progress' | 'completed';
}

export interface UserResponse {
  id: string;
  email: string;
  display_name: string;
  phone_number: string | null;
  organisations: OrganisationResponse[];
}

export interface CsrfResponse {
  csrfToken: string;
}

export interface PasswordResetRequestData {
  email: string;
}

export interface PasswordResetConfirmData {
  uid: string;
  token: string;
  password: string;
  password_confirm: string;
}

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const method = options.method || 'GET';
  const headers = new Headers(options.headers);

  // Set credentials to include cookies
  options.credentials = 'include';

  // For unsafe methods, insert CSRF token
  if (!['GET', 'HEAD', 'OPTIONS', 'TRACE'].includes(method.toUpperCase())) {
    const csrfToken = getCachedCsrfToken();
    if (csrfToken) {
      headers.set('X-CSRFToken', csrfToken);
    }
  }

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  options.headers = headers;

  const response = await fetch(url, options);

  if (response.status === 401) {
    const errorData = await response.json().catch(() => ({}));
    throw new ApiError('Unauthorized', 401, errorData);
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message = errorData.detail || errorData.non_field_errors?.[0] || 'An API error occurred';
    throw new ApiError(message, response.status, errorData);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

/**
 * Checks the backend API service and database connectivity health status.
 */
export async function checkHealth(): Promise<HealthResponse> {
  const response = await fetch(`${BASE_URL}/health/`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok && response.status !== 503) {
    throw new Error(`API health check failed with status: ${response.status}`);
  }

  return response.json();
}

/**
 * Fetch and initialize CSRF token.
 */
export async function fetchCsrfToken(): Promise<CsrfResponse> {
  const data = await apiRequest<CsrfResponse>('/auth/csrf/');
  setCachedCsrfToken(data.csrfToken);
  return data;
}

/**
 * Login view.
 */
export async function loginUser(payload: unknown): Promise<UserResponse> {
  return apiRequest<UserResponse>('/auth/login/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Signup view.
 */
export async function signupUser(payload: unknown): Promise<UserResponse> {
  return apiRequest<UserResponse>('/auth/signup/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Logout view.
 */
export async function logoutUser(): Promise<{ detail: string }> {
  return apiRequest<{ detail: string }>('/auth/logout/', {
    method: 'POST',
  });
}

/**
 * Fetch current user context.
 */
export async function fetchCurrentUser(): Promise<UserResponse> {
  return apiRequest<UserResponse>('/auth/me/');
}

/**
 * Request password reset email.
 */
export async function requestPasswordReset(payload: PasswordResetRequestData): Promise<{ detail: string }> {
  return apiRequest<{ detail: string }>('/auth/password-reset/request/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Confirm password reset using token and uid.
 */
export async function confirmPasswordReset(payload: PasswordResetConfirmData): Promise<{ detail: string }> {
  return apiRequest<{ detail: string }>('/auth/password-reset/confirm/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export interface FinancialYearResponse {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: 'open' | 'closed';
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface OrganisationProfile {
  id: string;
  name: string;
  code: string;
  status: string;
  default_currency: string;
  timezone: string;
  legal_name: string | null;
  trade_name: string | null;
  phone_number: string | null;
  email: string | null;
  gstin: string | null;
  pan: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  district: string | null;
  state: string | null;
  postal_code: string | null;
  onboarding_status: 'not_started' | 'in_progress' | 'completed';
  onboarding_completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OutletDetail {
  id: string;
  name: string;
  code: string;
  status: string;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  district: string | null;
  state: string | null;
  postal_code: string | null;
  phone_number: string | null;
  outlet_type: 'fuel_station' | 'fuel_and_ev' | 'ev_station' | 'other';
  operating_brand_code: string | null;
  operating_brand_name: string | null;
  dealer_code: string | null;
  email: string | null;
  created_at: string;
  updated_at: string;
}

export interface OnboardingCompletePayload {
  org_data: Partial<OrganisationProfile>;
  outlet_data: Partial<OutletDetail>;
  fy_data: Partial<FinancialYearResponse>;
}

export interface OnboardingCompleteResponse {
  organisation: OrganisationProfile;
  outlet: OutletDetail;
  financial_year: FinancialYearResponse;
}

export interface OnboardingStatusResponse {
  organisation_id: string;
  onboarding_status: 'not_started' | 'in_progress' | 'completed';
  onboarding_completed_at: string | null;
}

/**
 * Fetch all organisations for authenticated user.
 */
export async function fetchOrganisations(): Promise<OrganisationProfile[]> {
  return apiRequest<OrganisationProfile[]>('/organisations/');
}

/**
 * Fetch a single organization.
 */
export async function fetchOrganisation(orgId: string): Promise<OrganisationProfile> {
  return apiRequest<OrganisationProfile>(`/organisations/${orgId}/`);
}

/**
 * Update an organization.
 */
export async function updateOrganisation(orgId: string, payload: Partial<OrganisationProfile>): Promise<OrganisationProfile> {
  return apiRequest<OrganisationProfile>(`/organisations/${orgId}/`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

/**
 * List outlets in organisation.
 */
export async function fetchOutlets(orgId: string): Promise<OutletDetail[]> {
  return apiRequest<OutletDetail[]>(`/organisations/${orgId}/outlets/`);
}

/**
 * Create a new outlet.
 */
export async function createOutlet(orgId: string, payload: Partial<OutletDetail>): Promise<OutletDetail> {
  return apiRequest<OutletDetail>(`/organisations/${orgId}/outlets/`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Update an outlet.
 */
export async function updateOutlet(
  orgId: string,
  outletId: string,
  payload: Partial<OutletDetail>
): Promise<OutletDetail> {
  return apiRequest<OutletDetail>(`/organisations/${orgId}/outlets/${outletId}/`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

/**
 * Fetch a single outlet.
 */
export async function fetchOutlet(orgId: string, outletId: string): Promise<OutletDetail> {
  return apiRequest<OutletDetail>(`/organisations/${orgId}/outlets/${outletId}/`);
}

/**
 * Get onboarding status.
 */
export async function fetchOnboardingStatus(orgId: string): Promise<OnboardingStatusResponse> {
  return apiRequest<OnboardingStatusResponse>(`/organisations/${orgId}/onboarding/status/`);
}

/**
 * Complete onboarding.
 */
export async function completeOnboarding(orgId: string, payload: OnboardingCompletePayload): Promise<OnboardingCompleteResponse> {
  return apiRequest<OnboardingCompleteResponse>(`/organisations/${orgId}/onboarding/complete/`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Fetch financial years.
 */
export async function fetchFinancialYears(orgId: string): Promise<FinancialYearResponse[]> {
  return apiRequest<FinancialYearResponse[]>(`/organisations/${orgId}/financial-years/`);
}

export interface PermissionResponse {
  id: string;
  code: string;
  name: string;
  module: string;
  description: string | null;
  is_active: boolean;
}

export interface RoleResponse {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  is_active: boolean;
  permissions: string[];
  created_at: string;
  updated_at: string;
}

export interface UserMiniResponse {
  id: string;
  email: string;
  display_name: string;
  phone_number: string | null;
}

export interface MembershipResponse {
  id: string;
  user: UserMiniResponse;
  membership_type: 'owner' | 'administrator' | 'member';
  status: 'invited' | 'active' | 'suspended';
  joined_at: string | null;
  roles: RoleResponse[];
  outlets: OutletDetail[];
  created_at: string;
  updated_at: string;
}

export interface ActivationResponse {
  id: string;
  email: string;
  display_name: string;
  phone_number: string | null;
  membership_type: 'administrator' | 'member';
  status: 'pending' | 'activated' | 'revoked' | 'expired';
  expires_at: string;
  activated_at: string | null;
  created_at: string;
  roles: RoleResponse[];
  outlets: OutletDetail[];
  invited_by: UserMiniResponse;
}

export interface PublicActivationResponse {
  organisation_name: string;
  email: string;
  display_name: string;
  phone_number: string | null;
  membership_type: 'administrator' | 'member';
  status: string;
}

/**
 * Fetch PermissionDefinitions grouped by module.
 */
export async function fetchPermissions(orgId: string): Promise<Record<string, PermissionResponse[]>> {
  return apiRequest<Record<string, PermissionResponse[]>>(`/organisations/${orgId}/permissions/`);
}

/**
 * Fetch the authenticated user's effective permissions for selected organisation.
 */
export async function fetchEffectivePermissions(orgId: string): Promise<{ permissions: string[] }> {
  return apiRequest<{ permissions: string[] }>(`/organisations/${orgId}/effective-permissions/`);
}

/**
 * Fetch all roles.
 */
export async function fetchRoles(orgId: string): Promise<RoleResponse[]> {
  return apiRequest<RoleResponse[]>(`/organisations/${orgId}/roles/`);
}

/**
 * Create a custom role.
 */
export async function createRole(orgId: string, payload: Partial<RoleResponse>): Promise<RoleResponse> {
  return apiRequest<RoleResponse>(`/organisations/${orgId}/roles/`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Update a custom role.
 */
export async function updateRole(orgId: string, roleId: string, payload: Partial<RoleResponse>): Promise<RoleResponse> {
  return apiRequest<RoleResponse>(`/organisations/${orgId}/roles/${roleId}/`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

/**
 * Delete a custom role.
 */
export async function deleteRole(orgId: string, roleId: string): Promise<void> {
  return apiRequest<void>(`/organisations/${orgId}/roles/${roleId}/`, {
    method: 'DELETE',
  });
}

/**
 * Fetch memberships.
 */
export async function fetchMemberships(orgId: string, params?: { status?: string }): Promise<MembershipResponse[]> {
  const query = params?.status ? `?status=${params.status}` : '';
  return apiRequest<MembershipResponse[]>(`/organisations/${orgId}/memberships/${query}`);
}

/**
 * Fetch a single membership.
 */
export async function fetchMembership(orgId: string, membershipId: string): Promise<MembershipResponse> {
  return apiRequest<MembershipResponse>(`/organisations/${orgId}/memberships/${membershipId}/`);
}

/**
 * Update membership access.
 */
export async function updateMembershipAccess(
  orgId: string,
  membershipId: string,
  payload: { roles: string[]; outlets: string[] }
): Promise<MembershipResponse> {
  return apiRequest<MembershipResponse>(`/organisations/${orgId}/memberships/${membershipId}/`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

/**
 * Suspend a membership.
 */
export async function suspendMembership(orgId: string, membershipId: string): Promise<MembershipResponse> {
  return apiRequest<MembershipResponse>(`/organisations/${orgId}/memberships/${membershipId}/suspend-reactivate/`, {
    method: 'POST',
    body: JSON.stringify({ action: 'suspend' }),
  });
}

/**
 * Reactivate a membership.
 */
export async function reactivateMembership(orgId: string, membershipId: string): Promise<MembershipResponse> {
  return apiRequest<MembershipResponse>(`/organisations/${orgId}/memberships/${membershipId}/suspend-reactivate/`, {
    method: 'POST',
    body: JSON.stringify({ action: 'reactivate' }),
  });
}

/**
 * Fetch activations.
 */
export async function fetchActivations(orgId: string): Promise<ActivationResponse[]> {
  return apiRequest<ActivationResponse[]>(`/organisations/${orgId}/activations/`);
}

/**
 * Add a new user.
 */
export async function addUser(
  orgId: string,
  payload: {
    email: string;
    display_name: string;
    phone_number?: string;
    membership_type: 'administrator' | 'member';
    roles: string[];
    outlets: string[];
  }
): Promise<ActivationResponse> {
  return apiRequest<ActivationResponse>(`/organisations/${orgId}/activations/`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Resend or replace activation.
 */
export async function resendActivation(orgId: string, activationId: string): Promise<ActivationResponse> {
  return apiRequest<ActivationResponse>(`/organisations/${orgId}/activations/${activationId}/action/`, {
    method: 'POST',
    body: JSON.stringify({ action: 'resend' }),
  });
}

/**
 * Revoke activation.
 */
export async function revokeActivation(orgId: string, activationId: string): Promise<ActivationResponse> {
  return apiRequest<ActivationResponse>(`/organisations/${orgId}/activations/${activationId}/action/`, {
    method: 'POST',
    body: JSON.stringify({ action: 'revoke' }),
  });
}

/**
 * Inspect public activation token.
 */
export async function inspectPublicActivation(token: string): Promise<PublicActivationResponse> {
  return apiRequest<PublicActivationResponse>(`/organisations/activations/public/inspect/?token=${token}`);
}

/**
 * Submit public activation.
 */
export async function submitPublicActivation(payload: { token: string; password?: string }): Promise<UserResponse> {
  return apiRequest<UserResponse>(`/organisations/activations/public/submit/`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

