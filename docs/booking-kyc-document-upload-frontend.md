# Admin booking KYC document upload — frontend integration spec

**Status:** Frontend implemented against the backend integration guide  
**Audience:** Frontend engineers  
**Scope:** Upload or replace a customer's KYC file from the admin booking detail page.

## Existing frontend context

`src/features/bookings/BookingDetailPage.tsx` renders the checklist and provides admin upload, replacement, and secure preview actions. `src/lib/api.ts` sends uploads as `multipart/form-data` without setting `Content-Type` manually. The backend integration guide is the source of truth for this endpoint contract.

Do not add a mock/static upload response or mark a file uploaded locally. The API response is authoritative. Keep the existing `ApiBookingDetail` as the upload response and refresh the full booking from the server after successful upload.

## Contract and URL

Base URL is `VITE_API_BASE_URL`, defaulting to `https://divinevisioninfrabackend-301k.onrender.com`. Routes have no `/api/v1` prefix; the frontend strips a trailing `/api/v1` from the configured base URL. The route is:

```text
POST /admin/bookings/{booking_id}/documents/{document_type}
```

Supported `{document_type}` values are `aadhaar_front`, `aadhaar_back`, `pan_card`, `applicant_photo`, and `cancelled_cheque`. Uploads replace the current file for the same type; the backend must preserve audit history and never silently overwrite the old object.

### Request

```http
POST /admin/bookings/BKG-2026-00123/documents/pan_card HTTP/1.1
Authorization: Bearer <admin-access-token>
Idempotency-Key: 2f105db8-7109-4b1a-8e44-22227a8c9181
Accept: application/json
Content-Type: multipart/form-data; boundary=<browser-generated>
```

Multipart parts:

| Name | Type | Required | Description |
|---|---|---:|---|
| `file` | File | Yes | Maximum 10 MiB. Aadhaar front/back, PAN, and applicant photo accept `.jpg`, `.jpeg`, or `.png`; only cancelled cheque also accepts `.pdf`. Extension, browser MIME, and file content must match. |
| `expected_version` | integer text | Yes | Current `booking.version` to prevent overwriting a booking changed by another admin. |
| `note` | text | No | Short reason, e.g. `Replacement PAN supplied after name mismatch`; cap at 500 characters. |

The browser must generate the multipart boundary. Do not set `Content-Type` yourself. `Idempotency-Key` should be a fresh UUID per user submission and reused only when retrying that exact submission after a network failure.

### Success response — `200 OK`

Return the refreshed booking detail using the existing response shape. `preview_url` is a private signed link expiring after `preview_url_expires_in` seconds (currently 3600). The frontend re-fetches booking detail before opening a preview and does not persist signed URLs.

```json
{
  "id": "BKG-2026-00123",
  "status": "pending_kyc_review",
  "kyc_status": "needs_resubmission",
  "version": 8,
  "admin_note": null,
  "customer_id": "CUS-00421",
  "customer_name": "Aarav Sharma",
  "customer_email": "aarav@example.com",
  "customer_phone": "+919876543210",
  "project_name": "Divine Meadows",
  "unit_number": "A-104",
  "amount": 250000,
  "payment_id": "PAY-8801",
  "payment_method": "razorpay",
  "payment_status": "captured",
  "gateway_payment_id": "pay_example_123",
  "razorpay_payment_id": null,
  "utr_number": null,
  "cheque_number": null,
  "documents": [
    {
      "document_type": "pan_card",
      "label": "PAN Card",
      "uploaded": true,
      "preview_url": "https://documents.example.invalid/short-lived-signed-url",
      "preview_url_expires_in": 300,
      "uploaded_at": "2026-10-23T16:10:00Z"
    },
    {
      "document_type": "aadhaar_front",
      "label": "Aadhaar Front",
      "uploaded": true,
      "preview_url": "https://documents.example.invalid/short-lived-signed-url-2",
      "preview_url_expires_in": 300,
      "uploaded_at": "2026-10-22T11:00:00Z"
    },
    {
      "document_type": "aadhaar_back",
      "label": "Aadhaar Back",
      "uploaded": true,
      "preview_url": "https://documents.example.invalid/short-lived-signed-url-3",
      "preview_url_expires_in": 300,
      "uploaded_at": "2026-10-22T11:00:00Z"
    },
    {
      "document_type": "applicant_photo",
      "label": "Applicant Photo",
      "uploaded": true,
      "preview_url": "https://documents.example.invalid/short-lived-signed-url-4",
      "preview_url_expires_in": 300,
      "uploaded_at": "2026-10-22T11:00:00Z"
    },
    {
      "document_type": "cancelled_cheque",
      "label": "Cancelled Cheque",
      "uploaded": true,
      "preview_url": "https://documents.example.invalid/short-lived-signed-url-5",
      "preview_url_expires_in": 300,
      "uploaded_at": "2026-10-22T11:00:00Z"
    }
  ],
  "decision_history": [
    {
      "actor": "Admin: Divya Rao",
      "action": "kyc_document_uploaded",
      "note": "Replacement PAN supplied after name mismatch",
      "created_at": "2026-10-23T16:10:00Z"
    }
  ],
  "payment_schedule": [],
  "next_due": null,
  "amount_received": 250000,
  "created_at": "2026-10-20T12:30:00Z",
  "last_activity_at": "2026-10-23T16:10:00Z"
}
```

