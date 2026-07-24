# Feature Specification: Chat Persistence & External LLM

**Feature Branch**: `006-chat-persistence-llm`

**Created**: 2026-07-24

**Status**: Approved

**Input**: Add PostgreSQL persistence for conversation history and spike-test a
free-tier external LLM decoder for generation after Feature **003** retrieval.
**Containerize** the query API on **Cloud Run** (Feature **005**) and persist
history in **Neon Postgres** (same managed provider as sibling
`agentic-foundation`). Flow: `POST /chat` → retrieve (vector DB) → load history
(Neon) → call LLM (OpenAI / Anthropic / Gemini).

## Summary

- **What this feature delivers**: A **conversation-aware** chat path on the query
  API — persist multi-turn history in **Neon PostgreSQL**, run the existing Feature
  **003** retrieval pipeline (Upstash Vector), then compose answers with an
  **external LLM** (spike: at least one free-tier provider). **Production hosting**:
  single-container Cloud Run (005) with `POSTGRES_URL` and LLM keys in Secret Manager;
  database is **Neon serverless Postgres** (free tier), not a Cloud Run sidecar.
  Stateless `POST /v1/chat` (no `conversation_id`) remains supported for backward
  compatibility.
- **Surface type**: HTTP API extension + Neon schema + LLM provider adapter (spike)
  + **Cloud Run secret/IaC extension** (005).
- **Who it affects**: Read consumers (e.g. `agentic-foundation`) call one Cloud Run
  URL for RAG + memory + LLM; operators create a **dedicated Neon database** (same
  account/provider pattern as the sibling app) and deploy via `provision.ps1`.
- **Public contract**: [`contracts/public/knowledge-index`](../../contracts/public/knowledge-index/README.md)
  — **semver bump to 4.0.0** (new conversation fields, LLM metadata, optional routes).
- **Works with**: Feature **003** retrieve/rerank; Feature **005** Cloud Run;
  **Neon** (aligned with `agentic-foundation` `POSTGRES_URL` convention).
- **Must not break**: INV-RETRIEVE-001–004; bearer auth on `/v1/*`; single-writer
  index split; stateless `/v1/chat` when `conversation_id` is omitted; 005 deploy
  when `enable_chat_persistence = false`.

## Domain Mapping

**Primary bounded context**: Knowledge (conversational query)

| Entity | Role in this feature | Owner context |
|--------|----------------------|---------------|
| Conversation | aggregate root (thread metadata) | Knowledge |
| Conversation Message | created (user + assistant turns) | Knowledge |
| Semantic Vector Index | referenced (read via 003 retrieve) | Knowledge |
| Embedding Chunk | referenced (RAG context) | Knowledge |
| External LLM Completion | created (ephemeral; provider response) | Knowledge |
| RAG Chat Turn | orchestration (retrieve → history → LLM → persist) | Knowledge |

**Cross-feature dependencies**:

| Feature / external | Relationship | Contract |
|--------------------|--------------|----------|
| 003 | extends `/v1/chat`; reuses `retrieveKnowledge` + chunk types | public api contract |
| 005 | extends Cloud Run secrets/env (`enable_chat_persistence`) | [cloud-run-chat-persistence](./contracts/cloud-run-chat-stack.md) |
| agentic-foundation | same **Neon provider** pattern (`POSTGRES_URL`); separate DB | sibling reference only |
| otel-collector-platform | shared GCP `project_id` / `region` (sibling tfvars) | internal |
| Upstash Vector | read-only retrieval | public data contract |
| Neon PostgreSQL | managed persistence (free tier) | internal data-model |
| OpenAI / Anthropic / Google Gemini | external LLM APIs (spike) | provider HTTP APIs |

**Invariants**:

- **INV-CHAT-001**: Conversation persistence MUST NOT write to Upstash Vector
  (index remains Features 001–002 only).
- **INV-CHAT-002**: Persisted messages MUST NOT store raw embedding vectors or
  provider API keys.
- **INV-CHAT-003**: When external LLM is unavailable or disabled, the API MUST
  fall back to Feature **003** extractive answer (same as today) and still persist
  the turn when `conversation_id` is present.
- **INV-CHAT-004**: Production MUST require bearer auth on all `/v1/*` routes
  (unchanged from 003).
