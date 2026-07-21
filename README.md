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
  (release tag `contracts/knowledge-index/v1.0.0`)
- Specs: `001-posts-vector-index`, `002-archive-embed-backfill`

## What it does not own

- Essay MDX / `data/unfolding-*` authorship (corpus producer, e.g. `agentic-foundation`)
- Registered users, authentication, or session policy
- Chat UI, answer composition, or `POST /api/knowledge/retrieve` (read consumer)
- Online retrieve may remain in the consumer app for latency; this platform remains the
  **sole writer** to the shared Upstash index

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

## Quick start

```powershell
cd C:\my_projects\knowledge-index-platform
Copy-Item .env.example .env   # set UPSTASH_VECTOR_* and CORPUS_ROOT
npm install
npm test
npm run validate
npm run embed:backfill -- --dry-run
```

Point `CORPUS_ROOT` at the producer checkout that holds `content/` and `data/`.

Airflow (Feature 002):

```powershell
cd airflow
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
