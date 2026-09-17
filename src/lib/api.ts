const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  "https://divinevisioninfrabackend.onrender.com";

export interface FastApiValidationError {
  type: string;
  loc: (string | number)[];
  msg: string;
  input?: unknown;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  /** Raw `detail` from a FastAPI 422 validation body, when the error is shaped that way. */
  validationErrors?: FastApiValidationError[];

  constructor(status: number, message: string, code?: string, validationErrors?: FastApiValidationError[]) {
    super(message);
    this.status = status;
    this.code = code;
    this.validationErrors = validationErrors;
  }
}

async function parseResponse<T>(res: Response): Promise<T> {
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    const detail = body?.detail;

    if (Array.isArray(detail)) {
      const message =
        detail
          .map((d: FastApiValidationError) => {
            const field = Array.isArray(d.loc) ? d.loc.filter((p) => p !== "body").join(".") : null;
            return field ? `${field}: ${d.msg}` : d.msg;
          })
          .filter(Boolean)
          .join(" ") || `Request failed with status ${res.status}`;
      throw new ApiError(res.status, message, detail[0]?.type, detail);
    }

    const code = typeof detail === "string" ? detail : detail?.code;
    const message =
      (typeof detail === "string" ? detail : detail?.message) ??
      body?.message ??
      `Request failed with status ${res.status}`;
    throw new ApiError(res.status, message, code);
  }

  return body as T;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  return parseResponse<T>(res);
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

type UnauthorizedHandler = () => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;

/** Registered once by AuthProvider so a 401 on any authenticated request can trigger logout + redirect. */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  unauthorizedHandler = handler;
}

function handleUnauthorized<T>(promise: Promise<T>): Promise<T> {
  return promise.catch((err) => {
    if (err instanceof ApiError && err.status === 401) {
      unauthorizedHandler?.();
      // Session is being torn down and the app is about to redirect to
      // /admin/login — never resolve so callers don't briefly render a
      // stale error state before the redirect unmounts them.
      return new Promise<T>(() => {});
    }
    throw err;
  });
}

