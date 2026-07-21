# Data Model: Budgeted Daily Embedding Backfill

**Feature**: 002-archive-embed-backfill | **Date**: 2026-07-17

Entity **ownership** is declared in [spec.md Domain Mapping](./spec.md). This file is field SSOT only.

## Embedding Backfill Plan

Long-lived aggregate describing archive backlog and completion state.

| Field | Type | Notes |
|-------|------|-------|
| `status` | enum | `backlog_pending` \| `batch_running` \| `batch_committed` \| `backlog_complete` \| `batch_failed` |
| `provider_daily_cap` | number | Default `10000` |
| `write_budget` | number | Default `9500`; MUST be `< provider_daily_cap` |
| `files` | map | Key = `essay_path` (archive only) |
| `files[path].content_hash` | string | `sha256:…` of LF-normalized source |
| `files[path].total_chunks` | number | Last known chunk count for this hash |
| `files[path].next_chunk_index` | number | First uncommitted chunk index (cursor) |
| `files[path].committed_chunks` | number | Equals `next_chunk_index` after successful commits |
| `committed_archive_vectors` | number | Σ `committed_chunks` — reconciliation target |
| `last_run` | Backfill Batch Run \| null | Most recent run |
| `updated_at` | ISO-8601 | Last durable write |

**Persistence**: Upstash vector id `__backfill_manifest__` (SSOT) + `lib/knowledge/backfill-manifest.json` (dev cache).

**Validation**:
- `write_budget < provider_daily_cap` (FR-012)
- Every `essay_path` matches conversation-archive pattern (`chatgpt` / `gemini`)
- `0 ≤ next_chunk_index ≤ total_chunks`
- `committed_chunks === next_chunk_index` after commit

## Backfill Batch Run

One scheduled or manual execution.

| Field | Type | Notes |
|-------|------|-------|
| `run_id` | UUID | |
| `trigger` | enum | `daily_schedule` \| `manual` \| `retry` |
| `run_date_utc` | string | `YYYY-MM-DD` (quota day) |
| `started_at` | ISO-8601 | |
| `finished_at` | ISO-8601 \| null | |
| `state` | enum | mirrors plan status at end of run |
| `cursor_before` | number | `committed_archive_vectors` at start |
| `cursor_after` | number | after commit |
| `chunks_upserted` | number | |
| `chunks_deleted` | number | |
| `budget_spent` | number | upserts + deletes + bookkeeping writes |
| `budget_limit` | number | `write_budget` for that day |
| `error_stage` | enum \| null | `validate` \| `scan` \| `chunk` \| `embed` \| `upsert` \| `commit` |
| `error_message` | string \| null | |
| `essay_paths_filter` | string[] \| null | Manual subset (FR-011) |

## Write Budget

Computed per run (not a separate store row).

| Field | Type | Notes |
|-------|------|-------|
| `provider_daily_cap` | number | env `UPSTASH_DAILY_WRITE_CAP` default 10000 |
| `write_budget` | number | env `EMBED_BACKFILL_WRITE_BUDGET` default 9500 |
| `bookkeeping_reserve` | number | constant `5` |
| `chunk_write_budget` | number | `write_budget - bookkeeping_reserve` |
| `spent` | number | running counter during batch |

**Rules**: Refuse start if `write_budget >= provider_daily_cap` or `chunk_write_budget < 1`. Stop selecting new chunks when `spent + estimated_next_microbatch > write_budget`.

## Backfill Progress Cursor

Logical view of plan progress (not a separate persistence document).

| Field | Type | Notes |
|-------|------|-------|
| `global_committed` | number | = `committed_archive_vectors` |
| `per_file_next` | map path → index | = `files[path].next_chunk_index` |

**Invariant (INV-BACKFILL-002)**: After commit, store vectors for archives with deterministic ids equal the set of committed chunk indices for current hashes (no duplicates; gaps only for in-flight uncommitted micro-batches that rolled back by not advancing cursor).

## Relationships

```text
Embedding Backfill Plan 1──* archive Essay paths (via files map)
Embedding Backfill Plan 1──1 Backfill Progress Cursor (derived)
Embedding Backfill Plan 1──* Backfill Batch Run (last_run + optional history append)
Write Budget ── constrains ── Backfill Batch Run
Backfill Batch Run ── upserts ── Embedding Chunk (005) in Semantic Vector Index (005)
```

## State transitions

See [spec.md § SAGA-BACKFILL-001](./spec.md) (`BF01`–`BF08`). Code module: `lib/knowledge/backfill-saga.ts`.
