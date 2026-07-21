# Knowledge Index Platform

Standalone Spec-Kit project for the **posts vector index** and **budgeted
archive embedding backfill**. It is the sole writer to a shared Upstash Vector
index; corpus producers supply `content/` + `data/` via `CORPUS_ROOT`.

Governance: [`.specify/memory/constitution.md`](.specify/memory/constitution.md)
(v1.1.0).

## What this repo owns

- Deploy-time / operator **embed sync** into Upstash Vector (`__manifest__`)
- **Archive backfill** CLI + Airflow DAG (`__backfill_manifest__`, daily write budget)
- Chunking, Xenova embed for batch jobs, vector id / payload scheme
- **Published contract**: [`contracts/public/knowledge-index`](contracts/public/knowledge-index/README.md)
  (release tag `contracts/knowledge-index/v3.0.0`)
- Specs: `001-posts-vector-index`, `002-archive-embed-backfill`, `003-knowledge-query-api`
- **Query HTTP API** (`npm run serve`): bi-encoder ANN + cross-encoder rerank + extractive/generative answers (`POST /v1/chat`)

## What it does not own

- Essay MDX / `data/unfolding-*` authorship (corpus producer, e.g. `agentic-foundation`)
- Chat UI (read consumer, e.g. `agentic-foundation`)
- Registered users, authentication, or session policy

## Security

Tracked files contain **no Upstash credentials** — only empty env var names in
`.env.example` and `airflow/.env.example`. Local `.env` and `airflow/.env` are
**gitignored** and must never be committed. `docker-compose.yml` references
`${UPSTASH_VECTOR_*}` from your shell or `airflow/.env` at runtime only.

Verified: `git grep` on `HEAD` finds no `upstash.io` URLs or token values in
tracked files. If a token is ever committed to a public remote, rotate it in the
Upstash console immediately.

## Corpus paths (producer checkout only)

**There is no `content/` or `data/` in this repository.** Operators set
`CORPUS_ROOT` to a separate checkout (e.g. `agentic-foundation`). All paths
below are read **from that producer tree** at CLI runtime:

| Scope | Producer-relative paths | Body resolution |
|-------|-------------------------|-----------------|
| Deploy sync | `content/posts/examined/**`, `content/posts/unfolding/**` (excludes year archives) | In-tree or `data/unfolding-activity/` for activity stubs |
| Archive backfill | `content/posts/unfolding/{chatgpt,gemini}-20xx.mdx` only | `data/unfolding-chatgpt/`, `data/unfolding-gemini/` |

Index stubs (`chatgpt.mdx`) and ISR part stubs (`chatgpt-2025-p1.mdx`) are **not**
backfill sources — they render slices of the year archive file.

## Repository layout

This is a **CLI + library** service (not a Next.js app). Implementation code:

```text
knowledge-index-platform/
├── lib/
│   ├── env/
│   │   └── load-env.ts              # .env loader for CLIs
│   └── knowledge/
│       ├── paths.ts                 # corpus path rules (CORPUS_ROOT-relative)
│       ├── corpus.ts                # list/read producer MDX + data/ resolution
│       ├── manifest.ts              # deploy-sync __manifest__
│       ├── embed-meta.ts            # bi-encoder defaults (Xenova/all-MiniLM-L6-v2)
│       ├── embed.ts                 # embed API (worker or in-process)
│       ├── embed-runtime.ts         # bi-encoder ONNX via @xenova/transformers
│       ├── xenova-env.ts            # models/transformers-cache layout
│       ├── inference-mode.ts        # fork worker vs in-process ONNX
│       ├── inference-bridge.ts      # IPC to knowledge-inference-worker
│       ├── embed-saga.ts              # SAGA-EMBED-001 (EM01–EM09)
│       ├── vector-client.ts         # @upstash/vector client
│       ├── vector-payload.ts        # chunk id + metadata schema
│       ├── backfill-saga.ts         # SAGA-BACKFILL-001 (BF01–BF08)
│       ├── backfill-budget.ts       # daily write budget (INV-BACKFILL-001)
│       ├── backfill-manifest.ts     # __backfill_manifest__
│       ├── backfill-scan.ts         # year-archive backlog diff
│       ├── retrieve-core.ts         # two-stage retrieve (Feature 003)
│       ├── retrieve-query.ts        # query expansion + filters
│       ├── rerank.ts                # cross-encoder rerank
│       ├── extractive.ts            # extractive answer composition
│       ├── generate.ts              # optional Xenova generative synthesis
│       ├── chat-core.ts             # retrieve + compose pipeline
│       └── *.test.ts                # unit + integration tests (npm test)
├── server/
│   └── index.ts                     # npm run serve — HTTP query API
├── lib/server/
│   ├── auth.ts                      # bearer secret for /v1/*
│   └── router.ts                    # /health, /v1/retrieve, /v1/status, /v1/warm
├── scripts/
│   ├── embed-posts/
│   │   ├── sync.ts                  # npm run embed:sync
│   │   ├── backfill.ts              # npm run embed:backfill
│   │   ├── chunk-mdx.ts             # MDX → text chunks
│   │   └── digest.ts
│   ├── prefetch-xenova-models.mjs   # npm run prefetch:xenova (cache ONNX)
│   ├── fix-xenova-sharp.mjs         # postinstall sharp fix for transformers
│   ├── check-public-contract.ps1
│   ├── validate.ps1
│   └── knowledge-inference-worker.ts  # optional forked ONNX process
├── models/
│   └── transformers-cache/          # gitignored vendored ONNX (optional)
├── airflow/
│   ├── dags/embed_archive_backfill.py
│   ├── docker-compose.yml
│   └── Dockerfile
├── contracts/public/knowledge-index/   # published contract (pin @3.0.0)
└── specs/                              # internal Spec-Kit (not normative for consumers)
```

**Not in this repo:** `app/`, `content/`, `data/`, or end-user auth/session policy.
**Feature 003** adds `server/` + `lib/server/` query HTTP and grounded `/v1/chat` answers.

## Quick start

```powershell
cd C:\my_projects\knowledge-index-platform
Copy-Item .env.example .env   # set UPSTASH_VECTOR_* and CORPUS_ROOT
npm install
npm test
npm run validate
npm run embed:sync -- --dry-run
npm run serve
# separate terminal: smoke test in specs/003-knowledge-query-api/quickstart.md
npm run embed:backfill -- --dry-run
```

Point `CORPUS_ROOT` at the producer checkout that holds `content/` and `data/`.

Airflow (Feature 002):

```powershell
cd airflow
Copy-Item .env.example .env   # set UPSTASH_VECTOR_* (gitignored)
docker compose up -d
# UI http://localhost:8080 — DAG embed_archive_backfill @ 01:00 UTC
```

## Repository boundaries

| Path | Role |
|------|------|
| `contracts/public/` | **Published** contracts for external consumers |
| `specs/` | Internal Spec-Kit features (not normative for consumers) |
| `lib/`, `scripts/` | Index platform implementation |
| `airflow/` | Scheduled backfill operator surface |

## Features

| ID | Spec folder | Role |
|----|-------------|------|
| 001 | `specs/001-posts-vector-index` | Deploy sync + index contract |
| 002 | `specs/002-archive-embed-backfill` | Budgeted backfill + Airflow |
| 003 | `specs/003-knowledge-query-api` | Query HTTP (`npm run serve`) |
