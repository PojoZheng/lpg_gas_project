#!/usr/bin/env python3
"""用户故事：从“我的”进入债务管理，完成催收与还款闭环并验证回写。"""

from __future__ import annotations

from datetime import date
from pathlib import Path
import json
import random
import sys
import time
import urllib.error
import urllib.request


ROOT = Path(__file__).resolve().parents[3]
BASE_URL = "http://127.0.0.1:3100"


def assert_contains(path: Path, needles: list[str]) -> None:
    text = path.read_text(encoding="utf-8")
    missing = [needle for needle in needles if needle not in text]
    if missing:
        raise AssertionError(f"{path} missing: {missing}")


def request_json(method: str, path: str, payload: dict | None = None, token: str = "") -> tuple[int, dict]:
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(f"{BASE_URL}{path}", data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, json.loads(raw or "{}")
    except urllib.error.HTTPError as err:
        raw = err.read().decode("utf-8")
        try:
            parsed = json.loads(raw or "{}")
        except json.JSONDecodeError:
            parsed = {"success": False, "error": raw}
        return err.code, parsed
    except urllib.error.URLError as err:
        raise AssertionError(f"backend unavailable: {err}") from err


def expect_success(status: int, payload: dict, path: str) -> dict:
    if status != 200:
        raise AssertionError(f"{path} status={status}, payload={payload}")
    if payload.get("success") is not True:
        raise AssertionError(f"{path} not success: {payload}")
    return payload.get("data") or {}


def login_for_story() -> str:
    phone = f"13{int(time.time() * 1000 + random.randint(1000, 9999)) % 1000000000:09d}"
    status, send_code_payload = request_json("POST", "/auth/send-code", {"phone": phone})
    send_data = expect_success(status, send_code_payload, "/auth/send-code")
    code = str(send_data.get("dev_code") or "").strip()
    if len(code) != 6:
        raise AssertionError(f"invalid dev_code: {send_data}")

    status, login_payload = request_json(
        "POST",
        "/auth/login",
        {"phone": phone, "code": code, "deviceName": "story-e2e"},
    )
    login_data = expect_success(status, login_payload, "/auth/login")
    token = str(login_data.get("accessToken") or "").strip()
    if not token:
        raise AssertionError(f"accessToken missing: {login_data}")
    return token


def ensure_debt_customer(token: str) -> str:
    status, list_payload = request_json("GET", "/debts/list?filter=all&page=1&size=20", token=token)
    items = expect_success(status, list_payload, "/debts/list").get("items") or []
    if items:
        return str(items[0].get("customerId") or "")

    status, customers_payload = request_json("GET", "/customers/quick-select", token=token)
    customers = expect_success(status, customers_payload, "/customers/quick-select")
    if not customers:
        raise AssertionError("no customers available for debt bootstrap")
    customer_id = str(customers[0].get("id") or "")
    if not customer_id:
        raise AssertionError(f"invalid customer list item: {customers[0]}")

    status, inventory_payload = request_json("GET", "/inventory/snapshot", token=token)
    inventory_data = expect_success(status, inventory_payload, "/inventory/snapshot")
    available_specs = [
        row for row in inventory_data if isinstance(row, dict) and int(row.get("available") or 0) > 0
    ]
    if not available_specs:
        raise AssertionError("no available inventory to bootstrap debt scenario")
    chosen = sorted(available_specs, key=lambda x: int(x.get("available") or 0), reverse=True)[0]
    spec = str(chosen.get("spec") or "15kg")

    status, create_payload = request_json(
        "POST",
        "/orders/quick-create",
        {
            "customerId": customer_id,
            "spec": spec,
            "quantity": 1,
            "unitPrice": 88,
            "orderType": "later_delivery",
            "scheduleAt": "尽快配送",
        },
        token=token,
    )
    create_data = expect_success(status, create_payload, "/orders/quick-create")
    order_id = str(create_data.get("orderId") or "")
    if not order_id:
        raise AssertionError(f"quick-create missing orderId: {create_data}")

    status, _complete_payload = request_json(
        "POST",
        f"/orders/{order_id}/complete",
        {
            "receivedAmount": 0,
            "paymentMethod": "credit",
            "recycledEmptyCount": 0,
            "owedEmptyCount": 0,
        },
        token=token,
    )
    if status != 200:
        raise AssertionError(f"/orders/{order_id}/complete status={status}")

    status, list_payload = request_json("GET", "/debts/list?filter=all&page=1&size=20", token=token)
    items = expect_success(status, list_payload, "/debts/list (after bootstrap)").get("items") or []
    if not items:
        raise AssertionError("failed to bootstrap debt list")
    return str(items[0].get("customerId") or "")


def run() -> None:
    my_page = ROOT / "apps" / "delivery-app" / "src" / "my.html"
    debt_page = ROOT / "apps" / "delivery-app" / "src" / "debt-overview.html"

    for path in (my_page, debt_page):
        if not path.is_file():
            raise AssertionError(f"missing file: {path}")

    # Entry and return-path contracts for cross-page flow.
    assert_contains(
        my_page,
        [
            'id="debtBtn"',
            "./debt-overview.html",
        ],
    )
    assert_contains(
        debt_page,
        [
            'id="copyReminderBtn"',
            'id="callReminderBtn"',
            'id="smsReminderBtn"',
            'id="submitReminderBtn"',
            'id="submitRepaymentBtn"',
            'goBackOr("./my.html")',
            "navigator.clipboard.writeText",
            "window.location.href = `tel:",
            "window.location.href = `sms:",
        ],
    )

    token = login_for_story()

    customer_id = ensure_debt_customer(token)
    if not customer_id:
        raise AssertionError("failed to resolve debt customer")

    status, detail_before_payload = request_json("GET", f"/debts/customer/{customer_id}", token=token)
    detail_before = expect_success(status, detail_before_payload, "/debts/customer/:id (before)")
    debt_amount_before = float(detail_before.get("debtAmount") or 0)
    if debt_amount_before <= 0:
        raise AssertionError(f"customer has no debt before repayment: {detail_before}")
    reminder_count_before = len(detail_before.get("reminderHistory") or [])

    reminder_payload = {
        "customerId": customer_id,
        "type": "sms",
        "content": "测试催款：请尽快结清本期欠款。",
        "result": "promised",
        "promisedAt": date.today().isoformat(),
    }
    status, reminder_resp_payload = request_json("POST", "/debts/reminder", reminder_payload, token=token)
    reminder_resp = expect_success(status, reminder_resp_payload, "/debts/reminder")
    customer_after_reminder = reminder_resp.get("customer") or {}
    if str(customer_after_reminder.get("customerId") or "") != customer_id:
        raise AssertionError(f"reminder customer mismatch: {reminder_resp}")

    status, detail_after_reminder_payload = request_json("GET", f"/debts/customer/{customer_id}", token=token)
    detail_after_reminder = expect_success(status, detail_after_reminder_payload, "/debts/customer/:id (after reminder)")
    reminder_count_after = len(detail_after_reminder.get("reminderHistory") or [])
    if reminder_count_after < reminder_count_before + 1:
        raise AssertionError(
            f"reminder history not updated: before={reminder_count_before}, after={reminder_count_after}"
        )

    status, overview_before_payload = request_json("GET", "/debts/overview", token=token)
    overview_before = expect_success(status, overview_before_payload, "/debts/overview (before repayment)")
    total_debt_before = float((overview_before.get("totalDebt") or {}).get("amount") or 0)

    status, repayment_resp_payload = request_json(
        "POST",
        "/debts/repayment",
        {
            "customerId": customer_id,
            "amount": debt_amount_before,
            "method": "cash",
            "note": "故事测试：结清验证",
        },
        token=token,
    )
    repayment_resp = expect_success(status, repayment_resp_payload, "/debts/repayment")
    repayment_customer = repayment_resp.get("customer") or {}
    if not bool(repayment_customer.get("settled")):
        raise AssertionError(f"customer should be settled after full repayment: {repayment_resp}")

    status, list_after_payload = request_json("GET", "/debts/list?filter=all&page=1&size=50", token=token)
    list_after = expect_success(status, list_after_payload, "/debts/list (after repayment)")
    remaining_ids = {str(item.get("customerId") or "") for item in (list_after.get("items") or [])}
    if customer_id in remaining_ids:
        raise AssertionError("settled customer still appears in debt list")

    status, overview_after_payload = request_json("GET", "/debts/overview", token=token)
    overview_after = expect_success(status, overview_after_payload, "/debts/overview (after repayment)")
    total_debt_after = float((overview_after.get("totalDebt") or {}).get("amount") or 0)
    if total_debt_after > total_debt_before + 1e-6:
        raise AssertionError(
            f"overview total debt not rolled back: before={total_debt_before}, after={total_debt_after}"
        )

    print("story_customer_debt_cross_page_e2e passed")


if __name__ == "__main__":
    try:
        run()
    except AssertionError as err:
        print(f"story_customer_debt_cross_page_e2e failed: {err}", file=sys.stderr)
        raise SystemExit(1) from err
