# Research: Budgeted Daily Embedding Backfill

**Feature**: 002-archive-embed-backfill | **Date**: 2026-07-17

## Decision 1 — Orchestration: thin Airflow DAG + TypeScript worker

**Decision**: Ship an Airflow DAG that shells out to a TypeScript CLI (`npm run embed:backfill` → `scripts/embed-posts/backfill.ts`). All budget arithmetic, chunking, Xenova embed, Upstash upsert, and progress persistence live in TypeScript reusing Feature 001 libraries.

**Rationale**: Embedding, vector IDs, and corpus resolution already exist in Node (`chunk-mdx`, `embed`, `paths`, `vector-client`). Duplicating that in Python risks ID drift (INV-BACKFILL-002). Airflow owns schedule, retries, and operator UX only.

**Alternatives considered**:
| Option | Rejected because |
|--------|------------------|
| Pure Python DAG with transformers | Duplicate Xenova path; different chunk IDs |
| Cron + shell only | Spec requires Airflow DAG (FR-001); loses UI retries/backfill |
| Vercel Cron | Hits same free-tier write wall; no multi-day durable cursor |

## Decision 2 — Daily schedule aligned to Upstash UTC reset

**Decision**: Schedule `0 1 * * *` (01:00 UTC) — one hour after the provider’s calendar-day write-limit reset. One DAG run = one budget day; never span two quota days.

**Rationale**: Observed error `Exceeded daily write limit: 10000` is calendar-based. Running at UTC midnight risks overlapping residual traffic from the previous day; 01:00 UTC gives a quiet window for the full batch.

**Alternatives**: Local timezone schedule (ambiguous vs provider); multiple runs/day (would require splitting one day’s budget — unnecessary complexity for v1).

## Decision 3 — Budget arithmetic

**Decision**:

```text
PROVIDER_DAILY_CAP     = int(env, default 10000)
WRITE_BUDGET           = int(env, default 9500)   # ~95% headroom
BOOKKEEPING_RESERVE    = 5                        # plan + cursor + run record upserts
CHUNK_WRITE_BUDGET     = WRITE_BUDGET - BOOKKEEPING_RESERVE

fail-closed if WRITE_BUDGET >= PROVIDER_DAILY_CAP   # FR-012
fail-closed if CHUNK_WRITE_BUDGET < 1
```

**Write accounting** (each counts 1 against the day’s spend):
- Chunk upsert (1 per vector)
- Chunk delete (1 per id)
- Progress-manifest upsert (`__backfill_manifest__`)

Deploy-time `__manifest__` writes belong to Feature 001 and are **not** charged to this budget (disjoint writers, INV-BACKFILL-003).

**Commit policy**: Advance the cursor only after a **committed micro-batch** (default upsert batch size 16, same as 005). Mid-run failure leaves cursor at last successful micro-batch commit (not start-of-day). Day’s total spend (upserts + deletes + bookkeeping) MUST stay ≤ `WRITE_BUDGET`.

**Rationale**: 9500 leaves ~500 headroom for accidental retries / concurrent 005 deploy writes the same UTC day. Reserve 5 keeps bookkeeping from eating the last chunk slots.

**Alternatives**: Budget = 9999 (too tight); budget in tokens/MB (provider meters writes, not tokens).

## Decision 4 — Progress-manifest strategy (dual SSOT)

**Decision**: Separate durable control vector **`__backfill_manifest__`** in the **same** Upstash index as Feature 001’s `__manifest__`. Local cache: `lib/knowledge/backfill-manifest.json` (gitignored), mirroring the 005 pattern.

| Manifest | Vector id | Writer | Scope |
|----------|-----------|--------|-------|
| Deploy sync | `__manifest__` | `embed:sync` (Vercel postbuild) | examined + non-archive unfolding |
| Archive backfill | `__backfill_manifest__` | `embed:backfill` (Airflow) | chatgpt/gemini archives only |

**Why not extend `__manifest__`**: Concurrent deploy + daily DAG would race on one JSON blob; a failed backfill already froze `__manifest__` at `sync_running` in production. Dual manifests = single-writer per control record.

**Shared data plane**: Same index, same `vectorIdForChunk(essay_slug, chunk_index)`, same chunk metadata shape — retrieval/chat need no changes.

**Cursor model** (chunk-granular, per file):

```json
{
  "status": "backlog_pending",
  "provider_daily_cap": 10000,
  "write_budget": 9500,
  "files": {
    "content/posts/unfolding/chatgpt-2025.mdx": {
      "content_hash": "sha256:…",
      "total_chunks": 42000,
      "next_chunk_index": 9500,
      "committed_chunks": 9500
    }
  },
  "committed_archive_vectors": 9500,
  "last_run": { /* Backfill Batch Run */ }
}
```

`committed_archive_vectors` = Σ `committed_chunks` — reconciliation target for SC-003.

**Hash change (BF07/BF08)**: If live `content_hash` ≠ stored, delete vectors `0..old_total-1` (budgeted across days if needed), reset `next_chunk_index=0`, re-enqueue.

## Decision 5 — DAG topology

```text
embed_archive_backfill (schedule: 0 1 * * *, catchup=False)
  ├─ validate_budget          # FR-012; fail if budget ≥ cap
  ├─ scan_and_plan            # list archive files; apply BF07/BF08 hash diffs
  ├─ run_budgeted_batch       # CLI: embed ≤ CHUNK_WRITE_BUDGET; retries=3
  └─ finalize_run_record      # append run audit; set backlog_complete if drained
```

Manual trigger params: `essay_paths` (optional subset), `dry_run` (budget math only).

Airflow task retries map to BF05/BF06; CLI is idempotent on cursor.

## Decision 6 — Hosting

**Decision**: Operator-local or self-hosted Airflow (Docker Compose sample under `airflow/`). Not on Vercel.

**Rationale**: Spec assumption — scheduler needs long-running Xenova ONNX + repo checkout of `data/unfolding-*` archives.

## Decision 7 — Amend 005 embedding-pipeline contract

**Decision**: Document that conversation archives are **excluded** from deploy sync unless `EMBED_CONVERSATION_ARCHIVES=true`, and that Feature 002 owns them via `__backfill_manifest__`.

**Rationale**: Cross-feature handoff already declared in 007 Domain Mapping; contract text must match shipped `lib/knowledge/paths.ts` behavior.
