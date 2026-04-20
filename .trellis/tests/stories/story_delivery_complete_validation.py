#!/usr/bin/env python3
"""用户故事：配送员完单时，前后端按同一规则校验关键输入。"""

from __future__ import annotations

import json
import os
from pathlib import Path
import random
import subprocess
import sys
import time
import urllib.error
import urllib.request


ROOT = Path(__file__).resolve().parents[3]
SERVER_JS = ROOT / "services" / "backend" / "src" / "server.js"
PORT = int(os.environ.get("STORY_PORT", "3110"))
BASE_URL = f"http://127.0.0.1:{PORT}"


def request_json(method: str, path: str, payload: dict | None = None, token: str = "") -> tuple[int, dict]:
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(f"{BASE_URL}{path}", data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as err:
        raw = err.read().decode("utf-8")
        return err.code, json.loads(raw or "{}")
    except urllib.error.URLError as err:
        raise AssertionError(f"backend unavailable: {err}") from err


def wait_server_ready(timeout_sec: float = 8.0) -> None:
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        try:
            status, _ = request_json("GET", "/workbench/overview")
            if status in (200, 400, 401):
                return
        except Exception:
            pass
        time.sleep(0.1)
    raise AssertionError("story backend startup timeout")


def expect_success(status: int, payload: dict, path: str) -> dict:
    if status != 200:
        raise AssertionError(f"{path} status={status}, payload={payload}")
    if payload.get("success") is not True:
        raise AssertionError(f"{path} expected success payload={payload}")
    return payload.get("data") or {}


def expect_validation_error(status: int, payload: dict, path: str) -> None:
    if status != 400:
        raise AssertionError(f"{path} should be 400, got {status}, payload={payload}")
    if payload.get("success") is not False:
        raise AssertionError(f"{path} should fail, payload={payload}")
    code = str((payload.get("error") or {}).get("code") or "")
    if code != "VALIDATION_400":
        raise AssertionError(f"{path} error.code should be VALIDATION_400, payload={payload}")


def expect_status_conflict(status: int, payload: dict, path: str) -> None:
    if status != 409:
        raise AssertionError(f"{path} should be 409, got {status}, payload={payload}")
    if payload.get("success") is not False:
        raise AssertionError(f"{path} should fail, payload={payload}")
    code = str((payload.get("error") or {}).get("code") or "")
    if code != "ORDER_409_STATUS":
        raise AssertionError(f"{path} error.code should be ORDER_409_STATUS, payload={payload}")


def login() -> str:
    phone = f"13{int(time.time() * 1000 + random.randint(1000, 9999)) % 1000000000:09d}"
    status, send_code_payload = request_json("POST", "/auth/send-code", {"phone": phone})
    send_data = expect_success(status, send_code_payload, "/auth/send-code")
    code = str(send_data.get("dev_code") or "").strip()
    if len(code) != 6:
        raise AssertionError(f"invalid code payload: {send_data}")

    status, login_payload = request_json(
        "POST",
        "/auth/login",
        {"phone": phone, "code": code, "deviceName": "story-delivery-complete-validation"},
    )
    login_data = expect_success(status, login_payload, "/auth/login")
    token = str(login_data.get("accessToken") or "").strip()
    if not token:
        raise AssertionError("access token missing")
    return token


def create_pending_order(token: str, quantity: int = 2) -> str:
    status, payload = request_json(
        "POST",
        "/orders/quick-create",
        {
            "customerId": "CUST-001",
            "spec": "15kg",
            "quantity": quantity,
            "unitPrice": 120,
            "orderType": "later_delivery",
            "scheduleAt": "今天 18:30",
        },
        token=token,
    )
    data = expect_success(status, payload, "/orders/quick-create")
    order_id = str(data.get("orderId") or "")
    if not order_id:
        raise AssertionError(f"missing order id: {data}")
    return order_id


def run() -> None:
    token = login()

    # 合法：现金收款>0，空瓶处理合计不超过配送数量。
    ok_order = create_pending_order(token, quantity=2)
    status, ok_payload = request_json(
        "POST",
        f"/orders/{ok_order}/complete",
        {
            "receivedAmount": 120,
            "paymentMethod": "cash",
            "recycledEmptyCount": 1,
            "owedEmptyCount": 1,
        },
        token=token,
    )
    expect_success(status, ok_payload, f"/orders/{ok_order}/complete valid")

    # 非法：实收金额超过两位小数。
    invalid_decimal_order = create_pending_order(token, quantity=1)
    status, payload = request_json(
        "POST",
        f"/orders/{invalid_decimal_order}/complete",
        {
            "receivedAmount": "10.123",
            "paymentMethod": "cash",
            "recycledEmptyCount": 0,
            "owedEmptyCount": 0,
        },
        token=token,
    )
    expect_validation_error(status, payload, "invalid decimal")

    # 非法：记账时实收金额必须为 0。
    invalid_credit_order = create_pending_order(token, quantity=1)
    status, payload = request_json(
        "POST",
        f"/orders/{invalid_credit_order}/complete",
        {
            "receivedAmount": 1,
            "paymentMethod": "credit",
            "recycledEmptyCount": 0,
            "owedEmptyCount": 0,
        },
        token=token,
    )
    expect_validation_error(status, payload, "credit with received amount")

    # 非法：现金/微信收款时实收金额必须大于 0。
    invalid_cash_order = create_pending_order(token, quantity=1)
    status, payload = request_json(
        "POST",
        f"/orders/{invalid_cash_order}/complete",
        {
            "receivedAmount": 0,
            "paymentMethod": "cash",
            "recycledEmptyCount": 0,
            "owedEmptyCount": 0,
        },
        token=token,
    )
    expect_validation_error(status, payload, "cash with zero received")

    # 非法：回收空瓶 + 欠瓶 > 配送数量。
    invalid_bottle_order = create_pending_order(token, quantity=1)
    status, payload = request_json(
        "POST",
        f"/orders/{invalid_bottle_order}/complete",
        {
            "receivedAmount": 120,
            "paymentMethod": "cash",
            "recycledEmptyCount": 1,
            "owedEmptyCount": 1,
        },
        token=token,
    )
    expect_validation_error(status, payload, "bottle count overflow")

    # 状态冲突：已完单不可重复完单。
    status, payload = request_json(
        "POST",
        f"/orders/{ok_order}/complete",
        {
            "receivedAmount": 120,
            "paymentMethod": "cash",
            "recycledEmptyCount": 0,
            "owedEmptyCount": 0,
        },
        token=token,
    )
    expect_status_conflict(status, payload, "repeat complete")

    print("story_delivery_complete_validation passed")


if __name__ == "__main__":
    if not SERVER_JS.exists():
        print(f"story_delivery_complete_validation failed: missing backend file {SERVER_JS}", file=sys.stderr)
        raise SystemExit(1)

    proc = subprocess.Popen(
        ["node", str(SERVER_JS)],
        cwd=str(ROOT),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        env={**os.environ, "PORT": str(PORT)},
    )
    try:
        wait_server_ready()
        run()
    except AssertionError as err:
        print(f"story_delivery_complete_validation failed: {err}", file=sys.stderr)
        raise SystemExit(1) from err
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=2)
        except subprocess.TimeoutExpired:
            proc.kill()
