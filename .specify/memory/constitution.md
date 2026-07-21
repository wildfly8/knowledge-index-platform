<!-- Sync Impact Report
- Version: 1.0.0 → 1.1.0 (MINOR: Federated Public Contracts + cleanup)
- Added Principle III (public contracts); renumbered IV–VIII
- Removed stale domain-compiler substitution table; aligned gates with validate.ps1
- Updated: README, contracts/, specs/dependencies.yaml, internal contract redirects
- Removed: .specify/domain/* monorepo artifacts (no domain compiler in this repo)
-->

# Knowledge Index Platform Constitution

This repository is a **standalone knowledge-index microservice**: it owns
embedding, vector-index write paths, deploy sync, and budgeted archive
backfill into Upstash Vector. It serves corpus producers and read consumers
(first pair: `agentic-foundation` as both) and owns **no** end-user UI, auth
product, or site content authorship. Answer composition runs on Feature **003**.

## Core Principles

### I. Spec-First Delivery
Every feature begins with a written specification in `specs/` before
implementation. CLIs, Airflow DAGs, and library modules must trace to
functional requirements, invariants (`INV-EMBED-*`, `INV-BACKFILL-*`), and user
stories. `spec.md` is the domain theory. Multi-step flows document
`## Saga and state machines` (**SAGA-EMBED-001**, **SAGA-BACKFILL-001**).

### II. Single-Writer Index Split (NON-NEGOTIABLE)
Exactly one writer owns each control plane and each file-scope class:

| Writer | Control vector | File scope |
|--------|----------------|------------|
| Deploy sync (Feature 001) | `__manifest__` | examined + unfolding non-archives |
| Archive backfill (Feature 002) | `__backfill_manifest__` | ChatGPT/Gemini year archives only |

Writers MUST NOT touch each other's control records or file scopes
(INV-BACKFILL-003). Producer apps and read consumers MUST NOT upsert into the
shared index.

### III. Federated Public Contracts
`contracts/public/` is the **only** normative surface published to external
applications. Public contract packages MUST be independently consumable, carry
a semantic `VERSION` and changelog, and separate API, data, and capability
guarantees from internal `specs/` design artifacts. Consumers MUST pin a
released contract version and MUST NOT import `specs/`, `lib/`, `scripts/`, or
`airflow/` as normative inputs.

Contract compatibility follows semantic versioning. Releases use repository
tags `contracts/<name>/v<version>` until a registry exists. Observable behavior
changes MUST update the public contract, changelog, and version in the same
change.

### IV. Corpus Ownership Stays with Producers
MDX stubs and `data/unfolding-*` bodies remain producer-owned. This platform
reads corpus via `CORPUS_ROOT` (legacy alias `AGENTIC_FOUNDATION_REPO`);
it never authors product essays. Vector ids and chunk metadata are the
platform's normative index contract; prose content is not.

### V. Budget Fail-Closed
Archive backfill MUST refuse to run when `EMBED_BACKFILL_WRITE_BUDGET` is not
strictly less than `UPSTASH_DAILY_WRITE_CAP`. Quota exhaustion MUST leave the
cursor at the last committed micro-batch; retries resume without duplicates
(idempotent vector ids). Stuck transient saga states (`batch_running` /
`batch_committed`) recover via BF06-equivalent retry — never refuse forever.

### VI. Query and Answer Path Owned Here (amended 2026-07-20)
Feature **003** serves retrieve, rerank, and extractive/generative answer
composition over HTTP (`npm run serve`, `POST /v1/chat`). Read consumers call
the API with a bearer secret; they keep user auth, chat UI, and rate limits.
This platform remains the sole index **writer** (Features 001–002).

### VII. Privacy at Index Boundary
Chunk payloads MUST NOT include auth material, raw user/session ids, or
secrets. Read consumers remain responsible for not logging prompts or chunk
text into telemetry.

### VIII. Simplicity (YAGNI)
Stock Upstash Vector + Xenova ONNX models. No custom vector DB. Prefer CLI +
Airflow over a permanent always-on service until traffic requires it.

## Technology Constraints

- **Runtime**: Node 20+, TypeScript (`tsx`), `@upstash/vector`, Xenova /
  Transformers.js ONNX
- **Orchestration**: Apache Airflow (Docker Compose standalone) for Feature
  002 daily budget drain at 01:00 UTC
- **Index**: Upstash Vector free tier; daily write cap enforced in code
- **Secrets**: `.env` gitignored; never commit Upstash tokens

## Ownership Boundary (Cross-Project)

| Concern | Owner |
|---------|-------|
| Deploy sync, `__manifest__`, chunk embed upsert (non-archives) | **This project** |
| Archive backfill, `__backfill_manifest__`, Airflow DAG, write budget | **This project** |
| Public index contract (`contracts/public/knowledge-index`) | **This project** |
| Essay/MDX content + `data/` archives | Producer (`agentic-foundation`) |
| Chat UI | Read consumer (producer app) |
| Extractive/generative answers | **This project** (Feature 003 `/v1/chat`) |
| Query HTTP (retrieve / status / warm) | **This project** (Feature 003) |
| Auth gate for product APIs | Read consumer |
| Chat SLOs / OTel product metrics | Read consumer / OTel platform |

## Features

| ID | Name | Notes |
|----|------|-------|
| 001 | Posts vector index (deploy sync) | Public contract deploy-sync writer |
| 002 | Budgeted archive embedding backfill | Public contract archive-backfill writer |
| 003 | Knowledge query API | HTTP retrieve + rerank (`npm run serve`) |

## Quality Gates

This repository has **no** formal `domain:*` compiler. Spec-stage proofs are
editorial review of `spec.md` plus the gates below.

| Stage | Gate | Command |
|-------|------|---------|
| Public contract | Structure + version consistency | `npm run validate` |
| Unit | Saga, budget, manifest, scan, paths tests | `npm test` |
| Sync dry | Deploy sync plan against configured corpus | `npm run embed:sync -- --dry-run` |
| Backfill | Budget validate + dry-run plan | `npm run embed:backfill -- --dry-run` |
| Backfill verify | Manifest vs live vectors (read-only) | `npm run embed:backfill -- --verify` |
| Query API | Retrieve smoke | `npm run serve` + quickstart § Smoke test |
| Airflow | DAG parses; compose up healthy | `docker compose` in `airflow/` |

## Artifact Precedence

| Order | Artifact | Owns |
|-------|----------|------|
| 1 | `constitution.md` | Governance, ownership, gates |
| 2 | `contracts/public/knowledge-index/` | **Published** API, data, capability |
| 3 | `specs/NNN-*/spec.md` | Internal domain theory, INV-*, sagas |
| 4 | `specs/NNN-*/plan.md`, `research.md`, `contracts/` (redirects) | Internal design |
| 5 | `lib/`, `scripts/`, `airflow/` | Implementation |

## Governance

Amendments require semver bump + Sync Impact Report. Changing the
single-writer split (Principle II), public contract surfaces (Principle III),
or corpus ownership (Principle IV) is MAJOR.

**Version**: 1.1.0 | **Ratified**: 2026-07-20 | **Last Amended**: 2026-07-20
