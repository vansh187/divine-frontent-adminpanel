# Backend change: number of plots using each payment plan

**For:** backend team (DivineVisionInfraBackend)
**Size:** small. One read-only query and one new field on an existing endpoint. No migration, no new endpoint, and nothing changes in booking, payment or plan writes.
**Frontend status:** shipped in the admin panel and backward compatible. Until this change is live, the field shows "-" with the note *"Available after the server update"*. The page needs no further change once the backend sends the field.

## What the client asked for

> **Payment Plan – Number of Plots**
> - Add a new field named **Number of Plots Using This Payment Plan** in the Payment Plan section.
> - This field should display the total number of plots currently assigned to the respective payment plan.
> - The count should update automatically whenever a plot is assigned to or removed from the payment plan.

## What the admin panel needs

On `GET /admin/payment-plans`, add one integer to **every** plan version in `plans`:

```jsonc
{
  "count": 2,
  "plans": [
    { "code": "PP1/FPP/10-15-25-25-15-10", "version": 2, "is_active": true,  "plots_count": 5, ... },
    { "code": "PP1/FPP/10-15-25-25-15-10", "version": 1, "is_active": false, "plots_count": 3, ... }
  ]
}
```

| Field | Type | Meaning |
|---|---|---|
| `plots_count` | int, ≥ 0 | Plots with an **active booking** made on **this exact code and version** |

Count **per version**, not per code. The admin panel adds the versions up itself and shows the total ("8" above). When customers are on more than one version, it also shows the split ("v1: 3 · v2: 5"). Customers keep the version they booked on, so plots on retired versions still count towards the plan.

No other endpoint changes. The admin panel reads only this field.

## What counts as "a plot using the plan"

A plot counts when all three hold:

1. It has a row in `divine_bookings` with `status` in `('pending_kyc_review', 'booked')`. This is the same "active booking" rule `service_offline_import.py` already uses.
2. That booking's payment (`divine_payments.id = divine_bookings.payment_id`) has plan terms in `notes.payment_plan`. These are written by `servicePayment._booking_plan_terms()` for both gateway and manually recorded booking payments.
3. `notes.payment_plan.payment_plan_code` and `notes.payment_plan.payment_plan_version` match the plan entry.

Count **distinct `inventory_id`**, so one plot is never counted twice.

| Situation | Counted? |
|---|---|
| Booking payment made, KYC review pending (`pending_kyc_review`) | Yes: the plot is held on this plan |
| Booking approved (`booked`) | Yes |
| Booking rejected (`rejected`) or cancelled (`cancelled`) | No: the plot is released |
| Legacy booking made before payment plans existed (no `notes.payment_plan`) | No: it isn't on any plan |
| Offline buyer imported from the client sheet (no booking row or plan terms) | No |
| Plan deactivated (`is_active = false`) | Its plots **still count**: deactivating doesn't move anyone off the plan |
| Terms without `payment_plan_version` | Count them on the code's **newest** version. `booking_terms()` always writes the version, so this is only a safety net. |

