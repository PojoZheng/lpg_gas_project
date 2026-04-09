#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
WORKBENCH = ROOT / ".trellis" / "delivery-app" / "src" / "workbench.html"
CLIENT = ROOT / ".trellis" / "delivery-app" / "src" / "workbench-client.js"


def assert_contains(path: Path, needles):
  text = path.read_text(encoding="utf-8")
  for needle in needles:
    if needle not in text:
      raise AssertionError(f"{path}: missing `{needle}`")


def main():
  assert_contains(
    WORKBENCH,
    [
      'id="syncOverlay"',
      'id="syncNowBtn"',
      'id="syncLaterBtn"',
      'id="syncDetailBtn"',
      'id="syncRetryBtn"',
      'id="nextDetailBtn"',
      'id="startDeliveryBtn"',
      "maybeShowSyncModal",
      "今日暂无收款数据，可先去快速开单。",
      "可前往快速开单创建新订单",
    ],
  )
  assert_contains(CLIENT, ["fetchSyncQueueOverview", "batchSyncNow"])
  print("task16 workbench closure smoke passed")


if __name__ == "__main__":
  try:
    main()
  except Exception as err:
    print(f"[FAIL] {err}")
    sys.exit(1)
