# Research: Posts Semantic Vector Index

**Feature**: 001-posts-vector-index | **Date**: 2026-07-12

## Vector database vendor comparison (Vercel-aligned, free tier)

### Decision: **Upstash Vector** (primary recommendation)

**Rationale**:

- **Vercel Marketplace** native integration — env vars injected via `vercel link` + Upstash integration; no VPC or connection pool management.
- **Serverless HTTP API** (`@upstash/vector`) fits Next.js Route Handlers and background sync scripts on Vercel (no long-lived TCP from serverless functions).
- **Free tier** (2026): ~10K queries/day, 1 GB total data, 200M vector×dimension budget — sufficient for ~35 essays chunked into hundreds of vectors at 384–1536 dimensions.
- **Scale-to-zero** — aligns with low-traffic gated posts site; pay-as-you-go after free limits.

**Alternatives considered**:

| Vendor | Free tier | Vercel fit | Verdict |
|--------|-----------|------------|---------|
| **Neon pgvector** | Neon free DB (existing `POSTGRES_URL` for 003) | Same region as auth DB; SQL joins possible | **Strong alternate** — zero new vendor if pgvector enabled; but mixes OLTP auth with vector workload; serverless driver + ANN indexes need tuning |
| **Pinecone** | Starter (limited indexes/records) | Vercel Marketplace | Good DX; starter caps tighter than Upstash for hobby; proprietary SDK |
| **Supabase pgvector** | Free project | Separate dashboard from Vercel | Extra account; good if already on Supabase |
| **Cloudflare Vectorize** | Workers free tier | Not Vercel-native | Requires Workers edge split — rejected for single-Vercel-host constraint |
| **Chroma / self-hosted** | Self-host cost | Violates static-first simplicity | Rejected |

### Decision: **Neon pgvector** (documented fallback)

**Rationale**: Project already uses **Vercel Postgres → Neon** for Feature 003. Enabling `pgvector` extension stores embeddings beside auth tables — one bill, one connection string family (`POSTGRES_URL`).

**When to choose over Upstash**:

- Operator prefers single database vendor.
- Corpus stays &lt; ~50k chunks and query volume low.
- Team comfortable with SQL migrations for `embedding_chunks` table + HNSW index.

**Trade-off**: Vercel serverless functions share connection limits with auth queries; use Neon's serverless driver + pooled connections; isolate vector table namespace.

---

## Embedding model

### Decision: **`@xenova/transformers`** (`Xenova/all-MiniLM-L6-v2`, 384 dims) — default, $0 API

**Rationale**:

- **No OpenAI API** — Cursor IDE does not expose an embedding API for deploy/sync; this project uses bundled Xenova ONNX locally.
- Runs in Node during `postbuild` sync and at retrieval query time (same model for index + query).
- 384 dimensions fit Upstash free tier; quality sufficient for ~35 gated essays.
- First run downloads ONNX weights (~90MB) to `.cache/`; subsequent builds reuse cache.

**Optional upgrade**: not used in this repo (operator has Cursor only, not OpenAI API). Future features may add paid APIs via a new provider adapter.

---

## Sync trigger placement

### Decision: **Dedicated npm script + Vercel `postbuild` hook after Pagefind**

**Rationale**:

- Feature 004 already uses `postbuild` for Pagefind; append `node scripts/embed-posts/sync.mjs` (or `npm run embed:sync`) in sequence.
- Keeps vectors aligned with same deploy artifact as search index.
- If embedding exceeds Vercel build timeout (45s hobby / 300s pro), split: build succeeds → **Vercel Deploy Hook** or **GitHub Action** calls sync API route with `CRON_SECRET` (documented in quickstart as escalation path).

**Alternatives considered**: Real-time git webhook worker (out of v1 scope); embed inside `next build` (couples too tightly).

---

## Chunking strategy

### Decision: **MDX-aware text extraction + heading-bounded chunks (~500 tokens, 80-token overlap)**

**Rationale**:

- Strip frontmatter and JSX; preserve `##` headings as metadata for RAG citations.
- Overlap reduces boundary misses for retrieval.
- Store `essay_path`, `heading`, `chunk_index`, `content_hash` in vector metadata (≤48 KB Upstash limit per vector).

---

## Retrieval API shape

### Decision: **`POST /api/knowledge/retrieve`** (protected prefix `/api/knowledge/**`)

**Rationale**:

- Server-side embeds query with same model as index (or uses Upstash hybrid if enabled later).
- Returns JSON chunk list only — no LLM in v1.
- Middleware extends 003 matcher for `/api/knowledge/:path*`.

### Decision: **Two-stage retrieve — bi-encoder ANN + Xenova cross-encoder rerank**

**Rationale**:

- Bi-encoder cosine (384-d MiniLM) is fast for approximate nearest-neighbor over the full corpus but conflates query and passage in separate embeddings.
- **Cross-encoder** `Xenova/ms-marco-MiniLM-L-6-v2` scores `(query, passage)` jointly — better top-k ordering for RAG passage selection.
- Stage 1 fetches `candidate_pool` (default `min(60, max(top_k × 6, top_k + 5))`) from Upstash; stage 2 reranks before per-essay dedupe.
- Use `AutoTokenizer` + `AutoModelForSequenceClassification` with **raw logits** — `text-classification` pipeline softmax collapses single-logit outputs to 1.0.

**Alternatives considered**: Cohere rerank API (paid, external); rerank in v2 only (rejected — quality gap visible on technical essays); larger cross-encoder (slower cold start on Vercel).

---

## Security

- Vector DB credentials: `UPSTASH_VECTOR_REST_URL`, `UPSTASH_VECTOR_REST_TOKEN` (or reuse `POSTGRES_URL` for pgvector path).
- Optional `EMBED_SYNC_SECRET` for manual/CI re-index POST.
- Never import vector client in `'use client'` modules.
