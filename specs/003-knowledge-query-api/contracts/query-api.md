# Query API contract (internal redirect)

> **Not a published contract.** Normative surface:
> [`contracts/public/knowledge-index`](../../../contracts/public/knowledge-index/README.md)
> @ **`4.0.0`** — release tag `contracts/knowledge-index/v4.0.0`.

Query HTTP routes, request/response shapes, and auth for Feature
**003-knowledge-query-api** are defined in the public package:

- [api-contract.md](../../../contracts/public/knowledge-index/api-contract.md) —
  `POST /v1/retrieve`, `POST /v1/chat`, `GET /v1/status`, `POST /v1/warm`, `GET /health`
- [data-contract.md](../../../contracts/public/knowledge-index/data-contract.md) —
  chunk metadata returned to consumers (no raw vectors)
- [capability.md](../../../contracts/public/knowledge-index/capability.md) —
  single-writer split; query path owned here

Internal implementation: `server/index.ts`, `lib/server/router.ts`,
`lib/knowledge/retrieve-core.ts`, `lib/knowledge/chat-core.ts`.
