# Research: Chat persistence & external LLM (Feature 006)

## PostgreSQL hosting (chosen: Neon)

| Option | Free tier | Fit |
|--------|-----------|-----|
| **Neon** | ~0.5 GB, serverless, branches | **Chosen** — already used by `agentic-foundation` (`POSTGRES_URL`, `@neondatabase/serverless`) |
| Supabase | 500 MB | Viable alternative; no sibling alignment |
| Cloud SQL | Limited free trial | GCP-native but paid; not free-tier spike |
| Cloud Run postgres sidecar | N/A | **Rejected** — no durable storage, wrong operational model |

**Choice**: **Neon serverless Postgres**

- Operator creates a **dedicated database** (or Neon project) for `knowledge-index-platform` conversation tables.
- Reuse the **same provider and env conventions** as sibling `agentic-foundation`:
  - `POSTGRES_URL` — pooled connection ( `-pooler` host on Neon)
  - `POSTGRES_URL_NON_POOLING` — optional for migrations
- Driver: `@neondatabase/serverless` (works from Cloud Run serverless containers over TLS).
- Cloud Run: connection string in **Secret Manager**; single query-api container (005).

**Not chosen**: Sharing the sibling app's Neon **database** — auth/rate-limit tables
stay in agentic-foundation; platform conversations are INV-CHAT-006 separate.

## Local development

| Mode | When |
|------|------|
| Neon **dev branch** | Default — matches production driver and TLS |
| Docker `postgres:16` | Offline only; set `POSTGRES_URL` to localhost |

## LLM providers (spike)

| Provider | Free / low-cost tier | SDK |
|----------|----------------------|-----|
| **Google Gemini** | Gemini Flash free quota | `@google/generative-ai` or REST |
| **OpenAI** | gpt-4o-mini | `openai` npm |
| **Anthropic** | Haiku | `@anthropic-ai/sdk` |

**Spike default**: `LLM_PROVIDER=gemini` with `GEMINI_API_KEY` in Secret Manager.

## Terraform / provision

Extend Feature **005** `infra/gcp/`:

- `enable_chat_persistence` (bool)
- Secrets: `postgres-url`, `gemini-api-key`
- Env on existing `google_cloud_run_v2_service.query_api` — no new containers

`provision.ps1` seeds `postgres_url` from `.env` `POSTGRES_URL` like Upstash vars.

## Alternatives rejected

- **Postgres Cloud Run sidecar** — ephemeral, singleton scaling, not managed SQL.
- **Store history in Upstash** — wrong data model.
- **Shared Neon DB with auth tables** — coupling and schema ownership conflict.
