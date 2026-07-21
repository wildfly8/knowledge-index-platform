# Implementation Plan: Posts Vector Index

**Branch**: `001-posts-vector-index` | **Spec**: [spec.md](./spec.md)

Operator CLI (`npm run embed:sync`) embeds in-scope posts from the producer
corpus at `CORPUS_ROOT` into Upstash Vector. Control vector `__manifest__`.
Public contract: [`contracts/public/knowledge-index`](../../contracts/public/knowledge-index/README.md).

## Constitution Check

- [x] `npm test` passed
- [x] `npm run validate` passed
- [x] Single-writer split vs Feature 002 preserved

## Domain Alignment

| Entity | Implementation | Contract |
|--------|----------------|----------|
| Semantic Vector Index | `lib/knowledge/manifest.ts`, `vector-client.ts` | public data-contract |
| Embedding Sync Job | `scripts/embed-posts/sync.ts`, `embed-saga.ts` | public api-contract |
| Embedding Chunk | `lib/knowledge/embed.ts`, `vector-payload.ts` | public data-contract |

## Structure

```text
lib/knowledge/
scripts/embed-posts/sync.ts
specs/001-posts-vector-index/contracts/   # redirects only
```

Saga **SAGA-EMBED-001** tested in `lib/knowledge/embed-saga.test.ts`.

## Out of scope (read consumer)

- `POST /api/knowledge/retrieve`, auth, rate limits, rerank HTTP API
