# Codex Collaboration Guide

> **Purpose**: Use Codex for both需求讨论 and implementation execution without mixing the two phases.

---

## Two Working Modes

### Mode 1: Product Discussion

Use this mode when:

- requirements are still fuzzy
- page responsibilities are unclear
- the user is deciding whether a function belongs in `delivery-app` or `platform`
- the UI is functionally correct but feels crowded or off-priority

In this mode, Codex should primarily update:

- `product/scenarios/`
- `product/interaction/`
- `product/decisions/`

Do **not** jump straight to code unless the user explicitly wants prototyping.

### Mode 2: Execution

Use this mode when:

- product decisions are stable enough
- a task already exists or can be created confidently
- file ownership and acceptance are clear

In this mode, Codex should:

1. read `task.json`, `prd.md`, and referenced `product/` files
2. read the corresponding spec
3. implement within explicit file boundaries
4. run validation
5. update completion artifacts

---

## Recommended Role Split

### Product Designer

- clarifies user scenario
- defines page responsibility
- decides interaction priority

### Planner

- translates stable product decisions into task acceptance
- keeps task dependencies coherent

### Builder

- changes code in owned files only

### Integrator

- runs regression and story validation
- checks docs and acceptance closure

---

## Practical Conversation Pattern

Use this loop:

1. user describes business problem or discomfort
2. Codex restates the user scenario in product terms
3. Codex writes or updates `product/` artifacts
4. user confirms or corrects
5. Codex updates spec / task
6. Codex implements
7. Codex validates with story-oriented checks

---

## File Ownership Rule

Parallel execution should be split by **write set**, not by abstract role names.

Example for a cross-layer feature:

- frontend worker:
  - `apps/delivery-app/src/*.html`
  - `apps/delivery-app/src/*-client.js`
- backend worker:
  - `services/backend/src/*.js`
- integrator:
  - task docs
  - story tests
  - final validation

---

## Design Collaboration Rule

Design optimization must respect this order:

1. clarify page responsibility
2. remove functional stacking
3. improve information hierarchy
4. then polish visual expression

Use project design constraints from:

- `.trellis/spec/delivery-app/ui-manifest.md`
- `.trellis/spec/delivery-app/DESIGN.md`
- `.impeccable.md`

The design skill is a refinement tool, not a replacement for product decisions.
