# Data model: Conversation persistence (Feature 006)

## PostgreSQL tables

### `conversations`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | Server-generated (`gen_random_uuid()`) |
| `title` | `text` nullable | Optional label from first message |
| `created_at` | `timestamptz` | Default `now()` |
| `updated_at` | `timestamptz` | Bumped on each new message |

Indexes: `created_at DESC` for operator listing (future).

### `conversation_messages`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | Returned as `message_id` |
| `conversation_id` | `uuid` FK → `conversations.id` ON DELETE CASCADE |
| `role` | `text` | `user` \| `assistant` \| `system` (system reserved) |
| `content` | `text` | Message body (assistant = final answer text) |
| `retrieval_meta` | `jsonb` nullable | Slugs, `index_status`, `rerank` flags — no raw vectors |
| `llm_meta` | `jsonb` nullable | `provider`, `model`, `fallback`, token usage if available |
| `created_at` | `timestamptz` | Default `now()` |

Indexes: `(conversation_id, created_at ASC)` for history load.

## API identifiers

| Field | Source |
|-------|--------|
| `conversation_id` | `conversations.id` |
| `message_id` | `conversation_messages.id` (assistant row) |

## Connection (application)

| Env | Source |
|-----|--------|
| `POSTGRES_URL` | Neon console pooled URL (production: Secret Manager) |
| `DATABASE_URL` | Accepted alias for local/scripts |

Migrations use pooled or non-pooling URL per Neon docs; prefer non-pooling for DDL if needed.

## Retention

Neon free tier; dev branches can be reset. Production policy TBD.

## Privacy

- Do **not** store bearer tokens, provider API keys, or raw embedding arrays.
- Optional `external_user_id` column deferred (consumer-owned identity).
- Database hosted on **Neon** (dedicated project/DB — INV-CHAT-006).
