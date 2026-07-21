# Tasks: Knowledge Query API (003)

**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

**Scope**: HTTP retrieve, rerank, status, warm, and grounded chat answers over
the shared Upstash index written by Features 001–002. Service-to-service bearer
auth only — no end-user sessions in this repo.

**Gates**: `npm test`, `npm run validate`, `npm run serve` + [quickstart.md](./quickstart.md) smoke

## Completed (this repo)

- [x] T001 `lib/knowledge/retrieve*.ts` — manifest read, ANN, saga QR01–QR03
- [x] T002 `lib/knowledge/rerank*.ts` — cross-encoder rerank (same models as write path)
- [x] T003 `lib/knowledge/extractive.ts`, `generate.ts`, `chat-core.ts` — `/v1/chat` pipeline
- [x] T004 `server/index.ts`, `lib/server/router.ts`, `lib/server/auth.ts` — HTTP surface
- [x] T005 Unit + integration tests — `retrieve*.test.ts`, `rerank.test.ts`, `extractive.test.ts`, `generate.test.ts`
- [x] T006 Public contract query HTTP — `contracts/public/knowledge-index/` @ 3.0.0
- [x] T007 Internal redirect — `contracts/query-api.md` → public package
- [x] T008 `.env.example` — `KNOWLEDGE_RETRIEVE_API_SECRET`, `KNOWLEDGE_RERANK`, serve port

## Out of scope

- User registration, OAuth, session management
- Chat UI and per-user rate limits (read consumer)
- Index writes (Features 001–002 only)

## Optional follow-ups

- [ ] T010 Operator smoke against live Upstash index (`specs/003-knowledge-query-api/quickstart.md`)
- [ ] T011 Consumer proxy wiring in `agentic-foundation` (`KNOWLEDGE_INDEX_PLATFORM_URL`)
