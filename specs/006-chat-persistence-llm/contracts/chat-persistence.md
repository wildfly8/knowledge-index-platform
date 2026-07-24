# Chat persistence contract (Feature 006)

Internal operator contract — normative HTTP shapes published in
`contracts/public/knowledge-index/api-contract.md` @ **4.0.0**.

## Extended `POST /v1/chat`

**Request** (additions in bold)

```json
{
  "query": "what is catamorphism",
  "conversation_id": "uuid-optional",
  "title": "optional-new-thread-label",
  "top_k": 5,
  "rerank": true,
  "synthesize": true,
  "use_external_llm": true
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `conversation_id` | No | Omit for stateless 003 behavior |
| `title` | No | Used when creating a new conversation |
| `use_external_llm` | No | Default `true` when `LLM_PROVIDER` configured; `false` forces extractive |

**Response** (additions)

```json
{
  "conversation_id": "uuid-or-null",
  "message_id": "uuid-or-null",
  "answer": "...",
  "chunks": [],
  "meta": {
    "llm_provider": "gemini",
    "llm_model": "gemini-2.0-flash",
    "llm_fallback": false
  }
}
```

## `GET /v1/conversations/:id/messages`

Bearer required. Query: `limit` (default 50), `before` (cursor, optional).

**Response `200`**

```json
{
  "conversation_id": "uuid",
  "messages": [
    { "id": "uuid", "role": "user", "content": "...", "created_at": "ISO8601" },
    { "id": "uuid", "role": "assistant", "content": "...", "created_at": "ISO8601" }
  ]
}
```

## Status codes

| Status | Condition |
|--------|-----------|
| 404 | Unknown `conversation_id` |
| 503 | Index unavailable (unchanged) or persistence disabled/unreachable when `conversation_id` used |
