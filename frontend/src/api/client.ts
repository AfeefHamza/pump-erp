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
    let messageStr = 'An API error occurred';

    const extractString = (val: unknown): string | null => {
      if (!val) return null;
      if (typeof val === 'string') return val;
      if (Array.isArray(val)) {
        const joined = val.map(extractString).filter(Boolean).join(', ');
        return joined || null;
      }
      if (typeof val === 'object' && val !== null) {
        const parts = Object.entries(val as Record<string, unknown>).map(([k, v]) => {
          const sub = extractString(v);
          const formattedKey = k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
          return sub ? (k === '__all__' || k === 'detail' ? sub : `${formattedKey}: ${sub}`) : null;
        }).filter(Boolean);
        return parts.join(' | ') || null;
      }
      return String(val);
    };

    if (errorData.detail) {
      messageStr = extractString(errorData.detail) || messageStr;
    } else if (errorData.non_field_errors) {
      messageStr = extractString(errorData.non_field_errors) || messageStr;
    } else if (errorData.error) {
      messageStr = extractString(errorData.error) || messageStr;
    } else if (errorData.message) {
      messageStr = extractString(errorData.message) || messageStr;
    } else if (typeof errorData === 'object' && errorData !== null) {
      messageStr = extractString(errorData) || messageStr;
    }

    throw new ApiError(messageStr, response.status, errorData);
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

export async function fetchOutletReadiness(orgId: string, outletId: string): Promise<OutletReadinessCheck> {
  return apiRequest<OutletReadinessCheck>(`/organisations/${orgId}/outlets/${outletId}/readiness/`);
}

/**
 * Nozzle Commissioning APIs
 */
export interface NozzleCommissioningStatusItem {
  nozzle_id: string;
  nozzle_code: string;
  nozzle_name: string;
  nozzle_number: number | null;
  dispenser_id: string;
  dispenser_code: string;
  dispenser_name: string;
  product_id: string | null;
  product_code: string | null;
  product_name: string | null;
  tank_id: string | null;
  tank_code: string | null;
  is_active: boolean;
  status: 'opening_balance' | 'commissioned' | 'previous_shift' | 'missing';
  starting_totalizer: string | null;
  source_effective_time: string | null;
  commissioning_allowed: boolean;
  blocking_reason: string | null;
  commissioned_by_name: string | null;
  commissioned_at: string | null;
  reason: string | null;
  notes: string | null;
}

export interface CommissionNozzlePayload {
  initial_totalizer: number | string;
  effective_at: string;
  reason: string;
  notes?: string;
  activate?: boolean;
}

export interface BulkCommissionItemPayload {
  nozzle_id: string;
  initial_totalizer: number | string;
  notes?: string;
}

export interface BulkCommissionNozzlePayload {
  effective_at: string;
  reason: string;
  items: BulkCommissionItemPayload[];
  activate?: boolean;
}

export async function fetchNozzleCommissioningStatus(orgId: string, outletId: string): Promise<NozzleCommissioningStatusItem[]> {
  return apiRequest<NozzleCommissioningStatusItem[]>(`/organisations/${orgId}/outlets/${outletId}/nozzles/commissioning-status/`);
}

