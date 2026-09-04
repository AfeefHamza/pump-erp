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

// ==========================================
// FORECOURT SETUP MODULE TYPES & ENDPOINTS
// ==========================================

export interface FuelProduct {
  id: string;
  organisation: string;
  code: string;
  name: string;
  short_name: string | null;
  category: 'petrol' | 'diesel' | 'premium_petrol' | 'premium_diesel' | 'cng' | 'adblue' | 'other';
  custom_category_name: string | null;
  unit: 'litre' | 'kilogram';
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductPrice {
  id: string;
  organisation: string;
  outlet: string;
  product: string;
  product_name: string;
  product_code: string;
  selling_price: string;
  effective_from: string;
  effective_to: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
}

export interface CurrentPriceItem {
  product_id: string;
  product_name: string;
  product_code: string;
  selling_price: string | null;
  effective_from: string | null;
  previous_price: string | null;
  price_id: string | null;
}

export interface Tank {
  id: string;
  organisation: string;
  outlet: string;
  product: string;
  product_name: string;
  product_code: string;
  product_unit: string;
  code: string;
  name: string;
  capacity: string;
  safe_fill_capacity: string | null;
  dead_stock_level: string | null;
  low_stock_threshold: string | null;
  manufacturer: string | null;
  serial_number: string | null;
  commissioned_on: string | null;
  status: 'active' | 'inactive' | 'maintenance';
  notes: string | null;
  acknowledged_manual_dip?: boolean;
  created_at: string;
  updated_at: string;
}

export interface Dispenser {
  id: string;
  organisation: string;
  outlet: string;
  code: string;
  name: string;
  manufacturer: string | null;
  model_number: string | null;
  serial_number: string | null;
  commissioned_on: string | null;
  status: 'active' | 'inactive' | 'maintenance';
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Nozzle {
  id: string;
  organisation: string;
  outlet: string;
  dispenser: string;
  dispenser_name: string;
  dispenser_code: string;
  tank: string;
  tank_name: string;
  tank_code: string;
  product_id: string;
  product_name: string;
  product_category: string;
  code: string;
  name: string;
  nozzle_number: number | null;
  status: 'active' | 'inactive' | 'maintenance';
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ForecourtTankItem {
  id: string;
  code: string;
  name: string;
  capacity: string;
  safe_fill_capacity: string | null;
  status: string;
  product: {
    id: string;
    code: string;
    name: string;
    category: string;
    unit: string;
  };
}

export interface ForecourtNozzleItem {
  id: string;
  code: string;
  name: string;
  nozzle_number: number | null;
  status: string;
  notes: string | null;
  tank: {
    id: string;
    code: string;
    name: string;
    product: {
      id: string;
      code: string;
      name: string;
      category: string;
    };
  };
}

export interface ForecourtDispenserItem {
  id: string;
  code: string;
  name: string;
  status: string;
  manufacturer: string | null;
  model_number: string | null;
  serial_number: string | null;
  nozzles: ForecourtNozzleItem[];
}

export interface ForecourtStructureResponse {
  outlet_id: string;
  outlet_name: string;
  tanks: ForecourtTankItem[];
  dispensers: ForecourtDispenserItem[];
}

/**
 * Fuel Products APIs
 */
export async function fetchFuelProducts(orgId: string, params?: { search?: string; status?: string }): Promise<FuelProduct[]> {
  let query = '';
  if (params) {
    const qParts: string[] = [];
    if (params.search) qParts.push(`search=${encodeURIComponent(params.search)}`);
    if (params.status) qParts.push(`status=${params.status}`);
    if (qParts.length > 0) query = `?${qParts.join('&')}`;
  }
  return apiRequest<FuelProduct[]>(`/organisations/${orgId}/fuel-products/${query}`);
}

export async function fetchFuelProduct(orgId: string, productId: string): Promise<FuelProduct> {
  return apiRequest<FuelProduct>(`/organisations/${orgId}/fuel-products/${productId}/`);
}

export async function createFuelProduct(orgId: string, payload: Partial<FuelProduct>): Promise<FuelProduct> {
  return apiRequest<FuelProduct>(`/organisations/${orgId}/fuel-products/`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateFuelProduct(orgId: string, productId: string, payload: Partial<FuelProduct>): Promise<FuelProduct> {
  return apiRequest<FuelProduct>(`/organisations/${orgId}/fuel-products/${productId}/`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

/**
 * Product Prices APIs
 */
export async function fetchCurrentProductPrices(orgId: string, outletId: string): Promise<CurrentPriceItem[]> {
  return apiRequest<CurrentPriceItem[]>(`/organisations/${orgId}/outlets/${outletId}/product-prices/`);
}

export async function setProductPrices(
  orgId: string,
  outletId: string,
  payload: { effective_from?: string | null; prices: { product_id: string; selling_price: number | string }[] }
): Promise<ProductPrice[]> {
  return apiRequest<ProductPrice[]>(`/organisations/${orgId}/outlets/${outletId}/product-prices/`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchProductPriceHistory(orgId: string, outletId: string, productId: string): Promise<ProductPrice[]> {
  return apiRequest<ProductPrice[]>(`/organisations/${orgId}/outlets/${outletId}/product-prices/${productId}/history/`);
}

/**
 * Tanks APIs
 */
export async function fetchTanks(orgId: string, outletId: string, params?: { search?: string; status?: string }): Promise<Tank[]> {
  let query = '';
  if (params) {
    const qParts: string[] = [];
    if (params.search) qParts.push(`search=${encodeURIComponent(params.search)}`);
    if (params.status) qParts.push(`status=${params.status}`);
    if (qParts.length > 0) query = `?${qParts.join('&')}`;
  }
  return apiRequest<Tank[]>(`/organisations/${orgId}/outlets/${outletId}/tanks/${query}`);
}

export async function fetchTank(orgId: string, outletId: string, tankId: string): Promise<Tank> {
  return apiRequest<Tank>(`/organisations/${orgId}/outlets/${outletId}/tanks/${tankId}/`);
}

export async function createTank(orgId: string, outletId: string, payload: Partial<Tank>): Promise<Tank> {
  return apiRequest<Tank>(`/organisations/${orgId}/outlets/${outletId}/tanks/`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateTank(orgId: string, outletId: string, tankId: string, payload: Partial<Tank>): Promise<Tank> {
  return apiRequest<Tank>(`/organisations/${orgId}/outlets/${outletId}/tanks/${tankId}/`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

/**
 * Dispensers APIs
 */
export async function fetchDispensers(orgId: string, outletId: string, params?: { search?: string; status?: string }): Promise<Dispenser[]> {
  let query = '';
  if (params) {
    const qParts: string[] = [];
    if (params.search) qParts.push(`search=${encodeURIComponent(params.search)}`);
    if (params.status) qParts.push(`status=${params.status}`);
    if (qParts.length > 0) query = `?${qParts.join('&')}`;
  }
  return apiRequest<Dispenser[]>(`/organisations/${orgId}/outlets/${outletId}/dispensers/${query}`);
}

export async function fetchDispenser(orgId: string, outletId: string, dispenserId: string): Promise<Dispenser> {
  return apiRequest<Dispenser>(`/organisations/${orgId}/outlets/${outletId}/dispensers/${dispenserId}/`);
}

export async function createDispenser(orgId: string, outletId: string, payload: Partial<Dispenser>): Promise<Dispenser> {
  return apiRequest<Dispenser>(`/organisations/${orgId}/outlets/${outletId}/dispensers/`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateDispenser(orgId: string, outletId: string, dispenserId: string, payload: Partial<Dispenser>): Promise<Dispenser> {
  return apiRequest<Dispenser>(`/organisations/${orgId}/outlets/${outletId}/dispensers/${dispenserId}/`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

/**
 * Nozzles APIs
 */
export async function fetchNozzles(orgId: string, outletId: string, params?: { search?: string; status?: string }): Promise<Nozzle[]> {
  let query = '';
  if (params) {
    const qParts: string[] = [];
    if (params.search) qParts.push(`search=${encodeURIComponent(params.search)}`);
    if (params.status) qParts.push(`status=${params.status}`);
    if (qParts.length > 0) query = `?${qParts.join('&')}`;
  }
  return apiRequest<Nozzle[]>(`/organisations/${orgId}/outlets/${outletId}/nozzles/${query}`);
}

export async function fetchNozzle(orgId: string, outletId: string, nozzleId: string): Promise<Nozzle> {
  return apiRequest<Nozzle>(`/organisations/${orgId}/outlets/${outletId}/nozzles/${nozzleId}/`);
}

export async function createNozzle(orgId: string, outletId: string, payload: Partial<Nozzle>): Promise<Nozzle> {
  return apiRequest<Nozzle>(`/organisations/${orgId}/outlets/${outletId}/nozzles/`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateNozzle(orgId: string, outletId: string, nozzleId: string, payload: Partial<Nozzle>): Promise<Nozzle> {
  return apiRequest<Nozzle>(`/organisations/${orgId}/outlets/${outletId}/nozzles/${nozzleId}/`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

/**
 * Forecourt complete structure
 */
export async function fetchForecourtStructure(orgId: string, outletId: string): Promise<ForecourtStructureResponse> {
  return apiRequest<ForecourtStructureResponse>(`/organisations/${orgId}/outlets/${outletId}/forecourt/`);
}

/**
 * Milestone 8 Types
 */
export interface EmployeeDesignation {
  id: string;
  organisation: string;
  code: string;
  name: string;
  description: string | null;
  requires_nozzle_assignment: boolean;
  is_system: boolean;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface EmployeeOutletAssignment {
  id: string;
  employee: string;
  outlet_id: string;
  outlet_details?: any;
  is_primary: boolean;
  effective_from: string | null;
  effective_to: string | null;
  created_at: string;
}

export interface Employee {
  id: string;
  organisation: string;
  employee_code: string;
  display_name: string;
  phone_number: string | null;
  alternate_phone_number: string | null;
  address: string | null;
  date_of_birth: string | null;
  joined_on: string | null;
  left_on: string | null;
  designation_id: string;
  designation_details: EmployeeDesignation;
  status: 'active' | 'inactive';
  notes: string | null;
  outlet_assignments?: EmployeeOutletAssignment[];
  created_at: string;
  updated_at: string;
}

export interface ShiftDefinition {
  id: string;
  organisation: string;
  outlet: string;
  code: string;
  name: string;
  starts_at: string;
  ends_at: string;
  crosses_midnight: boolean;
  display_order: number;
  is_active: boolean;
  notes: string | null;
  duration_display?: string;
  created_at: string;
  updated_at: string;
}

export interface ShiftNozzleAssignment {
  id: string;
  nozzle_id: string;
  nozzle_details?: any;
  created_at: string;
}

export interface ShiftStaffAssignment {
  id: string;
  roster: string;
  employee_id: string;
  employee_details: Employee;
  duty_designation_id: string;
  duty_designation_details: EmployeeDesignation;
  is_primary_cashier: boolean;
  nozzle_assignments: ShiftNozzleAssignment[];
  notes: string | null;
  created_at: string;
}

export interface ShiftRoster {
  id: string;
  organisation: string;
  outlet: string;
  shift_definition_id: string;
  shift_definition_details: ShiftDefinition;
  business_date: string;
  is_locked: boolean;
  notes: string | null;
  staff_assignments: ShiftStaffAssignment[];
  created_at: string;
  updated_at: string;
}

export interface RosterWorkspaceResponse {
  exists: boolean;
  roster?: ShiftRoster;
  available_staff?: Employee[];
  nozzles: Array<{
    id: string;
    code: string;
    name: string;
    dispenser_id: string;
    dispenser_name: string;
    product_name: string;
    tank_code: string;
    assigned_to_staff_id: string | null;
    is_assigned: boolean;
  }>;
}

export interface DipCalibrationPoint {
  id: string;
  chart: string;
  height_mm: string;
  volume_litres: string;
  sequence: number;
}

export interface DipCalibrationChart {
  id: string;
  organisation: string;
  name: string;
  description: string | null;
  nominal_capacity: string;
  tank_diameter: string | null;
  tank_length: string | null;
  manufacturer_or_source: string | null;
  source_filename: string | null;
  source_file: string | null;
  source_checksum: string | null;
  original_height_unit: 'millimetre' | 'centimetre' | 'inch';
  normalized_height_unit: string;
  volume_unit: string;
  lookup_mode: 'exact_only' | 'linear_interpolation';
  status: 'draft' | 'active' | 'archived';
  points?: DipCalibrationPoint[];
  point_count: number;
  created_at: string;
  updated_at: string;
}

export interface TankCalibrationAssignment {
  id: string;
  organisation: string;
  outlet: string;
  tank_id: string;
  tank_details?: any;
  chart_id: string;
  chart_details?: DipCalibrationChart;
  effective_from: string;
  effective_to: string | null;
  assigned_by?: string;
  created_at: string;
}

export interface NozzleOpeningBalance {
  id: string;
  batch: string;
  nozzle_id: string;
  nozzle_details?: any;
  totalizer_reading: string;
  notes: string | null;
  created_at: string;
}

export interface TankOpeningBalance {
  id: string;
  batch: string;
  tank_id: string;
  tank_details?: any;
  book_quantity: string;
  physical_quantity: string;
  raw_dip_value: string | null;
  raw_dip_unit: string | null;
  calibration_assignment?: string;
  density: string | null;
  conversion_method: 'calibration_exact' | 'calibration_interpolated' | 'manual_quantity';
  manual_quantity_reason: string | null;
  notes: string | null;
  created_at: string;
}

export interface OpeningBalanceBatch {
  id: string;
  organisation: string;
  outlet: string;
  effective_at: string;
  status: 'preparing' | 'confirmed';
  notes: string | null;
  nozzle_balances: NozzleOpeningBalance[];
  tank_balances: TankOpeningBalance[];
  created_by?: string;
  confirmed_by?: string;
  created_at: string;
  confirmed_at?: string;
}

export interface OpeningBalanceBatchResponse {
  exists: boolean;
  batch?: OpeningBalanceBatch;
}

export interface OutletReadinessCheck {
  ready: boolean;
  checks: Array<{
    id: string;
    name: string;
    passed: boolean;
    details: string;
  }>;
  missing_requirements: string[];
  warnings: string[];
  resolution_links: Record<string, string>;
}

/**
 * Employees APIs
 */
export async function fetchEmployees(orgId: string, params?: { search?: string; status?: string; designation?: string; outlet?: string }): Promise<Employee[]> {
  let query = '';
  if (params) {
    const qParts: string[] = [];
    if (params.search) qParts.push(`search=${encodeURIComponent(params.search)}`);
    if (params.status) qParts.push(`status=${params.status}`);
    if (params.designation) qParts.push(`designation=${params.designation}`);
    if (params.outlet) qParts.push(`outlet=${params.outlet}`);
    if (qParts.length > 0) query = `?${qParts.join('&')}`;
  }
  return apiRequest<Employee[]>(`/organisations/${orgId}/employees/${query}`);
}

export async function fetchEmployee(orgId: string, employeeId: string): Promise<Employee> {
  return apiRequest<Employee>(`/organisations/${orgId}/employees/${employeeId}/`);
}

export async function createEmployee(orgId: string, payload: any): Promise<Employee> {
  return apiRequest<Employee>(`/organisations/${orgId}/employees/`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateEmployee(orgId: string, employeeId: string, payload: any): Promise<Employee> {
  return apiRequest<Employee>(`/organisations/${orgId}/employees/${employeeId}/`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

/**
 * Designations APIs
 */
export async function fetchDesignations(orgId: string, params?: { search?: string }): Promise<EmployeeDesignation[]> {
  let query = '';
  if (params && params.search) {
    query = `?search=${encodeURIComponent(params.search)}`;
  }
  return apiRequest<EmployeeDesignation[]>(`/organisations/${orgId}/designations/${query}`);
}

export async function fetchDesignation(orgId: string, designationId: string): Promise<EmployeeDesignation> {
  return apiRequest<EmployeeDesignation>(`/organisations/${orgId}/designations/${designationId}/`);
}

export async function createDesignation(orgId: string, payload: any): Promise<EmployeeDesignation> {
  return apiRequest<EmployeeDesignation>(`/organisations/${orgId}/designations/`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateDesignation(orgId: string, designationId: string, payload: any): Promise<EmployeeDesignation> {
  return apiRequest<EmployeeDesignation>(`/organisations/${orgId}/designations/${designationId}/`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteDesignation(orgId: string, designationId: string): Promise<void> {
  return apiRequest<void>(`/organisations/${orgId}/designations/${designationId}/`, {
    method: 'DELETE',
  });
}

/**
 * Shift Setup APIs
 */
export interface FetchShiftsResponse {
  shifts: ShiftDefinition[];
  warnings: any[];
}

export async function fetchShiftDefinitions(orgId: string, outletId: string, params?: { status?: string }): Promise<FetchShiftsResponse> {
  let query = '';
  if (params && params.status) {
    query = `?status=${params.status}`;
  }
  return apiRequest<FetchShiftsResponse>(`/organisations/${orgId}/outlets/${outletId}/shifts/${query}`);
}

export async function fetchShiftDefinition(orgId: string, outletId: string, shiftId: string): Promise<ShiftDefinition> {
  return apiRequest<ShiftDefinition>(`/organisations/${orgId}/outlets/${outletId}/shifts/${shiftId}/`);
}

export async function createShiftDefinition(orgId: string, outletId: string, payload: any): Promise<FetchShiftsResponse> {
  return apiRequest<FetchShiftsResponse>(`/organisations/${orgId}/outlets/${outletId}/shifts/`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateShiftDefinition(orgId: string, outletId: string, shiftId: string, payload: any): Promise<FetchShiftsResponse> {
  return apiRequest<FetchShiftsResponse>(`/organisations/${orgId}/outlets/${outletId}/shifts/${shiftId}/`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

/**
 * Shift Assignments & Rosters APIs
 */
export async function fetchRosterWorkspace(orgId: string, outletId: string, date: string, shiftDefId: string): Promise<RosterWorkspaceResponse> {
  return apiRequest<RosterWorkspaceResponse>(`/organisations/${orgId}/outlets/${outletId}/rosters/?business_date=${date}&shift_definition_id=${shiftDefId}`);
}

export async function saveRosterWorkspace(orgId: string, outletId: string, payload: any): Promise<RosterWorkspaceResponse> {
  return apiRequest<RosterWorkspaceResponse>(`/organisations/${orgId}/outlets/${outletId}/rosters/`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Opening Balances APIs
 */
export async function fetchOpeningBalanceBatch(orgId: string, outletId: string): Promise<OpeningBalanceBatchResponse> {
  return apiRequest<OpeningBalanceBatchResponse>(`/organisations/${orgId}/outlets/${outletId}/opening-balances/batches/`);
}

export async function createOpeningBalanceBatch(orgId: string, outletId: string, payload: any): Promise<OpeningBalanceBatch> {
  return apiRequest<OpeningBalanceBatch>(`/organisations/${orgId}/outlets/${outletId}/opening-balances/batches/`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function saveOpeningBalanceEntries(orgId: string, outletId: string, payload: any): Promise<OpeningBalanceBatch> {
  return apiRequest<OpeningBalanceBatch>(`/organisations/${orgId}/outlets/${outletId}/opening-balances/entries/`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchOpeningBalancePreview(orgId: string, outletId: string, batchId: string): Promise<any> {
  return apiRequest<any>(`/organisations/${orgId}/outlets/${outletId}/opening-balances/batches/${batchId}/preview/`);
}

export async function confirmOpeningBalanceBatch(orgId: string, outletId: string, batchId: string): Promise<OpeningBalanceBatch> {
  return apiRequest<OpeningBalanceBatch>(`/organisations/${orgId}/outlets/${outletId}/opening-balances/batches/${batchId}/confirm/`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

/**
 * Dip Calibrations APIs
 */
export async function uploadCalibrationPreview(orgId: string, file: File): Promise<any> {
  const formData = new FormData();
  formData.append('file', file);
  return apiRequest<any>(`/organisations/${orgId}/calibrations/preview/`, {
    method: 'POST',
    body: formData,
  });
}

export async function importCalibrationChart(orgId: string, payload: FormData): Promise<DipCalibrationChart> {
  return apiRequest<DipCalibrationChart>(`/organisations/${orgId}/calibrations/import/`, {
    method: 'POST',
    body: payload,
  });
}

export async function fetchCalibrationCharts(orgId: string, params?: { status?: string }): Promise<DipCalibrationChart[]> {
  let query = '';
  if (params && params.status) {
    query = `?status=${params.status}`;
  }
  return apiRequest<DipCalibrationChart[]>(`/organisations/${orgId}/calibrations/charts/${query}`);
}

export async function fetchCalibrationChart(orgId: string, chartId: string): Promise<DipCalibrationChart> {
  return apiRequest<DipCalibrationChart>(`/organisations/${orgId}/calibrations/charts/${chartId}/`);
}

export async function activateCalibrationChart(orgId: string, chartId: string): Promise<DipCalibrationChart> {
  return apiRequest<DipCalibrationChart>(`/organisations/${orgId}/calibrations/charts/${chartId}/`, {
    method: 'POST',
    body: JSON.stringify({ action: 'activate' }),
  });
}

export async function assignCalibrationChartToTank(orgId: string, outletId: string, payload: any): Promise<TankCalibrationAssignment> {
  return apiRequest<TankCalibrationAssignment>(`/organisations/${orgId}/outlets/${outletId}/tanks/calibrations/assign/`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchTankCalibrationHistory(orgId: string, outletId: string, tankId: string): Promise<TankCalibrationAssignment[]> {
  return apiRequest<TankCalibrationAssignment[]>(`/organisations/${orgId}/outlets/${outletId}/tanks/${tankId}/calibrations/history/`);
}

export async function previewDipConversion(orgId: string, outletId: string, params: { tank_id: string; height: number; unit: string }): Promise<any> {
  return apiRequest<any>(`/organisations/${orgId}/outlets/${outletId}/tanks/convert-dip/?tank_id=${params.tank_id}&height=${params.height}&unit=${params.unit}`);
}

/**
 * Outlet Readiness APIs
 */
export async function fetchOutletReadiness(orgId: string, outletId: string): Promise<OutletReadinessCheck> {
  return apiRequest<OutletReadinessCheck>(`/organisations/${orgId}/outlets/${outletId}/readiness/`);
}

/**
 * Milestone 9: Live Shift Operations Types and API methods
 */

export interface OperationalShiftListItem {
  id: string;
  organisation: string;
  outlet: string;
  shift_definition: string;
  shift_definition_name: string;
  business_date: string;
  scheduled_starts_at: string;
  scheduled_ends_at: string;
  opened_at: string;
  closed_at: string | null;
  status: 'open' | 'closed';
  opened_by_name: string | null;
  closed_by_name: string | null;
  staff_count: number;
  totals: {
    total_gross_quantity: string;
    total_testing_quantity: string;
    total_sale_quantity: string;
    total_fuel_sale_amount: string;
  };
  version: number;
  created_at: string;
  updated_at: string;
}

export interface ShiftListResponse {
  current_open_shift: OperationalShiftListItem | null;
  shifts: OperationalShiftListItem[];
}

export interface OperationalShiftStaffMember {
  id: string;
  shift: string;
  source_employee: string;
  employee_code_snapshot: string;
  employee_name_snapshot: string;
  designation_snapshot: string;
  is_primary_cashier: boolean;
  assigned_nozzles: string[];
  notes: string | null;
  created_at: string;
}

export interface ShiftNozzlePriceSegmentItem {
  id: string;
  sequence: number;
  starts_at: string;
  ends_at: string | null;
  opening_reading: string;
  closing_reading: string | null;
  unit_price: string;
  gross_quantity: string;
  testing_quantity: string;
  sale_quantity: string;
  sale_amount: string;
  price_history_reference: string | null;
  created_at: string;
}

export interface ShiftMeterEventItem {
  id: string;
  shift_nozzle_meter: string;
  event_type: 'meter_reset' | 'meter_replacement' | 'totalizer_rollover' | 'approved_correction';
  reading_before: string;
  reading_after: string;
  occurred_at: string;
  reason: string;
  recorded_by: string;
  recorded_by_name: string | null;
  created_at: string;
}

export interface ShiftNozzleMeterItem {
  id: string;
  shift: string;
  nozzle: string;
  nozzle_code: string;
  nozzle_name: string;
  dispenser_name: string;
  product_id: string;
  product_name: string;
  product_code: string;
  staff_assignment: string | null;
  employee_id: string | null;
  employee_name: string | null;
  opening_reading: string;
  closing_reading: string | null;
  opening_source: string;
  opening_source_reference: string | null;
  manual_exception_type: string | null;
  manual_exception_reason: string | null;
  gross_quantity: string;
  testing_quantity: string;
  sale_quantity: string;
  stock_depletion_quantity: string;
  sale_amount: string;
  price_segments: ShiftNozzlePriceSegmentItem[];
  meter_events: ShiftMeterEventItem[];
  created_at: string;
  updated_at: string;
}

export interface ShiftTestingRecordItem {
  id: string;
  organisation: string;
  outlet: string;
  shift: string;
  shift_nozzle_meter: string;
  nozzle_code: string;
  nozzle_name: string;
  price_segment: string | null;
  quantity: string;
  returned_to_tank: boolean;
  destination_tank: string | null;
  destination_tank_name: string | null;
  occurred_at: string;
  notes: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShiftTankDipObservationItem {
  id: string;
  organisation: string;
  outlet: string;
  shift: string;
  tank: string;
  tank_code: string;
  tank_name: string;
  product_name: string;
  tank_capacity: string;
  observation_type: 'opening' | 'closing';
  measured_at: string;
  raw_dip_value: string;
  raw_dip_unit: string;
  converted_quantity: string | null;
  calibration_assignment: string | null;
  calibration_chart: string | null;
  calibration_chart_name: string | null;
  conversion_method: string;
  density: string | null;
  manual_quantity_reason: string | null;
  notes: string | null;
  recorded_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShiftActivityLogItem {
  id: string;
  organisation: string;
  outlet: string;
  shift: string;
  event_type: string;
  actor: string | null;
  actor_name: string | null;
  occurred_at: string;
  reason: string | null;
  metadata: Record<string, any>;
}

export interface ShiftTotalsResponse {
  nozzles: Array<{
    nozzle_id: string;
    nozzle_code: string;
    nozzle_name: string;
    dispenser_name: string;
    product_id: string;
    product_name: string;
    product_code: string;
    employee_name: string;
    opening_reading: string;
    closing_reading: string | null;
    gross_quantity: string;
    testing_quantity: string;
    sale_quantity: string;
    stock_depletion_quantity: string;
    sale_amount: string;
    price_segments: Array<{
      sequence: number;
      unit_price: string;
      opening_reading: string;
      closing_reading: string | null;
      gross_quantity: string;
      testing_quantity: string;
      sale_quantity: string;
      sale_amount: string;
    }>;
  }>;
  employees: Array<{
    employee_id: string | null;
    employee_name: string;
    employee_code: string;
    designation: string;
    nozzle_count: number;
    nozzle_codes: string[];
    gross_quantity: string;
    testing_quantity: string;
    sale_quantity: string;
    sale_amount: string;
  }>;
  products: Array<{
    product_id: string;
    product_name: string;
    product_code: string;
    gross_quantity: string;
    testing_quantity: string;
    sale_quantity: string;
    stock_depletion_quantity: string;
    sale_amount: string;
  }>;
  overall: {
    total_nozzles: number;
    entered_closing_readings: number;
    pending_closing_readings: number;
    total_gross_quantity: string;
    total_testing_quantity: string;
    total_sale_quantity: string;
    total_stock_depletion_quantity: string;
    total_fuel_sale_amount: string;
  };
}

export interface ShiftClosingPreviewResponse {
  can_close: boolean;
  blocking_errors: string[];
  warnings: string[];
  totals: ShiftTotalsResponse;
  meters_summary: {
    total: number;
    completed: number;
    pending: number;
  };
  dips_summary: {
    total_tanks: number;
    opening_recorded: number;
    closing_recorded: number;
  };
}

export interface ShiftOpenPreparationResponse {
  outlet_id: string;
  shift_definition_id: string;
  business_date: string;
  can_open: boolean;
  readiness: OutletReadinessCheck;
  active_open_shift: {
    id: string;
    shift_name: string;
    business_date: string;
    opened_at: string;
  } | null;
  existing_shift: {
    id: string;
    status: string;
  } | null;
  has_planned_roster: boolean;
  nozzles: Array<{
    nozzle_id: string;
    nozzle_code: string;
    nozzle_name: string;
    dispenser_id: string;
    dispenser_name: string;
    product_id: string;
    product_name: string;
    product_code: string;
    tank_id: string;
    tank_code: string;
    derived_opening_reading: string | null;
    opening_source: string;
    opening_source_reference: string | null;
    opening_source_description: string;
    requires_manual_exception: boolean;
    current_price: string | null;
    preselected_employee_id: string | null;
  }>;
  employees: Array<{
    id: string;
    code: string;
    name: string;
    designation_id: string | null;
    designation_name: string;
    is_roster_cashier: boolean;
  }>;
}

export interface OperationalShiftDetailResponse {
  shift: {
    id: string;
    organisation: string;
    outlet: string;
    shift_definition: string;
    shift_definition_name: string;
    business_date: string;
    scheduled_starts_at: string;
    scheduled_ends_at: string;
    opened_at: string;
    closed_at: string | null;
    status: 'open' | 'closed';
    opened_by_name: string | null;
    closed_by_name: string | null;
    reopened_by_name: string | null;
    reopened_at: string | null;
    reopen_reason: string | null;
    notes: string | null;
    version: number;
    staff_members: OperationalShiftStaffMember[];
    meters: ShiftNozzleMeterItem[];
    testing_records: ShiftTestingRecordItem[];
    dip_observations: ShiftTankDipObservationItem[];
    created_at: string;
    updated_at: string;
  };
  totals: ShiftTotalsResponse;
  can_reopen: boolean;
}

export async function fetchOperationalShifts(
  orgId: string,
  outletId: string,
  params?: { status?: string; shift_definition_id?: string; from_date?: string; to_date?: string }
): Promise<ShiftListResponse> {
  const query = new URLSearchParams();
  if (params?.status) query.append('status', params.status);
  if (params?.shift_definition_id) query.append('shift_definition_id', params.shift_definition_id);
  if (params?.from_date) query.append('from_date', params.from_date);
  if (params?.to_date) query.append('to_date', params.to_date);

  const qs = query.toString() ? `?${query.toString()}` : '';
  return apiRequest<ShiftListResponse>(`/organisations/${orgId}/outlets/${outletId}/operational-shifts/${qs}`);
}

export async function prepareShiftOpening(
  orgId: string,
  outletId: string,
  shiftDefinitionId: string,
  businessDate: string
): Promise<ShiftOpenPreparationResponse> {
  return apiRequest<ShiftOpenPreparationResponse>(
    `/organisations/${orgId}/outlets/${outletId}/operational-shifts/prepare-opening/?shift_definition_id=${shiftDefinitionId}&business_date=${businessDate}`
  );
}

export async function openOperationalShift(
  orgId: string,
  outletId: string,
  payload: {
    shift_definition_id: string;
    business_date: string;
    staff_assignments: Array<{
      employee_id: string;
      nozzle_ids: string[];
      is_primary_cashier?: boolean;
      notes?: string;
    }>;
    manual_exceptions?: Record<string, { reading: number | string; reason: string; type: string }>;
    notes?: string;
  }
): Promise<any> {
  return apiRequest<any>(`/organisations/${orgId}/outlets/${outletId}/operational-shifts/open/`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchOperationalShiftDetail(
  orgId: string,
  outletId: string,
  shiftId: string
): Promise<OperationalShiftDetailResponse> {
  return apiRequest<OperationalShiftDetailResponse>(
    `/organisations/${orgId}/outlets/${outletId}/operational-shifts/${shiftId}/`
  );
}

export async function updateShiftAssignments(
  orgId: string,
  outletId: string,
  shiftId: string,
  payload: {
    staff_assignments: Array<{
      employee_id: string;
      nozzle_ids: string[];
      is_primary_cashier?: boolean;
      notes?: string;
    }>;
  }
): Promise<any> {
  return apiRequest<any>(
    `/organisations/${orgId}/outlets/${outletId}/operational-shifts/${shiftId}/assignments/`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
}

export async function discardOperationalShift(
  orgId: string,
  outletId: string,
  shiftId: string,
  reason?: string
): Promise<{ detail: string }> {
  return apiRequest<{ detail: string }>(
    `/organisations/${orgId}/outlets/${outletId}/operational-shifts/${shiftId}/`,
    {
      method: 'DELETE',
      body: JSON.stringify({ reason: reason || '' }),
    }
  );
}

export interface AddShiftStaffPayload {
  employee_id: string;
  duty_designation_id?: string | null;
  is_primary_cashier?: boolean;
  notes?: string;
  assigned_nozzle_ids?: string[];
}

export interface TransferShiftNozzlePayload {
  nozzle_id: string;
  new_employee_id: string;
  handover_reading: string | number;
  handover_time?: string | null;
  reason: string;
}

export interface CorrectShiftNozzlePayload {
  nozzle_id: string;
  new_employee_id: string;
  reason: string;
}

export interface TransferShiftCashierPayload {
  new_staff_id: string;
  reason: string;
}

export interface ActivateShiftNozzlePayload {
  nozzle_id: string;
  employee_id: string;
  starting_reading: string | number;
  reason: string;
}

export interface ShiftStaffHistoryResponse {
  cashier_periods: Array<{
    id: string;
    shift: string;
    staff: string;
    staff_name: string;
    staff_code: string;
    effective_from: string;
    effective_to: string | null;
    is_active: boolean;
    changed_by_name: string | null;
    reason: string;
    created_at: string;
  }>;
  nozzle_assignments: Array<{
    id: string;
    shift: string;
    shift_staff: string;
    nozzle: string;
    nozzle_code: string;
    employee_name: string;
    employee_code: string;
    dispenser_name_snapshot: string;
    nozzle_name_snapshot: string;
    product_name_snapshot: string;
    effective_from: string;
    effective_to: string | null;
    is_active: boolean;
    opening_reading: string;
    closing_reading: string | null;
    assignment_type: string;
    reason: string | null;
    created_by_name: string | null;
    created_at: string;
  }>;
}

export async function addShiftStaff(
  orgId: string,
  outletId: string,
  shiftId: string,
  payload: AddShiftStaffPayload
): Promise<any> {
  return apiRequest<any>(
    `/organisations/${orgId}/outlets/${outletId}/operational-shifts/${shiftId}/staff/`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
}

export async function transferShiftNozzle(
  orgId: string,
  outletId: string,
  shiftId: string,
  payload: TransferShiftNozzlePayload
): Promise<any> {
  return apiRequest<any>(
    `/organisations/${orgId}/outlets/${outletId}/operational-shifts/${shiftId}/handover/`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
}

export async function correctShiftNozzle(
  orgId: string,
  outletId: string,
  shiftId: string,
  payload: CorrectShiftNozzlePayload
): Promise<any> {
  return apiRequest<any>(
    `/organisations/${orgId}/outlets/${outletId}/operational-shifts/${shiftId}/correct-assignment/`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
}

export async function transferShiftCashier(
  orgId: string,
  outletId: string,
  shiftId: string,
  payload: TransferShiftCashierPayload
): Promise<any> {
  return apiRequest<any>(
    `/organisations/${orgId}/outlets/${outletId}/operational-shifts/${shiftId}/cashier-transfer/`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
}

export async function activateShiftNozzle(
  orgId: string,
  outletId: string,
  shiftId: string,
  payload: ActivateShiftNozzlePayload
): Promise<any> {
  return apiRequest<any>(
    `/organisations/${orgId}/outlets/${outletId}/operational-shifts/${shiftId}/activate-nozzle/`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
}

export async function fetchShiftStaffHistory(
  orgId: string,
  outletId: string,
  shiftId: string
): Promise<ShiftStaffHistoryResponse> {
  return apiRequest<ShiftStaffHistoryResponse>(
    `/organisations/${orgId}/outlets/${outletId}/operational-shifts/${shiftId}/staff-history/`
  );
}



export async function recordShiftMeterReading(
  orgId: string,
  outletId: string,
  shiftId: string,
  nozzleId: string,
  payload: {
    closing_reading: number | string;
    reason?: string;
  }
): Promise<{ meter: ShiftNozzleMeterItem; totals: ShiftTotalsResponse }> {
  return apiRequest<{ meter: ShiftNozzleMeterItem; totals: ShiftTotalsResponse }>(
    `/organisations/${orgId}/outlets/${outletId}/operational-shifts/${shiftId}/meters/${nozzleId}/`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
}

export async function recordShiftMeterEvent(
  orgId: string,
  outletId: string,
  shiftId: string,
  nozzleId: string,
  payload: {
    event_type: string;
    reading_before: number | string;
    reading_after: number | string;
    reason: string;
  }
): Promise<{ event: ShiftMeterEventItem; meter: ShiftNozzleMeterItem; totals: ShiftTotalsResponse }> {
  return apiRequest<{ event: ShiftMeterEventItem; meter: ShiftNozzleMeterItem; totals: ShiftTotalsResponse }>(
    `/organisations/${orgId}/outlets/${outletId}/operational-shifts/${shiftId}/meters/${nozzleId}/events/`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
}

export async function fetchShiftTestingRecords(
  orgId: string,
  outletId: string,
  shiftId: string
): Promise<ShiftTestingRecordItem[]> {
  return apiRequest<ShiftTestingRecordItem[]>(
    `/organisations/${orgId}/outlets/${outletId}/operational-shifts/${shiftId}/testing/`
  );
}

export async function recordShiftTesting(
  orgId: string,
  outletId: string,
  shiftId: string,
  payload: {
    nozzle_id: string;
    quantity: number | string;
    returned_to_tank: boolean;
    destination_tank_id?: string;
    occurred_at?: string;
    notes?: string;
  }
): Promise<{ testing: ShiftTestingRecordItem; totals: ShiftTotalsResponse }> {
  return apiRequest<{ testing: ShiftTestingRecordItem; totals: ShiftTotalsResponse }>(
    `/organisations/${orgId}/outlets/${outletId}/operational-shifts/${shiftId}/testing/`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
}

export async function updateShiftTesting(
  orgId: string,
  outletId: string,
  shiftId: string,
  testingId: string,
  payload: {
    quantity?: number | string;
    returned_to_tank?: boolean;
    destination_tank_id?: string;
    notes?: string;
  }
): Promise<{ testing: ShiftTestingRecordItem; totals: ShiftTotalsResponse }> {
  return apiRequest<{ testing: ShiftTestingRecordItem; totals: ShiftTotalsResponse }>(
    `/organisations/${orgId}/outlets/${outletId}/operational-shifts/${shiftId}/testing/${testingId}/`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }
  );
}

export async function deleteShiftTesting(
  orgId: string,
  outletId: string,
  shiftId: string,
  testingId: string
): Promise<{ detail: string; totals: ShiftTotalsResponse }> {
  return apiRequest<{ detail: string; totals: ShiftTotalsResponse }>(
    `/organisations/${orgId}/outlets/${outletId}/operational-shifts/${shiftId}/testing/${testingId}/`,
    {
      method: 'DELETE',
    }
  );
}

export async function fetchShiftDips(
  orgId: string,
  outletId: string,
  shiftId: string
): Promise<ShiftTankDipObservationItem[]> {
  return apiRequest<ShiftTankDipObservationItem[]>(
    `/organisations/${orgId}/outlets/${outletId}/operational-shifts/${shiftId}/dips/`
  );
}

export async function recordShiftDip(
  orgId: string,
  outletId: string,
  shiftId: string,
  payload: {
    tank_id: string;
    observation_type: 'opening' | 'closing';
    raw_dip_value: number | string;
    raw_dip_unit: string;
    density?: number | string;
    manual_quantity?: number | string;
    manual_quantity_reason?: string;
    notes?: string;
  }
): Promise<ShiftTankDipObservationItem> {
  return apiRequest<ShiftTankDipObservationItem>(
    `/organisations/${orgId}/outlets/${outletId}/operational-shifts/${shiftId}/dips/`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
}

export async function previewShiftPriceChange(
  orgId: string,
  outletId: string,
  shiftId: string,
  payload: {
    product_id: string;
    new_price: number | string;
    nozzle_snapshot_readings: Record<string, number | string>;
  }
): Promise<any> {
  return apiRequest<any>(
    `/organisations/${orgId}/outlets/${outletId}/operational-shifts/${shiftId}/price-change/preview/`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
}

export async function confirmShiftPriceChange(
  orgId: string,
  outletId: string,
  shiftId: string,
  payload: {
    product_id: string;
    new_price: number | string;
    effective_at?: string;
    nozzle_snapshot_readings: Record<string, number | string>;
  }
): Promise<any> {
  return apiRequest<any>(
    `/organisations/${orgId}/outlets/${outletId}/operational-shifts/${shiftId}/price-change/confirm/`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
}

export async function previewShiftClosing(
  orgId: string,
  outletId: string,
  shiftId: string
): Promise<ShiftClosingPreviewResponse> {
  return apiRequest<ShiftClosingPreviewResponse>(
    `/organisations/${orgId}/outlets/${outletId}/operational-shifts/${shiftId}/closing-preview/`
  );
}

export async function closeOperationalShift(
  orgId: string,
  outletId: string,
  shiftId: string
): Promise<any> {
  return apiRequest<any>(
    `/organisations/${orgId}/outlets/${outletId}/operational-shifts/${shiftId}/close/`,
    {
      method: 'POST',
    }
  );
}

export async function reopenOperationalShift(
  orgId: string,
  outletId: string,
  shiftId: string,
  reason: string
): Promise<any> {
  return apiRequest<any>(
    `/organisations/${orgId}/outlets/${outletId}/operational-shifts/${shiftId}/reopen/`,
    {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }
  );
}

export async function fetchShiftActivityLogs(
  orgId: string,
  outletId: string,
  shiftId: string
): Promise<ShiftActivityLogItem[]> {
  return apiRequest<ShiftActivityLogItem[]>(
    `/organisations/${orgId}/outlets/${outletId}/operational-shifts/${shiftId}/activity/`
  );
}

export async function fetchShiftTotals(
  orgId: string,
  outletId: string,
  shiftId: string
): Promise<ShiftTotalsResponse> {
  return apiRequest<ShiftTotalsResponse>(
    `/organisations/${orgId}/outlets/${outletId}/operational-shifts/${shiftId}/totals/`
  );
}


