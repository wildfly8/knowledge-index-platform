---
name: "speckit-normalize"
description: "Resolve cross-feature spec.md Domain Mapping drift. **Not used in knowledge-index-platform** (no domain compiler) — use editorial review + npm test instead."
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "agentic-foundation"
---

---

> **knowledge-index-platform**: This skill requires `domain:normalize` tooling, which is **not installed** in this repo. Stop immediately and use editorial review of `spec.md` + `npm test` + `npm run validate` instead.

## User Input

```text
$ARGUMENTS
```

## Purpose

**Spec-stage normalization** — editorial pass on **`spec.md` Domain Mapping** only (semantic edits). Does **not** read `plan.md`, `data-model.md`, `contracts/`, or hand-edit `domain.graph.yaml`.

**Pipeline position:**

```text
Specify → Extract → Validate
              ↓ (spec vocabulary drift / ownership in spec tables)
         Normalize  ← this skill (npm run domain:normalize)
              ↓  rewrite spec.md Domain Mapping
         Re-extract → Re-validate → Plan
```

## What `domain:normalize` checks (spec-stage only)

| Code | Meaning |
|------|---------|
| `OWNERSHIP_CONFLICT` | Two features claim strong ownership of same entity in spec tables |
| `DISPLAY_ALIAS` | Same entity id, different display names across specs |
| `INV_DESC_DRIFT` | Same `INV-*`, different inline prose in spec Domain Mapping |

Per-feature spec Domain Mapping shape (no field columns) is enforced at **`domain:extract`**, not normalize.

## What `domain:check-plan` checks (plan stage — not normalize or `domain:check`)

| Check | Gate |
|-------|------|
| `plan.md` must not declare Domain Mapping | `plan_authoring_gates` |
| `data-model.md` entities ⊆ spec Domain Mapping | `plan_authoring_gates` |

## Ownership rules (NON-NEGOTIABLE)

- **Cross-feature ownership** → **`spec.md` Domain Mapping** only (not `plan.md`).
- **`plan.md`** → **Domain Alignment** traceability only.
- **Entity fields** → **`data-model.md`** only.

## Pre-execution

1. Run from repo root:

   ```bash
   npm run domain:normalize -- --strict
   ```

2. If `domain:check` failed on spec shape, fix spec Domain Mapping first. Plan/data-model issues are **`domain:check-plan`** (after `/speckit-plan` Phase 1).

## Workflow

### 1. Diagnose

Run `npm run domain:normalize` (or `--json`). Address only spec-stage codes above.

### 2. Edit

- Amend **`spec.md` Domain Mapping** for cross-feature changes.
- Do **not** add Domain Mapping to `plan.md`.
- Do **not** hand-edit `domain.graph.yaml`.
- Append **`.specify/domain/normalization-log.md`**.

### 3. Re-compile (semantic edit obligation)

Any normalize edit to `spec.md` is a **semantic edit** — recompile and validate the **global** graph:

```bash
npm run domain:extract
npm run domain:check
npm run domain:normalize -- --strict
```

Commit updated `domain.graph.yaml` with spec changes.

### 4. Completion report

- Spec-stage findings resolved
- `domain:check` green
- Ready for `/speckit-plan`

## When to invoke

- After a **semantic edit** to any feature's `spec.md` that may cause cross-feature drift
- After `domain:check` fails on **ownership** or cross-spec **vocabulary** in spec tables
- When `domain:normalize` reports errors
- Before merging cross-feature spec amendments (then `domain:check-all` recommended)

## Do NOT

- Use normalize to fix plan.md structure (`domain:check-plan` fails; edit plan to Domain Alignment only)
- Use normalize to fix data-model ↔ spec alignment (amend spec or data-model; `domain:check-plan` confirms)
