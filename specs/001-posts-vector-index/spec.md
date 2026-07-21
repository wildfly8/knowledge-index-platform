# Feature Specification: Posts Semantic Vector Index

**Feature Branch**: `001-posts-vector-index`

**Created**: 2026-07-12

**Status**: Approved

**Input**: Embed MD posts under `content/posts/examined/**` and
`content/posts/unfolding/**` (excluding `pre-examined` and conversation year
archives) into Upstash Vector via operator CLI.

## Summary

- **What this feature delivers**: A **semantic vector index** of the in-scope
  posts corpus, built on deploy or operator sync, stored in Upstash Vector.
  This platform is **write-only** — retrieval and auth live in read consumers.
- **Who it affects**: Operators (sync health, re-index); read consumers
  (stable chunk metadata per public contract).
- **Public contract**: [`contracts/public/knowledge-index`](../../contracts/public/knowledge-index/README.md)
  @ 1.0.0 — deploy-sync writer surface.
- **Works with**: Producer checkout at `CORPUS_ROOT` (`content/` + `data/`).
  Feature **002** owns conversation year archives (single-writer split).
- **Must not break**: Archive vectors owned by Feature 002; free-tier write caps.

*Spec changes are reviewed editorially and validated with `npm test` and
`npm run validate` (constitution Quality Gates).*

## Domain Mapping

**Primary bounded context**: Knowledge

| Entity | Role | Owner context |
|--------|------|---------------|
| Semantic Vector Index | aggregate root | Knowledge |
| Embedding Chunk | created | Knowledge |
| Embedding Sync Job | created | Knowledge |
| Essay | indexed (source corpus) | Content (producer) |

**Cross-feature dependencies**:

| Feature | Relationship | Contract / SSOT |
|---------|--------------|-----------------|
| 002 | single-writer sibling | public contract archive-backfill writer |
| Producer | corpus source | `CORPUS_ROOT` checkout |

**Invariants**:

- **INV-EMBED-001**: Sync includes in-scope posts (`examined`, `unfolding`
  non-archives); excludes `pre-examined` and conversation year archives
- **INV-EMBED-002**: Embeddings reflect current corpus digest — stale index
  detectable after content change
- **INV-EMBED-003**: Chunk payloads carry no auth material or user identity
- **INV-BACKFILL-003**: Deploy sync MUST NOT write conversation year archives
  while Feature 002 owns them

## Saga and state machines

### Process states

| State | Meaning |
|-------|---------|
| `no_index` | No successful sync has completed |
| `stale` | Corpus digest differs from manifest |
| `sync_pending` | Change detected; job not started |
| `sync_running` | Chunk → embed → upsert in progress |
| `index_current` | Manifest matches corpus digest |
| `sync_failed` | Last job failed; prior index may remain |

### SAGA-EMBED-001 — Post corpus embedding sync

| ID | From | Event | To | Side effects | Compensation |
|----|------|-------|-----|--------------|--------------|
| EM01 | `no_index` | `deploy_build_ok` | `sync_running` | Enqueue initial sync | — |
| EM02 | `index_current` | `posts_digest_changed` | `stale` | Mark manifest stale | — |
| EM03 | `stale` | `sync_start` | `sync_running` | Diff posts; chunk changed files | — |
| EM04 | `stale` | `schedule_sync` | `sync_pending` | Queue job | — |
| EM05 | `sync_pending` | `sync_start` | `sync_running` | Same as EM03 | — |
| EM06 | `sync_running` | `sync_complete` | `index_current` | Upsert vectors; write manifest | — |
| EM07 | `sync_running` | `sync_error` | `sync_failed` | Log failure stage | Operator `sync_retry` |
| EM08 | `sync_failed` | `sync_retry` | `sync_running` | Re-run from failed stage | — |
| EM09 | `index_current` | `posts_digest_unchanged` | `index_current` | Skip sync (idempotent) | — |

