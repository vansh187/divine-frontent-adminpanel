# Backend change: CSV import for admin sections

**For:** backend team (DivineVisionInfraBackend)
**Size:** medium. One new admin endpoint with four entity handlers. No migration: every handler writes to tables that already exist, using the same rules as today's single-record writes.
**Frontend status:** shipped in the admin panel. Export and sample download already work on every section, because they only use the existing list endpoints. Import is complete on the admin side. Until this endpoint is live, the import dialog says *"Importing needs a server update that isn't live yet"* and nothing is saved.

## What the client asked for

> Admins can export and import the data in the form of CSV in all sections, with one button to download a sample file so admins can prepare files in the export / import format.

| Section | Export | Sample | Import |
|---|---|---|---|
| Customers & Leads | yes | yes | **yes**: `customers` |
| Channel Partners | yes | yes | **yes**: `brokers` |
| Site Visits | yes | yes | **yes**: `visits` |
| Payment Plans | yes | yes | **yes**: `payment-plans` (add new plans only) |
| Booking Queue, Refunds, Revenue | yes | yes | no: these records come from the payment and KYC flows, which keep the audit trail (gateway ids, decision history, receipts). |

## What the admin panel does before calling you

The browser parses the CSV, matches headers (case and spacing don't matter), and checks every cell against the rules below. It calls the endpoint only when **every** row passes. Values arrive already normalised: labels are turned into API values (`"Channel Partner"` → `CHANNEL_PARTNER`), dates into `YYYY-MM-DD`, times into `HH:MM`. Columns the import doesn't use (`Created At`, `Status` on customers, …) are not sent. **Still validate everything on the server.** The browser checks are only there for fast feedback.

## Endpoint

```
POST /admin/imports/{entity}          entity: customers | brokers | visits | payment-plans
Authorization: Bearer <admin token>
Idempotency-Key: <uuid v4>            one per file the admin chose
Content-Type: application/json

{ "rows": [ { "row": 2, ...fields }, { "row": 3, ...fields } ] }
```

- `row` is the spreadsheet row number (the header is row 1). Echo it back in errors. Don't store it.
- At most **5,000** rows. Reply **413** above that.
- **All or nothing.** Validate every row, then write them all in **one transaction**. If any row fails, write nothing.
- **Blank means unchanged.** A field that is not in a row object was blank in the file. On update, leave that field as it is. On create, use the same default as today's single-record create.
- **Idempotency.** Store the key with the successful response for 24 h, scoped to the admin. If the same key arrives again with the same body, return the stored response without writing. If it arrives with a different body, reply `409 {"detail": "idempotency_conflict"}`. Don't store failed attempts: the admin fixes the file, which gets a new key anyway. `admin_booking_kyc_api.py` already has this pattern.
- **Rate limit:** the default 60/min per admin is fine. One file is one request.

### Success: 200

```json
{ "created": 12, "updated": 3 }
```

### Rows refused: 422 (nothing written)

```json
{
  "detail": {
    "code": "import_invalid",
    "message": "2 rows have problems. Nothing was imported.",
    "errors": [
      { "row": 5, "field": "email", "message": "A customer with this email already exists." },
      { "row": 9, "field": "id", "message": "No customer with this ID." }
    ]
  }
}
```

`field` is the request field name. The admin panel turns it into the column header, and `field` may be left out for a row-level problem. Write `message` for the admin: it is shown exactly as sent. Return every problem you find, not just the first. FastAPI's own 422 for a malformed body is also handled (the panel maps `loc: ["body", "rows", <index>, <field>]` to the row).

Other statuses the panel explains to the admin: 404 or 405 (endpoint not live yet), 413, 429, 5xx (it asks the admin to retry with the same key).

## Entities

### `customers`

| Field | Rules |
|---|---|
| `id` | optional. Present: **update** that customer. Unknown id → row error. |
| `full_name` | 2–200 characters. Required on create. |
| `email` | valid email. Required on create. Unique, case-insensitive, among customers **and** within the file. |
| `phone` | 1–20 characters. Required on create. |

Create works exactly like `serviceAdminCustomers.create_customer`: a real account with a random password, set later through forgot-password, plus `source = WEBSITE`. Update changes only the fields sent, and an email change must still be unique.

### `brokers`

| Field | Rules |
|---|---|
| `id` | optional → update. Unknown → row error. |
| `full_name` | 2–200. Required on create. |
| `email` | valid, unique among brokers and within the file. Required on create. |
| `phone` | 1–20. Required on create. |
| `project` | `suraksha-enclave` or `ops-divine-greens`. Required on create. |

New brokers get a random password and use forgot-password, the same as customers. If broker accounts need anything else at creation (approval state, referral code, …), set it here the way broker signup does.

### `visits`

| Field | Rules |
|---|---|
| `id` | optional → update. Unknown → row error. |
| `origin_type` | `CUSTOMER` or `CHANNEL_PARTNER`. Required on create. Can't change on update. |
| `customer_name` | 2–200. Required on create. |
| `customer_contact` | 1–20 |
| `customer_email` | valid email |
| `project_name` | `suraksha-enclave` or `ops-divine-greens` |
| `plot_number` | ≤ 50 |
| `source`, `assigned_to`, `preferred_window` | ≤ 100 each |
| `visit_date` | `YYYY-MM-DD` |
| `visit_time` | `HH:MM`, 24-hour |
| `status` | `requested`, `scheduled`, `confirmed`, `completed`, `follow_up`, `no_show`, `converted`, `cancelled`. Defaults to `scheduled` on create (`requested` when there is no `visit_date`). |
| `notes` | ≤ 2000 |

`GET /admin/visits` merges customer and channel-partner visits (`serviceAdminVisits`), so write each row to the table its `origin_type` belongs to. Make sure the `id` you return in the list is enough to find the row again on update: if the two tables can share id values, prefix them in the list or reply with a row error.

### `payment-plans`

Each row is one complete plan, in exactly the shape of `POST /admin/payment-plans` (`PaymentPlanCreatePayload`), plus `row` (the plan's first line in the file):

```json
{ "row": 2, "code": "PP5/CLP/10-40-50", "short_code": "PP5", "name": "Construction Linked Plan",
  "description": null, "project_id": "suraksha-enclave", "sort_order": 4,
  "instalments": [ { "label": "Booking amount", "percent": 10, "due_trigger": "booking", "due_days": 0, "charge_head": null }, … ] }
```

Run each plan through `servicePaymentPlans.create_plan`'s validation, and create them all in one transaction. **Create only:** an existing code → row error `payment_plan_exists`. Codes and active short codes must also be unique within the file. Map the service's error codes to row errors on `row`. The panel already builds these payloads with the same code as the Add Payment Plan form, so anything the single-plan endpoint accepts is accepted here.

## Tests to add

1. A valid file creates every row, and `GET` lists them.
2. One bad row among many → 422 listing that row, and **nothing** is written. Check the table counts.
3. Update by `id` changes only the fields sent.
4. Duplicate email within the file, and against the database → both refused.
5. Same `Idempotency-Key` and body twice → one write, same response. Same key with a different body → 409.
6. 5,001 rows → 413.
7. A non-admin token → 401 or 403.

## Frontend reference

- Column layouts and import rules: `src/features/csv/sections.ts`
- Parsing, validation and error mapping: `src/features/csv/csvModel.ts`
- API call: `importRows()` in `src/lib/api.ts`