- **INV-CHAT-005**: Chunk text returned to clients MUST continue to obey
  INV-RETRIEVE-003 (no raw vectors); conversation rows MAY store assistant text
  and citation slugs only.
- **INV-CHAT-006**: Conversation tables MUST live in a **dedicated** Neon database
  (or project) for this platform — MUST NOT share tables with agentic-foundation auth.
- **INV-CHAT-007**: `POSTGRES_URL` MUST live in Secret Manager on Cloud Run;
  MUST NOT be committed in images or git.

## Saga and state machines

### SAGA-CHAT-001 — Conversational RAG turn

| ID | From | Event | To | Side effects |
|----|------|-------|-----|--------------|
| CH01 | `ready` | `chat_request` | `retrieving` | Feature 003 retrieve (ANN + optional rerank) |
| CH02 | `retrieving` | `index_unavailable` | `ready` | 503; no message persisted |
| CH03 | `retrieving` | `chunks_ready` | `loading_history` | Load prior messages from Neon |
| CH04 | `loading_history` | `history_ready` | `generating` | Build prompt (history + chunks); call LLM adapter |
| CH05 | `generating` | `llm_ok` | `persisting` | Append user + assistant messages |
| CH06 | `generating` | `llm_failed` | `persisting` | Extractive fallback answer; mark `meta.llm_fallback` |
| CH07 | `persisting` | `persist_ok` | `ready` | 200 response with `conversation_id`, `message_id`, answer |
| CH08 | `persisting` | `persist_failed` | `ready` | 500; retrieval succeeded but history not saved |

Stateless path (no `conversation_id`, no persist): CH01 → CH02|CH03 → CH04 → CH05|CH06 → 200 (skip CH07).

### SAGA-DEPLOY-002 — Chat persistence on Cloud Run

| ID | From | Event | To | Side effects |
|----|------|-------|-----|--------------|
| CP01 | `serving` (005) | `chat_persistence_enable` | `configuring` | Secret Manager: `POSTGRES_URL`, LLM keys |
| CP02 | `configuring` | `migrate_applied` | `chat_serving` | `db:migrate` against Neon |
| CP03 | `chat_serving` | `e2e_chat_pass` | `verified` | Cloud E2E two-turn conversation |

## User stories

### US1 — Consumer sends a message in an existing conversation (P1)

As a read consumer, I `POST /v1/chat` with `conversation_id` and `query` so the
platform retrieves relevant chunks, loads prior turns from Neon, calls the
configured LLM, persists both sides of the turn, and returns a grounded answer.

**Acceptance**

1. Response includes `conversation_id`, new `message_id`, `answer`, `chunks`, `meta`.
2. A subsequent request with the same `conversation_id` includes prior turns in LLM context.
3. User and assistant rows exist in Neon for the turn.

### US2 — Consumer starts a new conversation (P1)

As a read consumer, I `POST /v1/chat` with `query` and optional `title` but no
`conversation_id` so the platform creates a conversation, runs the RAG+LLM pipeline,
and returns a new `conversation_id`.

### US3 — Consumer lists conversation history (P2)

As a read consumer, I `GET /v1/conversations/:id/messages` with bearer auth to
page through prior turns (newest last or configurable order documented in contract).

### US4 — Operator runs LLM provider spike (P1)

As an operator, I configure one free-tier provider (default spike: **Google Gemini**
Flash) via env, run a local or Cloud Run smoke, and compare answer quality vs
extractive-only baseline on 3 fixture queries.

### US5 — Backward-compatible stateless chat (P1)

As an existing consumer on contract 3.x, I omit `conversation_id` and receive the
same shape as today (retrieve + extractive/generative per 003 flags) with no
Neon writes.

### US6 — Operator wires Neon + deploys chat on Cloud Run (P1)

As an operator, I create a **Neon** database (free tier, same provider as
agentic-foundation), set `enable_chat_persistence = true` in Terraform, apply
runtime so Cloud Run receives `POSTGRES_URL` from Secret Manager, run migrations,
and pass cloud E2E for a two-turn conversation.

**Acceptance**

1. Neon pooled connection string in Secret Manager; Cloud Run revision stays single-container.
2. `npm run db:migrate` succeeds against Neon before or during deploy.
3. `npm run test:e2e:cloud` passes conversational smoke against `cloud_run_uri`.

## Functional requirements

