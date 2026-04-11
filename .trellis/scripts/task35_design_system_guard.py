#!/usr/bin/env python3
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[2]

KEY_PAGES = [
    ".trellis/delivery-app/src/workbench.html",
    ".trellis/delivery-app/src/quick-order.html",
    ".trellis/delivery-app/src/delivery-complete.html",
    ".trellis/delivery-app/src/my.html",
]

UNIFIED_REFERENCES = [
    "delivery-shell.css",
    "/.trellis/ui-kit/styles/tokens.css",
    "/.trellis/ui-kit/styles/components.css",
    "./delivery-shell.css",
    "../styles/tokens.css",
]


def check_page(path: Path) -> str:
    text = path.read_text(encoding="utf-8")
    if any(ref in text for ref in UNIFIED_REFERENCES):
        return "ok"
    return "missing unified token/css reference"


def main() -> int:
    failures = []
    checked = []
    for rel in KEY_PAGES:
        page = ROOT / rel
        if not page.exists():
            failures.append(f"{rel}: missing file")
            continue
        result = check_page(page)
        checked.append(rel)
        if result != "ok":
            failures.append(f"{rel}: {result}")

    print(f"task35 guard checked {len(checked)} pages")
    for rel in checked:
        print(f"- {rel}: ok")

    if failures:
        print("task35 guard failed:", file=sys.stderr)
        for item in failures:
            print(f"- {item}", file=sys.stderr)
        return 1

    print("task35 design-system guard passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
