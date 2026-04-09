#!/usr/bin/env python3
from __future__ import annotations

import json
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, Optional, Tuple


ROOT = Path(__file__).resolve().parents[2]
SERVER_ENTRY = ROOT / ".trellis/backend/src/server.js"
BASE_URL = "http://127.0.0.1:3100"


def is_port_open(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.2)
        return sock.connect_ex((host, port)) == 0


def request_json(
    path: str,
    method: str = "GET",
    body: Optional[Dict[str, Any]] = None,
    headers: Optional[Dict[str, str]] = None,
) -> Tuple[int, Dict[str, Any]]:
    payload = None
    req_headers = {"Content-Type": "application/json"}
    if headers:
        req_headers.update(headers)
    if body is not None:
        payload = json.dumps(body).encode("utf-8")

    req = urllib.request.Request(
        f"{BASE_URL}{path}",
        data=payload,
        method=method,
        headers=req_headers,
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.getcode(), json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8")
        return e.code, json.loads(raw) if raw else {}


def assert_true(expr: bool, message: str) -> None:
    if not expr:
        raise AssertionError(message)


def main() -> int:
    if not SERVER_ENTRY.exists():
        print(f"[task15-e2e] 缺少后端入口: {SERVER_ENTRY}")
        return 1

    started_here = False
    proc: Optional[subprocess.Popen[str]] = None

    try:
        if not is_port_open("127.0.0.1", 3100):
            started_here = True
            proc = subprocess.Popen(
                ["node", str(SERVER_ENTRY)],
                cwd=str(ROOT),
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                text=True,
            )
            for _ in range(50):
                if is_port_open("127.0.0.1", 3100):
                    break
                time.sleep(0.1)
            assert_true(is_port_open("127.0.0.1", 3100), "后端服务未能在 3100 端口启动")

        # case 1: send-code 正常
        status, send_code_ok = request_json(
            "/auth/send-code",
            method="POST",
            body={"phone": "13800138000"},
        )
        assert_true(status == 200, "发送验证码应返回 200")
        assert_true(send_code_ok.get("success") is True, "发送验证码 success 应为 true")
        assert_true(send_code_ok.get("error") is None, "发送验证码 error 应为 null")
        dev_code = (send_code_ok.get("data") or {}).get("dev_code")
        assert_true(bool(dev_code), "发送验证码应返回 dev_code")

        # case 2: login 失败回归
        status, login_fail = request_json(
            "/auth/login",
            method="POST",
            body={"phone": "13800138000", "code": "000000", "deviceName": "task15-regression"},
        )
        assert_true(status == 400, "错误验证码登录应返回 400")
        assert_true(login_fail.get("success") is False, "错误验证码登录 success 应为 false")
        err = login_fail.get("error")
        if isinstance(err, dict):
            assert_true(err.get("code") in {"VALIDATION_400", ""}, "错误验证码登录 error.code 应符合契约")
            assert_true(bool(err.get("message")), "错误验证码登录 error.message 必填")
        else:
            assert_true("验证码" in str(err or ""), "错误验证码登录应返回验证码相关错误提示")

        # case 3: login 成功 + refresh
        status, login_ok = request_json(
            "/auth/login",
            method="POST",
            body={"phone": "13800138000", "code": dev_code, "deviceName": "task15-regression"},
        )
        assert_true(status == 200, "验证码登录应返回 200")
        assert_true(login_ok.get("success") is True, "验证码登录 success 应为 true")
        login_data = login_ok.get("data") or {}
        refresh_token = login_data.get("refreshToken")
        access_token = login_data.get("accessToken")
        assert_true(bool(refresh_token) and bool(access_token), "登录成功应返回 accessToken/refreshToken")
        assert_true(login_ok.get("error") is None, "登录成功 error 应为 null")

        status, refresh_ok = request_json(
            "/auth/refresh",
            method="POST",
            body={"refreshToken": refresh_token},
        )
        assert_true(status == 200, "刷新 token 应返回 200")
        assert_true(refresh_ok.get("success") is True, "刷新 token success 应为 true")
        refresh_data = refresh_ok.get("data") or {}
        assert_true(bool(refresh_data.get("accessToken")), "刷新 token 后应有新 accessToken")
        assert_true(refresh_ok.get("error") is None, "刷新 token error 应为 null")

        # case 4: devices 会话查询
        status, devices_ok = request_json(
            "/auth/devices",
            headers={"Authorization": f"Bearer {refresh_data.get('accessToken') or access_token}"},
        )
        assert_true(status == 200, "设备会话查询应返回 200")
        assert_true(devices_ok.get("success") is True, "设备会话查询 success 应为 true")
        assert_true(isinstance(devices_ok.get("data"), list), "设备会话 data 应为数组")
        assert_true(len(devices_ok.get("data")) >= 1, "设备会话至少包含 1 条")
        assert_true(devices_ok.get("error") is None, "设备会话 error 应为 null")

        print("[task15-e2e] 通过：send-code/login/refresh/devices 4 条回归用例")
        return 0
    except AssertionError as e:
        print(f"[task15-e2e] 失败：{e}")
        return 1
    finally:
        if started_here and proc is not None:
            proc.terminate()
            try:
                proc.wait(timeout=2)
            except subprocess.TimeoutExpired:
                proc.kill()


if __name__ == "__main__":
    sys.exit(main())