- **FR-001**: `POST /v1/chat` accepts optional `conversation_id`, optional `title`
  (new thread), and existing retrieve fields (`query`, `top_k`, `rerank`, etc.).
- **FR-002**: When `conversation_id` is set or created, persist a **user** message
  and **assistant** message per successful turn (including LLM fallback path).
- **FR-003**: `GET /v1/conversations/:id/messages` returns paginated message history
  for bearer-authenticated callers.
- **FR-004**: PostgreSQL schema: `conversations` + `conversation_messages` (see
  [data-model.md](./data-model.md)); migrations via `npm run db:migrate`.
- **FR-005**: LLM adapter interface with spike implementations for at least **one**
  free-tier provider (Gemini recommended); optional OpenAI and Anthropic behind env
  `LLM_PROVIDER=gemini|openai|anthropic|off`.
- **FR-006**: Prompt composition: system instructions + retrieved chunk excerpts +
  bounded conversation history (token/window limit configurable) + user query.
- **FR-007**: Response `meta` includes `llm_provider`, `llm_model`, `llm_fallback`,
  `conversation_id`, `message_id`, and existing retrieval meta fields.
- **FR-008**: `POSTGRES_URL` (or `DATABASE_URL` alias) required when persistence
  enabled; graceful 503 when persistence requested but Neon unreachable.
- **FR-009**: Data access via `@neondatabase/serverless`; unit tests mock SQL layer;
  optional integration test against Neon dev branch or Testcontainers.
- **FR-010**: Spike script `scripts/spike/llm-decoder.ps1` runs 3 canned queries
  and prints provider latency + answer preview.
- **FR-011**: Extend `infra/gcp/` Terraform: `enable_chat_persistence`, Secret Manager
  for `postgres_url` and `gemini_api_key` (optional OpenAI/Anthropic keys) on the
  existing Cloud Run service — **no postgres sidecar**.
- **FR-012**: Extend `scripts/cloud-run/provision.ps1` to seed `postgres_url` from
  `.env` / operator input (same pattern as Upstash secrets).
- **FR-013**: Extend `scripts/e2e/cloud/` for conversational smoke after runtime apply.
- **FR-014**: Unit tests for deploy config (`lib/deploy/cloud-config.ts`) when
  `enable_chat_persistence` is true.
- **FR-015**: Document Neon setup in quickstart (dedicated DB; sibling parity with
  `agentic-foundation` `POSTGRES_URL` convention).

## Success criteria

- **SC-001**: Operator can run migrations and send two turns in one `conversation_id`;
  second turn's LLM prompt includes the first turn (verified by integration test or
  logged fixture).
- **SC-002**: With `LLM_PROVIDER=gemini` and valid API key, spike script completes
  3/3 queries with non-empty answers grounded in retrieved chunks.
- **SC-003**: With `LLM_PROVIDER=off` or provider error, API returns extractive
  fallback and still persists messages when `conversation_id` is used.
- **SC-004**: Stateless `POST /v1/chat` (no `conversation_id`) passes existing
  Feature 003 behavior tests without regression.
- **SC-005**: `npm test` and `npm run validate` pass; public contract @ **4.0.0**
  documents new fields and routes.
- **SC-006**: Cloud Run + Neon: extended cloud E2E passes two-turn chat against live URL.
- **SC-007**: `terraform validate` passes with `enable_chat_persistence` configuration.

## Assumptions

- Read consumers continue to enforce end-user auth; this API trusts bearer secret
  and opaque `conversation_id` (no per-user ACL in spike — document as follow-up).
- **Neon free tier** is sufficient for spike (0.5 GB, serverless scale-to-zero on DB
  side; Cloud Run API still scale-to-zero independently).
- Operator may reuse the **same Neon account** as agentic-foundation but creates a
  **separate database** for platform conversation tables.
- Gemini Flash free tier is the primary LLM spike target.
- Message retention: no TTL in spike; Neon branch reset acceptable for dev.

## Out of scope

- End-user authentication, OAuth, or per-user conversation ACLs
- Chat UI (remains read consumer)
- Writing to Upstash Vector from chat path
- OTel export to otel-collector-platform (separate feature)
- Multi-modal attachments or tool-calling agents
- Postgres sidecar or Cloud SQL on GCP (Neon is the chosen store)
- Sharing Neon tables with agentic-foundation auth/rate-limit schema
