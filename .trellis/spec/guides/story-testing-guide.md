# Story Testing Guide

> **Purpose**: Validate end-to-end user outcomes, not just spec compliance.

---

## Why Story Tests

规约测试只能回答“做没做”，故事测试要回答“用户能不能顺利完成目标”。

If a feature passes contract checks but fails the real user flow, it is not done.

---

## When Story Tests Are Required

- the feature spans `delivery-app + backend`
- a workflow crosses multiple pages
- the task affects user priority or page responsibility
- the feature changes what the user does next

---

## Test Structure

Each story test should include:

1. user role
2. preconditions
3. trigger action
4. core path
5. exception path
6. observable result

---

## What to Assert

- the user reaches the right page from the expected entry
- the page shows the right priority information first
- the user can complete the key action with minimal detours
- data updates are reflected in all affected views
- failure states explain what the user should do next

---

## Naming

Prefer:

- `story_customer_debt_collection.py`
- `story_delivery_complete_with_safety.py`
- `story_platform_policy_publish.py`

Avoid names that only expose task numbers without user meaning.

---

## Failure Classification

When a story test fails, classify the issue as one of:

- `scenario_gap`: product story is underspecified
- `interaction_gap`: page responsibility or flow is wrong
- `contract_gap`: API / state contract mismatch
- `implementation_gap`: code bug or regression
