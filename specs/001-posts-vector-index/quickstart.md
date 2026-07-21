# Quickstart: Posts Vector Index Sync

**Feature**: 001-posts-vector-index

Public contract: [`contracts/public/knowledge-index`](../../contracts/public/knowledge-index/README.md).
Internal redirect: [embedding-pipeline.md](./contracts/embedding-pipeline.md).

## Prerequisites

1. Producer checkout at `CORPUS_ROOT` with `content/posts/examined/` and
   `content/posts/unfolding/` (non-archive files).
2. `.env` with `UPSTASH_VECTOR_REST_URL`, `UPSTASH_VECTOR_REST_TOKEN`, `CORPUS_ROOT`.
3. `npm install`

## Sync

```bash
npm run embed:sync -- --dry-run
npm run embed:sync
```

**Expected**: `__manifest__` reaches `index_current`; in-scope paths listed; year
archives and `pre-examined` excluded.

## Validation

```bash
npm test
npm run validate
```

## Read-consumer smoke

Retrieval and auth are **not** implemented in this repo. After sync, verify chunk
metadata in Upstash or via the read consumer application per the public data
contract.
