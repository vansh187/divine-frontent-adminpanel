const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  "https://divinevisioninfrabackend.onrender.com";

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    const detail = body?.detail;
    const code = typeof detail === "string" ? detail : detail?.code ?? detail?.[0]?.type;
    const message =
      (typeof detail === "string" ? detail : detail?.message) ??
      body?.message ??
      `Request failed with status ${res.status}`;
    throw new ApiError(res.status, message, code);
  }

  return body as T;
}

export interface AdminUser {
  id: string;
  full_name: string;
  employee_id: string;
  email: string;
  [key: string]: unknown;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface RefreshResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export function signup(payload: {
  full_name: string;
  employee_id: string;
  email: string;
  password: string;
}): Promise<AdminUser> {
  return request<AdminUser>("/admin/signup", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function login(payload: { email: string; password: string }): Promise<TokenResponse> {
  return request<TokenResponse>("/admin/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function refresh(refreshToken: string): Promise<RefreshResponse> {
  return request<RefreshResponse>("/admin/refresh", {
    method: "POST",
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
}

export function forgotPassword(email: string): Promise<{ message: string }> {
  return request<{ message: string }>("/admin/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function resetPassword(payload: {
  email: string;
  otp: string;
  new_password: string;
}): Promise<{ message: string }> {
  return request<{ message: string }>("/admin/reset-password", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function authRequest<T>(
  path: string,
  accessToken: string,
  options: RequestInit = {}
): Promise<T> {
  return request<T>(path, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

export type CustomerSource = "WEBSITE" | "BROKER_CHANNEL";
export type CustomerStatus = "LEAD" | "ACTIVE" | "BOOKED" | "INACTIVE";

export interface ApiCustomer {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  source: CustomerSource;
  status: CustomerStatus;
  created_at: string;
  last_activity_at: string;
}

export interface CustomerListResponse {
  items: ApiCustomer[];
  pagination: {
    page: number;
    page_size: number;
    total_items: number;
    total_pages: number;
  };
}

export interface CustomerListParams {
  page?: number;
  page_size?: number;
  search?: string;
  source?: CustomerSource;
  status?: CustomerStatus;
  sort?: string;
}

export function listCustomers(
  accessToken: string,
  params: CustomerListParams = {}
): Promise<CustomerListResponse> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  const qs = query.toString();
  return authRequest<CustomerListResponse>(`/admin/customers${qs ? `?${qs}` : ""}`, accessToken);
}

export function createCustomer(
  accessToken: string,
  payload: { full_name: string; email: string; phone: string }
): Promise<ApiCustomer> {
  return authRequest<ApiCustomer>("/admin/customers", accessToken, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export type BrokerProject = "suraksha-enclave" | "ops-divine-greens";
export type BrokerSort = "-created_at" | "created_at" | "full_name" | "-full_name";

export interface ApiBroker {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  project: BrokerProject;
  created_at: string;
  last_activity_at: string;
}

export interface BrokerListResponse {
  items: ApiBroker[];
  pagination: {
    page: number;
    page_size: number;
    total_items: number;
    total_pages: number;
  };
}

export interface BrokerListParams {
  page?: number;
  page_size?: number;
  search?: string;
  project?: BrokerProject;
  sort?: BrokerSort;
}

export function listBrokers(
  accessToken: string,
  params: BrokerListParams = {}
): Promise<BrokerListResponse> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  const qs = query.toString();
  return authRequest<BrokerListResponse>(`/admin/brokers${qs ? `?${qs}` : ""}`, accessToken);
}
