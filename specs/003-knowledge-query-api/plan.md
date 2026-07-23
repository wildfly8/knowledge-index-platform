# Plan: Knowledge Query API (Feature 003)

**Feature**: 003-knowledge-query-api | **Date**: 2026-07-20

## Goal

Serve two-stage semantic retrieval (bi-encoder ANN + cross-encoder rerank) and
index status over HTTP so read consumers (e.g. `agentic-foundation`) keep user
auth and chat composition while Xenova + Upstash run in this service.

## Design

| Layer | Module | Notes |
|-------|--------|-------|
| HTTP | `server/index.ts`, `lib/server/router.ts`, `lib/server/transport-security.ts` | `GET /health`, `POST /v1/retrieve`, Cloud Run `PORT` bind, HTTPS redirect + HSTS |
| Auth | `lib/server/auth.ts` | Bearer `KNOWLEDGE_RETRIEVE_API_SECRET` |
| Retrieve | `lib/knowledge/retrieve-core.ts` | Manifest read, embed, ANN, rerank |
| Expansion | `lib/knowledge/retrieve-query.ts` | Casual query expansion, score floors |
| Rerank | `lib/knowledge/rerank*.ts` | Cross-encoder via Xenova |

Public contract: `contracts/public/knowledge-index@3.0.0` — Query HTTP section in
`api-contract.md`; consumer pins same version.

## Consumer integration

- `KNOWLEDGE_INDEX_PLATFORM_URL` + matching bearer secret on the app.
- App routes `/api/knowledge/retrieve`, `/status`, `/warm` proxy with session auth + rate limits.

## Verification

- `npm test` (unit + optional `KNOWLEDGE_INTEGRATION=1`)
- `npm run validate` (public contract)
- `specs/003-knowledge-query-api/quickstart.md` smoke against `npm run serve`
