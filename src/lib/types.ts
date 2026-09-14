// Shared domain enums & types — mirrors "Divine Vision Infra Admin Panel Frontend
// Requirements & Integration HLD v1.1" §8 Shared Domain Enums.
// NOTE: these will be replaced by the generated OpenAPI client types once the
// backend contract package is available (see doc §15). Do not hand-roll a
// second copy of these enums elsewhere.

export type BookingStatus =
  | "PAYMENT_RECEIVED"
  | "KYC_PENDING"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED"
  | "REFUND_IN_PROGRESS"
  | "REFUNDED";

export type PlotStatus =
  | "AVAILABLE"
  | "ON_HOLD"
  | "BOOKED"
  | "RELEASE_PENDING"
  | "AVAILABLE_AFTER_CANCEL";

export type KycStatus = "PENDING" | "VERIFIED" | "REJECTED" | "NEEDS_RESUBMISSION";

export type PaymentStatus =
  | "INITIATED"
  | "AUTHORIZED"
  | "CAPTURED"
  | "FAILED"
  | "CASH_RECORDED"
  | "REFUND_PENDING"
  | "PARTIALLY_REFUNDED"
  | "REFUNDED";

export type RefundStatus =
  | "NOT_REQUIRED"
  | "PENDING"
  | "INITIATED"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  | "CASH_REFUND_PENDING"
  | "CASH_COLLECTED";

export type VisitStatus =
  | "SCHEDULED"
  | "CONFIRMED"
  | "COMPLETED"
  | "NO_SHOW"
  | "CANCELLED"
  | "FOLLOW_UP_REQUIRED"
  | "CONVERTED";

export type VisitSource = "CUSTOMER" | "BROKER_CHANNEL";

export type PaymentMethod = "ONLINE" | "CASH" | "BANK_TRANSFER" | "OTHER";

export type SettlementStatus =
  | "PENDING"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "ON_HOLD"
  | "REJECTED"
  | "PAID"
  | "REVERSED";

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  source: VisitSource;
  status: "LEAD" | "ACTIVE" | "BOOKED" | "INACTIVE";
  project: string;
  createdAt: string;
  lastActivity: string;
  siteVisits: number;
}

export interface Broker {
  id: string;
  name: string;
  agency: string;
  email: string;
  phone: string;
  status: "ACTIVE" | "INACTIVE";
  leadsSourced: number;
  siteVisitsSourced: number;
  bookingsConverted: number;
  commissionEarned: number;
  commissionPending: number;
  joinedAt: string;
}

export interface SiteVisit {
  id: string;
  customerName: string;
  project: string;
  plot: string;
  source: VisitSource;
  brokerName?: string;
  scheduledAt: string;
  status: VisitStatus;
  assignedTo: string;
}

export interface Document {
  id: string;
  name: string;
  type: "PAN" | "AADHAAR" | "PHOTO" | "CANCELLED_CHEQUE";
  status: KycStatus;
  uploadedAt: string;
}

export interface Booking {
  id: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  project: string;
  plot: string;
  plotStatus: PlotStatus;
  status: BookingStatus;
  amount: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  paymentReference: string;
  kycStatus: KycStatus;
  documents: Document[];
  version: number;
  createdAt: string;
  decisionHistory: { actor: string; action: string; timestamp: string; note?: string }[];
}

export interface Refund {
  id: string;
  bookingId: string;
  customerName: string;
  amount: number;
  method: PaymentMethod;
  status: RefundStatus;
  reason: string;
  requestedAt: string;
}

export interface RevenueTransaction {
  id: string;
  bookingId: string;
  customerName: string;
  project: string;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  date: string;
}

export interface AuditLogEntry {
  id: string;
  actor: string;
  action: string;
  entity: string;
  entityId: string;
  priorState?: string;
  newState?: string;
  timestamp: string;
  requestId: string;
}

export interface Settlement {
  id: string;
  bookingId: string;
  brokerName: string;
  project: string;
  commissionAmount: number;
  approvedAmount?: number;
  status: SettlementStatus;
  createdAt: string;
  version: number;
}