export function authRequest<T>(
  path: string,
  accessToken: string,
  options: RequestInit = {}
): Promise<T> {
  return handleUnauthorized(
    request<T>(path, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${accessToken}`,
      },
    })
  );
}

/** Like authRequest, but for multipart/form-data bodies — never sets a JSON Content-Type. */
export function authUploadRequest<T>(
  path: string,
  accessToken: string,
  formData: FormData
): Promise<T> {
  return handleUnauthorized(
    fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: formData,
    }).then((res) => parseResponse<T>(res))
  );
}

export interface ApiAdminProfile {
  id: string;
  full_name: string;
  employee_id: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  initials: string;
  created_by: string | null;
  created_date: string | null;
  last_updated_by: string | null;
  last_updated_date: string | null;
}

export function getAdminProfile(accessToken: string): Promise<ApiAdminProfile> {
  return authRequest<ApiAdminProfile>("/admin/profile", accessToken);
}

export function uploadAdminProfilePhoto(accessToken: string, file: File): Promise<ApiAdminProfile> {
  const formData = new FormData();
  formData.append("file", file);
  return authUploadRequest<ApiAdminProfile>("/admin/profile/photo", accessToken, formData);
}

export interface SupportTicketPayload {
  subject: string;
  description: string;
}

export interface ApiSupportTicket {
  ticket_number: string;
  subject: string;
  description: string;
  raised_by: string | null;
  submitted_date: string;
  email_sent: boolean;
}

export function submitSupportTicket(
  accessToken: string,
  payload: SupportTicketPayload
): Promise<ApiSupportTicket> {
  return authRequest<ApiSupportTicket>("/admin/support-tickets", accessToken, {
    method: "POST",
    body: JSON.stringify(payload),
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

export type VisitOriginType = "CUSTOMER" | "CHANNEL_PARTNER";
export type VisitStatus =
  | "requested"
  | "scheduled"
  | "confirmed"
  | "completed"
  | "follow_up"
  | "no_show"
  | "converted"
  | "cancelled";
export type VisitSort = "visit_date" | "-visit_date" | "created_at" | "-created_at" | "customer_name" | "-customer_name";

export interface ApiVisit {
  id: string;
  origin_type: VisitOriginType;
  customer_name: string;
  customer_contact: string | null;
  project_name: BrokerProject | null;
  plot_number: string | null;
  source: string | null;
  assigned_to: string | null;
  customer_email: string | null;
  preferred_window: string | null;
  visit_date: string | null;
  visit_time: string | null;
  status: VisitStatus;
  notes: string | null;
  created_at: string;
  last_activity_at: string;
}

export interface VisitListResponse {
  items: ApiVisit[];
  pagination: {
    page: number;
    page_size: number;
    total_items: number;
    total_pages: number;
  };
}

export interface VisitListParams {
  page?: number;
  page_size?: number;
  search?: string;
  origin_type?: VisitOriginType;
  status?: VisitStatus;
  sort?: VisitSort;
}

export function listVisits(
  accessToken: string,
  params: VisitListParams = {}
): Promise<VisitListResponse> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  const qs = query.toString();
  return authRequest<VisitListResponse>(`/admin/visits${qs ? `?${qs}` : ""}`, accessToken);
}

export function getVisit(accessToken: string, id: string): Promise<ApiVisit> {
  return authRequest<ApiVisit>(`/admin/visits/${id}`, accessToken);
}

export type BookingStatus = "pending_kyc_review" | "booked" | "rejected" | "cancelled";
export type KycStatus = "pending" | "verified" | "needs_resubmission" | "rejected";
export type BookingDocumentType =
  | "aadhaar_front"
  | "aadhaar_back"
  | "pan_card"
  | "applicant_photo"
  | "cancelled_cheque";

export interface ApiBookingListItem {
  id: string;
  customer_id: string;
  customer_name: string;
  project_name: string;
  unit_number: string;
  amount: number;
  status: BookingStatus;
  kyc_status: KycStatus;
  version: number;
  created_at: string;
  last_activity_at: string;
}

export interface BookingListResponse {
  items: ApiBookingListItem[];
  pagination: {
    page: number;
    page_size: number;
    total_items: number;
    total_pages: number;
  };
}

export interface BookingListParams {
  page?: number;
  page_size?: number;
  search?: string;
  status?: BookingStatus;
  kyc_status?: KycStatus;
}

export function listBookings(
  accessToken: string,
  params: BookingListParams = {}
): Promise<BookingListResponse> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  const qs = query.toString();
  return authRequest<BookingListResponse>(`/admin/bookings${qs ? `?${qs}` : ""}`, accessToken);
}

export interface ApiBookingDocument {
  document_type: BookingDocumentType;
  label: string;
  uploaded: boolean;
  preview_url: string | null;
  preview_url_expires_in: number | null;
  uploaded_at: string | null;
}

export interface ApiBookingDecision {
  actor: string;
  action: string;
  note: string | null;
  created_at: string;
}

export interface ApiBookingDetail {
  id: string;
  status: BookingStatus;
  kyc_status: KycStatus;
  version: number;
  admin_note: string | null;
  customer_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  project_name: string;
  unit_number: string;
  amount: number;
  payment_id: string;
  payment_method: string;
  payment_status: string;
  razorpay_payment_id: string | null;
  utr_number: string | null;
  documents: ApiBookingDocument[];
  decision_history: ApiBookingDecision[];
  created_at: string;
  last_activity_at: string;
}

export function getBooking(accessToken: string, id: string): Promise<ApiBookingDetail> {
  return authRequest<ApiBookingDetail>(`/admin/bookings/${id}`, accessToken);
}

export interface BookingDecisionPayload {
  note?: string;
  version: number;
}

export function approveBooking(
  accessToken: string,
  id: string,
  payload: BookingDecisionPayload
): Promise<ApiBookingDetail> {
  return authRequest<ApiBookingDetail>(`/admin/bookings/${id}/approve`, accessToken, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function rejectBooking(
  accessToken: string,
  id: string,
  payload: BookingDecisionPayload
): Promise<ApiBookingDetail> {
  return authRequest<ApiBookingDetail>(`/admin/bookings/${id}/reject`, accessToken, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// Cancels a booking at either the KYC-review stage or once the plot is already
// booked, releasing the plot back to available and starting a refund.
export function cancelBookedPlot(
  accessToken: string,
  id: string,
  payload: BookingDecisionPayload
): Promise<ApiBookingDetail> {
  return authRequest<ApiBookingDetail>(`/admin/bookings/${id}/cancel`, accessToken, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export type RevenueStatus = "captured" | "cash_recorded" | "refund_pending" | "refunded";
export type RevenueMethod = "razorpay" | "cash" | "rtgs_neft";

export interface RevenueSummaryParams {
  date_from?: string;
  date_to?: string;
}

export interface ApiRevenueSummary {
  total_transactions: number;
  gross_amount: number;
  net_amount: number;
  captured_amount: number;
  cash_amount: number;
  refund_pending_amount: number;
  refunded_amount: number;
}

export function getRevenueSummary(
  accessToken: string,
  params: RevenueSummaryParams = {}
): Promise<ApiRevenueSummary> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  const qs = query.toString();
  return authRequest<ApiRevenueSummary>(`/admin/revenue/summary${qs ? `?${qs}` : ""}`, accessToken);
}

export interface ApiRevenueTransaction {
  transaction_id: string;
  booking_id: string | null;
  customer_id: string;
  customer_name: string | null;
  project_name: string | null;
  unit_number: string | null;
  amount: number;
  currency: string;
  method: RevenueMethod;
  status: RevenueStatus;
  created_at: string;
}

export interface ApiRevenueTransactionDetail extends ApiRevenueTransaction {
  razorpay_payment_id: string | null;
  utr_number: string | null;
}

export interface RevenueTransactionListResponse {
  items: ApiRevenueTransaction[];
  pagination: {
    page: number;
    page_size: number;
    total_items: number;
    total_pages: number;
  };
}

export interface RevenueTransactionListParams {
  page?: number;
  page_size?: number;
  search?: string;
  status?: RevenueStatus;
  method?: RevenueMethod;
  date_from?: string;
  date_to?: string;
}

export function listRevenueTransactions(
  accessToken: string,
  params: RevenueTransactionListParams = {}
): Promise<RevenueTransactionListResponse> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  const qs = query.toString();
  return authRequest<RevenueTransactionListResponse>(
    `/admin/revenue/transactions${qs ? `?${qs}` : ""}`,
    accessToken
  );
}

export function getRevenueTransaction(
  accessToken: string,
  id: string
): Promise<ApiRevenueTransactionDetail> {
  return authRequest<ApiRevenueTransactionDetail>(`/admin/revenue/transactions/${id}`, accessToken);
}

export type RefundMethod = "razorpay" | "cash" | "rtgs_neft";
export type RefundStatus =
  | "processing"
  | "completed"
  | "failed"
  | "cash_refund_pending"
  | "cash_collected"
  | "bank_transfer_pending"
  | "bank_transfer_completed";

export interface ApiRefundListItem {
  id: string;
  booking_id: string | null;
  customer_id: string;
  customer_name: string | null;
  project_name: string | null;
  unit_number: string | null;
  amount: number;
  currency: string;
  method: RefundMethod;
  status: RefundStatus;
  refund_initiated_date: string | null;
  refund_completed_date: string | null;
}

export interface ApiRefundDetail extends ApiRefundListItem {
  razorpay_payment_id: string | null;
  razorpay_refund_id: string | null;
  utr_number: string | null;
  refund_note: string | null;
  created_at: string;
}

export interface RefundListResponse {
  items: ApiRefundListItem[];
  pagination: {
    page: number;
    page_size: number;
    total_items: number;
    total_pages: number;
  };
}

export interface RefundListParams {
  page?: number;
  page_size?: number;
  search?: string;
  status?: RefundStatus;
  method?: RefundMethod;
}

export function listRefunds(
  accessToken: string,
  params: RefundListParams = {}
): Promise<RefundListResponse> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  const qs = query.toString();
  return authRequest<RefundListResponse>(`/admin/refunds${qs ? `?${qs}` : ""}`, accessToken);
}

export function getRefund(accessToken: string, paymentId: string): Promise<ApiRefundDetail> {
  return authRequest<ApiRefundDetail>(`/admin/refunds/${paymentId}`, accessToken);
}

export function retryRefund(accessToken: string, paymentId: string): Promise<ApiRefundDetail> {
  return authRequest<ApiRefundDetail>(`/admin/refunds/${paymentId}/retry`, accessToken, {
    method: "POST",
  });
}

export function markRefundCollected(
  accessToken: string,
  paymentId: string,
  note?: string
): Promise<ApiRefundDetail> {
  return authRequest<ApiRefundDetail>(`/admin/refunds/${paymentId}/mark-collected`, accessToken, {
    method: "POST",
    body: JSON.stringify({ note: note || undefined }),
  });
}
