// Static placeholder data for UI development only.
// Every value here will be replaced by live API responses once the backend
// endpoints listed in the HLD (§9 API Endpoint Wiring Matrix) are wired up.
import type {
  Booking,
  Broker,
  Customer,
  RevenueTransaction,
} from "./types";

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
      { id: "DOC-3", name: "Cancelled Cheque", type: "CANCELLED_CHEQUE", status: "VERIFIED", uploadedAt: "2026-09-08" },
      { id: "DOC-4", name: "Photo", type: "PHOTO", status: "VERIFIED", uploadedAt: "2026-09-08" },
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
      { id: "DOC-7", name: "Cancelled Cheque", type: "CANCELLED_CHEQUE", status: "PENDING", uploadedAt: "2026-09-09" },
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

export const revenueTransactions: RevenueTransaction[] = [
  { id: "TXN-88012", bookingId: "BKG-2026-001040", customerName: "Meera Pillai", project: "Palm County", amount: 3_120_000, method: "ONLINE", status: "CAPTURED", date: "2026-08-30" },
  { id: "TXN-88031", bookingId: "BKG-2026-001043", customerName: "Rehan Sharma", project: "Green Meadows", amount: 2_450_000, method: "ONLINE", status: "CAPTURED", date: "2026-09-08" },
  { id: "TXN-88045", bookingId: "BKG-2026-001044", customerName: "Ananya Iyer", project: "Green Meadows", amount: 1_980_000, method: "ONLINE", status: "CAPTURED", date: "2026-09-09" },
  { id: "TXN-87990", bookingId: "BKG-2026-001021", customerName: "Ibrahim Qureshi", project: "Sunrise Valley", amount: 980_000, method: "CASH", status: "CASH_RECORDED", date: "2026-09-01" },
  { id: "TXN-87960", bookingId: "BKG-2026-001009", customerName: "Ritu Bansal", project: "Emerald Hills", amount: 2_100_000, method: "ONLINE", status: "REFUNDED", date: "2026-08-09" },
];