Executable contract: public package + internal redirect
[`contracts/embedding-pipeline.md`](./contracts/embedding-pipeline.md).

## User Scenarios & Testing

### User Story 1 - Operator indexes posts corpus (Priority: P1)

As an operator, I want `npm run embed:sync` to embed all in-scope files under
`content/posts/examined/**` and non-archive `content/posts/unfolding/**` so
read consumers can query the index.

**Independent Test**: After sync, `__manifest__` reports `index_current` with
chunk count ≥ in-scope MDX files.

**Acceptance Scenarios**:

1. **Given** a clean vector store, **When** sync completes, **Then** manifest
   lists all in-scope paths and excludes `pre-examined` and year archives.
2. **Given** companion `.md`/`.txt` files in scope, **When** sync runs, **Then**
   they are chunked and embedded.
3. **Given** unchanged corpus digest, **When** sync runs, **Then** EM09 skip
   avoids redundant full re-embed.

---

### User Story 2 - Index payloads carry no secrets (Priority: P1)

As an operator, I want chunk metadata to exclude auth and user identity so
the index is safe for shared read tokens.

**Independent Test**: Sample vector metadata contains only public contract fields.

**Acceptance Scenarios**:

1. **Given** synced chunks, **When** metadata is inspected, **Then** no
   session, user, or credential fields are present.
2. **Given** Upstash credentials in env, **When** inspected from consumer app
   client bundles, **Then** write tokens are not exposed (consumer responsibility
   for read-token scope).

---

### User Story 3 - Content change triggers re-sync (Priority: P1)

As an operator editing corpus in the producer checkout, I want the index to
become stale when in-scope posts change so the next sync refreshes embeddings.

**Independent Test**: Edit post MDX → digest changes → sync reaches
`index_current` with updated chunk text.

---

### User Story 4 - Stable chunk contract (Priority: P2)

As a read-consumer developer, I want stable chunk records per the public data
contract so retrieval apps assemble prompts without re-parsing MDX.

**Independent Test**: Vector metadata matches
[`data-contract.md`](../../contracts/public/knowledge-index/data-contract.md).

## Requirements

### Functional Requirements

- **FR-001**: Chunk and embed in-scope `content/posts/examined/**` and
  non-archive `content/posts/unfolding/**`.
- **FR-002**: Include `.md`/`.txt` under those prefixes when present.
- **FR-002a**: MUST NOT embed `content/posts/pre-examined/**`.
- **FR-003**: Compute corpus digest and persist in `__manifest__`.
- **FR-004**: Sync via `npm run embed:sync` (operator/CI).
- **FR-005**: Transition per **SAGA-EMBED-001**.
- **FR-006**: Purge vectors for removed essays and `pre-examined` paths on sync.
- **FR-007**: Vector DB write credentials server-side only.
- **FR-008**: Record sync job status for operator diagnostics.
- **FR-009**: MUST NOT index outside in-scope posts prefixes in v1.
- **FR-010**: MUST NOT touch `__backfill_manifest__` or archive year files
  (INV-BACKFILL-003).

## Success Criteria

- **SC-001**: 100% of in-scope MDX paths in manifest after sync; zero
  `pre-examined` paths.
- **SC-002**: Chunk metadata matches public data contract schema.
- **SC-003**: Editing a post and re-syncing updates chunk `content_hash` within
  one sync cycle.
- **SC-004**: `npm test` and `npm run validate` pass.

## Assumptions

- Corpus fits free-tier storage; `pre-examined` omitted intentionally.
- Xenova `all-MiniLM-L6-v2` for batch embed.
- Retrieval HTTP APIs and chat UI are read-consumer scope.

## Out of Scope

- User registration, sessions, or route auth.
- `POST /api/knowledge/retrieve` or rerank implementation.
- Chat UI or LLM answer synthesis.
- Conversation year archives (Feature 002).
- OCR; real-time sync without operator invoke.
