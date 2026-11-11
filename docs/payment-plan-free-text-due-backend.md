# Backend change: free-text "Counted from" and two-charge combinations on payment plan instalments

**For:** backend team (DivineVisionInfraBackend)
**Frontend status:** shipped in the admin panel and backward compatible. Plans that use only single charges or "All", and
"Booking date" / "Offer of Possession date" with 0 days on the first instalment work today.
Everything else in this doc is rejected by the current backend until this change goes live.
The admin panel then shows: *"The server did not accept this plan. Custom 'Counted from' events…
need a server update."*

### Backend status (checked against the working copy on 2026-11-11)

| Part | Status |
|---|---|
| Sections 1–5: custom "Counted from" (`due_trigger: "custom"`, `due_from`, `due_text`), editable booking-amount due | **Implemented, uncommitted** in the backend working copy. Field names match this doc. Migration `07_payment_plan_custom_events.sql` (adds `due_from`, widens milestone `charge_head` to `varchar(20)`) says it was applied to production on 2026-11-11. |
| Section 6: two-charge combinations (`PLC+IFMS`, `PLC+CAM`, `IFMS+CAM`) | **Implemented, uncommitted** in the backend working copy. |

### Contract test: run it before committing

[`docs/testing/backend_contract_test.py`](testing/backend_contract_test.py) sends the **exact** payloads the admin panel builds to the backend's real API. They come from `src/features/paymentPlans/__fixtures__/planPayloadContract.json`, and the admin panel's unit tests check that the form produces exactly these payloads. The test checks:
- the accepted/refused status;
- the worked example and due wording;
- the database round-trip;
- that refused plans are never saved;
- the customer page's `GET /admin/bookings` query and booking-detail fields.

It detects which features the backend supports. Unsupported features must be refused with nothing saved; supported ones must work exactly. Run instructions are at the top of the file.

Results on 2026-11-11:

| Backend | Detected support | Contract test | Full backend suite |
|---|---|---|---|
| Committed (`58da5ed`) | none of the three | 32/32 passed | 1513 passed, 5 failed (see below) |
| Working copy (uncommitted) | custom event, booking-amount due, charge pairs | 32/32 passed | 1610 passed, 15 skipped, 11 failed (see below) |

None of the full-suite failures involve payment plans, bookings or customers:
- **`test_inventory_*`** (1 committed, 7 working) failed with `401 token_expired`. These tests sign their tokens when the file loads, and the two suites ran in parallel for 80 minutes. Rerun alone, both files pass on both copies.
- **`test_admin_help_support_api.py`** (4 on both copies, identical) failed with `ticket_email_failed`. They need the real email settings from `.env`, which wasn't copied into the test environment (dummy secrets only). The failure is the same on the committed code, so it is not a regression.

## What the client asked for

On **Add Payment Plan**, every instalment field except **Add charges** is now free text:

| Field | Before | Now |
|---|---|---|
| Label | text | text (unchanged) |
| % of BSP | text | text (unchanged) |
| Counted from | dropdown: Booking date / Offer of Possession date | **free text**, with those two as suggestions |
| Days later | number, **locked to 0 on instalment 1** | number, **editable on every row incl. instalment 1** |
| Add charges | dropdown: PLC / IFMS / CAM / All | dropdown, **adds the pairs** PLC + IFMS / PLC + CAM / IFMS + CAM (All kept) |
| Display order | number field | **removed from the UI** (see below; no backend change) |

## How the admin panel sends "Counted from"

The panel maps the typed text onto `due_trigger`. It ignores case and extra spaces, and a leading "the" / "date of" and a trailing "date" don't change the result:

| Admin types | `due_trigger` | `due_from` |
|---|---|---|
| `Booking date`, `booking`, `Date of booking` | `"booking"` | *not sent* |
| `Offer of Possession date`, `Possession`, `offer of possession` | `"possession"` | *not sent* |
| anything else, e.g. `Completion of plinth` | **`"custom"`** (new) | **`"Completion of plinth"`** (new) |

So standard plans send exactly the same payload as before. Only custom rows add anything new.

## Required changes

### 1. Accept `due_trigger: "custom"` and a new `due_from` field

