# Feature Specification: Knowledge Query API

**Feature Branch**: `003-knowledge-query-api`

**Created**: 2026-07-20

**Status**: Approved

**Input**: HTTP query service for two-stage retrieval (bi-encoder ANN + optional
cross-encoder rerank) over the shared Upstash index written by Features 001–002.

## Summary

- **What this feature delivers**: HTTP query service — `POST /v1/retrieve`,
  `POST /v1/chat` (retrieve + answer composition), `GET /v1/status`, `POST /v1/warm`.
  Xenova embed, rerank, and optional generative synthesis run here.
  Service-to-service auth via bearer secret — **no end-user sessions** in this repo.
- **Who it affects**: Read consumers (e.g. `agentic-foundation` chat) call this API;
  operators run `npm run serve` beside sync/backfill CLIs.
- **Public contract**: [`contracts/public/knowledge-index`](../../contracts/public/knowledge-index/README.md)
  @ **3.0.0** — query HTTP + answer composition.
- **Works with**: Features **001** (index writes), **002** (archives); same Upstash
  index and chunk metadata per data contract.
- **Must not break**: Single-writer split; consumers keep auth/rate-limit at their edge.

## Domain Mapping

**Primary bounded context**: Knowledge

| Entity | Role | Owner context |
|--------|------|---------------|
| Semantic Vector Index | referenced (read) | Knowledge |
| Embedding Chunk | referenced (read) | Knowledge |
| RAG Synthesized Answer | created (per turn, grounded) | Knowledge |
| Knowledge Query API | aggregate root | Knowledge |

**Cross-feature dependencies**:

| Feature | Relationship | Contract |
|---------|--------------|----------|
| 001 | reads index written by deploy-sync | public data contract |
| 002 | reads archive vectors from backfill | public data contract |
| Consumer apps | HTTP client + user auth | public api contract § Query HTTP |

**Invariants**:

- **INV-RETRIEVE-001**: Query API MUST NOT upsert or delete chunk vectors
- **INV-RETRIEVE-002**: Retrieval uses same bi-encoder / cross-encoder models as write path
- **INV-RETRIEVE-003**: Responses MUST NOT include raw embedding vectors
- **INV-RETRIEVE-004**: Production MUST require `KNOWLEDGE_RETRIEVE_API_SECRET` bearer auth

## Saga and state machines

### SAGA-RETRIEVE-001 — Platform retrieve request

| ID | From | Event | To | Side effects |
|----|------|-------|-----|--------------|
| QR01 | `ready` | `retrieve_request` | `ready` | ANN + optional rerank; return chunks |
| QR02 | `ready` | `index_unavailable` | `ready` | 503; no fabricated chunks |
| QR03 | `ready` | `index_stale` | `ready` | 200 with `meta.stale=true` |

## Functional requirements

- **FR-001**: `POST /v1/retrieve` accepts `query`, `top_k`, `min_score`, `rerank`, `candidate_pool`
- **FR-002**: Default pipeline: query expand → bi-encoder embed → Upstash ANN → cross-encoder rerank
- **FR-003**: `GET /v1/status` returns manifest summary (status, digest, stale, counts)
- **FR-004**: `POST /v1/warm` preloads embed + rerank ONNX in process memory
- **FR-005**: `GET /health` unauthenticated liveness probe
- **FR-006**: `POST /v1/chat` returns grounded extractive answers by default; optional Xenova generative when `GENERATOR_SYNTHESIZE=true`

## Out of scope

- User registration, OAuth, or session management
- Chat UI (consumer owns `/chat` and session gate)
- Rate limiting per end-user (consumer responsibility)
