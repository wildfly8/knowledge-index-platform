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

After sync, verify retrieval via Feature **003** (`npm run serve`) or the read
consumer proxy — see [003 quickstart](../003-knowledge-query-api/quickstart.md).

## Producer hook

The corpus producer (e.g. `agentic-foundation`) should invoke this platform's
sync after deploy when posts change. Example Vercel `package.json` postbuild
sequence (paths are illustrative):

```json
{
  "scripts": {
    "postbuild": "node scripts/pagefind.mjs && cd ../knowledge-index-platform && npm run embed:sync"
  }
}
```

Set `CORPUS_ROOT` in the platform `.env` to the producer checkout (or pass it
in CI). Use `npm run embed:sync -- --dry-run` in CI plan-only jobs.
