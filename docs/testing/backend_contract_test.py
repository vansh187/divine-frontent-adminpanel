"""Admin panel <-> backend contract test for payment plans and the customer page.

Sends the EXACT payloads the admin panel builds (src/features/paymentPlans/__fixtures__/
planPayloadContract.json, which the admin panel's own unit tests assert byte-for-byte) to the
backend's real API, on a throwaway SQLite database, and checks:

  * plans using only what this backend supports are accepted, with the worked example,
    the due wording and the charge placement exactly as the admin panel expects;
  * the stored plan reads back from the database unchanged and valid (no column overflow);
  * plans needing a feature this backend lacks (custom "Counted from", editable booking-amount
    due, charge pairs) are refused with 400/422 and NOTHING is saved;
  * plans the admin panel blocks are refused by the backend too;
  * GET /admin/bookings accepts the customer page's query, and the booking-detail DTO has
    every field the customer page reads.

Feature support is detected from the backend code itself, so the same file runs against the
committed backend (new features must be refused safely) and the updated one (they must work).

How to run (from the backend repo root; it only uses the local SQLite test database):

    copy this file to tests/test_admin_panel_contract.py
    set ADMIN_PANEL_CONTRACT=<path to planPayloadContract.json>
    set RATE_LIMIT_CALLS=100000        # the suite makes more than 60 requests a minute
    (plus dummy ADMIN_JWT_SECRET_KEY / JWT_SECRET_KEY / GEMINI_API_KEY / GROQ_API_KEY if no .env)
    python -m pytest tests/test_admin_panel_contract.py -v
"""
import inspect
import json
import os

import pytest
from pydantic import ValidationError
from sqlalchemy import text

import DivineService.service_payment_plans as pp
from DivineAPI.payment_plan_api import PlanInstalmentInDTO
from DivineDTO.models import BookingDetailDTO, BookingPaymentScheduleRowDTO
# Reuse the backend's own fixtures: temp SQLite DB, seeded PP1-PP4, admin-authenticated client.
from test_payment_plans import admin_api, api, factory, plan_persistence, plan_service  # noqa: F401

CONTRACT_PATH = os.environ.get("ADMIN_PANEL_CONTRACT")
if not CONTRACT_PATH:
    pytest.skip("ADMIN_PANEL_CONTRACT is not set", allow_module_level=True)
with open(CONTRACT_PATH, encoding="utf-8") as fh:
    CONTRACT = json.load(fh)

PAIRS = ("PLC+IFMS", "PLC+CAM", "IFMS+CAM")


# ---------------------------------------------------------------------------
# What does this backend support?
# ---------------------------------------------------------------------------

def _dto_accepts(**fields):
    try:
        PlanInstalmentInDTO(label="x", percent=100, **fields)
        return True
    except ValidationError:
        return False


def _service_accepts(first_row):
    plan = {"code": "PROBE", "instalments": [{"seq": 1, "label": "x", "percent": 100, **first_row}]}
    try:
        pp.validate_plan(plan)
        return True
    except ValueError:
        return False


SUPPORTS = {
    "custom_event": _dto_accepts(due_trigger="custom", due_from="Plinth")
    and _service_accepts({"due_trigger": "custom", "due_from": "Plinth", "due_days": 0}),
    "booking_amount_due": _service_accepts({"due_trigger": "booking", "due_days": 7}),
    "charge_pairs": all(_dto_accepts(charge_head=h) for h in PAIRS)
    and all(h in getattr(pp, "ROW_CHARGE_HEADS", ()) for h in PAIRS),
}


def features_used(payload):
    rows = payload["instalments"]
    used = set()
    if any(r["due_trigger"] == "custom" for r in rows):
        used.add("custom_event")
    if rows[0]["due_trigger"] != "booking" or rows[0]["due_days"] != 0:
        # A custom first row is covered by custom_event; days on a booking row by booking_amount_due.
        used.add("custom_event" if rows[0]["due_trigger"] == "custom" else "booking_amount_due")
    if any(r.get("charge_head") in PAIRS for r in rows):
        used.add("charge_pairs")
    return used


