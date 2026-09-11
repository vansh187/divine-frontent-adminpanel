// Static placeholder data for UI development only.
// Every value here will be replaced by live API responses once the backend
// endpoints listed in the HLD (§9 API Endpoint Wiring Matrix) are wired up.
import type {
  AuditLogEntry,
  Booking,
  Broker,
  Customer,
  Refund,
  RevenueTransaction,
  Settlement,
  SiteVisit,
} from "./types";

export const currentAdmin = {
  id: "adm_101",
  name: "Arjun Mehta",
  email: "arjun.mehta@divinevisioninfra.com",
  roles: ["SUPER_ADMIN"],
  initials: "AM",
};

export const dashboardSummary = {
  customers_total: 1482,
  brokers_total: 186,
  pending_kyc: 23,
  approved_bookings: 117,
  refunds_in_progress: 4,
  gross_received: 41_800_000,
  approved_revenue: 35_200_000,
  refunded_amount: 1_250_000,
};

export const customerBrokerTrend = [
  { month: "Apr", customers: 88, brokers: 12 },
  { month: "May", customers: 102, brokers: 15 },
  { month: "Jun", customers: 96, brokers: 11 },
  { month: "Jul", customers: 128, brokers: 19 },
  { month: "Aug", customers: 145, brokers: 22 },
  { month: "Sep", customers: 133, brokers: 17 },
];

export const siteVisitTrend = [
  { month: "Apr", customer: 60, broker: 28 },
  { month: "May", customer: 72, broker: 34 },
  { month: "Jun", customer: 65, broker: 30 },
  { month: "Jul", customer: 84, broker: 41 },
  { month: "Aug", customer: 96, broker: 47 },
  { month: "Sep", customer: 89, broker: 39 },
];

export const revenueTrend = [
  { month: "Apr", revenue: 4_200_000 },
  { month: "May", revenue: 5_100_000 },
  { month: "Jun", revenue: 4_650_000 },
  { month: "Jul", revenue: 6_300_000 },
  { month: "Aug", revenue: 7_450_000 },
  { month: "Sep", revenue: 6_900_000 },
];

export const bookingFunnel = [
  { stage: "Payment Received", value: 312 },
  { stage: "KYC Pending", value: 254 },
  { stage: "Approved", value: 117 },
  { stage: "Rejected", value: 38 },
  { stage: "Cancelled / Refunded", value: 21 },
];

export const todaySchedule = [
  { time: "10:00 AM", title: "Site Visit — Green Meadows", subtitle: "With Mr. Rehan Sharma", tag: "Upcoming" },
  { time: "01:00 PM", title: "Client Follow Up Call", subtitle: "Regarding Plot #A-112", tag: "Upcoming" },
  { time: "04:00 PM", title: "Team Meeting", subtitle: "Weekly Sales Review", tag: "Upcoming" },
];