The response above illustrates the contract. Preserve nullable fields as `null`; do not infer a KYC or document verification status from `uploaded: true`. Uploading does not approve KYC or approve the booking.

## Frontend implementation requirements

1. `uploadBookingDocument` sends `FormData` fields `file`, `expected_version`, and optional `note`, plus a UUID `Idempotency-Key`. It preserves bearer auth and the existing unauthorized handler.
2. Upload and replacement controls are shown only while the booking is `pending_kyc_review`. Aadhaar front/back, PAN, and applicant photo accept `.jpg`, `.jpeg`, and `.png`; cancelled cheque also accepts `.pdf`. Validate extension, matching browser MIME, and the 10 MiB limit for usability; the backend also validates actual file content. Display the selected filename and require an explicit upload action.
3. Disable that row's control while uploading. Show progress if the transport supports it; otherwise show an indeterminate `Uploading…` state. After `200`, replace state with the server response, refresh preview URLs, clear the file input, and show a success notice. Never optimistically set `uploaded` or `kyc_status`.
4. On `409 version_conflict`, reload booking detail and tell the admin the booking changed; require them to inspect and submit again. Do not silently retry with a newer version.
5. Keep `Approve` gated by the required document set being uploaded and the booking being reviewable, and always rely on the backend approve endpoint for the final decision. Fix the checklist rule to explicitly check the required document types: `[].every(...)` is true for an empty list and must not enable approval if the API omitted documents.
6. Put the checklist/upload section inside `SectionErrorBoundary` (or an equivalent local `ErrorBoundary`) so a rendering failure in that section does not blank the entire booking page. The upload event handler must also catch request errors and render a recoverable inline message; an error boundary does not catch rejected promises or event-handler errors.
7. Preserve the page's existing request-version/cancellation guards so a late upload response for a previous booking ID cannot overwrite the current page. If the admin navigates away mid-upload, ignore the stale UI update; server-side upload may already have completed, so reloading the booking on return is authoritative.
8. Use the existing `ApiError` parser. Map errors to useful text without exposing raw server internals:

| HTTP | Frontend behavior |
|---:|---|
| 400 / 422 | Show safe validation message (unsupported document type, missing part, invalid note/version). |
| 401 | Existing `authRequest` unauthorized handler logs out/redirects. |
| 403 | Explain admin lacks permission. |
| 404 | Booking not found or document type unsupported; refresh/return to queue. |
| 409 | Reload booking, explain version conflict or booking no longer accepts uploads. |
| 413 | Explain 10 MiB limit. |
| 415 | Explain supported formats. |
| 429 | Disable uploads for the returned `Retry-After` interval; if the global limiter omits it, use 60 seconds. Keep the exact request and key for retry. |
| 5xx / network | Keep the selected file and reuse the key for the identical request. For `document_saved_refresh_failed`, report that the file was saved and re-fetch booking detail rather than reporting upload failure. |

## Security and privacy requirements

- Send the bearer token only to the configured API origin over HTTPS. Include `X-Request-ID` from API errors in the displayed support reference. Do not include tokens, document bytes, signed URLs, or full PAN/Aadhaar values in logs, analytics, error telemetry, or browser storage.
- Avoid putting signed preview URLs in query logs or persistent caches. Fetch a fresh URL before opening previews, open it in a new tab with `noopener,noreferrer`, and treat it as a secret.
- Do not render filenames as HTML. Render through normal React text escaping. Clear file input state after completion and on booking change.
- Respect server-side role and booking scope checks. Frontend route visibility is not an authorization boundary.
- Do not auto-approve or claim KYC is verified after a file upload. The admin must inspect and invoke the existing approve action.

## Acceptance checklist

- Admin can upload or replace each supported type from the correct booking detail.
- Success is reflected from the API response and preview works with a fresh URL.
- Missing, malformed, oversized, unauthorized, stale-version, rate-limited, network, and server errors produce useful UI feedback without crashing the page.
- The upload section's render errors are isolated by an error boundary.
- No mock/static success path is introduced.
- Uploading alone never approves the booking or marks KYC verified.
