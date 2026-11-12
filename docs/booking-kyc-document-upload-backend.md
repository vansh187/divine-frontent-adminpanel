# Admin booking KYC document upload — backend integration spec

**Status:** Proposed contract, to implement and align with the frontend  
**Audience:** Backend/API engineers  
**API style:** Existing FastAPI-style JSON API, bearer-token admin authentication, booking detail response.

## Endpoint

```text
POST /api/v1/admin/bookings/{booking_id}/documents/{document_type}
```

Example deployment URL:

```text
https://divinevisioninfrabackend-301k.onrender.com/api/v1/admin/bookings/BKG-2026-00123/documents/pan_card
```

If `/api/v1` is already included in the deployment's `VITE_API_BASE_URL`, configure the route without duplicating the prefix. Confirm this with the current API router before implementation.

Supported document types (allowlist only): `aadhaar_front`, `aadhaar_back`, `pan_card`, `applicant_photo`, `cancelled_cheque`.

## Authentication, authorization, and headers

Required headers:

```http
Authorization: Bearer <valid-admin-access-token>
Accept: application/json
Idempotency-Key: <UUID>
Content-Type: multipart/form-data; boundary=<client-generated>
```

The client must not manually set the multipart `Content-Type`; the HTTP client supplies the boundary. Enforce authentication and admin approval/active status in a dependency. Enforce role permission such as `bookings:documents:write` (or the repository's established admin role model), tenant/project scope where applicable, and booking status rules in the service. Do not rely on hidden frontend controls.

Recommended policy: allow upload/replacement only while `status == pending_kyc_review`; if the business needs post-approval corrections, define a separate audited correction workflow. Reject rejected/cancelled/booked states by default. Re-check permission and state atomically when committing the document pointer.

## Multipart request

```http
POST /api/v1/admin/bookings/BKG-2026-00123/documents/pan_card HTTP/1.1
Host: divinevisioninfrabackend-301k.onrender.com
Authorization: Bearer <admin-access-token>
Accept: application/json
Idempotency-Key: 2f105db8-7109-4b1a-8e44-22227a8c9181
Content-Type: multipart/form-data; boundary=----client-boundary

------client-boundary
Content-Disposition: form-data; name="file"; filename="pan-card-replacement.pdf"
Content-Type: application/pdf

<binary file bytes>
------client-boundary
Content-Disposition: form-data; name="expected_version"

7
------client-boundary
Content-Disposition: form-data; name="note"

Replacement PAN supplied after name mismatch
------client-boundary--
```

| Part/header | Required | Validation |
|---|---:|---|
| `file` | Yes | Non-empty; maximum 10 MiB; allow only `.pdf`, `.jpg`, `.jpeg`, `.png` with matching detected content (`application/pdf`, `image/jpeg`, `image/png`); verify magic bytes/content, not filename or client MIME alone. Reject mismatches and encrypted/unsupported PDFs if the scanning pipeline cannot inspect them. |
| `expected_version` | Yes | Integer >= 1; compare to the booking's current version using an atomic optimistic concurrency check. |
| `note` | No | Trim, max 500 characters, safe plain text; never interpret as markup. |
| `Idempotency-Key` | Yes | UUID recommended; bind to admin ID + route + request fingerprint; retain at least 24 hours. Same key with different file/fields returns 409. |

File type/size allowlist should be confirmed with product/compliance before release. Suggested defaults above are intentionally narrow. Consider virus/malware scanning and quarantine before the uploaded document becomes previewable or usable for approval.

## Success response

Return `200 OK`, `Content-Type: application/json`, and the refreshed `ApiBookingDetail` shape already used by `GET /admin/bookings/{id}`. Return short-lived signed preview URLs only for authorized admin responses; recommended expiry is 300 seconds. Do not return object-store keys or public URLs.

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

In production, return all configured document checklist entries, including missing entries, as `GET /admin/bookings/{id}` does. `uploaded: true` means a file exists, not that it is valid or verified. Uploading must not change `kyc_status` to `verified`, set booking status to `booked`, or implicitly invoke approval. The admin reviews the file and uses the existing approval endpoint.

## Error contract and HTTP status codes

Keep the API's current FastAPI-compatible error envelope (`detail` string or object with `code` and `message`), for example:

```json
{
  "detail": {
    "code": "version_conflict",
    "message": "Booking changed since it was loaded. Refresh and try again."
  }
}
```

| Status | Code | When |
|---:|---|---|
| 400 | `invalid_multipart` | Missing/malformed multipart data or invalid idempotency key syntax. |
| 401 | `unauthorized` | Missing, expired, or invalid bearer token. |
| 403 | `forbidden` | Authenticated user is not an active authorized admin or lacks booking scope. |
| 404 | `booking_not_found` | Booking does not exist or is outside caller's permitted scope; avoid disclosing its existence across scopes. |
| 409 | `version_conflict` | `expected_version` is stale; include current version if policy allows. |
| 409 | `booking_not_uploadable` | Current booking state does not allow this mutation. |
| 409 | `idempotency_conflict` | Same key reused with a different request fingerprint. |
| 413 | `file_too_large` | Request/file exceeds 10 MiB limit. Configure ingress and application limits. |
| 415 | `unsupported_media_type` | File extension, detected MIME, or signature not allowed. |
| 422 | `validation_error` | Missing required field, invalid document type/note/version. |
| 429 | `rate_limited` | Per-admin upload limit exceeded; include `Retry-After` seconds. |
| 500 | `internal_error` | Unexpected internal failure; generic message only, with correlation ID. |
| 503 | `document_storage_unavailable` | Object storage or malware-scanning dependency unavailable. |

Always return `application/json` for errors. Include a request/correlation ID header in success and error responses. Never return stack traces, storage keys, signed URLs, SQL details, or raw exception strings to clients.

## Rate limiting and request limits

Suggested initial limits (tune from observed traffic):

- Per authenticated admin: **10 document uploads per minute**, burst of 3.
- Per booking: **20 uploads per hour** across admins to reduce replacement abuse.
- Maximum request body: **11 MiB** including multipart overhead, with an exact file cap of 10 MiB.
- Apply limits at both edge/API gateway and application identity level. Return `429` with `Retry-After`, and expose standard `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset` headers where infrastructure supports them.
- Exempt idempotent replays from consuming another storage write, but still apply a modest request/read limit to prevent abuse.

Use a shared limiter (e.g. Redis or gateway limiter) in multi-instance deployments; an in-process counter is not sufficient. Ensure proxy/body limits agree so oversized data is rejected before it is fully buffered.

## Security, storage, and audit controls

- HTTPS only. Validate JWT signature, issuer, audience, expiry, active-admin state, and required permission on every request.
- Validate booking scope and state server-side; defend against IDOR. Use parameterized database queries and atomic `WHERE id = :id AND version = :expected_version` semantics.
- Allowlist exactly `.pdf`, `.jpg`, `.jpeg`, and `.png`, requiring matching detected MIME and file signatures (`application/pdf`, `image/jpeg`, `image/png`). Both `.jpg` and `.jpeg` are valid extensions for `image/jpeg`. Reject every other extension, MIME type, or signature, including mismatches. Generate storage object names server-side; do not trust paths or filenames. Strip path components and store original filename only as sanitized metadata if needed.
- Keep objects private with encryption at rest and in transit. Restrict storage IAM to the service. Serve preview via short-expiry signed URL or authenticated streaming route. Add `X-Content-Type-Options: nosniff`, safe `Content-Disposition`, and a restrictive CSP on any preview host.
- Malware scan/quarantine before setting `uploaded=true`. If scanning is asynchronous, represent `pending_scan` explicitly and block approval until clean; do not claim upload means KYC verification.
- On replacement, retain immutable prior object/version metadata according to retention policy; do not expose prior versions unless an authorized audit workflow exists. Delete orphan objects safely after failed DB commits.
- In one durable transaction, persist document metadata, increment booking version, update last activity, write audit/decision-history event (actor ID, timestamp, type, prior/new object version, note, request ID), and record idempotency result. Avoid logging file bytes or sensitive identifiers.
- Apply privacy retention/deletion rules for PAN/Aadhaar and access logging. Restrict document preview to least privilege and audit reads if required by policy.
- Configure CORS to the known admin frontend origins only; allow `Authorization`, `Idempotency-Key`, and request ID headers, and expose `Retry-After` plus the request ID header so the frontend can show the retry delay and correlate failures. Never use wildcard origin with credentials.

## FastAPI implementation and exception handling

Keep the route thin: authentication/authorization dependencies, bounded multipart parsing, then a service that performs state/version checks, scanning, storage, audit, and persistence. Do not use an empty or broad `except: pass`, return success after a failed write, or leak `str(exc)`.

Illustrative structure (adapt names and repository conventions):

```python
from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile, status

router = APIRouter()

@router.post(
    "/admin/bookings/{booking_id}/documents/{document_type}",
    response_model=BookingDetailResponse,
    status_code=status.HTTP_200_OK,
)
async def upload_booking_document(
    booking_id: str,
    document_type: BookingDocumentType,
    file: UploadFile = File(...),
    expected_version: int = Form(..., ge=1),
    note: str | None = Form(default=None, max_length=500),
    idempotency_key: str = Header(alias="Idempotency-Key"),
    admin: Admin = Depends(require_permission("bookings:documents:write")),
    service: BookingDocumentService = Depends(get_booking_document_service),
):
    try:
        result = await service.upload(
            booking_id=booking_id,
            document_type=document_type,
            upload=file,
            expected_version=expected_version,
            note=note,
            idempotency_key=idempotency_key,
            admin=admin,
        )
        return await service.get_booking_detail_for_admin(result.booking_id, admin)
    except BookingNotFound:
        raise HTTPException(status_code=404, detail={"code": "booking_not_found", "message": "Booking not found."})
    except BookingVersionConflict:
        raise HTTPException(status_code=409, detail={"code": "version_conflict", "message": "Booking changed since it was loaded. Refresh and try again."})
    except BookingNotUploadable:
        raise HTTPException(status_code=409, detail={"code": "booking_not_uploadable", "message": "This booking cannot accept document uploads in its current state."})
    except InvalidDocument as exc:
        raise HTTPException(status_code=415, detail={"code": "unsupported_media_type", "message": exc.safe_message})
    except DocumentTooLarge:
        raise HTTPException(status_code=413, detail={"code": "file_too_large", "message": "File exceeds the 10 MiB limit."})
    except IdempotencyConflict:
        raise HTTPException(status_code=409, detail={"code": "idempotency_conflict", "message": "Idempotency key was already used for a different request."})
    except DocumentStorageUnavailable:
        raise HTTPException(status_code=503, detail={"code": "document_storage_unavailable", "message": "Document service is temporarily unavailable."})
    except Exception:
        logger.exception("Unexpected booking document upload failure", extra={"request_id": request_id_var.get()})
        raise HTTPException(status_code=500, detail={"code": "internal_error", "message": "Unable to upload document. Contact support with the request ID."})
    finally:
        await file.close()
```

Important implementation notes:

- In production, centralize exception-to-response mapping in the app's exception handlers where appropriate; the route example shows required mappings, not a mandate to duplicate boilerplate in every route. Use typed domain exceptions and catch expected failures explicitly. A final catch-all may log a correlation ID and return generic 500, but must never suppress the error or expose internals.
- FastAPI validation and request-size errors need registered handlers to preserve the JSON error envelope. Authentication/permission failures should map to 401/403. Ensure framework and reverse-proxy 413/429 responses also use a compatible JSON shape where configurable.
- `UploadFile` alone does not guarantee a strict streaming limit. Read in bounded chunks and stop above the cap; configure proxy limits, avoid loading the whole file into memory, and clean temporary files.
- Validate file signature after bounded read, not only extension or declared MIME. Scanner timeout/error is 503 and leaves no live document pointer.
- Storage and DB do not share a transaction. Use a safe staging key, scan, then atomic DB pointer/audit/idempotency commit; on failure delete the staged object or enqueue reliable cleanup. On DB success, prior object retention follows policy.
- Generate a fresh preview URL for the returned booking detail; signed URL creation failure must not roll back a successfully persisted upload. Return `preview_url: null` and let the normal detail endpoint refresh it, or return a controlled dependency error according to the established service contract.
- Make idempotency replay return the original successful result without repeating storage/audit writes. Store a hash/fingerprint, not file contents.

## Approval integration

The existing `POST /admin/bookings/{id}/approve` must independently enforce:

1. Booking state is `pending_kyc_review`.
2. All required document types exist and have passed malware scanning.
3. Any required human review/verification state is satisfied according to business policy.
4. Expected booking version matches atomically.

Do not treat presence of all files as proof of valid identity. If the current backend approval only checks upload presence, tighten it as part of this feature or explicitly document the existing review policy. The upload endpoint itself must never mark KYC verified or finalize the booking.

## Operational observability

- Emit structured logs with request ID, admin ID, booking ID, document type, file byte count, result code, duration, and idempotency replay flag; omit file contents, PAN/Aadhaar values, bearer tokens, and signed URLs.
- Metrics: upload attempts/success/failure by safe error code and document type, bytes, scan latency/failures, storage failures, 409 rate, and 429 rate. Avoid customer-identifying metric labels.
- Alert on unusual per-admin volume, scan backlog/failures, storage errors, repeated authorization failures, and elevated 5xx rates.

## Backend acceptance checklist

- Authenticated, authorized admin can upload and replace allowlisted document types; unauthorized and out-of-scope access is rejected.
- Correct 200 response returns the refreshed detail shape and a short-lived private preview URL.
- Upload/replacement increments booking version and creates immutable audit history with actor, timestamp, note, request ID, and document type.
- Version mismatch, invalid booking state, unsupported type/file, oversized file, storage/scanner failure, and rate limit map to the documented status and safe JSON envelope.
- Idempotent retries do not create duplicate objects or audit events; key reuse with different contents is rejected.
- Files are private, bounded, scanned, and unavailable to preview/approval until clean.
- Approval independently validates state, version, and required documents; upload never auto-approves KYC.
- Error handling uses explicit domain mappings and a sanitized 500 handler; no static/mock API path or swallowed exceptions.
