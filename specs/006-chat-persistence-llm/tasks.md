# Tasks: Chat Persistence & External LLM (Feature 006)

**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

**Gates**: `npm test`, `npm run validate`, `npm run test:iac`, `npm run test:e2e:cloud` (after deploy)

## Phase 1 — Schema & repository (Neon)

- [x] T001 `db/migrations/001_conversations.sql` — tables per [data-model.md](./data-model.md)
- [x] T002 `lib/chat/conversation-repo.ts` — Neon via `@neondatabase/serverless`
- [x] T003 `lib/chat/conversation-repo.test.ts` — mocked SQL / neon client
- [x] T004 `npm run db:migrate` — supports `POSTGRES_URL` and `DATABASE_URL` alias

## Phase 2 — LLM adapter spike

- [x] T005 `lib/chat/llm/types.ts` + `index.ts` — `LLM_PROVIDER` dispatch
- [x] T006 `lib/chat/llm/gemini.ts` — Gemini Flash completion
- [x] T007 `lib/chat/llm/gemini.test.ts` — mock HTTP
- [x] T008 `lib/chat/prompt.ts` — history + chunk prompt builder + tests
- [x] T009 `scripts/spike/llm-decoder.ps1` — 3 fixture queries

## Phase 3 — Conversational RAG orchestrator

- [x] T010 `lib/chat/conversational-rag.ts` — SAGA-CHAT-001
- [x] T011 `lib/chat/conversational-rag.test.ts` — LLM fallback paths
- [x] T012 Extend `lib/server/router.ts` — chat + list messages routes
- [x] T013 `.env.example` — `POSTGRES_URL`, `LLM_PROVIDER`, `GEMINI_API_KEY`, etc.

## Phase 4 — Cloud Run + Neon IaC (extends 005)

- [x] T014 `infra/gcp/variables.tf` — `enable_chat_persistence`, `postgres_url`, `gemini_api_key`
- [x] T015 `infra/gcp/main.tf` — Secret Manager + env on query-api (no sidecar)
- [x] T016 `infra/gcp/terraform.tfvars.example` — Neon + LLM fields
- [x] T017 Extend `scripts/cloud-run/provision.ps1` — seed `POSTGRES_URL` from `.env`
- [x] T018 Extend `lib/deploy/cloud-config.ts` + tests for chat persistence tfvars
- [x] T019 Update `contracts/cloud-run-chat-stack.md` ↔ Terraform

## Phase 5 — Public contract & cloud E2E

- [x] T020 `contracts/public/knowledge-index/` → **4.0.0** + CHANGELOG
- [x] T021 Extend `scripts/e2e/cloud/` — two-turn chat + list messages
- [x] T022 `quickstart.md` — Neon setup (dedicated DB; sibling `POSTGRES_URL` parity)
- [x] T023 Constitution quality gate

## Phase 6 — Optional

- [ ] T024 Neon dev-branch integration test or Testcontainers (CI optional)

## Dependencies

```text
T001 → T002 → T010 → T012
T005 → T006 → T010
T014 → T015 → T017 → T021
T012 → T020
```
