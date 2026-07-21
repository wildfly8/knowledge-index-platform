# Tasks: Posts Semantic Vector Index (001)

**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

**Scope**: Write-only deploy sync into Upstash. Corpus files live in the
**producer** checkout at `CORPUS_ROOT` — not in this repo.

**Gates**: `npm test`, `npm run validate`, `npm run embed:sync -- --dry-run`

## Completed (this repo)

- [x] T001 `lib/knowledge/` — paths, corpus resolver, manifest, embed, vector client, payload, embed-saga
- [x] T002 `scripts/embed-posts/sync.ts` — scan producer `content/posts/{examined,unfolding}`, EM01–EM09
- [x] T003 `lib/knowledge/embed-saga.test.ts`, `paths.test.ts`, `manifest.test.ts`, `sync.integration.test.ts`
- [x] T004 Public contract deploy-sync writer — `contracts/public/knowledge-index/` @ 1.0.0
- [x] T005 Internal redirect — `contracts/embedding-pipeline.md` → public package
- [x] T006 `.env.example` — `CORPUS_ROOT`, Upstash, embed env

## Out of scope (read consumer / producer repos)

- Auth, registered users, `middleware.ts`, `app/api/knowledge/**`
- Retrieval, rerank HTTP APIs (`vector-retrieval` is a redirect only)
- Pagefind, Vercel `postbuild`, Features 003–004

## Optional follow-ups

- [ ] T010 Operator dry-run against a real `CORPUS_ROOT` producer checkout
- [ ] T011 Document producer-side hook to invoke `npm run embed:sync` after deploy
