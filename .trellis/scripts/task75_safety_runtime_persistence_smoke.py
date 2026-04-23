#!/usr/bin/env python3
"""Task 75: 安检真实上报链路 + 离线补传 + 运行态重启恢复烟测。"""
from __future__ import annotations

import json
import os
import random
import socket
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SERVER_JS = ROOT / "services/backend/src/server.js"


def pick_port() -> int:
    for _ in range(40):
        port = random.randint(31200, 32999)
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            s.bind(("127.0.0.1", port))
            return port
        except OSError:
            continue
        finally:
            s.close()
    raise RuntimeError("no free port")


def req(base: str, method: str, path: str, data: dict | None = None, token: str = ""):
    body = None if data is None else json.dumps(data).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(
        url=f"{base}{path}",
        data=body,
        method=method,
        headers=headers,
    )
    try:
        with urllib.request.urlopen(request, timeout=8) as resp:
            raw = resp.read().decode("utf-8")
            payload = json.loads(raw) if raw.strip() else {}
            return resp.status, payload
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8")
        try:
            payload = json.loads(raw) if raw.strip() else {}
        except json.JSONDecodeError:
            payload = {"raw": raw}
        return e.code, payload


def wait_backend_ready(base: str) -> bool:
    for _ in range(60):
        try:
            code, _ = req(base, "GET", "/__healthcheck__")
            if code in (404, 400, 200):
                return True
        except Exception:
            pass
        time.sleep(0.1)
    return False


def login(base: str) -> str:
    phone = f"138{random.randint(0, 99999999):08d}"
    s1, send_code = req(base, "POST", "/auth/send-code", {"phone": phone})
    if s1 != 200 or not send_code.get("success"):
        raise RuntimeError(f"send-code failed: {s1} {send_code}")
    code = send_code.get("data", {}).get("dev_code")
    s2, login_res = req(
        base,
        "POST",
        "/auth/login",
        {"phone": phone, "code": code, "deviceName": "task75-smoke"},
    )
    if s2 != 200 or not login_res.get("success"):
        raise RuntimeError(f"login failed: {s2} {login_res}")
    token = str(login_res.get("data", {}).get("accessToken", ""))
    if not token:
        raise RuntimeError("login response missing accessToken")
    return token


def create_and_complete_order(base: str, token: str, customer_id: str) -> str:
    s1, create = req(
        base,
        "POST",
        "/orders/quick-create",
        {
            "customerId": customer_id,
            "orderType": "later_delivery",
            "spec": "15kg",
            "quantity": 1,
            "unitPrice": 120,
        },
        token,
    )
    if s1 != 200 or not create.get("success"):
        raise RuntimeError(f"quick-create failed: {s1} {create}")
    order_id = str(create.get("data", {}).get("orderId", "")).strip()
    if not order_id:
        raise RuntimeError("quick-create missing orderId")

    s2, complete = req(
        base,
        "POST",
        f"/orders/{order_id}/complete",
        {
            "receivedAmount": 120,
            "paymentMethod": "cash",
            "recycledEmptyCount": 0,
            "owedEmptyCount": 0,
        },
        token,
    )
    if s2 != 200 or not complete.get("success"):
        raise RuntimeError(f"complete-order failed: {s2} {complete}")
    return order_id


class FakeRegulatorHandler(BaseHTTPRequestHandler):
    calls_by_safety_id: dict[str, int] = {}

    def do_POST(self):  # noqa: N802
        if self.path != "/report":
            self.send_response(404)
            self.end_headers()
            return
        length = int(self.headers.get("Content-Length", "0") or "0")
        body = self.rfile.read(length).decode("utf-8") if length > 0 else "{}"
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            payload = {}
        safety_id = str(payload.get("safetyId") or "")
        count = int(self.calls_by_safety_id.get(safety_id, 0)) + 1
        self.calls_by_safety_id[safety_id] = count
        if count == 1:
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"success":false,"message":"fail once"}')
            return
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"success":true,"message":"ok"}')

    def log_message(self, _format, *_args):  # noqa: A003
        return