export async function commissionNozzle(orgId: string, outletId: string, nozzleId: string, payload: CommissionNozzlePayload): Promise<any> {
  return apiRequest<any>(`/organisations/${orgId}/outlets/${outletId}/nozzles/${nozzleId}/commission/`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function bulkCommissionNozzles(orgId: string, outletId: string, payload: BulkCommissionNozzlePayload): Promise<any> {
  return apiRequest<any>(`/organisations/${orgId}/outlets/${outletId}/nozzles/bulk-commission/`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
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
  reconciliation_status?: 'pending' | 'partial' | 'reconciled';
  shift_reconciliation_complete?: boolean;
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

export interface ActivateShiftNozzlePayload {
  nozzle_id: string;
  employee_id: string;
  starting_reading: string | number;
  reason: string;
}

export interface ShiftStaffHistoryResponse {
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

// ==========================================
// Milestone 10: Customer Master & Credit Slips
// ==========================================

export interface Customer {
  id: string;
  organisation: string;
  customer_code: string;
  display_name: string;
  customer_type: 'individual' | 'business' | 'government' | 'other';
  phone_number?: string | null;
  alternate_phone_number?: string | null;
  email?: string | null;
  billing_address?: string | null;
  GSTIN?: string | null;
  credit_limit?: number | string | null;
  credit_days?: number | null;
  status: 'active' | 'inactive';
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
  assigned_outlets?: Array<{ id: string; name: string; code: string }>;
}

export interface CustomerCreditPosition {
  customer_id: string;
  customer_code: string;
  display_name: string;
  customer_type: string;
  status: string;
  credit_limit: number | string;
  credit_days: number;
  total_active_slips: number;
  total_void_slips: number;
  outstanding_credit_amount: number | string;
  outstanding_operational_credit: number | string;
  oldest_credit_date: string | null;
  credit_limit_usage_percent: number | string;
  is_credit_limit_exceeded: boolean;
}

export interface FuelCreditSlip {
  id: string;
  organisation: string;
  outlet: string;
  operational_shift: string;
  shift_business_date?: string;
  employee: string;
  employee_name?: string;
  employee_code?: string;
  customer: string;
  customer_code?: string;
  customer_name?: string;
  slip_number: string;
  occurred_at: string;
  nozzle?: string | null;
  nozzle_code?: string | null;
  product: string;
  product_name?: string;
  product_code?: string;
  quantity: number | string;
  unit_price: number | string;
  amount: number | string;
  vehicle_number?: string | null;
  driver_name?: string | null;
  customer_reference?: string | null;
  physical_slip_number?: string | null;
  notes?: string | null;
  status: 'active' | 'void';
  void_reason?: string | null;
  voided_by?: string | null;
  voided_by_name?: string | null;
  voided_at?: string | null;
  created_at?: string;
}

export interface CashDenominationItem {
  denomination_value: number | string;
  quantity: number;
  calculated_amount?: number | string;
}

export interface EmployeeShiftCollection {
  id: string;
  organisation: string;
  outlet: string;
  operational_shift: string;
  employee: string;
  employee_name?: string;
  employee_code?: string;
  collection_method: 'cash' | 'card' | 'upi';
  amount: number | string;
  occurred_at: string;
  reference_number?: string | null;
  provider_name?: string | null;
  terminal_or_account_reference?: string | null;
  notes?: string | null;
  status: 'active' | 'void';
  void_reason?: string | null;
  voided_by?: string | null;
  voided_by_name?: string | null;
  voided_at?: string | null;
  denominations?: CashDenominationItem[];
  created_at?: string;
}

export interface EmployeeShiftDeduction {
  id: string;
  organisation: string;
  outlet: string;
  operational_shift: string;
  employee: string;
  employee_name?: string;
  employee_code?: string;
  deduction_type: 'cash_expense' | 'approved_deduction' | 'other_adjustment';
  direction: 'increases_accounted' | 'decreases_accounted';
  amount: number | string;
  occurred_at: string;
  description: string;
  payee?: string | null;
  reference_number?: string | null;
  approval_reason: string;
  approved_by: string;
  approved_by_name?: string;
  status: 'active' | 'void';
  void_reason?: string | null;
  voided_by?: string | null;
  voided_by_name?: string | null;
  voided_at?: string | null;
  created_at?: string;
}

export interface EmployeeAccountabilityItem {
  employee_id: string;
  employee_code: string;
  employee_name: string;
  nozzle_codes: string[];
  assigned_nozzles?: string[];
  expected_sale_amount: number | string;
  cash_amount: number | string;
  card_amount: number | string;
  upi_amount: number | string;
  credit_slip_amount: number | string;
  approved_increase_adjustments: number | string;
  approved_decrease_adjustments: number | string;
  total_accounted_amount: number | string;
  difference_amount: number | string;
  shortage_amount: number | string;
  excess_amount: number | string;
  result: 'balanced' | 'shortage' | 'excess';
  settlement_status: 'not_started' | 'preparing' | 'reconciled';
  settlement_id: string | null;
  reconciled_at: string | null;
  reconciled_by_name: string | null;
}

export interface ShiftReconciliationSummary {
  id: string;
  organisation: string;
  outlet: string;
  operational_shift: string;
  expected_sale_amount: number | string;
  total_accounted_amount: number | string;
  shortage_amount: number | string;
  excess_amount: number | string;
  net_difference_amount: number | string;
  required_employee_count: number;
  reconciled_employee_count: number;
  status: 'pending' | 'partial' | 'reconciled';
  completed_by?: string | null;
  completed_at?: string | null;
}

export interface EmployeeReconciliationPreview {
  shift_id: string;
  employee_id: string;
  employee_name: string;
  employee_code: string;
  shift_status: string;
  can_reconcile: boolean;
  blocking_reasons: string[];
  blocking_errors?: string[];
  expected_sale_amount: number | string;
  nozzle_breakdown: Array<{
    nozzle_id: string;
    nozzle_code: string;
    product_name: string;
    unit_price: number | string;
    quantity: number | string;
    amount: number | string;
  }>;
  cash_amount: number | string;
  card_amount: number | string;
  upi_amount: number | string;
  credit_slip_amount: number | string;
  approved_increase_adjustments: number | string;
  approved_decrease_adjustments: number | string;
  total_accounted_amount: number | string;
  difference_amount: number | string;
  shortage_amount: number | string;
  excess_amount: number | string;
  result: 'balanced' | 'shortage' | 'excess';
  requires_acknowledgement: boolean;
  settlement_status: string;
  reconciled_at?: string | null;
  reconciled_by_name?: string | null;
  reconciliation_notes?: string | null;
}

export interface CollectionAuditLogItem {
  id: string;
  shift: string;
  employee_id?: string | null;
  employee_name?: string | null;
  customer_id?: string | null;
  customer_name?: string | null;
  actor_id?: string | null;
  actor_name?: string | null;
  event_type: string;
  occurred_at: string;
  reason?: string | null;
  metadata?: Record<string, any>;
}

// Customers API
export async function fetchCustomers(
  orgId: string,
  params?: { search?: string; status?: string; customer_type?: string }
): Promise<Customer[]> {
  const query = new URLSearchParams();
  if (params?.search) query.set('search', params.search);
  if (params?.status) query.set('status', params.status);
  if (params?.customer_type) query.set('customer_type', params.customer_type);
  const qs = query.toString() ? `?${query.toString()}` : '';
  return apiRequest<Customer[]>(`/organisations/${orgId}/customers/${qs}`);
}

export async function fetchCustomer(orgId: string, customerId: string): Promise<Customer> {
  return apiRequest<Customer>(`/organisations/${orgId}/customers/${customerId}/`);
}

export async function createCustomer(orgId: string, payload: Partial<Customer>): Promise<Customer> {
  return apiRequest<Customer>(`/organisations/${orgId}/customers/`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateCustomer(
  orgId: string,
  customerId: string,
  payload: Partial<Customer>
): Promise<Customer> {
  return apiRequest<Customer>(`/organisations/${orgId}/customers/${customerId}/`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deactivateCustomer(orgId: string, customerId: string): Promise<Customer> {
  return apiRequest<Customer>(`/organisations/${orgId}/customers/${customerId}/deactivate/`, {
    method: 'POST',
  });
}

export async function fetchCustomerCreditPosition(
  orgId: string,
  customerId: string,
  outletId?: string
): Promise<CustomerCreditPosition> {
  const qs = outletId ? `?outlet_id=${outletId}` : '';
  return apiRequest<CustomerCreditPosition>(
    `/organisations/${orgId}/customers/${customerId}/credit-position/${qs}`
  );
}

export async function fetchCustomerCreditSlips(
  orgId: string,
  customerId: string
): Promise<FuelCreditSlip[]> {
  return apiRequest<FuelCreditSlip[]>(
    `/organisations/${orgId}/customers/${customerId}/credit-slips/`
  );
}

// Credit Slips API
export async function fetchOutletCreditSlips(
  orgId: string,
  outletId: string,
  params?: { shift_id?: string; customer_id?: string; employee_id?: string; status?: string }
): Promise<FuelCreditSlip[]> {
  const query = new URLSearchParams();
  if (params?.shift_id) query.set('shift_id', params.shift_id);
  if (params?.customer_id) query.set('customer_id', params.customer_id);
  if (params?.employee_id) query.set('employee_id', params.employee_id);
  if (params?.status) query.set('status', params.status);
  const qs = query.toString() ? `?${query.toString()}` : '';
  return apiRequest<FuelCreditSlip[]>(`/organisations/${orgId}/outlets/${outletId}/credit-slips/${qs}`);
}

export async function fetchShiftCreditSlips(
  orgId: string,
  outletId: string,
  shiftId: string,
  employeeId?: string
): Promise<FuelCreditSlip[]> {
  const qs = employeeId ? `?employee_id=${employeeId}` : '';
  return apiRequest<FuelCreditSlip[]>(
    `/organisations/${orgId}/outlets/${outletId}/operational-shifts/${shiftId}/credit-slips/${qs}`
  );
}

export async function fetchCreditSlip(
  orgId: string,
  outletId: string,
  slipId: string
): Promise<FuelCreditSlip> {
  return apiRequest<FuelCreditSlip>(
    `/organisations/${orgId}/outlets/${outletId}/credit-slips/${slipId}/`
  );
}

export async function createShiftCreditSlip(
  orgId: string,
  outletId: string,
  shiftId: string,
  payload: {
    customer_id: string;
    employee_id: string;
    product_id: string;
    quantity: number | string;
    nozzle_id?: string | null;
    occurred_at?: string;
    slip_number?: string;
    vehicle_number?: string;
    driver_name?: string;
    customer_reference?: string;
    physical_slip_number?: string;
    notes?: string;
  }
): Promise<FuelCreditSlip> {
  return apiRequest<FuelCreditSlip>(
    `/organisations/${orgId}/outlets/${outletId}/operational-shifts/${shiftId}/credit-slips/`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
}

export async function updateCreditSlip(
  orgId: string,
  outletId: string,
  slipId: string,
  payload: Partial<FuelCreditSlip>
): Promise<FuelCreditSlip> {
  return apiRequest<FuelCreditSlip>(
    `/organisations/${orgId}/outlets/${outletId}/credit-slips/${slipId}/`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }
  );
}

export async function voidCreditSlip(
  orgId: string,
  outletId: string,
  slipId: string,
  reason: string
): Promise<FuelCreditSlip> {
  return apiRequest<FuelCreditSlip>(
    `/organisations/${orgId}/outlets/${outletId}/credit-slips/${slipId}/void/`,
    {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }
  );
}

// Collections API
export async function fetchShiftCollections(
  orgId: string,
  outletId: string,
  shiftId: string,
  params?: { employee_id?: string; collection_method?: string }
): Promise<EmployeeShiftCollection[]> {
  const query = new URLSearchParams();
  if (params?.employee_id) query.set('employee_id', params.employee_id);
  if (params?.collection_method) query.set('collection_method', params.collection_method);
  const qs = query.toString() ? `?${query.toString()}` : '';
  return apiRequest<EmployeeShiftCollection[]>(
    `/organisations/${orgId}/outlets/${outletId}/operational-shifts/${shiftId}/collections/${qs}`
  );
}

export async function fetchCollection(
  orgId: string,
  outletId: string,
  collectionId: string
): Promise<EmployeeShiftCollection> {
  return apiRequest<EmployeeShiftCollection>(
    `/organisations/${orgId}/outlets/${outletId}/collections/${collectionId}/`
  );
}

export async function createShiftCollection(
  orgId: string,
  outletId: string,
  shiftId: string,
  payload: {
    employee_id: string;
    collection_method: 'cash' | 'card' | 'upi';
    amount: number | string;
    occurred_at?: string;
    denominations?: CashDenominationItem[];
    reference_number?: string;
    provider_name?: string;
    terminal_or_account_reference?: string;
    notes?: string;
    allow_duplicate_reference?: boolean;
    override_reason?: string;
  }
): Promise<EmployeeShiftCollection> {
  return apiRequest<EmployeeShiftCollection>(
    `/organisations/${orgId}/outlets/${outletId}/operational-shifts/${shiftId}/collections/`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
}

export async function updateCollection(
  orgId: string,
  outletId: string,
  collectionId: string,
  payload: Partial<EmployeeShiftCollection>
): Promise<EmployeeShiftCollection> {
  return apiRequest<EmployeeShiftCollection>(
    `/organisations/${orgId}/outlets/${outletId}/collections/${collectionId}/`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }
  );
}

export async function voidCollection(
  orgId: string,
  outletId: string,
  collectionId: string,
  reason: string
): Promise<EmployeeShiftCollection> {
  return apiRequest<EmployeeShiftCollection>(
    `/organisations/${orgId}/outlets/${outletId}/collections/${collectionId}/void/`,
    {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }
  );
}

// Deductions / Adjustments API
export async function fetchShiftDeductions(
  orgId: string,
  outletId: string,
  shiftId: string,
  employeeId?: string
): Promise<EmployeeShiftDeduction[]> {
  const qs = employeeId ? `?employee_id=${employeeId}` : '';
  return apiRequest<EmployeeShiftDeduction[]>(
    `/organisations/${orgId}/outlets/${outletId}/operational-shifts/${shiftId}/deductions/${qs}`
  );
}

export async function createShiftDeduction(
  orgId: string,
  outletId: string,
  shiftId: string,
  payload: {
    employee_id: string;
    deduction_type: 'cash_expense' | 'approved_deduction' | 'other_adjustment';
    direction: 'increases_accounted' | 'decreases_accounted';
    amount: number | string;
    occurred_at?: string;
    description: string;
    approval_reason: string;
    payee?: string;
    reference_number?: string;
  }
): Promise<EmployeeShiftDeduction> {
  return apiRequest<EmployeeShiftDeduction>(
    `/organisations/${orgId}/outlets/${outletId}/operational-shifts/${shiftId}/deductions/`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
}

export async function voidShiftDeduction(
  orgId: string,
  outletId: string,
  deductionId: string,
  reason: string
): Promise<EmployeeShiftDeduction> {
  return apiRequest<EmployeeShiftDeduction>(
    `/organisations/${orgId}/outlets/${outletId}/deductions/${deductionId}/void/`,
    {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }
  );
}

// Accountability & Reconciliation API
export async function fetchEmployeeAccountabilitySummary(
  orgId: string,
  outletId: string,
  shiftId: string
): Promise<{
  shift_id: string;
  business_date: string;
  operational_status: string;
  reconciliation_status: string;
  shift_reconciliation_complete: boolean;
  employees: EmployeeAccountabilityItem[];
  reconciliation: ShiftReconciliationSummary;
}> {
  return apiRequest<any>(
    `/organisations/${orgId}/outlets/${outletId}/operational-shifts/${shiftId}/accountability/`
  );
}

export async function fetchEmployeeReconciliationPreview(
  orgId: string,
  outletId: string,
  shiftId: string,
  employeeId: string
): Promise<EmployeeReconciliationPreview> {
  return apiRequest<EmployeeReconciliationPreview>(
    `/organisations/${orgId}/outlets/${outletId}/operational-shifts/${shiftId}/accountability/${employeeId}/preview/`
  );
}

export async function reconcileEmployeeSettlement(
  orgId: string,
  outletId: string,
  shiftId: string,
  employeeId: string,
  payload: { notes?: string; acknowledge_difference?: boolean }
): Promise<any> {
  return apiRequest<any>(
    `/organisations/${orgId}/outlets/${outletId}/operational-shifts/${shiftId}/accountability/${employeeId}/reconcile/`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
}

export async function reopenEmployeeSettlement(
  orgId: string,
  outletId: string,
  shiftId: string,
  settlementId: string,
  reason: string
): Promise<any> {
  return apiRequest<any>(
    `/organisations/${orgId}/outlets/${outletId}/operational-shifts/${shiftId}/settlements/${settlementId}/reopen/`,
    {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }
  );
}

export async function fetchShiftReconciliationSummary(
  orgId: string,
  outletId: string,
  shiftId: string
): Promise<ShiftReconciliationSummary> {
  return apiRequest<ShiftReconciliationSummary>(
    `/organisations/${orgId}/outlets/${outletId}/operational-shifts/${shiftId}/reconciliation/`
  );
}

export async function fetchCollectionActivityTimeline(
  orgId: string,
  outletId: string,
  shiftId: string
): Promise<CollectionAuditLogItem[]> {
  return apiRequest<CollectionAuditLogItem[]>(
    `/organisations/${orgId}/outlets/${outletId}/operational-shifts/${shiftId}/collection-activity/`
  );
}

// ==========================================
// Shift Cards API & Interfaces
// ==========================================

export interface ShiftCardMeterInput {
  nozzle_id: string;
  opening_reading: number | string;
  closing_reading?: number | string | null;
  expected_opening_reading?: number | string | null;
  opening_source?: string;
  opening_source_reference?: string | null;
  continuity_status?: string;
  continuity_difference?: number | string;
  continuity_reason?: string | null;
  is_conflict_acknowledged?: boolean;
  manual_exception_type?: string | null;
  manual_exception_reason?: string | null;
  testing_quantity?: number | string;
  returned_to_tank?: boolean;
  destination_tank_id?: string | null;
  price_segments?: Array<{
    opening_reading: number | string;
    closing_reading?: number | string | null;
    unit_price: number | string;
    testing_quantity?: number | string;
    starts_at?: string;
    ends_at?: string;
  }>;
}

export interface ShiftCardCollectionInput {
  amount: number | string;
  provider_name?: string | null;
  reference_number?: string | null;
  terminal_or_account_reference?: string | null;
  occurred_at?: string | null;
  notes?: string | null;
}

export interface ShiftCardDenominationInput {
  denomination_value: number;
  quantity: number;
}

export interface ShiftCardCreditSlipInput {
  customer_id: string;
  nozzle_id?: string | null;
  product_id: string;
  quantity: number | string;
  unit_price: number | string;
  slip_number?: string;
  physical_slip_number?: string | null;
  vehicle_number?: string | null;
  driver_name?: string | null;
  customer_reference?: string | null;
  occurred_at?: string | null;
  notes?: string | null;
}

export interface ShiftCardDeductionInput {
  id?: string;
  deduction_type?: 'cash_expense' | 'approved_deduction' | 'other_adjustment';
  direction?: 'increases_accounted' | 'decreases_accounted';
  amount: number | string;
  description: string;
  payee?: string | null;
  reference_number?: string | null;
  occurred_at?: string | null;
}

export interface ShiftCardSavePayload {
  shift_card_id?: string;
  shift_definition_id: string;
  business_date: string;
  employee_id: string;
  sequence?: number;
  actual_starts_at?: string;
  actual_ends_at?: string;
  mpd_slip_number?: string;
  notes?: string;
  operator_notes?: string;
  is_shortage_excess_acknowledged?: boolean;
  shortage_acknowledged?: boolean;
  shortage_excess_acknowledgement_note?: string;
  shortage_notes?: string;
  meters?: ShiftCardMeterInput[];
  nozzle_meters: ShiftCardMeterInput[];
  cash_amount?: number | string;
  cash?: {
    amount: number | string;
    occurred_at?: string;
    notes?: string;
    denominations?: ShiftCardDenominationInput[];
  };
  cards?: ShiftCardCollectionInput[];
  upi?: ShiftCardCollectionInput[];
  fleet?: ShiftCardCollectionInput[];
  credit_slips?: ShiftCardCreditSlipInput[];
  deductions?: ShiftCardDeductionInput[];
}

export interface EmployeeShiftCardItem {
  id: string;
  sequence: number;
  parent_shift: {
    id: string;
    business_date: string;
    shift_definition: {
      id: string;
      code: string;
      name: string;
      starts_at: string;
      ends_at: string;
    };
    is_locked: boolean;
    locked_at: string | null;
    locked_by_name: string | null;
    lock_source: string | null;
    status: string;
  };
  employee: {
    id: string;
    display_name: string;
    employee_code: string;
  };
  status: 'active' | 'void';
  actual_starts_at: string | null;
  actual_ends_at: string | null;
  mpd_slip_number: string | null;
  mpd_slip_attachment: string | null;
  is_shortage_excess_acknowledged: boolean;
  shortage_excess_acknowledgement_note: string | null;
  notes: string | null;
  void_reason: string | null;
  voided_at: string | null;
  voided_by_name: string | null;
  total_litres_sold: number;
  total_sale_amount: number;
  total_collected_amount: number;
  difference_amount: number;
  meters: any[];
  collections: any[];
  credit_slips: any[];
  deductions: any[];
  settlement: any | null;
  created_at: string;
  updated_at: string;
}

export interface ShiftCardPreparationResponse {
  business_date: string;
  shift_definition_id: string | null;
  shift_definitions: Array<{
    id: string;
    code: string;
    name: string;
    starts_at: string;
    ends_at: string;
  }>;
  historical_employees: Array<{
    id: string;
    name: string;
    code: string;
  }>;
  historical_nozzles: Array<{
    id: string;
    code: string;
    name: string;
    dispenser_name: string;
    product_id: string;
    product_name: string;
    current_selling_price: number;
    opening_info: {
      reading: number | null;
      source: string;
      reference: string | null;
      source_description: string;
      continuity_status: string;
      requires_commissioning: boolean;
    };
  }>;
  customers: Array<{
    id: string;
    name: string;
    code: string;
    vehicle_numbers?: string[];
  }>;
  parent_shift: any | null;
  existing_cards: EmployeeShiftCardItem[];
  missing_nozzle_ids: string[];
}

export async function fetchShiftCardPreparation(
  orgId: string,
  outletId: string,
  businessDate?: string,
  shiftDefinitionId?: string
): Promise<ShiftCardPreparationResponse> {
  const params = new URLSearchParams();
  if (businessDate) params.append('business_date', businessDate);
  if (shiftDefinitionId) params.append('shift_definition_id', shiftDefinitionId);
  const qs = params.toString() ? `?${params.toString()}` : '';
  return apiRequest<ShiftCardPreparationResponse>(
    `/organisations/${orgId}/outlets/${outletId}/shift-cards/preparation/${qs}`
  );
}

export async function fetchShiftCardsList(
  orgId: string,
  outletId: string,
  filters?: {
    business_date?: string;
    shift_definition_id?: string;
    employee_id?: string;
    status?: string;
  }
): Promise<EmployeeShiftCardItem[]> {
  const params = new URLSearchParams();
  if (filters?.business_date) params.append('business_date', filters.business_date);
  if (filters?.shift_definition_id) params.append('shift_definition_id', filters.shift_definition_id);
  if (filters?.employee_id) params.append('employee_id', filters.employee_id);
  if (filters?.status) params.append('status', filters.status);
  const qs = params.toString() ? `?${params.toString()}` : '';
  return apiRequest<EmployeeShiftCardItem[]>(
    `/organisations/${orgId}/outlets/${outletId}/shift-cards/${qs}`
  );
}

export async function saveShiftCard(
  orgId: string,
  outletId: string,
  payload: ShiftCardSavePayload
): Promise<EmployeeShiftCardItem> {
  return apiRequest<EmployeeShiftCardItem>(
    `/organisations/${orgId}/outlets/${outletId}/shift-cards/`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
}

export async function fetchShiftCardDetail(
  orgId: string,
  outletId: string,
  cardId: string
): Promise<EmployeeShiftCardItem> {
  return apiRequest<EmployeeShiftCardItem>(
    `/organisations/${orgId}/outlets/${outletId}/shift-cards/${cardId}/`
  );
}

export async function voidShiftCard(
  orgId: string,
  outletId: string,
  cardId: string,
  reason: string
): Promise<EmployeeShiftCardItem> {
  return apiRequest<EmployeeShiftCardItem>(
    `/organisations/${orgId}/outlets/${outletId}/shift-cards/${cardId}/void/`,
    {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }
  );
}

export async function lockShift(
  orgId: string,
  outletId: string,
  shiftId: string,
  reason?: string
): Promise<{ id: string; is_locked: boolean; locked_at: string; lock_source: string }> {
  return apiRequest(
    `/organisations/${orgId}/outlets/${outletId}/shifts/${shiftId}/lock/`,
    {
      method: 'POST',
      body: JSON.stringify({ reason: reason || 'Manual shift lock' }),
    }
  );
}

export async function unlockShift(
  orgId: string,
  outletId: string,
  shiftId: string,
  reason: string
): Promise<{ id: string; is_locked: boolean; unlocked_at: string }> {
  return apiRequest(
    `/organisations/${orgId}/outlets/${outletId}/shifts/${shiftId}/unlock/`,
    {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }
  );
}

export async function approveShiftDeduction(
  orgId: string,
  outletId: string,
  deductionId: string,
  reason?: string
): Promise<EmployeeShiftDeduction> {
  return apiRequest<EmployeeShiftDeduction>(
    `/organisations/${orgId}/outlets/${outletId}/deductions/${deductionId}/approve/`,
    {
      method: 'POST',
      body: JSON.stringify({ reason: reason || 'Approved by manager' }),
    }
  );
}

export async function rejectShiftDeduction(
  orgId: string,
  outletId: string,
  deductionId: string,
  reason: string
): Promise<EmployeeShiftDeduction> {
  return apiRequest<EmployeeShiftDeduction>(
    `/organisations/${orgId}/outlets/${outletId}/deductions/${deductionId}/reject/`,
    {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }
  );
}

export async function fetchParentShiftSummary(
  orgId: string,
  outletId: string,
  shiftId: string
): Promise<any> {
  return apiRequest(
    `/organisations/${orgId}/outlets/${outletId}/operational-shifts/${shiftId}/summary/`
  );
}

// ==========================================
// Milestone 11: Purchases & Tanker Receipts
// ==========================================
import type {
  Supplier,
  TankerReceiptListItem,
  TankerReceiptDetail,
  TankerReceiptInput,
  TankerReceiptAttachment,
  PurchaseBillListItem,
  PurchaseBillDetail,
  PurchaseBillInput,
  PurchaseBillAttachment,
  AvailableTankerReceipt,
  SupplierOutstandingSummary,
  SupplierStatement,
  PurchaseTaxCode,
  PurchaseTaxCodeRate,
  PurchaseItem,
  ProductPurchaseTaxMapping,
  PurchaseBillCalculationPreview
} from '@/features/purchases/types';

export async function fetchSuppliers(orgId: string): Promise<Supplier[]> {
  return apiRequest<Supplier[]>(`/organisations/${orgId}/suppliers/`);
}

export async function createSupplier(orgId: string, data: Partial<Supplier>): Promise<Supplier> {
  return apiRequest<Supplier>(`/organisations/${orgId}/suppliers/`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateSupplier(orgId: string, supplierId: string, data: Partial<Supplier>): Promise<Supplier> {
  return apiRequest<Supplier>(`/organisations/${orgId}/suppliers/${supplierId}/`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function fetchTankerReceipts(
  orgId: string,
  outletId: string,
  params?: Record<string, string>
): Promise<TankerReceiptListItem[]> {
  const query = params ? `?${new URLSearchParams(params).toString()}` : '';
  return apiRequest<TankerReceiptListItem[]>(
    `/organisations/${orgId}/outlets/${outletId}/tanker-receipts/${query}`
  );
}

export async function fetchTankerReceiptDetail(
  orgId: string,
  outletId: string,
  receiptId: string
): Promise<TankerReceiptDetail> {
  return apiRequest<TankerReceiptDetail>(
    `/organisations/${orgId}/outlets/${outletId}/tanker-receipts/${receiptId}/`
  );
}

export async function createTankerReceipt(
  orgId: string,
  outletId: string,
  data: TankerReceiptInput
): Promise<TankerReceiptDetail> {
  return apiRequest<TankerReceiptDetail>(
    `/organisations/${orgId}/outlets/${outletId}/tanker-receipts/`,
    {
      method: 'POST',
      body: JSON.stringify(data),
    }
  );
}

export async function updateTankerReceipt(
  orgId: string,
  outletId: string,
  receiptId: string,
  data: TankerReceiptInput
): Promise<TankerReceiptDetail> {
  return apiRequest<TankerReceiptDetail>(
    `/organisations/${orgId}/outlets/${outletId}/tanker-receipts/${receiptId}/`,
    {
      method: 'PUT',
      body: JSON.stringify(data),
    }
  );
}

export async function confirmTankerReceipt(
  orgId: string,
  outletId: string,
  receiptId: string
): Promise<TankerReceiptDetail> {
  return apiRequest<TankerReceiptDetail>(
    `/organisations/${orgId}/outlets/${outletId}/tanker-receipts/${receiptId}/confirm/`,
    {
      method: 'POST',
    }
  );
}

export async function voidTankerReceipt(
  orgId: string,
  outletId: string,
  receiptId: string,
  void_reason: string
): Promise<TankerReceiptDetail> {
  return apiRequest<TankerReceiptDetail>(
    `/organisations/${orgId}/outlets/${outletId}/tanker-receipts/${receiptId}/void/`,
    {
      method: 'POST',
      body: JSON.stringify({ void_reason }),
    }
  );
}

export async function uploadTankerReceiptAttachment(
  orgId: string,
  outletId: string,
  receiptId: string,
  file: File,
  attachment_type: string = 'invoice'
): Promise<TankerReceiptAttachment> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('attachment_type', attachment_type);

  return apiRequest<TankerReceiptAttachment>(
    `/organisations/${orgId}/outlets/${outletId}/tanker-receipts/${receiptId}/attachments/`,
    {
      method: 'POST',
      body: formData,
    }
  );
}

export function getTankerReceiptAttachmentDownloadUrl(
  orgId: string,
  outletId: string,
  receiptId: string,
  attId: string
): string {
  return `${BASE_URL}/organisations/${orgId}/outlets/${outletId}/tanker-receipts/${receiptId}/attachments/${attId}/download/`;
}

export async function acknowledgeReceiptVariance(
  orgId: string,
  outletId: string,
  allocId: string,
  reason: string
): Promise<{ message: string; variance_status: string }> {
  return apiRequest<{ message: string; variance_status: string }>(
    `/organisations/${orgId}/outlets/${outletId}/tanker-receipts/allocations/${allocId}/acknowledge-variance/`,
    {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }
  );
}

export async function previewTankDipConversion(
  orgId: string,
  outletId: string,
  tankId: string,
  measuredHeight: string,
  inputUnit: string = 'millimetre',
  measuredAt?: string
): Promise<{ volume: string; chart_name: string; method: string }> {
  return apiRequest<{ volume: string; chart_name: string; method: string }>(
    `/organisations/${orgId}/outlets/${outletId}/tanker-receipts/preview-dip/`,
    {
      method: 'POST',
      body: JSON.stringify({
        tank_id: tankId,
        measured_height: measuredHeight,
        input_unit: inputUnit,
        measured_at: measuredAt,
      }),
    }
  );
}

// ==========================================
// Milestone 12: Purchase Bills & Supplier Outstanding
// ==========================================

export async function fetchPurchaseBills(
  orgId: string,
  outletId: string,
  params?: Record<string, string>
): Promise<PurchaseBillListItem[]> {
  const query = params ? `?${new URLSearchParams(params).toString()}` : '';
  return apiRequest<PurchaseBillListItem[]>(
    `/organisations/${orgId}/outlets/${outletId}/purchase-bills/${query}`
  );
}

export async function fetchPurchaseBillDetail(
  orgId: string,
  outletId: string,
  billId: string
): Promise<PurchaseBillDetail> {
  return apiRequest<PurchaseBillDetail>(
    `/organisations/${orgId}/outlets/${outletId}/purchase-bills/${billId}/`
  );
}

export async function createPurchaseBill(
  orgId: string,
  outletId: string,
  data: PurchaseBillInput
): Promise<PurchaseBillDetail> {
  return apiRequest<PurchaseBillDetail>(
    `/organisations/${orgId}/outlets/${outletId}/purchase-bills/`,
    {
      method: 'POST',
      body: JSON.stringify(data),
    }
  );
}

export async function updatePurchaseBill(
  orgId: string,
  outletId: string,
  billId: string,
  data: Partial<PurchaseBillInput>
): Promise<PurchaseBillDetail> {
  return apiRequest<PurchaseBillDetail>(
    `/organisations/${orgId}/outlets/${outletId}/purchase-bills/${billId}/`,
    {
      method: 'PUT',
      body: JSON.stringify(data),
    }
  );
}

export async function voidPurchaseBill(
  orgId: string,
  outletId: string,
  billId: string,
  void_reason: string
): Promise<PurchaseBillDetail> {
  return apiRequest<PurchaseBillDetail>(
    `/organisations/${orgId}/outlets/${outletId}/purchase-bills/${billId}/void/`,
    {
      method: 'POST',
      body: JSON.stringify({ void_reason }),
    }
  );
}

export async function fetchAvailableTankerReceipts(
  orgId: string,
  outletId: string,
  supplierId?: string
): Promise<AvailableTankerReceipt[]> {
  const query = supplierId ? `?supplier=${encodeURIComponent(supplierId)}` : '';
  return apiRequest<AvailableTankerReceipt[]>(
    `/organisations/${orgId}/outlets/${outletId}/purchase-bills/available-tanker-receipts/${query}`
  );
}

export async function uploadPurchaseBillAttachment(
  orgId: string,
  outletId: string,
  billId: string,
  file: File,
  attachment_type: string = 'supplier_invoice'
): Promise<PurchaseBillAttachment> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('attachment_type', attachment_type);

  return apiRequest<PurchaseBillAttachment>(
    `/organisations/${orgId}/outlets/${outletId}/purchase-bills/${billId}/attachments/`,
    {
      method: 'POST',
      body: formData,
    }
  );
}

export function getPurchaseBillAttachmentDownloadUrl(
  orgId: string,
  outletId: string,
  billId: string,
  attId: string
): string {
  return `${BASE_URL}/organisations/${orgId}/outlets/${outletId}/purchase-bills/${billId}/attachments/${attId}/download/`;
}

export async function previewPurchaseBillCalculation(
  orgId: string,
  outletId: string,
  data: Partial<PurchaseBillInput>
): Promise<PurchaseBillCalculationPreview> {
  return apiRequest<PurchaseBillCalculationPreview>(
    `/organisations/${orgId}/outlets/${outletId}/purchase-bills/calculate-preview/`,
    {
      method: 'POST',
      body: JSON.stringify(data),
    }
  );
}

// Purchase Tax Codes (Organisation-scoped)
export async function fetchPurchaseTaxCodes(orgId: string): Promise<PurchaseTaxCode[]> {
  return apiRequest<PurchaseTaxCode[]>(`/organisations/${orgId}/purchase-tax-codes/`);
}

export async function fetchPurchaseTaxCodeDetail(orgId: string, codeId: string): Promise<PurchaseTaxCode> {
  return apiRequest<PurchaseTaxCode>(`/organisations/${orgId}/purchase-tax-codes/${codeId}/`);
}

export async function createPurchaseTaxCode(orgId: string, data: Partial<PurchaseTaxCode>): Promise<PurchaseTaxCode> {
  return apiRequest<PurchaseTaxCode>(`/organisations/${orgId}/purchase-tax-codes/`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updatePurchaseTaxCode(orgId: string, codeId: string, data: Partial<PurchaseTaxCode>): Promise<PurchaseTaxCode> {
  return apiRequest<PurchaseTaxCode>(`/organisations/${orgId}/purchase-tax-codes/${codeId}/`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function createPurchaseTaxCodeRate(orgId: string, codeId: string, data: any): Promise<PurchaseTaxCodeRate> {
  return apiRequest<PurchaseTaxCodeRate>(`/organisations/${orgId}/purchase-tax-codes/${codeId}/rates/`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updatePurchaseTaxCodeRate(orgId: string, codeId: string, rateId: string, data: any): Promise<PurchaseTaxCodeRate> {
  return apiRequest<PurchaseTaxCodeRate>(`/organisations/${orgId}/purchase-tax-codes/${codeId}/rates/${rateId}/`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

// Purchase Items Master (Organisation-scoped)
export async function fetchPurchaseItems(orgId: string, params?: Record<string, string>): Promise<PurchaseItem[]> {
  const query = params ? `?${new URLSearchParams(params).toString()}` : '';
  return apiRequest<PurchaseItem[]>(`/organisations/${orgId}/purchase-items/${query}`);
}

export async function fetchPurchaseItemDetail(orgId: string, itemId: string): Promise<PurchaseItem> {
  return apiRequest<PurchaseItem>(`/organisations/${orgId}/purchase-items/${itemId}/`);
}

export async function createPurchaseItem(orgId: string, data: Partial<PurchaseItem>): Promise<PurchaseItem> {
  return apiRequest<PurchaseItem>(`/organisations/${orgId}/purchase-items/`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updatePurchaseItem(orgId: string, itemId: string, data: Partial<PurchaseItem>): Promise<PurchaseItem> {
  return apiRequest<PurchaseItem>(`/organisations/${orgId}/purchase-items/${itemId}/`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

// Product Purchase Tax Mappings (Organisation-scoped)
export async function fetchProductTaxMappings(orgId: string): Promise<ProductPurchaseTaxMapping[]> {
  return apiRequest<ProductPurchaseTaxMapping[]>(`/organisations/${orgId}/product-tax-mappings/`);
}

export async function createOrUpdateProductTaxMapping(orgId: string, data: Partial<ProductPurchaseTaxMapping>): Promise<ProductPurchaseTaxMapping> {
  return apiRequest<ProductPurchaseTaxMapping>(`/organisations/${orgId}/product-tax-mappings/`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function fetchSupplierOutstandingSummary(
  orgId: string,
  outletId: string
): Promise<SupplierOutstandingSummary> {
  return apiRequest<SupplierOutstandingSummary>(
    `/organisations/${orgId}/outlets/${outletId}/supplier-outstanding/summary/`
  );
}

export async function fetchSupplierStatement(
  orgId: string,
  outletId: string,
  supplierId: string
): Promise<SupplierStatement> {
  return apiRequest<SupplierStatement>(
    `/organisations/${orgId}/outlets/${outletId}/supplier-outstanding/suppliers/${supplierId}/`
  );
}


// ==========================================
// Milestone 11: Inventory & Fuel Stock
// ==========================================
import type {
  TankStockSummaryResponse,
  TankMovementLedgerResponse,
  StockAdjustmentItem,
  StockAdjustmentInput,
  UnitMaster,
  UnitConversion,
  Item,
  ItemOption,
  TaxTreatment,
  TaxTreatmentRate,
  TaxTreatmentComponent,
  ItemPurchaseTaxTreatment,
} from '@/features/inventory/types';

export type {
  UnitMaster,
  UnitConversion,
  Item,
  ItemOption,
  TaxTreatment,
  TaxTreatmentRate,
  TaxTreatmentComponent,
  ItemPurchaseTaxTreatment,
};

export async function fetchFuelStockSummary(
  orgId: string,
  outletId: string
): Promise<TankStockSummaryResponse> {
  return apiRequest<TankStockSummaryResponse>(
    `/organisations/${orgId}/outlets/${outletId}/fuel-stock/summary/`
  );
}

export async function fetchTankMovementLedger(
  orgId: string,
  outletId: string,
  tankId: string,
  params?: Record<string, string>
): Promise<TankMovementLedgerResponse> {
  const query = params ? `?${new URLSearchParams(params).toString()}` : '';
  return apiRequest<TankMovementLedgerResponse>(
    `/organisations/${orgId}/outlets/${outletId}/fuel-stock/tanks/${tankId}/ledger/${query}`
  );
}

export async function fetchStockAdjustments(
  orgId: string,
  outletId: string
): Promise<StockAdjustmentItem[]> {
  return apiRequest<StockAdjustmentItem[]>(
    `/organisations/${orgId}/outlets/${outletId}/fuel-stock/adjustments/`
  );
}

export async function createStockAdjustment(
  orgId: string,
  outletId: string,
  data: StockAdjustmentInput
): Promise<StockAdjustmentItem> {
  if (data.attachment) {
    const formData = new FormData();
    formData.append('tank_id', data.tank_id);
    formData.append('adjustment_type', data.adjustment_type);
    formData.append('quantity', data.quantity);
    formData.append('effective_at', data.effective_at);
    formData.append('reason_category', data.reason_category);
    formData.append('explanation', data.explanation);
    formData.append('attachment', data.attachment);

    return apiRequest<StockAdjustmentItem>(
      `/organisations/${orgId}/outlets/${outletId}/fuel-stock/adjustments/`,
      {
        method: 'POST',
        body: formData,
      }
    );
  }

  return apiRequest<StockAdjustmentItem>(
    `/organisations/${orgId}/outlets/${outletId}/fuel-stock/adjustments/`,
    {
      method: 'POST',
      body: JSON.stringify(data),
    }
  );
}

export async function reverseStockAdjustment(
  orgId: string,
  outletId: string,
  adjId: string,
  reversal_reason: string
): Promise<StockAdjustmentItem> {
  return apiRequest<StockAdjustmentItem>(
    `/organisations/${orgId}/outlets/${outletId}/fuel-stock/adjustments/${adjId}/reverse/`,
    {
      method: 'POST',
      body: JSON.stringify({ reversal_reason }),
    }
  );
}

export function getStockAdjustmentAttachmentDownloadUrl(
  orgId: string,
  outletId: string,
  adjId: string
): string {
  return `${BASE_URL}/organisations/${orgId}/outlets/${outletId}/fuel-stock/adjustments/${adjId}/attachment/`;
}

export async function recalculateTankChronology(
  orgId: string,
  outletId: string,
  tankId: string
): Promise<{ message: string; current_book_stock: string; has_chronology_conflict: boolean }> {
  return apiRequest<{ message: string; current_book_stock: string; has_chronology_conflict: boolean }>(
    `/organisations/${orgId}/outlets/${outletId}/fuel-stock/tanks/${tankId}/recalculate/`,
    {
      method: 'POST',
    }
  );
}

// ==========================================
// Canonical Item Master & Units (Inventory)
// ==========================================

export async function fetchUnits(orgId: string): Promise<UnitMaster[]> {
  return apiRequest<UnitMaster[]>(`/organisations/${orgId}/inventory/units/`);
}

export async function createUnit(orgId: string, data: Partial<UnitMaster>): Promise<UnitMaster> {
  return apiRequest<UnitMaster>(`/organisations/${orgId}/inventory/units/`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function fetchUnitConversions(orgId: string, params?: Record<string, string>): Promise<UnitConversion[]> {
  const query = params ? `?${new URLSearchParams(params).toString()}` : '';
  return apiRequest<UnitConversion[]>(`/organisations/${orgId}/inventory/unit-conversions/${query}`);
}

export async function createUnitConversion(orgId: string, data: Partial<UnitConversion>): Promise<UnitConversion> {
  return apiRequest<UnitConversion>(`/organisations/${orgId}/inventory/unit-conversions/`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function fetchItems(orgId: string, params?: Record<string, string>): Promise<Item[]> {
  const query = params ? `?${new URLSearchParams(params).toString()}` : '';
  return apiRequest<Item[]>(`/organisations/${orgId}/inventory/items/${query}`);
}

export async function fetchItemDetail(orgId: string, itemId: string): Promise<Item> {
  return apiRequest<Item>(`/organisations/${orgId}/inventory/items/${itemId}/`);
}

export async function createItem(orgId: string, data: any): Promise<Item> {
  return apiRequest<Item>(`/organisations/${orgId}/inventory/items/`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateItem(orgId: string, itemId: string, data: any): Promise<Item> {
  return apiRequest<Item>(`/organisations/${orgId}/inventory/items/${itemId}/`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deactivateItem(orgId: string, itemId: string): Promise<{ status: string; id: string; is_active: boolean }> {
  return apiRequest<{ status: string; id: string; is_active: boolean }>(
    `/organisations/${orgId}/inventory/items/${itemId}/deactivate/`,
    {
      method: 'POST',
    }
  );
}

export async function fetchItemOptions(orgId: string, params?: Record<string, string>): Promise<ItemOption[]> {
  const query = params ? `?${new URLSearchParams(params).toString()}` : '';
  return apiRequest<ItemOption[]>(`/organisations/${orgId}/inventory/items/options/${query}`);
}

export async function resolveLegacyItem(orgId: string, identifier: string): Promise<{ canonical_item: ItemOption }> {
  return apiRequest<{ canonical_item: ItemOption }>(
    `/organisations/${orgId}/inventory/items/resolve-legacy/?identifier=${encodeURIComponent(identifier)}`
  );
}

// ==========================================
// Tax Treatments (Settings / Purchases)
// ==========================================

export async function fetchTaxTreatments(orgId: string, params?: Record<string, string>): Promise<TaxTreatment[]> {
  const query = params ? `?${new URLSearchParams(params).toString()}` : '';
  return apiRequest<TaxTreatment[]>(`/organisations/${orgId}/tax-treatments/${query}`);
}

export async function fetchTaxTreatmentDetail(orgId: string, treatmentId: string): Promise<TaxTreatment> {
  return apiRequest<TaxTreatment>(`/organisations/${orgId}/tax-treatments/${treatmentId}/`);
}

export async function createTaxTreatment(orgId: string, data: Partial<TaxTreatment>): Promise<TaxTreatment> {
  return apiRequest<TaxTreatment>(`/organisations/${orgId}/tax-treatments/`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateTaxTreatment(orgId: string, treatmentId: string, data: Partial<TaxTreatment>): Promise<TaxTreatment> {
  return apiRequest<TaxTreatment>(`/organisations/${orgId}/tax-treatments/${treatmentId}/`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deactivateTaxTreatment(orgId: string, treatmentId: string): Promise<{ status: string; id: string; is_active: boolean }> {
  return apiRequest<{ status: string; id: string; is_active: boolean }>(
    `/organisations/${orgId}/tax-treatments/${treatmentId}/deactivate/`,
    {
      method: 'POST',
    }
  );
}

export async function createTaxTreatmentRate(orgId: string, treatmentId: string, data: any): Promise<TaxTreatmentRate> {
  return apiRequest<TaxTreatmentRate>(`/organisations/${orgId}/tax-treatments/${treatmentId}/rates/`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateTaxTreatmentRate(orgId: string, treatmentId: string, rateId: string, data: any): Promise<TaxTreatmentRate> {
  return apiRequest<TaxTreatmentRate>(`/organisations/${orgId}/tax-treatments/${treatmentId}/rates/${rateId}/`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteTaxTreatmentRate(orgId: string, treatmentId: string, rateId: string): Promise<{ status: string }> {
  return apiRequest<{ status: string }>(`/organisations/${orgId}/tax-treatments/${treatmentId}/rates/${rateId}/`, {
    method: 'DELETE',
  });
}

// Item Purchase Tax Treatment Mapping
export async function fetchItemPurchaseTaxTreatments(orgId: string, itemId: string): Promise<ItemPurchaseTaxTreatment[]> {
  return apiRequest<ItemPurchaseTaxTreatment[]>(`/organisations/${orgId}/items/${itemId}/tax-treatments/`);
}

export async function createItemPurchaseTaxTreatment(
  orgId: string,
  itemId: string,
  data: Partial<ItemPurchaseTaxTreatment>
): Promise<ItemPurchaseTaxTreatment> {
  return apiRequest<ItemPurchaseTaxTreatment>(`/organisations/${orgId}/items/${itemId}/tax-treatments/`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
