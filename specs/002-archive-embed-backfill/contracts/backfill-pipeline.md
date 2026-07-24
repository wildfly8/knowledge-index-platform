# Backfill pipeline (internal redirect)

> **Not a published contract.** Normative surface:
> [`contracts/public/knowledge-index`](../../../contracts/public/knowledge-index/README.md)
> @ **`4.0.0`** — release tag `contracts/knowledge-index/v4.0.0`.

Archive backfill writer scope, budget rules, CLI, and Airflow scheduling for
Feature **002-archive-embed-backfill** are defined in the public package:

- [api-contract.md](../../../contracts/public/knowledge-index/api-contract.md) —
  `npm run embed:backfill`, budget fail-closed, Airflow DAG
- [data-contract.md](../../../contracts/public/knowledge-index/data-contract.md) —
  archive corpus paths (`chatgpt-20xx` / `gemini-20xx` stubs → `data/unfolding-*`)
- [capability.md](../../../contracts/public/knowledge-index/capability.md) —
  single-writer split vs deploy-sync

Internal implementation: `lib/knowledge/backfill-saga.ts`,
`scripts/embed-posts/backfill.ts`, `airflow/dags/embed_archive_backfill.py`.
Tests: `lib/knowledge/backfill-saga.test.ts`, `lib/knowledge/backfill-budget.test.ts`
(edges BF01–BF08).