def start_fake_regulator(port: int):
    server = ThreadingHTTPServer(("127.0.0.1", port), FakeRegulatorHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server


def main() -> int:
    if not SERVER_JS.exists():
        print("[task75] 缺少 server.js", file=sys.stderr)
        return 1

    backend_port = pick_port()
    regulator_port = pick_port()
    base = f"http://127.0.0.1:{backend_port}"
    regulator_base = f"http://127.0.0.1:{regulator_port}/report"

    with tempfile.TemporaryDirectory(prefix="task75-") as tmpdir:
        tmp = Path(tmpdir)
        runtime_state_path = tmp / "runtime-state.json"
        customer_ledger_path = tmp / "customer-ledger.json"
        auth_state_path = tmp / "auth-state.json"
        env = {
            **os.environ,
            "PORT": str(backend_port),
            "TRELLIS_RUNTIME_STATE_PATH": str(runtime_state_path),
            "TRELLIS_CUSTOMER_LEDGER_PATH": str(customer_ledger_path),
            "TRELLIS_AUTH_STATE_PATH": str(auth_state_path),
            "SAFETY_REPORT_MODE": "external",
            "SAFETY_REPORT_ENDPOINT": regulator_base,
            "SAFETY_REPORT_TIMEOUT_MS": "5000",
        }

        regulator_server = start_fake_regulator(regulator_port)
        proc: subprocess.Popen | None = None
        try:
            proc = subprocess.Popen(
                ["node", str(SERVER_JS)],
                cwd=str(ROOT),
                env=env,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            if not wait_backend_ready(base):
                print("[task75] 后端启动超时")
                return 1

            token = login(base)

            # Case 1: 在线提交流程，首报失败、重试成功
            order_id_1 = create_and_complete_order(base, token, "CUST-001")
            s_submit, submit_res = req(
                base,
                "POST",
                f"/safety/by-order/{order_id_1}",
                {
                    "checkItems": ["cylinder", "hose"],
                    "photoUrls": ["photo-1"],
                    "hasAbnormal": True,
                    "hazardNote": "软管老化",
                },
                token,
            )
            if s_submit != 200 or not submit_res.get("success"):
                print("[task75] safety submit 请求失败", s_submit, submit_res)
                return 1
            submit_data = submit_res.get("data", {})
            if submit_data.get("status") != "failed":
                print("[task75] 预期首报失败，实际", submit_data)
                return 1
            safety_id_1 = str(submit_data.get("safetyId") or "")
            if not safety_id_1:
                print("[task75] 首报返回缺少 safetyId", submit_data)
                return 1

            s_retry, retry_res = req(base, "POST", f"/safety/{safety_id_1}/retry", {}, token)
            if s_retry != 200 or not retry_res.get("success"):
                print("[task75] safety retry 请求失败", s_retry, retry_res)
                return 1
            if retry_res.get("data", {}).get("status") != "completed":
                print("[task75] 重试后状态应为 completed", retry_res)
                return 1

            # Case 2: 离线补传流程，批量补传失败后单条重试成功
            order_id_2 = create_and_complete_order(base, token, "CUST-002")
            s_enqueue, enqueue_res = req(
                base,
                "POST",
                "/sync/queue/enqueue",
                {
                    "entityType": "safety",
                    "action": "sync",
                    "payload": {
                        "mode": "submit",
                        "orderId": order_id_2,
                        "submitPayload": {
                            "checkItems": ["cylinder"],
                            "photoUrls": ["photo-2"],
                            "hasAbnormal": True,
                            "hazardNote": "阀门渗漏",
                        },
                    },
                },
                token,
            )
            if s_enqueue != 200 or not enqueue_res.get("success"):
                print("[task75] enqueue 失败", s_enqueue, enqueue_res)
                return 1
            offline_id = str(enqueue_res.get("data", {}).get("offlineId") or "")
            if not offline_id:
                print("[task75] enqueue 缺少 offlineId", enqueue_res)
                return 1

            s_batch, batch_res = req(base, "POST", "/sync/queue/batch-submit", {}, token)
            if s_batch != 200 or not batch_res.get("success"):
                print("[task75] batch-submit 失败", s_batch, batch_res)
                return 1
            batch_results = batch_res.get("data", {}).get("results", [])
            batch_item = next((x for x in batch_results if x.get("offlineId") == offline_id), None)
            if not batch_item or batch_item.get("syncStatus") != "failed":
                print("[task75] 预期离线首轮失败", batch_res)
                return 1

            time.sleep(2.2)
            s_qretry, qretry_res = req(base, "POST", f"/sync/queue/{offline_id}/retry", {}, token)
            if s_qretry != 200 or not qretry_res.get("success"):
                print("[task75] queue retry 失败", s_qretry, qretry_res)
                return 1
            if qretry_res.get("data", {}).get("syncStatus") != "completed":
                print("[task75] queue retry 后应为 completed", qretry_res)
                return 1

            # 落盘检查
            if not runtime_state_path.exists():
                print("[task75] runtime-state 文件不存在")
                return 1
            runtime_raw = runtime_state_path.read_text(encoding="utf-8").strip()
            runtime_data = json.loads(runtime_raw or "{}")
            if len(runtime_data.get("quickOrders") or []) < 2:
                print(
                    "[task75] runtime-state quickOrders 数量异常",
                    {
                        "quickOrders": len(runtime_data.get("quickOrders") or []),
                        "safetyRecords": len(runtime_data.get("safetyRecords") or []),
                        "offlineQueue": len(runtime_data.get("offlineQueue") or []),
                        "keys": sorted(runtime_data.keys()),
                    },
                )
                return 1

            # 重启恢复检查
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()

            proc = subprocess.Popen(
                ["node", str(SERVER_JS)],
                cwd=str(ROOT),
                env=env,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            if not wait_backend_ready(base):
                print("[task75] 二次启动超时")
                return 1

            token2 = login(base)
            s_orders, orders_res = req(base, "GET", "/orders?size=200", None, token2)
            if s_orders != 200 or not orders_res.get("success"):
                print("[task75] 重启后订单查询失败", s_orders, orders_res)
                return 1
            order_ids = {str(x.get("orderId")) for x in (orders_res.get("data", {}).get("list") or [])}
            if order_id_1 not in order_ids or order_id_2 not in order_ids:
                print("[task75] 重启后订单未恢复", order_ids)
                return 1

            s_safe1, safe1_res = req(base, "GET", f"/safety/by-order/{order_id_1}", None, token2)
            if s_safe1 != 200 or not safe1_res.get("success") or not safe1_res.get("data"):
                print("[task75] 重启后 safety#1 未恢复", s_safe1, safe1_res)
                return 1
            if safe1_res.get("data", {}).get("status") != "completed":
                print("[task75] 重启后 safety#1 状态异常", safe1_res)
                return 1

            s_safe2, safe2_res = req(base, "GET", f"/safety/by-order/{order_id_2}", None, token2)
            if s_safe2 != 200 or not safe2_res.get("success") or not safe2_res.get("data"):
                print("[task75] 重启后 safety#2 未恢复", s_safe2, safe2_res)
                return 1

            print("[task75] 通过：安检真实上报、离线补传与运行态重启恢复校验通过")
            return 0
        finally:
            regulator_server.shutdown()
            regulator_server.server_close()
            if proc and proc.poll() is None:
                proc.terminate()
                try:
                    proc.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    proc.kill()


if __name__ == "__main__":
    sys.exit(main())
