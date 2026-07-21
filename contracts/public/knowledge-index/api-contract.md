# API contract

## CLI operations

This platform exposes **operator CLIs** only. It does not ship HTTP routes,
user sessions, or chat UI.

| Command | Writer | Purpose |
|---------|--------|---------|
| `npm run embed:sync` | deploy-sync | Incremental embed of in-scope posts (non-archive) |
| `npm run embed:sync -- --dry-run` | deploy-sync | Plan sync without writes |
| `npm run embed:backfill` | archive-backfill | Budgeted daily archive embedding |
| `npm run embed:backfill -- --dry-run` | archive-backfill | Plan backfill without writes |
| `npm run embed:backfill -- --verify` | archive-backfill | Reconcile manifest vs live vectors (read-only) |
| `npm run embed:backfill -- --essay-path <stub-path>` | archive-backfill | Single-file subset backfill |

Scheduled operation: Airflow DAG `embed_archive_backfill` invokes the same
backfill CLI daily at 01:00 UTC.

### Single-writer split (NON-NEGOTIABLE)

Paths are under the **producer** checkout (`CORPUS_ROOT`), not this repo.

| Control vector | Writer | Producer-relative file scope |
|----------------|--------|-------------------------------|
| `__manifest__` | deploy-sync | `content/posts/examined/**`, `content/posts/unfolding/**` except conversation year archives |
| `__backfill_manifest__` | archive-backfill | `content/posts/unfolding/{chatgpt,gemini}-20xx.mdx` only |

Writers MUST NOT modify the other writer's control record or file scope.
`EMBED_CONVERSATION_ARCHIVES=true` hands archives to deploy-sync and MUST NOT
be set while archive backfill is active.

## Environment

| Variable | Required | Purpose |
|----------|----------|---------|
| `UPSTASH_VECTOR_REST_URL` | Yes | Vector index REST endpoint |
| `UPSTASH_VECTOR_REST_TOKEN` | Yes | Write token |
| `CORPUS_ROOT` | Yes (operator) | **Producer** checkout root containing `content/` + `data/` (not this repo) |
| `AGENTIC_FOUNDATION_REPO` | No | Legacy alias for `CORPUS_ROOT` |
| `EMBED_PROVIDER` | No | Must be `xenova` (default) |
| `EMBED_MODEL` | No | Default `Xenova/all-MiniLM-L6-v2` |
| `UPSTASH_DAILY_WRITE_CAP` | No | Provider daily cap (default `10000`) |
| `EMBED_BACKFILL_WRITE_BUDGET` | No | Backfill ceiling (default `9500`; MUST be `<` cap) |
| `EMBED_CONVERSATION_ARCHIVES` | No | Must stay unset/false for default single-writer split |

Corpus files are read from the producer checkout at `CORPUS_ROOT`. This
platform never authors `content/` or `data/` essays.

Upstash URL and token are per-deployment secrets provisioned out of band.

## Delivery and failure behavior

**Deploy sync**

1. Scan in-scope corpus paths under the producer checkout.
2. Compare manifest digest; skip when unchanged (idempotent deploy).
3. Chunk changed files, embed with Xenova ONNX, upsert vectors, purge removed
   essays and `pre-examined` paths.
4. Persist `__manifest__` (primary SSOT) and optional local cache.

On embed/upsert failure: job enters `sync_failed`; prior index may remain;
operator retries the CLI.

**Archive backfill**

1. Refuse when `EMBED_BACKFILL_WRITE_BUDGET >= UPSTASH_DAILY_WRITE_CAP`.
2. Scan year archives only; diff against `__backfill_manifest__`.
3. Embed within daily write budget; advance per-file cursor only after
   successful micro-batch commit.
4. On interrupt: resume from last committed cursor (idempotent vector ids).

On batch failure: cursor unchanged; Airflow or operator retries.

Neither CLI guarantees retrieval latency or answer quality — those are read
consumer responsibilities.
