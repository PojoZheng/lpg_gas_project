#!/usr/bin/env python3
"""Task 18: 客户台账持久化、催收历史与详情一致性（独立端口 + 临时 ledger 文件）。"""
from __future__ import annotations

import json
import os
import random
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SERVER_JS = ROOT / ".trellis/backend/src/server.js"


def pick_listen_port() -> int:
    for _ in range(30):
        port = random.randint(31200, 31999)
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
    request = urllib.request.Request(
        url=f"{base}{path}",
        data=body,
        method=method,
        headers={
            "Content-Type": "application/json",
            **({"Authorization": f"Bearer {token}"} if token else {}),
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=5) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        payload = json.loads(e.read().decode("utf-8"))
        return e.code, payload


def wait_server(base: str) -> bool:
    for _ in range(50):
        try:
            code, _ = req(base, "GET", "/workbench/overview")
            if code in (200, 400, 401):
                return True
        except Exception:
            pass
        time.sleep(0.1)
    return False


def login_tokens(base: str) -> tuple[str, str]:
    # 避免与共享 auth-state.json 中既有号码的发送频率限制冲突
    phone = f"138{random.randint(0, 99999999):08d}"
    status, send_code = req(base, "POST", "/auth/send-code", {"phone": phone})
    if status != 200 or not send_code.get("success"):
        raise RuntimeError(f"send-code failed: {status} {send_code}")
    code = send_code["data"]["dev_code"]
    status, login = req(
        base,
        "POST",
        "/auth/login",
        {"phone": phone, "code": code, "deviceName": "task18-smoke"},
    )
    if status != 200 or not login.get("success"):
        raise RuntimeError("login failed")
    data = login["data"]
    return str(data["accessToken"]), str(data["refreshToken"])


def refresh_access_token(base: str, refresh_token: str) -> str:
    status, ref = req(base, "POST", "/auth/refresh", {"refreshToken": refresh_token})
    if status != 200 or not ref.get("success"):
        raise RuntimeError("refresh failed")
    return str(ref["data"]["accessToken"])


def main() -> int:
    if not SERVER_JS.exists():
        print("[task18] 缺少 server.js")
        return 1

    ledger_fd, ledger_path = tempfile.mkstemp(suffix="-customer-ledger.json")
    os.close(ledger_fd)
    test_port = pick_listen_port()
    base = f"http://127.0.0.1:{test_port}"
    env = {
        **os.environ,
        "PORT": str(test_port),
        "TRELLIS_CUSTOMER_LEDGER_PATH": ledger_path,
    }

    proc: subprocess.Popen | None = None
    try:
        proc = subprocess.Popen(
            ["node", str(SERVER_JS)],
            cwd=str(ROOT),
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        if not wait_server(base):
            print("[task18] 服务启动超时")
            return 1

        token, refresh = login_tokens(base)
        status, patch = req(
            base,
            "PATCH",
            "/customers/CUST-001/collection-status",
            {"status": "pending", "note": "测试备注 A"},
            token,
        )
        if status != 200 or not patch.get("success"):
            print("[task18] PATCH 催收状态失败", patch)
            return 1

        raw = Path(ledger_path).read_text(encoding="utf-8").strip()
        if not raw:
            print("[task18] ledger 文件在 PATCH 后仍为空，可能端口被占用导致请求未命中本测试实例")
            return 1
        disk = json.loads(raw)
        acc001 = None
        for pair in disk.get("accounts") or []:
            if isinstance(pair, list) and len(pair) >= 2 and pair[0] == "CUST-001":
                acc001 = pair[1]
                break
        if not acc001:
            print("[task18] ledger 中缺少 CUST-001")
            return 1
        if float(acc001.get("owedAmount", -1)) < 0:
            print("[task18] 台账结构异常")
            return 1
        hist = acc001.get("collectionHistory") or []
        if not hist or hist[-1].get("note") != "测试备注 A":
            print("[task18] 催收历史未写入文件", hist)
            return 1

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
        if not wait_server(base):
            print("[task18] 二次启动失败")
            return 1

        token2 = refresh_access_token(base, refresh)
        status, detail = req(base, "GET", "/customers/CUST-001/detail", None, token2)
        if status != 200 or not detail.get("success"):
            print("[task18] GET detail 失败", detail)
            return 1
        data = detail["data"]
        if data.get("account", {}).get("collectionStatus") != "pending":
            print("[task18] 重启后催收状态未恢复")
            return 1
        ch = data.get("collectionHistory") or []
        if not ch:
            print("[task18] 重启后 collectionHistory 为空")
            return 1
        if ch[0].get("note") != "测试备注 A":
            print("[task18] 最近催收记录与预期不符")
            return 1
        cons = data.get("accountSummaryConsistency") or {}
        if not cons.get("ok"):
            print("[task18] 摘要一致性应为通过", cons)
            return 1

        print("[task18] 持久化、催收历史与摘要一致性校验通过")
        return 0
    finally:
        if proc and proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                proc.kill()
        try:
            Path(ledger_path).unlink(missing_ok=True)
        except OSError:
            pass


if __name__ == "__main__":
    sys.exit(main())