export const customers: Customer[] = [
  { id: "CUS-1001", name: "Rehan Sharma", email: "rehan.sharma@example.com", phone: "+91 98765 43210", source: "CUSTOMER", status: "BOOKED", project: "Green Meadows", createdAt: "2026-08-02", lastActivity: "2026-09-10", siteVisits: 3 },
  { id: "CUS-1002", name: "Priya Nair", email: "priya.nair@example.com", phone: "+91 98450 11223", source: "BROKER_CHANNEL", status: "ACTIVE", project: "Sunrise Valley", createdAt: "2026-08-05", lastActivity: "2026-09-09", siteVisits: 2 },
  { id: "CUS-1003", name: "Karan Malhotra", email: "karan.m@example.com", phone: "+91 99220 33445", source: "CUSTOMER", status: "LEAD", project: "Emerald Hills", createdAt: "2026-08-11", lastActivity: "2026-09-08", siteVisits: 1 },
  { id: "CUS-1004", name: "Ananya Iyer", email: "ananya.iyer@example.com", phone: "+91 90210 55667", source: "CUSTOMER", status: "BOOKED", project: "Green Meadows", createdAt: "2026-07-28", lastActivity: "2026-09-07", siteVisits: 4 },
  { id: "CUS-1005", name: "Vikram Chauhan", email: "vikram.c@example.com", phone: "+91 98111 22334", source: "BROKER_CHANNEL", status: "ACTIVE", project: "Palm County", createdAt: "2026-08-19", lastActivity: "2026-09-06", siteVisits: 2 },
  { id: "CUS-1006", name: "Sneha Reddy", email: "sneha.reddy@example.com", phone: "+91 91234 66778", source: "CUSTOMER", status: "INACTIVE", project: "Sunrise Valley", createdAt: "2026-06-30", lastActivity: "2026-08-14", siteVisits: 1 },
  { id: "CUS-1007", name: "Aditya Kapoor", email: "aditya.kapoor@example.com", phone: "+91 90987 44556", source: "CUSTOMER", status: "LEAD", project: "Emerald Hills", createdAt: "2026-09-01", lastActivity: "2026-09-11", siteVisits: 1 },
  { id: "CUS-1008", name: "Meera Pillai", email: "meera.pillai@example.com", phone: "+91 98765 99887", source: "BROKER_CHANNEL", status: "BOOKED", project: "Palm County", createdAt: "2026-07-15", lastActivity: "2026-09-05", siteVisits: 3 },
];

export const brokers: Broker[] = [
  { id: "BRK-000128", name: "Suresh Kulkarni", agency: "Kulkarni Realty Partners", email: "suresh.k@realty.com", phone: "+91 98220 11009", status: "ACTIVE", leadsSourced: 64, siteVisitsSourced: 48, bookingsConverted: 12, commissionEarned: 1_850_000, commissionPending: 325_000, joinedAt: "2025-11-12" },
  { id: "BRK-000129", name: "NishaVerma", agency: "Verma Estates", email: "nisha.verma@vestates.com", phone: "+91 99887 00112", status: "ACTIVE", leadsSourced: 51, siteVisitsSourced: 39, bookingsConverted: 9, commissionEarned: 1_420_000, commissionPending: 180_000, joinedAt: "2026-01-20" },
  { id: "BRK-000130", name: "Rajesh Menon", agency: "Menon & Co Properties", email: "rajesh.menon@menonco.com", phone: "+91 90556 22334", status: "ACTIVE", leadsSourced: 38, siteVisitsSourced: 27, bookingsConverted: 6, commissionEarned: 890_000, commissionPending: 95_000, joinedAt: "2026-02-08" },
  { id: "BRK-000131", name: "Farida Sheikh", agency: "Sheikh Housing Advisors", email: "farida.sheikh@sha.com", phone: "+91 91778 55443", status: "INACTIVE", leadsSourced: 22, siteVisitsSourced: 14, bookingsConverted: 3, commissionEarned: 410_000, commissionPending: 0, joinedAt: "2025-09-30" },
];

export const siteVisits: SiteVisit[] = [
  { id: "VIS-3001", customerName: "Rehan Sharma", project: "Green Meadows", plot: "A-112", source: "CUSTOMER", scheduledAt: "2026-09-12 10:00 AM", status: "SCHEDULED", assignedTo: "Arjun Mehta" },
  { id: "VIS-3002", customerName: "Priya Nair", project: "Sunrise Valley", plot: "C-204", source: "BROKER_CHANNEL", brokerName: "Nisha Verma", scheduledAt: "2026-09-12 12:30 PM", status: "CONFIRMED", assignedTo: "Divya Rao" },
  { id: "VIS-3003", customerName: "Karan Malhotra", project: "Emerald Hills", plot: "B-018", source: "CUSTOMER", scheduledAt: "2026-09-11 04:00 PM", status: "COMPLETED", assignedTo: "Arjun Mehta" },
  { id: "VIS-3004", customerName: "Vikram Chauhan", project: "Palm County", plot: "D-091", source: "BROKER_CHANNEL", brokerName: "Suresh Kulkarni", scheduledAt: "2026-09-10 11:00 AM", status: "FOLLOW_UP_REQUIRED", assignedTo: "Divya Rao" },
  { id: "VIS-3005", customerName: "Sneha Reddy", project: "Sunrise Valley", plot: "C-110", source: "CUSTOMER", scheduledAt: "2026-09-09 03:00 PM", status: "NO_SHOW", assignedTo: "Arjun Mehta" },
  { id: "VIS-3006", customerName: "Ananya Iyer", project: "Green Meadows", plot: "A-045", source: "CUSTOMER", scheduledAt: "2026-09-08 09:30 AM", status: "CONVERTED", assignedTo: "Divya Rao" },
  { id: "VIS-3007", customerName: "Meera Pillai", project: "Palm County", plot: "D-033", source: "BROKER_CHANNEL", brokerName: "Suresh Kulkarni", scheduledAt: "2026-09-07 02:00 PM", status: "CANCELLED", assignedTo: "Arjun Mehta" },
];

