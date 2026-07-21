# Quickstart: Archive Embedding Backfill

**Feature**: 002-archive-embed-backfill

Validates budgeted daily embedding of conversation year archives. Public contract:
[`contracts/public/knowledge-index`](../../contracts/public/knowledge-index/README.md).
Internal redirect: [backfill-pipeline.md](./contracts/backfill-pipeline.md).

## Prerequisites

1. Producer checkout at `CORPUS_ROOT` with `data/unfolding-chatgpt/` (and optional
   `data/unfolding-gemini/`) plus matching `content/posts/unfolding/*-20xx.mdx` stubs.
2. `.env` with `UPSTASH_VECTOR_REST_URL` + `UPSTASH_VECTOR_REST_TOKEN` (same index as Feature 001).
3. Deploy sync exclusion: do **not** set `EMBED_CONVERSATION_ARCHIVES=true`.
4. Upstash daily write quota available.

## One-shot CLI (no Airflow)

```bash
npm run embed:backfill -- --dry-run
npm run embed:backfill
```

**Expected**: Exit 0; `budget_spent ≤ WRITE_BUDGET`; `__backfill_manifest__` advanced.

## Fail-closed budget (FR-012)

```bash
EMBED_BACKFILL_WRITE_BUDGET=10000 UPSTASH_DAILY_WRITE_CAP=10000 npm run embed:backfill
```

**Expected**: Refuse to start; no upserts.

## Resume after interrupt (SC-002)

1. Run with `EMBED_BACKFILL_WRITE_BUDGET=64`.
2. Kill mid-run (Ctrl+C).
3. Re-run with same budget.

**Expected**: Resumes from cursor; no duplicate vector ids.

## Airflow (optional local)

```bash
cd airflow
docker compose build
docker compose up -d
# UI: http://localhost:8080 → DAG embed_archive_backfill
```

First container run installs workspace deps:

```bash
docker compose exec airflow bash -c "cd /opt/knowledge-index-platform && npm ci"
```

DAG: `airflow/dags/embed_archive_backfill.py` — schedule `0 1 * * *` UTC.

## Deploy sync isolation (SC-004)

```bash
npm run embed:sync
```

**Expected**: Does not embed year archives; does not modify `__backfill_manifest__`.

## Read-consumer smoke (SC-005)

After a committed batch, verify in the **read consumer app** (not this repo) that
a query returns chunks with `essay_path` under `content/posts/unfolding/chatgpt-…`
or `gemini-…`.

## Manual file subset (FR-011)

```bash
npm run embed:backfill -- --essay-path content/posts/unfolding/chatgpt-2025.mdx
```
