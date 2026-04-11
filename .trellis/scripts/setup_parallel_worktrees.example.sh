#!/usr/bin/env bash
set -euo pipefail

# Example script: create parallel worktrees for dev A, dev B, and dev C (third tree; bus/scripts name it "integrate", e.g. wt-integrate). Merge to main stays on the main repo worktree.
# Copy this file to a local script (for example: setup_parallel_worktrees.sh),
# adjust variables below, then run it from anywhere.
#
# This script does not modify git config. It only creates worktrees/branches
# and writes `.trellis/.current-task` in each worktree.

REPO_ROOT="${REPO_ROOT:-/Users/zhengpeipei/多立恒/概念验证/lpg_gas_project}"
WT_BASE="${WT_BASE:-$HOME/worktrees/lpg_gas_project}"

DEV_A_TASK="${DEV_A_TASK:-.trellis/tasks/04-delivery-to-complete}"
DEV_B_TASK="${DEV_B_TASK:-.trellis/tasks/17-quick-order-ux-alignment}"
INT_TASK="${INT_TASK:-.trellis/tasks/04-delivery-to-complete}"

DEV_A_BRANCH="${DEV_A_BRANCH:-feat/04-delivery-to-complete}"
DEV_B_BRANCH="${DEV_B_BRANCH:-feat/17-quick-order-ux}"
INT_BRANCH="${INT_BRANCH:-integrate/mainline}"

DEV_A_DIR="${WT_BASE}/wt-04"
DEV_B_DIR="${WT_BASE}/wt-17"
INT_DIR="${WT_BASE}/wt-integrate"

echo "[info] REPO_ROOT=${REPO_ROOT}"
echo "[info] WT_BASE=${WT_BASE}"
mkdir -p "${WT_BASE}"

cd "${REPO_ROOT}"
BASE="$(git rev-parse HEAD)"
echo "[info] base commit: ${BASE}"

create_worktree_if_missing() {
  local dir="$1"
  local branch="$2"
  if [ -d "${dir}/.git" ] || [ -f "${dir}/.git" ]; then
    echo "[skip] worktree exists: ${dir}"
    return 0
  fi
  if git show-ref --verify --quiet "refs/heads/${branch}"; then
    echo "[run ] git worktree add \"${dir}\" \"${branch}\""
    git worktree add "${dir}" "${branch}"
  else
    echo "[run ] git worktree add -b \"${branch}\" \"${dir}\" \"${BASE}\""
    git worktree add -b "${branch}" "${dir}" "${BASE}"
  fi
}

write_current_task() {
  local dir="$1"
  local task="$2"
  mkdir -p "${dir}/.trellis"
  printf "%s\n" "${task}" > "${dir}/.trellis/.current-task"
  echo "[ok  ] ${dir}/.trellis/.current-task -> ${task}"
}

create_worktree_if_missing "${DEV_A_DIR}" "${DEV_A_BRANCH}"
create_worktree_if_missing "${DEV_B_DIR}" "${DEV_B_BRANCH}"
create_worktree_if_missing "${INT_DIR}" "${INT_BRANCH}"

write_current_task "${DEV_A_DIR}" "${DEV_A_TASK}"
write_current_task "${DEV_B_DIR}" "${DEV_B_TASK}"
write_current_task "${INT_DIR}" "${INT_TASK}"

echo
echo "[next] Open each directory in separate Cursor window:"
echo "       1) ${DEV_A_DIR}"
echo "       2) ${DEV_B_DIR}"
echo "       3) ${INT_DIR}"
echo "[next] In each window run: python3 ./.trellis/scripts/session_bootstrap.py"
echo "[next] Coordinator: copy coordinator.env.example -> coordinator.env, then:"
echo "       bash ./.trellis/scripts/coordinator_round.sh   (see agent-prompts/AUTOMATION.zh.md)"
echo "[done] git worktree list"
git worktree list
