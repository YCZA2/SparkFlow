---
name: line-budget-architect
description: Scan a repository for oversized source files, compare them against path-aware line budgets, and drive architecture-focused refactors when files exceed the limit. Use this skill when the user asks to control file size, find bloated files, enforce modularity, or refactor long screens, services, hooks, or components.
---

# Line Budget Architect

## Overview

Use this skill to turn "the files are getting too big" into a repeatable workflow:

1. Scan the repository with a deterministic script.
2. Flag files that exceed a line budget based on file role.
3. Read the worst offenders and adjacent modules.
4. Refactor by responsibility, not by arbitrary slicing.

## Quick Start

Run the bundled scanner first:

```bash
python3 scripts/scan_line_budget.py --root /absolute/path/to/repo
```

Useful variants:

```bash
python3 scripts/scan_line_budget.py --root /repo --top 30
python3 scripts/scan_line_budget.py --root /repo --budget app=220 --budget service=280
python3 scripts/scan_line_budget.py --root /repo --json
```

## Workflow

### 1. Scan before editing

- Always run the scanner before proposing refactors.
- Use the path-aware defaults unless the user gave a stricter threshold.
- Ignore generated and vendored code unless the user explicitly asks to include it.

### 2. Prioritize by severity

Use this order:

1. Files over budget by `150+` lines.
2. Files on hot paths such as routes, services, orchestration layers, or shared components.
3. Files that mix unrelated responsibilities such as UI, data fetching, state orchestration, and formatting.

### 3. Read the file with its neighbors

Before refactoring an oversized file:

- Read the file itself.
- Read sibling hooks/components/services the file should probably delegate to.
- Identify the real responsibilities already present in the file.

Do not split mechanically every `N` lines. Split by change reason.

### 4. Apply role-specific refactors

Use these patterns:

- `app/`, `screen`, route files:
  Extract data loading and actions into `useXScreen`.
  Extract major sections into feature components.
  Keep the route file focused on params, composition, and navigation.
- `components/`:
  Split presentational sections into subcomponents.
  Move stateful behavior into local hooks when the behavior is reusable or noisy.
  Move formatting and derived display logic into presenters or utils.
- `hooks/`:
  Separate remote data, mutation actions, and derived selectors when one hook is doing all three.
  Keep hooks centered on one screen flow or one reusable behavior.
- `services/` and backend provider files:
  Split transport client, request building, retry/polling, response parsing, and business orchestration.
  Keep provider-specific quirks isolated behind narrow interfaces.
- `tests/`:
  Extract builders, fixtures, and helper assertions before splitting by scenario file.

### 5. Preserve behavior

- Do not refactor only to satisfy the line budget.
- Keep behavior unchanged unless the user asked for a product change.
- After edits, run the narrowest verification that covers the refactor.

## Default Budgets

The scanner uses these defaults:

- `app`: `250`
- `screen`: `250`
- `component`: `180`
- `hook`: `180`
- `presenter`: `140`
- `util`: `140`
- `service`: `300`
- `schema`: `220`
- `test`: `400`
- `default`: `250`

Interpretation:

- A file under budget is not automatically well-structured.
- A file over budget is a strong review signal, not an excuse for blind fragmentation.

## Output Expectations

When using this skill, report results in this order:

1. Highest-severity violations with path, actual lines, budget, and overflow.
2. For each file you plan to change, name the target split.
3. After refactoring, summarize the new module boundaries and verification status.

## Resources

### `scripts/scan_line_budget.py`

Deterministic scanner for:

- counting physical lines
- classifying files by path and name
- applying per-role budgets
- printing a ranked report or JSON payload
