#!/usr/bin/env python3
"""用户故事：待配送选择 -> 完单提交 -> 安检闭环（按策略）。"""

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
PORT = int(os.environ.get("STORY_PORT", "3112"))
BASE_URL = f"http://127.0.0.1:{PORT}"


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
    status, login_payload = request_json("POST", "/auth/login", {"phone": phone, "code": code, "deviceName": "story-delivery-flow"})
    token = str(expect_success(status, login_payload, "/auth/login").get("accessToken") or "")
    if not token:
        raise AssertionError("missing token")
    return token


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
            "scheduleAt": "今天 20:00",
        },
        token=token,
    )
    order_id = str(expect_success(status, create_payload, "/orders/quick-create").get("orderId") or "")
    if not order_id:
        raise AssertionError("missing order id")

    status, pending_payload = request_json("GET", "/orders/pending-delivery", token=token)
    pending_rows = expect_success(status, pending_payload, "/orders/pending-delivery") or []
    if not any(str(x.get("orderId")) == order_id for x in pending_rows):
        raise AssertionError("new order not found in pending-delivery")

    status, complete_payload = request_json(
        "POST",
        f"/orders/{order_id}/complete",
        {
            "receivedAmount": 120,
            "paymentMethod": "cash",
            "recycledEmptyCount": 1,
            "owedEmptyCount": 0,
        },
        token=token,
    )
    complete_data = expect_success(status, complete_payload, "/orders/:id/complete")
    if str(complete_data.get("orderStatus")) != "completed":
        raise AssertionError(f"complete status mismatch: {complete_data}")

    status, policy_payload = request_json("GET", "/platform/policies/current", token=token)
    policy = expect_success(status, policy_payload, "/platform/policies/current") or {}
    required = bool(((policy.get("content") or {}).get("safetyCheckRequired")))

    status, safety_payload = request_json("GET", f"/safety/by-order/{order_id}", token=token)
    safety_data = expect_success(status, safety_payload, "/safety/by-order/:id")
    if required and not safety_data:
        raise AssertionError("safety should be triggered after complete when policy requires")

    if safety_data:
        status, submit_payload = request_json(
            "POST",
            f"/safety/by-order/{order_id}",
            {
                "checkItems": ["阀门密封检查"],
                "photoUrls": ["img-001"],
                "hasAbnormal": False,
                "hazardNote": "",
            },
            token=token,
        )
        submitted = expect_success(status, submit_payload, "/safety/by-order/:id submit")
        if str(submitted.get("status")) not in {"completed", "pending"}:
            raise AssertionError(f"unexpected safety submit status: {submitted}")

        status, final_payload = request_json("GET", f"/safety/by-order/{order_id}", token=token)
        final_data = expect_success(status, final_payload, "/safety/by-order/:id final")
        if str((final_data or {}).get("status")) not in {"completed", "pending", "failed"}:
            raise AssertionError(f"unexpected safety final status: {final_data}")

    print("story_delivery_complete_flow_e2e passed")


if __name__ == "__main__":
    if not SERVER_JS.exists():
        print(f"story_delivery_complete_flow_e2e failed: missing {SERVER_JS}", file=sys.stderr)
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
        print(f"story_delivery_complete_flow_e2e failed: {err}", file=sys.stderr)
        raise SystemExit(1) from err
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=2)
        except subprocess.TimeoutExpired:
            proc.kill()