**"Updates automatically"** is met by computing the count live on every request. Don't store a counter, add triggers, or hook into approve/reject/cancel. Every change of booking status shows up on the next request. The admin panel refetches the list when the page opens, after the admin activates or deactivates a plan, and when the admin comes back to the browser tab. Don't put this count behind `servicePaymentPlans._cached` (`admin_list` isn't cached today, so leave it that way).

## Suggested implementation

### 1. Persistence: `Divinepersistence/persistence_payment_plan.py`

Add a query to `_DEFAULT_QUERIES`:

```python
"list_active_booking_plan_terms": (
    "SELECT b.inventory_id, p.notes FROM divine_bookings b "
    "JOIN divine_payments p ON p.id = b.payment_id "
    "WHERE b.status IN ('pending_kyc_review', 'booked');"
),
```

and a read method on `persistencePaymentPlan`:

```python
def count_plots_by_plan(self) -> dict:
    """{(code, version or None): number of distinct plots} over active bookings
    (pending KYC review or booked) whose booking payment carries plan terms."""
    plots = {}
    with self._session_factory() as db:
        rows = db.execute(text(self._queries["list_active_booking_plan_terms"])).mappings().all()
    for row in rows:
        notes = row["notes"]
        if isinstance(notes, str):           # SQLite returns the JSON as text, Postgres JSONB as a dict
            try:
                notes = json.loads(notes)
            except ValueError:
                continue
        terms = notes.get("payment_plan") if isinstance(notes, dict) else None
        code = terms.get("payment_plan_code") if isinstance(terms, dict) else None
        if not code or not row["inventory_id"]:
            continue
        version = terms.get("payment_plan_version")
        key = (str(code), int(version) if version not in (None, "") else None)
        plots.setdefault(key, set()).add(row["inventory_id"])
    return {key: len(ids) for key, ids in plots.items()}
```

The JSON is parsed in Python on purpose, so the same code runs on SQLite (the test suite) and Postgres (production). It's one query per admin list request, over active bookings only. That's fine at the current scale. If bookings grow into tens of thousands, swap in a Postgres `GROUP BY` on `notes->'payment_plan'->>'payment_plan_code'` / `->>'payment_plan_version'` with `COUNT(DISTINCT b.inventory_id)`, and keep the Python version for SQLite.

I ran the query read-only against `test_db.sqlite`. It runs and the join is correct. That database had no plan-linked bookings left after the test runs, so it returned no counts.

### 2. Service: `servicePaymentPlans.admin_list()` in `DivineService/service_payment_plans.py`

Get the counts once, before the loop, and add the field to each `view`:

```python
def admin_list(self, project_id: str = None) -> list:
    try:
        counts = self._persistence.count_plots_by_plan()
    except Exception:
        logger.exception("payment_plan_plot_counts_failed")
        counts = None                        # leave the field out; never fail the plan list over it
    plans = self._persistence.list_all(project_id)
    newest = {}
    for plan in plans:                       # newest version of each code, for terms without a version
        newest[plan["code"]] = max(newest.get(plan["code"], 0), int(plan.get("version") or 1))
    out = []
    for plan in plans:
        ...                                  # existing view building, unchanged
        if counts is not None:
            version = int(plan.get("version") or 1)
            n = counts.get((plan["code"], version), 0)
            if version == newest[plan["code"]]:
                n += counts.get((plan["code"], None), 0)
            view["plots_count"] = n
        out.append(view)
    return out
```

If counting fails, **leave the field out** rather than sending `0`. The admin panel then shows "-" instead of a wrong "0", and the plan list keeps working.

`_admin_view()` (the reply to `PATCH /admin/payment-plans`) goes through `admin_list()`, so it picks up the field automatically. The admin panel doesn't rely on it there.

## Tests to add

In `tests/test_payment_plan_api_flow.py`, which already books a plot on a test plan end to end:

- After **test_03/04** (booking payment with the plan + application upload): the plan's entry in `GET /admin/payment-plans` has `plots_count == 1`. Every other plan's count is unchanged.
- After **test_07** (admin approves): still `1`.
- After **test_11** (plan switched off): still `1`, because deactivating doesn't remove plots.
- A booking that is **rejected** or **cancelled** brings the count back to `0`.

Unit tests for `count_plots_by_plan()`:

- Notes as a JSON string (SQLite) and as a dict (Postgres) both count.
- `notes = '{}'`, broken JSON, `payment_plan` without a code, and an empty `inventory_id` are all skipped without raising.
- Two versions of one code are counted separately.
- Terms without `payment_plan_version` are added to the newest version only.
- A plot is counted once even if it appears twice.

And one for `admin_list()`: when `count_plots_by_plan()` raises, the list still returns every plan, without `plots_count`.

## Out of scope / for later

- **Moving a plot to another plan.** No such feature exists today: a booking's plan is fixed by its booking payment. If one is added, it must rewrite `notes.payment_plan` on the booking payment, or this count will drift.
- **Offline buyers** from the client sheet aren't linked to any plan, so they aren't counted. Counting them would need the import to record a plan per buyer.
