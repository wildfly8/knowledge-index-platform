# Cloud Run chat persistence contract (Feature 006)

Internal operator contract — extends [Feature 005](../../../005-cloud-run-query-api/contracts/cloud-run-deployment.md).

## Topology

**Single-container** Cloud Run revision (Feature **005** query-api image). Conversation
history lives in **Neon Postgres** (managed, serverless) — same provider pattern as
sibling [`agentic-foundation`](../../../agentic-foundation) (`POSTGRES_URL` via Vercel/Neon).

```text
Internet → Cloud Run (HTTPS) → query-api:8080
                                    │
                                    ├── Upstash Vector (retrieve)
                                    └── Neon Postgres (TLS, pooled POSTGRES_URL)
```

No database container on Cloud Run.

## Neon (chosen)

| Aspect | Choice |
|--------|--------|
| Provider | [Neon](https://neon.tech) free tier (same as agentic-foundation) |
| Driver | `@neondatabase/serverless` (HTTP/WebSocket pooler-friendly) |
| Env | `POSTGRES_URL` (pooled); optional `POSTGRES_URL_NON_POOLING` for migrations |
| Database | **Dedicated** Neon database/project for platform conversation tables (not shared with agentic-foundation auth tables) |
| Local dev | Neon **dev branch** (recommended) or Docker Postgres for offline work |

Sibling reference: `agentic-foundation` uses `POSTGRES_URL` + Drizzle migrations;
this repo uses SQL migrations in `db/migrations/` against the same connection style.

## Secrets (Secret Manager)

When `enable_chat_persistence = true` on runtime apply:

| Secret | Maps to env |
|--------|-------------|
| `postgres-url` | `POSTGRES_URL` |
| `gemini-api-key` | `GEMINI_API_KEY` (optional OpenAI/Anthropic keys) |

Values sourced from operator `.env` / Neon console — never copied from otel or
agentic-foundation tfvars (only the **provider pattern** is shared).

## Terraform extension (`infra/gcp/`)

| Change | Notes |
|--------|-------|
| `enable_chat_persistence` | bool; adds chat secrets + env to existing `query_api` service |
| No second container | 005 single-container revision unchanged structurally |
| Variables | `postgres_url`, `gemini_api_key`, `llm_provider` |

Migrations: run `npm run db:migrate` once per environment (CI, local, or startup
hook against Neon — not on every cold start if revision unchanged).

## Provision

```powershell
# 1. Create Neon database (or branch) — see quickstart.md
# 2. Set in infra/gcp/terraform.tfvars:
enable_chat_persistence = true
postgres_url            = "postgresql://...@...-pooler....neon.tech/..."
gemini_api_key          = "..."

.\scripts\cloud-run\provision.ps1 -Phase runtime
npm run test:e2e:cloud
```

## E2E cloud (006 extension)

1. Existing 005 checks (`/health`, `/v1/status`, `/v1/retrieve`)
2. `POST /v1/chat` with `title` → 200, `conversation_id` present
3. Second `POST /v1/chat` with same `conversation_id` → 200
4. `GET /v1/conversations/:id/messages` → ≥2 messages
