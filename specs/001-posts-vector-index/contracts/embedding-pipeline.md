# Embedding pipeline (internal redirect)

> **Not a published contract.** Normative surface:
> [`contracts/public/knowledge-index`](../../../contracts/public/knowledge-index/README.md)
> @ **`3.0.0`** — release tag `contracts/knowledge-index/v3.0.0`.

Deploy-sync writer scope, CLI behavior, and saga alignment for Feature
**001-posts-vector-index** are defined in the public package:

- [api-contract.md](../../../contracts/public/knowledge-index/api-contract.md) —
  `npm run embed:sync`, environment, failure behavior
- [data-contract.md](../../../contracts/public/knowledge-index/data-contract.md) —
  deploy-sync corpus paths, vector ids, chunk metadata
- [capability.md](../../../contracts/public/knowledge-index/capability.md) —
  single-writer split vs archive backfill

Internal implementation: `lib/knowledge/embed-saga.ts`, `scripts/embed-posts/sync.ts`.
Tests: `lib/knowledge/embed-saga.test.ts` (edges EM01–EM09).