`DivineAPI/payment_plan_api.py`, `PlanInstalmentInDTO`:

```python
due_trigger: Literal["booking", "possession", "custom"] = "booking"
due_days: Optional[int] = Field(0, ge=0, le=3650)
due_from: Optional[str] = Field(None, max_length=100,
                                description="Required when due_trigger='custom': the event the days count from")
```

`DivineService/service_payment_plans.py`:

- `DUE_TRIGGERS = ("booking", "possession", "custom")`
- `normalize_definition`: when `trigger == "custom"`, require `due_from` stripped, 1–100 chars, else `ValueError("invalid_instalments")`. Store it on the instalment as `"due_from": due_from`. For booking/possession, store `due_from: None`. Ignore any value sent.
- `validate_plan`: a `custom` row must have a non-empty `due_from`.

### 2. Wording and due date for custom rows

```python
def due_text(row: dict) -> str:
    days = row.get("due_days")
    trigger = row.get("due_trigger") or "booking"
    if trigger == "custom":
        event = (row.get("due_from") or "").strip()
        return f"On {event}" if not days else f"{days} days after {event}"
    if trigger == "possession":
        return "On Offer of Possession" if not days else f"{days} days after Offer of Possession"
    return "On booking" if not days else f"{days} days after booking"
```

`compute_schedule`: for `custom` rows there is no anchor date, so `due_date = None`. Treat it like a possession row before the possession date is set. Include `due_from` in each output row.

`public_plan`: include `"due_from": r.get("due_from")` in each instalment.

### 3. Allow instalment 1 (booking amount) to have any due

Remove this rule from `validate_plan`:

```python
first = rows[0]
if (first.get("due_trigger") or "booking") != "booking" or int(first.get("due_days") or 0) != 0:
    raise ValueError("invalid_payment_plan")
```

This is safe for payments. `service_milestones._row_is_on_booking` already treats **row index 0** as the booking payment and marks it paid at booking, whatever its due settings. Only the displayed wording and `due_date` of row 1 change.

### 4. Milestones, demand letter and booking detail: rows with no date

- `service_milestones._rows_from_plan`: also copy `due_text` (and `due_from`) onto each milestone row, so screens can show "30 days after Completion of plinth" when `due_date` is null. `compute_status` already returns `"upcoming"` for a null `due_date`, so no change is needed there.
- `BookingPaymentScheduleRowDTO` (DivineDTO/models.py): add `due_text: Optional[str] = None`. The admin panel already shows `due_text` in the Due Date column whenever `due_date` is null.
- `service_demand_letter._awaiting_possession`: treat custom rows with no date the same as possession rows. Do not demand them yet, and show the wording in the due cell:

  ```python
  return _s(row.get("due_trigger")).lower() in ("possession", "custom") and not _to_date(row.get("due_date"))
  ```

  In the due cell, use the row's `due_text` instead of the fixed "On Possession" when the trigger is `custom`.
- Reminders: no change needed. Rows without a `due_date` are never "due"/"overdue", so no reminder is sent. The admin panel tells the admin this when they type a custom event.

### 5. Check the customer website

Any customer-facing screen that branches on `due_trigger` should handle `"custom"` by showing `due_text`. I found no `due_trigger` usage in `DivineVisionInfraFrontEnd/src`, but please double-check before release.

### 6. Two-charge combinations in "Add charges"

The dropdown now offers 7 values. The admin panel sends them as `charge_head`:

| Option | `charge_head` | Status |
|---|---|---|
| PLC / IFMS / CAM | `"PLC"` / `"IFMS"` / `"CAM"` | works today |
| PLC + IFMS | **`"PLC+IFMS"`** | new |
| PLC + CAM | **`"PLC+CAM"`** | new |
| IFMS + CAM | **`"IFMS+CAM"`** | new |
| All (PLC + IFMS + CAM) | `"ALL"` | works today |

Pairs always use the order PLC, IFMS, CAM, joined with `+` and no spaces. This is the same format `compute_schedule` already outputs in its rows (`"+".join(heads)`).

Changes:

- `payment_plan_api.py`, `PlanInstalmentInDTO`:
  ```python
  charge_head: Optional[Literal["PLC", "IFMS", "CAM", "PLC+IFMS", "PLC+CAM", "IFMS+CAM", "ALL"]] = None
  ```
