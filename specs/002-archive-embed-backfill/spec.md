# Feature Specification: Budgeted Daily Embedding Backfill Pipeline

**Feature Branch**: `002-archive-embed-backfill`

**Created**: 2026-07-17

**Status**: Approved

**Input**: Incrementally embed large ChatGPT/Gemini year archives into the
shared Upstash index under a daily write budget, with Airflow scheduling and
durable resume.

## Summary

- **What this feature delivers**: A **scheduled daily embedding pipeline**
  (Airflow DAG + CLI) that incrementally embeds conversation **year archives**
  (`chatgpt-20xx.mdx`, `gemini-20xx.mdx` stubs → `data/unfolding-*` bodies) in
  budgeted batches until the backlog is drained.
- **Surface type**: Operator CLI / Airflow only — no UI.
- **Who it affects**: Operators; read consumers benefit as archive chunks appear.
- **Public contract**: [`contracts/public/knowledge-index`](../../contracts/public/knowledge-index/README.md)
  @ 1.0.0 — archive-backfill writer surface.
- **Works with**: Feature **001** deploy sync on the same index (disjoint scopes).
- **Must not break**: Deploy sync EM09 behavior; free-tier daily write quota.

*Spec changes are reviewed editorially and validated with `npm test` and
`npm run validate` (constitution Quality Gates).*

## Domain Mapping

**Primary bounded context**: Knowledge

| Entity | Role | Owner context |
|--------|------|---------------|
| Embedding Backfill Plan | aggregate root | Knowledge |
| Backfill Batch Run | created | Knowledge |
| Write Budget | created (per-day allowance) | Knowledge |
| Backfill Progress Cursor | created | Knowledge |
| Semantic Vector Index | extended | Knowledge |
| Embedding Chunk | extended (archive provenance) | Knowledge |
| Embedding Sync Job | referenced (deploy sibling) | Knowledge |
| Essay | indexed (archive stubs) | Content (producer) |

**Cross-feature dependencies**:

| Feature | Relationship | Contract / SSOT |
|---------|--------------|-----------------|
| 001 | shared index; disjoint writer scopes | public contract deploy-sync writer |
| Read consumer | reads indexed archives | public contract data read surface |

**Invariants**:

- **INV-BACKFILL-001**: Daily writes MUST NOT exceed configured budget; budget
  MUST be `<` provider cap
- **INV-BACKFILL-002**: Progress durable and idempotent — resume without
  duplicate vector ids
- **INV-BACKFILL-003**: Year archives have exactly one writer — this feature;
  deploy sync excludes them
- **INV-EMBED-003**: Chunk payloads carry no auth material or user identity

## Saga and state machines

### Process states

| State | Meaning |
|-------|---------|
| `backlog_pending` | Un-embedded archive chunks remain |
| `batch_running` | Daily batch embedding within budget |
| `batch_committed` | Cursor advanced; spend recorded |
| `backlog_complete` | All archive chunks indexed |
| `batch_failed` | Batch aborted; cursor unchanged |

### SAGA-BACKFILL-001 — Budgeted daily archive embedding

| ID | From | Event | To | Side effects | Compensation |
|----|------|-------|-----|--------------|--------------|
| BF01 | `backlog_pending` | `daily_schedule` | `batch_running` | Select slice ≤ budget | — |
| BF02 | `batch_running` | `budget_exhausted` | `batch_committed` | Stop; persist cursor | — |
| BF03 | `batch_running` | `backlog_drained` | `backlog_complete` | Mark complete | — |
| BF04 | `batch_running` | `batch_error` | `batch_failed` | Log error | BF06 retry |
| BF05 | `batch_committed` | `daily_schedule` | `batch_running` | Next slice | — |
| BF06 | `batch_failed` | `retry` | `batch_running` | Resume from cursor | — |
| BF07 | `backlog_pending` | `archive_hash_changed` | `batch_running` | Re-embed from 0; delete tail | — |
| BF08 | `backlog_pending` | `archive_removed` | `batch_committed` | Delete orphan vectors | — |

Executable contract: public package + internal redirect
[`contracts/backfill-pipeline.md`](./contracts/backfill-pipeline.md).

## User Scenarios & Testing

### User Story 1 - Operator drains archive backlog within budget (Priority: P1)

As an operator, I want daily backfill runs to embed conversation year archives
without exceeding the Upstash free-tier daily write cap.

**Independent Test**: `npm run embed:backfill -- --dry-run` shows planned writes
≤ budget; live run advances `__backfill_manifest__`.

---

### User Story 2 - Resume after failure (Priority: P1)

As an operator, I want interrupted runs to resume from the last committed
cursor without duplicate vector ids.

**Independent Test**: Kill mid-run → re-run → `committed_archive_vectors`
monotonic; no duplicate ids.

---

### User Story 3 - Deploy sync isolation (Priority: P1)

As an operator, I want deploy sync to never touch archive vectors or the
backfill manifest.

**Independent Test**: `npm run embed:sync` does not embed `chatgpt-20xx.mdx` /
`gemini-20xx.mdx`; does not modify `__backfill_manifest__`.

---

### User Story 4 - Correct archive path scope (Priority: P1)

As an operator, I want only year archive stubs backfilled — not index stubs
(`chatgpt.mdx`) or ISR part stubs (`chatgpt-2025-p1.mdx`).

**Independent Test**: `listBackfillArchiveFiles()` returns only
`{chatgpt,gemini}-20xx.mdx` paths; bodies resolved from `data/unfolding-*`.

## Requirements

### Functional Requirements

- **FR-001**: Scan `content/posts/unfolding/{chatgpt,gemini}-20xx.mdx` only.
- **FR-002**: Resolve bodies from `data/unfolding-chatgpt/` and
  `data/unfolding-gemini/`.
- **FR-003**: Persist progress in `__backfill_manifest__`.
- **FR-004**: Run via `npm run embed:backfill` and Airflow DAG daily 01:00 UTC.
- **FR-005**: Transition per **SAGA-BACKFILL-001**.
- **FR-006**: Refuse when `EMBED_BACKFILL_WRITE_BUDGET >= UPSTASH_DAILY_WRITE_CAP`.
- **FR-007**: On content-hash change, re-embed and delete tail overhang (BF07).
- **FR-008**: On archive removal, delete committed vectors (BF08).
- **FR-009**: Diff backlog vs manifest before each run.
- **FR-010**: Count writes toward daily budget (chunks + manifest).
- **FR-011**: Support `--essay-path` subset for manual runs.
- **FR-012**: Budget fail-closed before any upsert.

## Success Criteria

- **SC-001**: Daily spend ≤ configured budget in integration tests.
- **SC-002**: Resume after interrupt without duplicate ids.
- **SC-003**: Cursor matches committed vectors after batch.
- **SC-004**: Deploy sync does not modify archive scope (INV-BACKFILL-003).
- **SC-005**: Read consumer can find archive phrases after batch (manual smoke
  in consumer app — not implemented here).

## Assumptions

- Producer checkout at `CORPUS_ROOT` contains expected `data/unfolding-*` trees.
- Same Upstash index and vector id scheme as Feature 001.
- Read consumers implement retrieval and auth separately.

## Out of Scope

- User registration or session policy.
- Chat UI or answer synthesis.
- Embedding index stubs or ISR part files.
- Deploy-time sync of year archives (`EMBED_CONVERSATION_ARCHIVES` override).
