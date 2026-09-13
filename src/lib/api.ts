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