export const bookings: Booking[] = [
  {
    id: "BKG-2026-001043",
    customerName: "Rehan Sharma",
    customerEmail: "rehan.sharma@example.com",
    customerPhone: "+91 98765 43210",
    project: "Green Meadows",
    plot: "A-112",
    plotStatus: "ON_HOLD",
    status: "UNDER_REVIEW",
    amount: 2_450_000,
    paymentMethod: "ONLINE",
    paymentStatus: "CAPTURED",
    paymentReference: "PAY-90213847",
    kycStatus: "VERIFIED",
    version: 7,
    createdAt: "2026-09-08",
    documents: [
      { id: "DOC-1", name: "PAN Card", type: "PAN", status: "VERIFIED", uploadedAt: "2026-09-08" },
      { id: "DOC-2", name: "Aadhaar Card", type: "AADHAAR", status: "VERIFIED", uploadedAt: "2026-09-08" },
      { id: "DOC-3", name: "Address Proof", type: "ADDRESS_PROOF", status: "VERIFIED", uploadedAt: "2026-09-08" },
      { id: "DOC-4", name: "Passport Photo", type: "PHOTO", status: "VERIFIED", uploadedAt: "2026-09-08" },
    ],
    decisionHistory: [
      { actor: "System", action: "Payment received", timestamp: "2026-09-08 11:02 AM" },
      { actor: "Divya Rao", action: "KYC documents verified", timestamp: "2026-09-09 03:40 PM" },
    ],
  },
  {
    id: "BKG-2026-001044",
    customerName: "Ananya Iyer",
    customerEmail: "ananya.iyer@example.com",
    customerPhone: "+91 90210 55667",
    project: "Green Meadows",
    plot: "A-045",
    plotStatus: "ON_HOLD",
    status: "KYC_PENDING",
    amount: 1_980_000,
    paymentMethod: "ONLINE",
    paymentStatus: "CAPTURED",
    paymentReference: "PAY-90213902",
    kycStatus: "NEEDS_RESUBMISSION",
    version: 3,
    createdAt: "2026-09-09",
    documents: [
      { id: "DOC-5", name: "PAN Card", type: "PAN", status: "VERIFIED", uploadedAt: "2026-09-09" },
      { id: "DOC-6", name: "Aadhaar Card", type: "AADHAAR", status: "NEEDS_RESUBMISSION", uploadedAt: "2026-09-09" },
      { id: "DOC-7", name: "Address Proof", type: "ADDRESS_PROOF", status: "PENDING", uploadedAt: "2026-09-09" },
    ],
    decisionHistory: [
      { actor: "System", action: "Payment received", timestamp: "2026-09-09 09:12 AM" },
      { actor: "Arjun Mehta", action: "Requested Aadhaar resubmission", timestamp: "2026-09-10 10:05 AM", note: "Image blurred, name not legible" },
    ],
  },
  {
    id: "BKG-2026-001040",
    customerName: "Meera Pillai",
    customerEmail: "meera.pillai@example.com",
    customerPhone: "+91 98765 99887",
    project: "Palm County",
    plot: "D-033",
    plotStatus: "BOOKED",
    status: "APPROVED",
    amount: 3_120_000,
    paymentMethod: "ONLINE",
    paymentStatus: "CAPTURED",
    paymentReference: "PAY-90209981",
    kycStatus: "VERIFIED",
    version: 9,
    createdAt: "2026-08-30",
    documents: [
      { id: "DOC-8", name: "PAN Card", type: "PAN", status: "VERIFIED", uploadedAt: "2026-08-30" },
      { id: "DOC-9", name: "Aadhaar Card", type: "AADHAAR", status: "VERIFIED", uploadedAt: "2026-08-30" },
    ],
    decisionHistory: [
      { actor: "System", action: "Payment received", timestamp: "2026-08-30 01:20 PM" },
      { actor: "Arjun Mehta", action: "KYC and payment verified", timestamp: "2026-08-31 09:15 AM" },
      { actor: "Arjun Mehta", action: "Booking approved, plot marked BOOKED", timestamp: "2026-08-31 09:16 AM" },
    ],
  },
  {
    id: "BKG-2026-001038",
    customerName: "Karan Malhotra",
    customerEmail: "karan.m@example.com",
    customerPhone: "+91 99220 33445",
    project: "Emerald Hills",
    plot: "B-018",
    plotStatus: "RELEASE_PENDING",
    status: "REJECTED",
    amount: 1_650_000,
    paymentMethod: "ONLINE",
    paymentStatus: "REFUND_PENDING",
    paymentReference: "PAY-90201122",
    kycStatus: "REJECTED",
    version: 5,
    createdAt: "2026-08-22",
    documents: [
      { id: "DOC-10", name: "PAN Card", type: "PAN", status: "REJECTED", uploadedAt: "2026-08-22" },
    ],
    decisionHistory: [
      { actor: "System", action: "Payment received", timestamp: "2026-08-22 04:45 PM" },
      { actor: "Divya Rao", action: "KYC rejected — PAN mismatch", timestamp: "2026-08-24 11:00 AM", note: "PAN name does not match booking profile" },
    ],
  },
];