def supported(payload):
    return all(SUPPORTS[f] for f in features_used(payload))


def test_report_detected_backend_support():
    """Not an assertion - prints what this backend supports, for the test log."""
    print("\nDetected backend support:", json.dumps(SUPPORTS))


ACCEPTED = [pytest.param(c, id=c["name"]) for c in CONTRACT["accepted"]]
REJECTED = [pytest.param(c, id=c["name"]) for c in CONTRACT["rejected"]]


def _saved_codes(client):
    r = client.get("/admin/payment-plans")
    assert r.status_code == 200, (r.status_code, r.text)
    return {p["code"] for p in r.json()["plans"]}


def _assert_matches_expectation(body, case):
    payload, expect = case["payload"], case["expect"]
    assert [r["due_text"] for r in body["instalments"]] == expect["dueTexts"]
    assert [r["charge_head"] for r in body["instalments"]] == [r["charge_head"] for r in payload["instalments"]]
    for got, sent in zip(body["instalments"], payload["instalments"]):
        assert got["due_trigger"] == sent["due_trigger"]
        assert got["due_days"] == sent["due_days"]
        if sent["due_trigger"] == "custom":
            assert got.get("due_from") == sent["due_from"]
    rows = body["example"]["rows"]
    assert [r["amount"] for r in rows] == expect["exampleAmounts"]
    assert [r["charge_head"] for r in rows] == expect["exampleChargeHeads"]
    assert [r["due_text"] for r in rows] == expect["dueTexts"]
    assert sum(r["amount"] for r in rows) == body["example"]["total"] == 5225000
    assert body["example"]["booking_amount"] == expect["exampleAmounts"][0]


# ---------------------------------------------------------------------------
# Plans the admin panel sends
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("case", ACCEPTED)
def test_validate_dry_run(admin_api, case):
    before = _saved_codes(admin_api)
    r = admin_api.post("/admin/payment-plans/validate", json=case["payload"])
    if supported(case["payload"]):
        assert r.status_code == 200, r.text
        _assert_matches_expectation(r.json(), case)
    else:
        # Must be refused cleanly, so the admin panel can explain the pending update.
        assert r.status_code in (400, 422), r.text
    assert _saved_codes(admin_api) == before, "validate must never save"


@pytest.mark.parametrize("case", ACCEPTED)
def test_create_stores_and_reads_back(admin_api, factory, case):
    payload = case["payload"]
    before = _saved_codes(admin_api)
    r = admin_api.post("/admin/payment-plans", json=payload)

    if not supported(payload):
        assert r.status_code in (400, 422), r.text
        assert _saved_codes(admin_api) == before, "a refused plan must not be saved"
        return

    assert r.status_code == 201, r.text
    created = r.json()
    _assert_matches_expectation(created, case)
    assert created["is_active"] is True and created["valid"] is True
    assert created["sort_order"] == payload.get("sort_order", 0)

    # Read back through the admin list: loaded from the DB and re-validated.
    listed = [p for p in admin_api.get("/admin/payment-plans").json()["plans"] if p["code"] == payload["code"]]
    assert len(listed) == 1 and listed[0]["valid"] is True, listed
    _assert_matches_expectation(listed[0], case)

    # And through the public endpoint customers use.
    public = admin_api.get(f"/payment-plans/{payload['code']}")
    assert public.status_code == 200, public.text
    _assert_matches_expectation(public.json(), case)

    # The raw rows written to the database.
    with factory() as db:
        cols = {row[1] for row in db.execute(text("PRAGMA table_info(divine_payment_plan_instalments)"))}
        select_from = ", due_from" if "due_from" in cols else ""
        rows = db.execute(
            text(
                f"SELECT i.seq, i.label, i.due_trigger, i.due_days, i.charge_head{select_from} "
                "FROM divine_payment_plan_instalments i JOIN divine_payment_plans p ON p.id = i.plan_id "
                "WHERE p.code = :code ORDER BY i.seq"
            ),
            {"code": payload["code"]},
        ).mappings().all()
    assert [r["charge_head"] for r in rows] == [s["charge_head"] for s in payload["instalments"]]
    assert [r["due_trigger"] for r in rows] == [s["due_trigger"] for s in payload["instalments"]]
    for stored, sent in zip(rows, payload["instalments"]):
        # Stored values must fit the production column sizes (SQLite does not enforce them).
        assert len(stored["label"]) <= 150
        assert stored["charge_head"] is None or len(stored["charge_head"]) <= 10
        assert len(stored["due_trigger"]) <= 12
        if sent["due_trigger"] == "custom":
            assert stored["due_from"] == sent["due_from"] and len(stored["due_from"]) <= 100


