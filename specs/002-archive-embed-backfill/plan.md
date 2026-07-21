# Implementation Plan: Archive Embedding Backfill

**Branch**: `002-archive-embed-backfill` | **Spec**: [spec.md](./spec.md)

Airflow DAG + CLI (`npm run embed:backfill`) embeds conversation **year archives**
under daily write budget. Control vector `__backfill_manifest__`.
Public contract: [`contracts/public/knowledge-index`](../../contracts/public/knowledge-index/README.md).

## Constitution Check

- [x] `npm test` passed
- [x] `npm run validate` passed
- [x] Budget fail-closed (Principle V)
- [x] Disjoint from Feature 001 deploy sync (Principle II)

## Domain Alignment

| Entity | Implementation | Contract |
|--------|----------------|----------|
| Embedding Backfill Plan | `lib/knowledge/backfill-manifest.ts` | public data-contract |
| Backfill Batch Run | `scripts/embed-posts/backfill.ts`, `backfill-saga.ts` | public api-contract |
| Write Budget | `lib/knowledge/backfill-budget.ts` | public api-contract |

## Structure

```text
lib/knowledge/backfill-*.ts
scripts/embed-posts/backfill.ts
airflow/dags/embed_archive_backfill.py
specs/002-archive-embed-backfill/contracts/   # redirects only
```

## Corpus path scope (verified)

Backfill sources **only**:

- `content/posts/unfolding/chatgpt-20xx.mdx` → `data/unfolding-chatgpt/chatgpt-20xx.mdx`
- `content/posts/unfolding/gemini-20xx.mdx` → `data/unfolding-gemini/gemini-20xx.mdx`

Excludes index stubs (`chatgpt.mdx`) and ISR parts (`chatgpt-2025-p1.mdx`).

Saga **SAGA-BACKFILL-001** tested in `lib/knowledge/backfill-saga.test.ts`.