export const refunds: Refund[] = [
  { id: "RFD-5001", bookingId: "BKG-2026-001038", customerName: "Karan Malhotra", amount: 1_650_000, method: "ONLINE", status: "PROCESSING", reason: "KYC rejected — PAN mismatch", requestedAt: "2026-08-24" },
  { id: "RFD-5002", bookingId: "BKG-2026-001021", customerName: "Ibrahim Qureshi", amount: 980_000, method: "CASH", status: "CASH_REFUND_PENDING", reason: "Customer requested cancellation", requestedAt: "2026-09-02" },
  { id: "RFD-5003", bookingId: "BKG-2026-001009", customerName: "Ritu Bansal", amount: 2_100_000, method: "ONLINE", status: "COMPLETED", reason: "Duplicate booking cancelled", requestedAt: "2026-08-10" },
  { id: "RFD-5004", bookingId: "BKG-2026-000998", customerName: "Manoj Tiwari", amount: 540_000, method: "CASH", status: "CASH_COLLECTED", reason: "Site visit dissatisfaction", requestedAt: "2026-07-28" },
  { id: "RFD-5005", bookingId: "BKG-2026-001051", customerName: "Fatima Ansari", amount: 1_320_000, method: "ONLINE", status: "FAILED", reason: "Gateway declined reversal", requestedAt: "2026-09-05" },
];

export const revenueTransactions: RevenueTransaction[] = [
  { id: "TXN-88012", bookingId: "BKG-2026-001040", customerName: "Meera Pillai", project: "Palm County", amount: 3_120_000, method: "ONLINE", status: "CAPTURED", date: "2026-08-30" },
  { id: "TXN-88031", bookingId: "BKG-2026-001043", customerName: "Rehan Sharma", project: "Green Meadows", amount: 2_450_000, method: "ONLINE", status: "CAPTURED", date: "2026-09-08" },
  { id: "TXN-88045", bookingId: "BKG-2026-001044", customerName: "Ananya Iyer", project: "Green Meadows", amount: 1_980_000, method: "ONLINE", status: "CAPTURED", date: "2026-09-09" },
  { id: "TXN-87990", bookingId: "BKG-2026-001021", customerName: "Ibrahim Qureshi", project: "Sunrise Valley", amount: 980_000, method: "CASH", status: "CASH_RECORDED", date: "2026-09-01" },
  { id: "TXN-87960", bookingId: "BKG-2026-001009", customerName: "Ritu Bansal", project: "Emerald Hills", amount: 2_100_000, method: "ONLINE", status: "REFUNDED", date: "2026-08-09" },
];

