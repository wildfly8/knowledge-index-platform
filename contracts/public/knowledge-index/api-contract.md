# API contract

## Query HTTP (Feature 003)

Service-to-service retrieve API. **No end-user sessions** — consumers attach
their own auth at the edge.

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/health` | None | Liveness |
| `POST` | `/v1/retrieve` | Bearer `KNOWLEDGE_RETRIEVE_API_SECRET` | Two-stage retrieve |
| `POST` | `/v1/chat` | Bearer | Retrieve + extractive/generative answer |
| `GET` | `/v1/status` | Bearer | Manifest summary |
| `POST` | `/v1/warm` | Bearer | Preload embed, rerank, and optional generator ONNX |

Start: `npm run serve` (default `http://127.0.0.1:3921`).

### `POST /v1/retrieve`

**Request**

```json
{
  "query": "natural language question",
  "top_k": 5,
  "min_score": 0.5,
  "rerank": true,
  "candidate_pool": 30
}
```

**Response `200`**

```json
{
  "chunks": [{ "essay_slug": "/posts/examined/...", "text": "...", "score": 1.2 }],
  "ann_chunks": [],
  "meta": {
    "index_status": "index_current",
    "manifest_digest": "sha256:...",
    "stale": false,
    "bi_encoder_model": "Xenova/all-MiniLM-L6-v2",
    "rerank_model": "Xenova/ms-marco-MiniLM-L-6-v2",
    "rerank": true,
    "model": "Xenova/ms-marco-MiniLM-L-6-v2"
  }
}
```

| Status | Condition |
|--------|-----------|
| 401 | Missing/invalid bearer |
| 400 | Invalid body |
| 503 | Index unavailable (`no_index` / `sync_failed`) |

Pipeline: query expansion → bi-encoder embed → Upstash ANN → optional
cross-encoder rerank (same models as write path).

### `POST /v1/chat`

Retrieve plus grounded answer composition (extractive default; optional Xenova
generative when `GENERATOR_SYNTHESIZE=true` on the platform).

**Request**

```json
{
  "query": "what's catamorphism",
  "top_k": 5,
  "min_score": 0.5,
  "rerank": true,
  "synthesize": true
}
```

**Response `200`**

```json
{
  "answer": "As a catamorphism (fold): …",
  "chunks": [{ "essay_slug": "/posts/examined/...", "text": "...", "score": 1.2 }],
  "ann_chunks": [],
  "meta": {
    "answer_mode": "extractive",
    "synthesized": false,
    "generator_model": null,
    "index_status": "index_current",
    "rerank": true
  },
  "synthesis_fallback": false
}
```

| Status | Condition |
|--------|-----------|
| 401 | Missing/invalid bearer |
| 400 | Invalid body |
| 503 | Index unavailable |

## CLI operations

Operator CLIs for index **writes** (Features 001–002):

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
| `KNOWLEDGE_PLATFORM_PORT` | No | Query API listen port (default `3921`) |
| `KNOWLEDGE_PLATFORM_HOST` | No | Bind host (default `127.0.0.1`) |
| `KNOWLEDGE_RETRIEVE_API_SECRET` | Yes (prod) | Bearer token for `/v1/*` routes |
| `KNOWLEDGE_RERANK` | No | Enable cross-encoder (default `true` off-platform) |
| `GENERATOR_SYNTHESIZE` | No | Opt-in Xenova generative answers (default off) |
| `GENERATOR_MODEL` | No | Default `Xenova/LaMini-Flan-T5-783M` when generative enabled |

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

Query HTTP latency, rerank quality, and **extractive/generative answer
composition** are owned by Feature **003** when consumers call `npm run serve`.
Read consumers keep user auth and rate limits at the edge.
