#!/usr/bin/env bash
# 一轮调度：可选先看主链建议 → 写三处 .current-task → 打印广播 → 可选本机通知。
# 依赖：已配置 coordinator.env（由 coordinator.env.example 复制）
#
# 用法:
#   cd /path/to/lpg_gas_project
#   bash ./.trellis/scripts/coordinator_round.sh
#   bash ./.trellis/scripts/coordinator_round.sh --suggest-only
#   COORDINATOR_NOTIFY=0 bash ./.trellis/scripts/coordinator_round.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${REPO_ROOT}"

ENV_FILE="${COORDINATOR_ENV:-${SCRIPT_DIR}/coordinator.env}"
if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
else
  echo "[err] 未找到 ${ENV_FILE}"
  echo "      请复制 coordinator.env.example 为 coordinator.env 并填写路径与任务。"
  exit 1
fi

REPO_ROOT="${TRELLIS_REPO_ROOT:-${REPO_ROOT}}"
export REPO_ROOT
PY="${PYTHON:-python3}"

SUGGEST_ONLY=0
for arg in "$@"; do
  if [[ "${arg}" == "--suggest-only" ]]; then
    SUGGEST_ONLY=1
  fi
  if [[ "${arg}" == "--help" || "${arg}" == "-h" ]]; then
    sed -n '1,20p' "$0"
    exit 0
  fi
done

: "${COORDINATOR_DEV_A_TASK:?请在 coordinator.env 设置 COORDINATOR_DEV_A_TASK}"
: "${COORDINATOR_DEV_B_TASK:?请在 coordinator.env 设置 COORDINATOR_DEV_B_TASK}"
: "${COORDINATOR_INTEGRATE_TASK:?请在 coordinator.env 设置 COORDINATOR_INTEGRATE_TASK}"

echo "=== [1/3] suggest_next_task（主链建议，供你确认）==="
"${PY}" "${SCRIPT_DIR}/suggest_next_task.py" || true
echo ""

if [[ "${SUGGEST_ONLY}" -eq 1 ]]; then
  echo "[info] --suggest-only：已打印建议，未写指针、未广播。"
  exit 0
fi

NOTIFY_FLAG=()
if [[ "${COORDINATOR_NOTIFY:-1}" != "0" ]]; then
  NOTIFY_FLAG=(--notify)
fi

echo "=== [2/3] coordinator_broadcast（写指针 + 广播）==="
CMD=(
  "${PY}" "${SCRIPT_DIR}/coordinator_broadcast.py"
  --repo-root "${REPO_ROOT}"
  --dev-a-task "${COORDINATOR_DEV_A_TASK}"
  --dev-b-task "${COORDINATOR_DEV_B_TASK}"
  --integrate-task "${COORDINATOR_INTEGRATE_TASK}"
)
if [[ -n "${TRELLIS_WT_DEV_A:-}" ]]; then
  CMD+=(--write-dev-a "${TRELLIS_WT_DEV_A}")
fi
if [[ -n "${TRELLIS_WT_DEV_B:-}" ]]; then
  CMD+=(--write-dev-b "${TRELLIS_WT_DEV_B}")
fi
if [[ -n "${TRELLIS_WT_INTEGRATE:-}" ]]; then
  CMD+=(--write-integrate "${TRELLIS_WT_INTEGRATE}")
fi
if [[ "${#NOTIFY_FLAG[@]}" -gt 0 ]]; then
  CMD+=("${NOTIFY_FLAG[@]}")
fi

echo "+ ${CMD[*]}"
"${CMD[@]}"

if [[ -n "${COORDINATOR_MAIN_REPO_TASK:-}" ]]; then
  mkdir -p "${REPO_ROOT}/.trellis"
  printf '%s\n' "${COORDINATOR_MAIN_REPO_TASK}" > "${REPO_ROOT}/.trellis/.current-task"
  echo "[ok] ${REPO_ROOT}/.trellis/.current-task -> ${COORDINATOR_MAIN_REPO_TASK}"
fi

echo ""
echo "=== [3/3] 完成 ==="
echo "请到三个 Cursor 窗口粘贴 SESSION_KICKOFF.zh.md 中对应段落（见 AUTOMATION.zh.md）。"