export const auditLogs: AuditLogEntry[] = [
  { id: "AUD-9001", actor: "Arjun Mehta", action: "BOOKING_APPROVED", entity: "Booking", entityId: "BKG-2026-001040", priorState: "UNDER_REVIEW", newState: "APPROVED", timestamp: "2026-08-31 09:16 AM", requestId: "req_7f2a1c" },
  { id: "AUD-9000", actor: "Arjun Mehta", action: "KYC_VERIFIED", entity: "Document", entityId: "DOC-8", priorState: "PENDING", newState: "VERIFIED", timestamp: "2026-08-31 09:15 AM", requestId: "req_6e1b0a" },
  { id: "AUD-8998", actor: "Divya Rao", action: "KYC_REJECTED", entity: "Document", entityId: "DOC-10", priorState: "PENDING", newState: "REJECTED", timestamp: "2026-08-24 11:00 AM", requestId: "req_5d0a99" },
  { id: "AUD-8990", actor: "System", action: "REFUND_INITIATED", entity: "Refund", entityId: "RFD-5001", priorState: "NOT_REQUIRED", newState: "PENDING", timestamp: "2026-08-24 11:01 AM", requestId: "req_5d0a9a" },
  { id: "AUD-8975", actor: "Arjun Mehta", action: "SETTLEMENT_APPROVED", entity: "Settlement", entityId: "SET-2026-000245", priorState: "UNDER_REVIEW", newState: "APPROVED", timestamp: "2026-08-20 02:30 PM", requestId: "req_4c9f88" },
  { id: "AUD-8960", actor: "Divya Rao", action: "BOOKING_CANCELLED", entity: "Booking", entityId: "BKG-2026-000998", priorState: "APPROVED", newState: "CANCELLED", timestamp: "2026-07-28 05:10 PM", requestId: "req_3b8e77" },
];

export const settlements: Settlement[] = [
  { id: "SET-2026-000245", bookingId: "BKG-2026-001043", brokerName: "Suresh Kulkarni", project: "Green Meadows", commissionAmount: 125_000, approvedAmount: 125_000, status: "APPROVED", createdAt: "2026-09-09", version: 5 },
  { id: "SET-2026-000241", bookingId: "BKG-2026-001040", brokerName: "Nisha Verma", project: "Palm County", commissionAmount: 156_000, status: "UNDER_REVIEW", createdAt: "2026-08-31", version: 2 },
  { id: "SET-2026-000238", bookingId: "BKG-2026-001021", brokerName: "Suresh Kulkarni", project: "Sunrise Valley", commissionAmount: 49_000, status: "ON_HOLD", createdAt: "2026-09-01", version: 3 },
  { id: "SET-2026-000230", bookingId: "BKG-2026-000998", brokerName: "Rajesh Menon", project: "Emerald Hills", commissionAmount: 27_000, status: "REVERSED", createdAt: "2026-07-29", version: 4 },
  { id: "SET-2026-000225", bookingId: "BKG-2026-000970", brokerName: "Suresh Kulkarni", project: "Green Meadows", commissionAmount: 210_000, approvedAmount: 210_000, status: "PAID", createdAt: "2026-07-15", version: 6 },
];

export const brokerAccountSummary = {
  totalEarned: 1_850_000,
  pendingApproval: 156_000,
  approvedUnpaid: 125_000,
  paidThisMonth: 0,
  lifetimePaid: 1_360_000,
  onHold: 49_000,
};
