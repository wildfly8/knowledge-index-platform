# Tasks: Posts Semantic Vector Index (001)

**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

**Scope**: Write-only deploy sync into Upstash. Corpus files live in the
**producer** checkout at `CORPUS_ROOT` — not in this repo.

**Gates**: `npm test`, `npm run validate`, `npm run embed:sync -- --dry-run`

## Completed (this repo)

- [x] T001 `lib/knowledge/` — paths, corpus resolver, manifest, embed, vector client, payload, embed-saga
- [x] T002 `scripts/embed-posts/sync.ts` — scan producer corpus, EM01–EM09, `--dry-run`
- [x] T003 `lib/knowledge/embed-saga.test.ts`, `paths.test.ts`, `manifest.test.ts`, `sync.integration.test.ts`
- [x] T004 Public contract deploy-sync writer — `contracts/public/knowledge-index/` @ 3.0.0
- [x] T005 Internal redirect — `contracts/embedding-pipeline.md` → public package
- [x] T006 `.env.example` — `CORPUS_ROOT`, Upstash, embed env

## Out of scope (producer / read consumer repos)

- End-user auth, registered users, chat UI
- Producer deploy hook wiring (documented in [quickstart.md](./quickstart.md) § Producer hook)

## Optional follow-ups

- [ ] T010 Operator dry-run against a real `CORPUS_ROOT` producer checkout
- [x] T011 Document producer-side hook to invoke `npm run embed:sync` after deploy
