#!/usr/bin/env python3
"""用户故事：订单列表/待配送/详情的字段契约保持一致。"""

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
PORT = int(os.environ.get("STORY_PORT", "3111"))
BASE_URL = f"http://127.0.0.1:{PORT}"

REQUIRED_KEYS = {
    "orderId",
    "customerId",
    "customerName",
    "address",
    "orderType",
    "orderStatus",
    "spec",
    "quantity",
    "unitPrice",
    "amount",
    "receivedAmount",
    "paymentStatus",
    "paymentMethod",
    "recycledEmptyCount",
    "owedEmptyCount",
    "scheduleAt",
    "inventoryStage",
    "createdAt",
    "completedAt",
}

SNAKE_KEYS = {"customer_name", "customer_id", "total_amount", "received_amount", "created_at", "appointment_time", "status", "id"}


def request_json(method: str, path: str, payload: dict | None = None, token: str = "") -> tuple[int, dict]:
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(f"{BASE_URL}{path}", headers=headers, data=data, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as err:
        return err.code, json.loads(err.read().decode("utf-8") or "{}")


def expect_success(status: int, payload: dict, path: str):
    if status != 200 or payload.get("success") is not True:
        raise AssertionError(f"{path} failed status={status}, payload={payload}")
    return payload.get("data")


def wait_server_ready(timeout_sec: float = 8.0) -> None:
    end = time.time() + timeout_sec
    while time.time() < end:
        try:
            code, _ = request_json("GET", "/workbench/overview")
            if code in (200, 400, 401):
                return
        except Exception:
            pass
        time.sleep(0.1)
    raise AssertionError("backend startup timeout")


def login() -> str:
    phone = f"13{int(time.time() * 1000 + random.randint(1000, 9999)) % 1000000000:09d}"
    status, send_payload = request_json("POST", "/auth/send-code", {"phone": phone})
    code = str(expect_success(status, send_payload, "/auth/send-code").get("dev_code") or "")
    status, login_payload = request_json("POST", "/auth/login", {"phone": phone, "code": code, "deviceName": "story-order-contract"})
    token = str(expect_success(status, login_payload, "/auth/login").get("accessToken") or "")
    if not token:
        raise AssertionError("missing token")
    return token


def assert_contract(item: dict, where: str) -> None:
    keys = set(item.keys())
    missing = sorted(REQUIRED_KEYS - keys)
    if missing:
        raise AssertionError(f"{where} missing keys: {missing}")
    hit_snake = sorted(SNAKE_KEYS & keys)
    if hit_snake:
        raise AssertionError(f"{where} still contains snake/legacy keys: {hit_snake}")


def run() -> None:
    token = login()
    status, create_payload = request_json(
        "POST",
        "/orders/quick-create",
        {
            "customerId": "CUST-001",
            "spec": "15kg",
            "quantity": 1,
            "unitPrice": 120,
            "orderType": "later_delivery",
            "scheduleAt": "今天 18:30",
        },
        token=token,
    )
    order_id = str(expect_success(status, create_payload, "/orders/quick-create").get("orderId") or "")
    if not order_id:
        raise AssertionError("quick-create missing orderId")

    status, list_payload = request_json("GET", f"/orders?page=1&size=20&keyword={order_id}", token=token)
    list_data = expect_success(status, list_payload, "/orders")
    rows = list_data.get("list") or []
    if not rows:
        raise AssertionError("orders list missing newly created order")
    order_from_list = rows[0]
    assert_contract(order_from_list, "GET /orders item")

    status, pending_payload = request_json("GET", "/orders/pending-delivery", token=token)
    pending_rows = expect_success(status, pending_payload, "/orders/pending-delivery") or []
    pending_match = [x for x in pending_rows if str(x.get("orderId")) == order_id]
    if not pending_match:
        raise AssertionError("pending-delivery missing newly created order")
    assert_contract(pending_match[0], "GET /orders/pending-delivery item")

    status, detail_payload = request_json("GET", f"/orders/{order_id}", token=token)
    detail = expect_success(status, detail_payload, "/orders/:id")
    assert_contract(detail, "GET /orders/:id")

    # 关键字段必须同口径可直接比较。
    key_subset = ["orderId", "customerId", "customerName", "orderStatus", "spec", "quantity", "amount", "scheduleAt"]
    for key in key_subset:
        if order_from_list.get(key) != pending_match[0].get(key) or order_from_list.get(key) != detail.get(key):
            raise AssertionError(f"contract mismatch on key={key}")

    print("story_order_contract_consistency passed")


if __name__ == "__main__":
    if not SERVER_JS.exists():
        print(f"story_order_contract_consistency failed: missing {SERVER_JS}", file=sys.stderr)
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
        print(f"story_order_contract_consistency failed: {err}", file=sys.stderr)
        raise SystemExit(1) from err
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=2)
        except subprocess.TimeoutExpired:
            proc.kill()