- `service_payment_plans.py`:
  ```python
  CHARGE_HEADS = ("PLC", "IFMS", "CAM")
  PAIR_CHARGE_HEADS = ("PLC+IFMS", "PLC+CAM", "IFMS+CAM")
  ROW_CHARGE_HEADS = CHARGE_HEADS + PAIR_CHARGE_HEADS + ("ALL",)

  def charges_in(head):
      """'PLC+CAM' -> ['PLC', 'CAM'], 'ALL' -> all three, None -> []."""
      if not head:
          return []
      return list(CHARGE_HEADS) if head == "ALL" else head.split("+")
  ```
- `normalize_definition`: replace the "no head twice, ALL only alone" check with an **individual-charge** check, so each of PLC/IFMS/CAM sits on at most one row:
  ```python
  used = [c for r in instalments for c in charges_in(r["charge_head"])]
  if len(set(used)) != len(used):
      raise ValueError("invalid_payment_plan")
  ```
- `compute_schedule`: choose each charge's carrier row by membership, not equality. A charge no row carries still falls back to the last row, as today:
  ```python
  for head in CHARGE_HEADS:
      idx = next((i for i, r in enumerate(rows) if head in charges_in(r.get("charge_head"))), len(rows) - 1)
      carrier[head] = idx
  ```
  The output row's `charge_head` (`"+".join(heads)`) and `charge_amount` need no change.
- `service_demand_letter._head_text`: it already prints "BSP + Charges" for any head containing `+`. Optionally print the actual charges (`f"BSP + {charge.replace('+', ' + ')}"`).

Also, `normalize_definition` upper-cases and strips the head (`"plc+ifms"` → `"PLC+IFMS"`). Do **not** accept spaces or another order (`"PLC + IFMS"`, `"IFMS+PLC"`). The admin panel always sends the exact values in the table above.

#### Database: inserting a plan with a combination is safe, and no migration is needed