@pytest.mark.parametrize("case", REJECTED)
def test_plans_the_admin_panel_blocks_are_refused_and_not_saved(admin_api, case):
    before = _saved_codes(admin_api)
    for path in ("/admin/payment-plans/validate", "/admin/payment-plans"):
        r = admin_api.post(path, json=case["payload"])
        assert r.status_code in (400, 422), f"{path}: {r.status_code} {r.text}"
    assert _saved_codes(admin_api) == before


def test_existing_plans_unchanged(admin_api):
    """The four seeded plans still list as valid, with the same worked example as before."""
    r = admin_api.get("/admin/payment-plans")
    assert r.status_code == 200, (r.status_code, r.text)
    plans = {p["short_code"]: p for p in r.json()["plans"]}
    assert {"PP1", "PP2", "PP3", "PP4"} <= set(plans)
    assert all(plans[c]["valid"] for c in ("PP1", "PP2", "PP3", "PP4"))
    assert [r["amount"] for r in plans["PP1"]["example"]["rows"]] == [500000, 750000, 1350000, 1300000, 825000, 500000]
    assert [r["amount"] for r in plans["PP4"]["example"]["rows"]] == [5225000]


# ---------------------------------------------------------------------------
# Customer page: bookings list query and booking-detail shape
# ---------------------------------------------------------------------------

class _FakeBookingService:
    def __init__(self):
        self.calls = []

    def list_queue(self, **kwargs):
        self.calls.append(kwargs)
        return {"items": [], "pagination": {"page": 1, "page_size": 100, "total_items": 0, "total_pages": 0}}


def test_bookings_list_accepts_the_customer_page_query(admin_api, monkeypatch):
    import DivineAPI.admin_booking_kyc_api as bookings_api

    fake = _FakeBookingService()
    monkeypatch.setattr(bookings_api, "_booking_service", fake)
    r = admin_api.get(
        "/admin/bookings", params={"page": 1, "page_size": 100, "customer_id": "CUST-1", "search": "CUST-1"}
    )
    assert r.status_code == 200, r.text
    assert set(r.json()) >= {"items", "pagination"}
    assert fake.calls and fake.calls[0]["search"] == "CUST-1"
    # Backends with the exact filter pass it through; older ones ignore the unknown parameter.
    if "customer_id" in inspect.signature(bookings_api.list_booking_queue).parameters:
        assert fake.calls[0].get("customer_id") == "CUST-1"


def test_booking_detail_has_every_field_the_customer_page_reads():
    detail_fields = set(BookingDetailDTO.model_fields)
    assert {"id", "status", "project_name", "unit_number", "payment_schedule", "next_due",
            "amount_received", "payment_plan"} <= detail_fields
    row_fields = set(BookingPaymentScheduleRowDTO.model_fields)
    assert {"id", "label", "percent", "due_date", "amount", "status", "pay_enabled_from",
            "paid_on", "paid_payment_id"} <= row_fields
    # Every instalment status the backend can send is one the admin panel renders.
    status_values = set(BookingPaymentScheduleRowDTO.model_fields["status"].annotation.__args__)
    assert status_values <= {"paid", "pending_review", "overdue", "due", "upcoming"}
    if SUPPORTS["custom_event"]:
        # Undated custom rows need their wording on the schedule row.
        assert "due_text" in row_fields
