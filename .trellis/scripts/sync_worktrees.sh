#!/usr/bin/env bash
# 在主仓库与各 worktree 中执行 git fetch + 对 main 快进（当前分支若不是 main 则 merge origin/main）。
# 需已配置 coordinator.env（与 coordinator_round.sh 共用路径变量）。
#
# 用法: bash ./.trellis/scripts/sync_worktrees.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
ENV_FILE="${COORDINATOR_ENV:-${SCRIPT_DIR}/coordinator.env}"
if [[ ! -f "${ENV_FILE}" ]]; then
  echo "[err] 未找到 ${ENV_FILE}，请先复制 coordinator.env.example"
  exit 1
fi
set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

sync_one() {
  local dir="$1"
  local name="$2"
  if [[ -z "${dir}" ]]; then
    echo "[skip] ${name}: 未配置路径（检查 coordinator.env）"
    return 0
  fi
  if [[ ! -d "${dir}" ]]; then
    echo "[skip] ${name}: 目录不存在 ${dir}"
    return 0
  fi
  echo ">>> ${name}: ${dir}"
  git -C "${dir}" fetch origin
  local br
  br="$(git -C "${dir}" rev-parse --abbrev-ref HEAD)"
  if [[ "${br}" == "main" ]]; then
    git -C "${dir}" pull origin main
  else
    git -C "${dir}" merge origin/main --no-edit || {
      echo "[warn] ${name}: merge origin/main 有冲突，请在本目录手动处理"
      return 1
    }
  fi
}

REPO_ROOT="${TRELLIS_REPO_ROOT:-${REPO_ROOT}}"
sync_one "${REPO_ROOT}" "主仓库"
sync_one "${TRELLIS_WT_DEV_A:-}" "wt-04"
sync_one "${TRELLIS_WT_DEV_B:-}" "wt-17"
sync_one "${TRELLIS_WT_INTEGRATE:-}" "wt-integrate"
echo "[done] sync_worktrees 结束"