| Column | Size | Longest value written | OK? |
|---|---|---|---|
| `divine_payment_plan_instalments.charge_head` (plan definition) | `varchar(10)` | `"PLC+IFMS"` / `"IFMS+CAM"` = 8 chars | yes |
| `divine_payment_milestones.charge_head` (a booking's instalments) | `varchar(20)` (migration 07) | computed `"PLC+IFMS+CAM"` = 12 chars | yes |

Keep `"ALL"` as the stored token for all three. **Never store `"PLC+IFMS+CAM"` in the plan table**: at 12 chars it would overflow `varchar(10)` and the insert would fail.

Other readers of `charge_head` already cope with a `+` in the value:
- reminders, `service_payment_reminders.py:215`, produce "… (incl. PLC+IFMS)";
- the demand letter `_head_text` prints "BSP + Charges";
- the customer profile and booking detail pass the value through.

**Deploy order:** ship the DTO change and the `ROW_CHARGE_HEADS` / `charges_in` change **together**.
- If only the DTO accepts pairs, `normalize_definition` rejects them with `400 invalid_instalments`. That is safe: nothing is saved.
- If the service code is later rolled back, plans already saved with a pair fail `validate_plan` on load. They show as `valid: false` and can't be used for new bookings. Existing bookings are unaffected, because their instalments are stored in `divine_payment_milestones`.

## Sample requests and responses: two-charge combinations

Example prices used by every worked example: BSP 50,00,000 · PLC 1,00,000 · IFMS 50,000 · CAM 75,000 · Total 52,25,000.

### E. Create a plan with "PLC + IFMS": `POST /admin/payment-plans`

Request:

```json
{
  "code": "PP7/FPP/10-40-50",
  "short_code": "PP7",
  "name": "Flexible Payment Plan 10-40-50",
  "description": "10% on booking, 40% (+PLC, IFMS) within 45 days, 50% (+CAM) on Offer of Possession.",
  "project_id": "suraksha-enclave",
  "sort_order": 7,
  "instalments": [
    { "label": "Booking Amount",            "percent": 10, "due_trigger": "booking",    "due_days": 0,  "charge_head": null },
    { "label": "Within 45 days of booking", "percent": 40, "due_trigger": "booking",    "due_days": 45, "charge_head": "PLC+IFMS" },
    { "label": "On Offer of Possession",    "percent": 50, "due_trigger": "possession", "due_days": 0,  "charge_head": "CAM" }
  ]
}
```

Response `201 Created`:

```json
{
  "code": "PP7/FPP/10-40-50",
  "short_code": "PP7",
  "name": "Flexible Payment Plan 10-40-50",
  "description": "10% on booking, 40% (+PLC, IFMS) within 45 days, 50% (+CAM) on Offer of Possession.",
  "project_id": "suraksha-enclave",
  "version": 1,
  "instalments": [
    { "seq": 1, "label": "Booking Amount",            "percent": 10, "due_trigger": "booking",    "due_days": 0,  "due_from": null, "due_text": "On booking",             "charge_head": null },
    { "seq": 2, "label": "Within 45 days of booking", "percent": 40, "due_trigger": "booking",    "due_days": 45, "due_from": null, "due_text": "45 days after booking",  "charge_head": "PLC+IFMS" },
    { "seq": 3, "label": "On Offer of Possession",    "percent": 50, "due_trigger": "possession", "due_days": 0,  "due_from": null, "due_text": "On Offer of Possession", "charge_head": "CAM" }
  ],
  "booking_percent": 10,
  "example": {
    "sale_price": 5000000, "plc": 100000, "ifms": 50000, "cam": 75000, "total": 5225000, "booking_amount": 500000,
    "rows": [
      { "seq": 1, "label": "Booking Amount",            "percent": 10, "due_text": "On booking",             "basic_amount": 500000,  "charge_head": null,       "charge_amount": 0,      "amount": 500000 },
      { "seq": 2, "label": "Within 45 days of booking", "percent": 40, "due_text": "45 days after booking",  "basic_amount": 2000000, "charge_head": "PLC+IFMS", "charge_amount": 150000, "amount": 2150000 },
      { "seq": 3, "label": "On Offer of Possession",    "percent": 50, "due_text": "On Offer of Possession", "basic_amount": 2500000, "charge_head": "CAM",      "charge_amount": 75000,  "amount": 2575000 }
    ]
  },
  "is_active": true,
  "sort_order": 7,
  "valid": true,
  "created_date": "2026-11-11T10:15:00+00:00",
  "last_updated_date": "2026-11-11T10:15:00+00:00"
}
```

Rows written to `divine_payment_plan_instalments`: `(seq 1, charge_head NULL)`, `(seq 2, charge_head 'PLC+IFMS')`, `(seq 3, charge_head 'CAM')`.

`POST /admin/payment-plans/validate` with the same body returns the same JSON with `200` and without the admin fields (`is_active` … `last_updated_date`). It saves nothing.

### F. "PLC + CAM": instalments and expected worked example

```json
"instalments": [
  { "label": "Booking Amount",            "percent": 10, "due_trigger": "booking",    "due_days": 0,  "charge_head": null },
  { "label": "Within 45 days of booking", "percent": 40, "due_trigger": "booking",    "due_days": 45, "charge_head": "PLC+CAM" },
  { "label": "On Offer of Possession",    "percent": 50, "due_trigger": "possession", "due_days": 0,  "charge_head": "IFMS" }
]
```

```json
"rows": [
  { "seq": 1, "basic_amount": 500000,  "charge_head": null,      "charge_amount": 0,      "amount": 500000 },
  { "seq": 2, "basic_amount": 2000000, "charge_head": "PLC+CAM", "charge_amount": 175000, "amount": 2175000 },
  { "seq": 3, "basic_amount": 2500000, "charge_head": "IFMS",    "charge_amount": 50000,  "amount": 2550000 }
]
```

### G. "IFMS + CAM": instalments and expected worked example

```json
"instalments": [
  { "label": "Booking Amount",            "percent": 10, "due_trigger": "booking",    "due_days": 0,  "charge_head": null },
  { "label": "Within 45 days of booking", "percent": 40, "due_trigger": "booking",    "due_days": 45, "charge_head": "IFMS+CAM" },
  { "label": "On Offer of Possession",    "percent": 50, "due_trigger": "possession", "due_days": 0,  "charge_head": "PLC" }
]
```

```json
"rows": [
  { "seq": 1, "basic_amount": 500000,  "charge_head": null,       "charge_amount": 0,      "amount": 500000 },
  { "seq": 2, "basic_amount": 2000000, "charge_head": "IFMS+CAM", "charge_amount": 125000, "amount": 2125000 },
  { "seq": 3, "basic_amount": 2500000, "charge_head": "PLC",      "charge_amount": 100000, "amount": 2600000 }
]
```

### H. Pair with the third charge left unassigned

A charge no row carries falls to the **last** row, as it does today.

```json
"instalments": [
  { "label": "Booking Amount", "percent": 10, "due_trigger": "booking", "due_days": 0,  "charge_head": "PLC+IFMS" },
  { "label": "Balance",        "percent": 90, "due_trigger": "booking", "due_days": 60, "charge_head": null }
]
```

```json
"rows": [
  { "seq": 1, "basic_amount": 500000,  "charge_head": "PLC+IFMS", "charge_amount": 150000, "amount": 650000 },
  { "seq": 2, "basic_amount": 4500000, "charge_head": "CAM",      "charge_amount": 75000,  "amount": 4575000 }
]
```

The `booking_amount` here is `650000`, because row 1 carries PLC + IFMS. The stored plan rows keep `charge_head` = `'PLC+IFMS'` and `NULL`. Only the computed schedule shows `CAM` on row 2.

### I. Rejected combinations: `400 {"detail": "invalid_payment_plan"}`, nothing saved

| Instalment A | Instalment B | Why |
|---|---|---|
| `"PLC+IFMS"` | `"PLC"` | PLC twice |
| `"PLC+IFMS"` | `"PLC+CAM"` | PLC twice |
| `"IFMS+CAM"` | `"ALL"` | IFMS and CAM twice |
| `"PLC+CAM"` | `"PLC+CAM"` | same pair twice |

## Sample requests and responses: custom "Counted from"

### A. Dry run with a custom event: `POST /admin/payment-plans/validate`

Request:

```json
{
  "code": "PP6/CLP/10-40-50",
  "short_code": "PP6",
  "name": "Construction Linked Plan 10:40:50",
  "description": null,
  "project_id": "suraksha-enclave",
  "sort_order": 6,
  "instalments": [
    { "label": "Booking Amount",          "percent": 10, "due_trigger": "booking",    "due_days": 0,  "charge_head": null },
    { "label": "On completion of plinth", "percent": 40, "due_trigger": "custom",     "due_days": 30, "due_from": "Completion of plinth", "charge_head": null },
    { "label": "On Offer of Possession",  "percent": 50, "due_trigger": "possession", "due_days": 0,  "charge_head": "ALL" }
  ]
}
```

Response `200` (same shape as today, plus `due_from`):

```json
{
  "code": "PP6/CLP/10-40-50",
  "short_code": "PP6",
  "name": "Construction Linked Plan 10:40:50",
  "description": null,
  "project_id": "suraksha-enclave",
  "version": 1,
  "instalments": [
    { "seq": 1, "label": "Booking Amount",          "percent": 10, "due_trigger": "booking",    "due_days": 0,  "due_from": null,                   "due_text": "On booking",                        "charge_head": null },
    { "seq": 2, "label": "On completion of plinth", "percent": 40, "due_trigger": "custom",     "due_days": 30, "due_from": "Completion of plinth", "due_text": "30 days after Completion of plinth", "charge_head": null },
    { "seq": 3, "label": "On Offer of Possession",  "percent": 50, "due_trigger": "possession", "due_days": 0,  "due_from": null,                   "due_text": "On Offer of Possession",            "charge_head": "ALL" }
  ],
  "booking_percent": 10,
  "example": {
    "sale_price": 5000000, "plc": 100000, "ifms": 50000, "cam": 75000, "total": 5225000, "booking_amount": 500000,
    "rows": [
      { "seq": 1, "label": "Booking Amount",          "percent": 10, "due_text": "On booking",                         "basic_amount": 500000,  "charge_head": null,           "charge_amount": 0,      "amount": 500000 },
      { "seq": 2, "label": "On completion of plinth", "percent": 40, "due_text": "30 days after Completion of plinth", "basic_amount": 2000000, "charge_head": null,           "charge_amount": 0,      "amount": 2000000 },
      { "seq": 3, "label": "On Offer of Possession",  "percent": 50, "due_text": "On Offer of Possession",             "basic_amount": 2500000, "charge_head": "PLC+IFMS+CAM", "charge_amount": 225000, "amount": 2725000 }
    ]
  }
}
```

`POST /admin/payment-plans` takes the same body and returns the same plan, plus the usual admin fields (`is_active`, `sort_order`, `created_date`, …).

### B. Booking amount not due on the booking date

Request (instalments only; the rest as in A):

```json
"instalments": [
  { "label": "Booking Amount", "percent": 25, "due_trigger": "booking", "due_days": 7,  "charge_head": null },
  { "label": "Balance",        "percent": 75, "due_trigger": "booking", "due_days": 60, "charge_head": "ALL" }
]
```

Expected: `200`, with instalment 1 `"due_text": "7 days after booking"`. Today this returns `400 invalid_payment_plan`.

### C. Booking detail schedule row for a custom instalment: `GET /admin/bookings/{id}`

```json
{
  "id": "<booking-application-document-id>-m2",
  "label": "On completion of plinth",
  "percent": 40,
  "due_days": 30,
  "due_date": null,
  "due_text": "30 days after Completion of plinth",
  "amount": 2000000,
  "status": "upcoming",
  "pay_enabled_from": "2026-11-11",
  "paid_on": null,
  "paid_payment_id": null,
  "basic_amount": 2000000,
  "charge_head": null,
  "charge_amount": 0,
  "due_trigger": "custom"
}
```

### D. Errors

| Case | Response |
|---|---|
| `due_trigger: "custom"` with missing/blank `due_from` | `400 {"detail": "invalid_instalments"}` |
| `due_from` longer than 100 chars | `422` (DTO) |
| unknown `due_trigger`, e.g. `"slab"` | `422` (DTO) |
| unknown `charge_head`, e.g. `"CAM+PLC"` (wrong order) | `422` (DTO) |
| the same charge on two rows, e.g. `"PLC+IFMS"` + `"PLC"` | `400 {"detail": "invalid_payment_plan"}` |

## No backend change needed

- **Display order:** removed from the admin UI only. The panel now sends `sort_order` = (highest existing `sort_order` + 1, max 1000), so new plans go last in the customer dropdown. It omits the field (backend default `0`) if the plan list didn't load. `sort_order` stays optional with `ge=0, le=1000`, exactly as today.

## Optional improvement: exact customer filter on the bookings list

The customer detail page lists a customer's plots with `GET /admin/bookings?search=<customer_id>` (substring match), then filters on the client. It already **also sends `customer_id`**, which FastAPI ignores today. If you add it, the page gets exact results with no frontend change:

```
GET /admin/bookings?customer_id=CUST-00123&search=CUST-00123&page=1&page_size=100
```

```python
customer_id: Optional[str] = Query(None, max_length=100, description="Exact customer id")
# SQL: AND (:customer_id IS NULL OR customer_id = :customer_id)   -- list_queue and count_queue
```

The response shape is unchanged (`BookingQueueResponseDTO`).

## Tests to add (tests/test_payment_plans.py)

1. A custom row with `due_from` validates; `due_text` = "N days after <event>" / "On <event>"; its `due_date` is null in `compute_schedule`.
2. A custom row without `due_from` gives `invalid_instalments`.
3. A first instalment with `due_days` 7, or with trigger `possession`/`custom`, now validates, and its milestone is still marked paid at booking.
4. The demand letter doesn't demand a custom row with no date, and shows its `due_text`.
5. Existing booking/possession-only plans produce identical output (regression).
6. Samples E–H: each charge lands on the right row, and the amounts match exactly (including H, where the unassigned charge falls to the last row).
7. Overlapping charges (`"PLC+IFMS"` + `"PLC"`, `"IFMS+CAM"` + `"ALL"`) give `invalid_payment_plan`.
8. Existing plans using single heads or `"ALL"` produce identical output (regression).
