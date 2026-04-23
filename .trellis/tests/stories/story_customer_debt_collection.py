#!/usr/bin/env python3
"""用户故事：配送员进入债务管理，执行催款并记录还款。"""

from __future__ import annotations

from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[3]


def assert_contains(path: Path, needles: list[str]) -> None:
    text = path.read_text(encoding="utf-8")
    missing = [needle for needle in needles if needle not in text]
    if missing:
        raise AssertionError(f"{path} missing: {missing}")


def run() -> None:
    """验证 Task 48 的主故事链路已接入关键实现。"""
    debt_page = ROOT / "apps" / "delivery-app" / "src" / "debt-overview.html"
    debt_client = ROOT / "apps" / "delivery-app" / "src" / "debt-client.js"
    my_page = ROOT / "apps" / "delivery-app" / "src" / "my.html"
    server = ROOT / "services" / "backend" / "src" / "server.js"

    for path in (debt_page, debt_client, my_page, server):
        if not path.is_file():
            raise AssertionError(f"missing file: {path}")

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
            "submitDebtReminder",
            "submitDebtRepayment",
            "fetchDebtCustomerDetail",
            "欠款已结清",
        ],
    )
    assert_contains(
        debt_client,
        [
            "/debts/overview",
            "/debts/list",
            "/debts/customer/",
            "/debts/reminder",
            "/debts/repayment",
        ],
    )
    assert_contains(
        server,
        [
            'pathname === "/debts/overview"',
            'pathname === "/debts/list"',
            'pathname.startsWith("/debts/customer/")',
            'pathname === "/debts/reminder"',
            'pathname === "/debts/repayment"',
            "buildDebtCustomerMutationResult",
            "settled:",
        ],
    )
    print("story_customer_debt_collection passed")


if __name__ == "__main__":
    try:
        run()
    except AssertionError as err:
        print(f"story_customer_debt_collection failed: {err}", file=sys.stderr)
        raise SystemExit(1) from err
