# Data Model: Posts Semantic Vector Index

**Feature**: 001-posts-vector-index | **Date**: 2026-07-12

Logical entities. Physical storage: Upstash Vector. Normative contract:
[`contracts/public/knowledge-index`](../../contracts/public/knowledge-index/data-contract.md).
Internal redirect: [`contracts/embedding-pipeline.md`](./contracts/embedding-pipeline.md).

## Entity: `SemanticVectorIndex`

| Attribute | Type | Notes |
|-----------|------|-------|
| `provider` | enum | `upstash` \| `neon_pgvector` |
| `index_name` | string | e.g. `posts-knowledge-v1` |
| `manifest_digest` | string | SHA-256 of posts corpus file set + contents |
| `vector_count` | number | Total upserted chunks |
| `dimension` | number | e.g. 384 (Xenova MiniLM) |
| `status` | enum | `no_index` \| `stale` \| `sync_pending` \| `sync_running` \| `index_current` \| `sync_failed` |
| `last_sync_at` | timestamp | ISO-8601 UTC |
| `last_error` | string \| null | From failed sync job |

### Invariants

- **INV-RAG-001**: covers posts corpus only; anonymous access forbidden at API layer.
- **INV-RAG-002**: `status=index_current` ⇒ `manifest_digest` matches computed posts digest.

## Entity: `EmbeddingChunk`

| Attribute | Type | Notes |
|-----------|------|-------|
| `id` | string | Stable: `{essay_slug}#{chunk_index}` |
| `essay_path` | path | Repo-relative, e.g. `content/posts/examined/foo.mdx` |
| `essay_slug` | string | URL slug `/posts/examined/foo` |
| `heading` | string \| null | Nearest preceding `##` title |
| `chunk_index` | number | 0-based within essay |
| `text` | string | Plain text snippet (no JSX) |
| `content_hash` | string | Hash of chunk text for idempotent upsert |
| `token_estimate` | number | Approximate tokens |
| `vector_id` | string | Provider-specific vector key |

### Invariants

- `essay_path` MUST start with `content/posts/examined/` or `content/posts/unfolding/`.
- `text` MUST NOT exceed provider metadata size (truncate with ellipsis in manifest only).

## Entity: `EmbeddingSyncJob`

| Attribute | Type | Notes |
|-----------|------|-------|
| `job_id` | string | UUID per run |
| `trigger` | enum | `deploy_postbuild` \| `manual` \| `ci` |
| `started_at` | timestamp | |
| `finished_at` | timestamp \| null | |
| `state` | enum | Maps to saga: `sync_running`, `sync_failed`, completed → index status |
| `files_scanned` | number | |
| `chunks_written` | number | |
| `chunks_deleted` | number | Tombstone/remove on deleted essays |
| `error_stage` | enum \| null | `scan` \| `chunk` \| `embed` \| `upsert` |

### Invariants

- One active `sync_running` job per environment (mutex via env lock file or DB advisory lock).

## Relationships

- **Essay** (Content producer): 1:N **EmbeddingChunk** by `essay_path`.
- **SemanticVectorIndex**: 1:N **EmbeddingChunk** (all vectors in one index v1).
- **Read consumer**: queries index per public data contract (auth not in this repo).

## Posts corpus digest (computed, not persisted separately)

| Input | Rule |
|-------|------|
| Glob | `content/posts/examined/**/*.{mdx,md,txt}` and `content/posts/unfolding/**/*.{mdx,md,txt}` |
| Exclude | `content/posts/pre-examined/**` |
| Digest | SHA-256 of sorted `path:content_hash` lines |

Used by sync to implement **INV-RAG-002**.

## Retrieval ranking (runtime, not persisted)

Two-stage pipeline per `contracts/vector-retrieval.md`:

| Stage | Model | Input | Output |
|-------|-------|-------|--------|
| 1 ANN | `Xenova/all-MiniLM-L6-v2` | query vector | `candidate_pool` chunks by cosine |
| 2 rerank | `Xenova/ms-marco-MiniLM-L-6-v2` | `(query, chunk.text)` pairs | rerank logit per chunk |

`EmbeddingChunk.vector_id` is indexed in stage 1 only; rerank operates on `text` snippets in memory.
