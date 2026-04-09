<!-- TRELLIS:START -->
# Trellis Instructions

These instructions are for AI assistants working in this project.

Use the `/trellis:start` command when starting a new session to:
- Initialize your developer identity
- Understand current project context
- Read relevant guidelines

Use `@/.trellis/` to learn:
- Development workflow (`workflow.md`)
- Project structure guidelines (`spec/`)
- Developer workspace (`workspace/`)

Keep this managed block so 'trellis update' can refresh the instructions.

<!-- TRELLIS:END -->

## Session Recovery Baseline

For any new chat session in this repository, run this recovery checklist before coding:

1. `pwd`
2. `git branch --show-current`
3. `cat .trellis/.current-task` (if file exists in this worktree)
4. `python3 ./.trellis/scripts/session_bootstrap.py`
5. `git status --short`

If the directory/branch/task pointer does not match the role for this window, stop and ask for correction before making edits.
