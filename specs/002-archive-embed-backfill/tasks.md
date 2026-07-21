# Tasks: Archive Embedding Backfill (002)

**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

**Scope**: Budgeted backfill of conversation **year archives** from the producer
checkout (`CORPUS_ROOT` → `content/posts/unfolding/*-20xx.mdx` stubs,
`data/unfolding-*` bodies). Not in this repo's tree.

**Gates**: `npm test`, `npm run validate`, `npm run embed:backfill -- --dry-run`

## Completed (this repo)

- [x] T001 `lib/knowledge/backfill-*.ts` — saga, budget, manifest, scan (BF01–BF08)
- [x] T002 `scripts/embed-posts/backfill.ts` — CLI with `--dry-run`, `--verify`, `--essay-path`
- [x] T003 `lib/knowledge/backfill-*.test.ts` — saga, budget, scan, manifest isolation
- [x] T004 `airflow/dags/embed_archive_backfill.py` + `docker-compose.yml` + `Dockerfile`
- [x] T005 Public contract archive-backfill writer — `contracts/public/knowledge-index/` @ 3.0.0
- [x] T006 Internal redirect — `contracts/backfill-pipeline.md` → public package
- [x] T007 `quickstart.md` — `CORPUS_ROOT` prerequisite, Airflow `npm ci` in `/opt/knowledge-index-platform`

## Out of scope

- Auth, chat UI, anonymous/registered retrieval tests (read consumer)
- Embedding `chatgpt.mdx` index stubs or `*-pN.mdx` ISR parts

## Optional follow-ups

- [ ] T010 Operator live drain after Upstash quota reset (SC-001)
- [ ] T011 Read-consumer smoke: archive phrase retrievable after batch (in producer app)
