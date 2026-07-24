# Quickstart: Chat Persistence & LLM (Feature 006)

**Feature**: 006-chat-persistence-llm

Prerequisites: Upstash index (001/002); **Neon** database; Gemini API key for LLM spike.

## 1. Neon database (recommended — same provider as agentic-foundation)

1. Sign in at [neon.tech](https://neon.tech) (same account as `agentic-foundation` is fine).
2. Create a **new project** or database for `knowledge-index-platform` (do **not** reuse auth tables).
3. Copy the **pooled** connection string (`POSTGRES_URL`):

```powershell
# .env
POSTGRES_URL=postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/knowledge?sslmode=require
LLM_PROVIDER=gemini
GEMINI_API_KEY=your-key
KNOWLEDGE_RETRIEVE_API_SECRET=your-32-char-secret
```

Sibling reference: `agentic-foundation` uses the same `POSTGRES_URL` variable name
and `@neondatabase/serverless`; see `npm run db:env` there for Vercel-pulled URLs.

```powershell
npm run db:migrate
npm run serve
```

## 2. Local Postgres (offline only)

```powershell
docker run --name knowledge-pg -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=knowledge -p 5432:5432 -d postgres:16
$env:POSTGRES_URL = "postgresql://postgres:dev@127.0.0.1:5432/knowledge"
npm run db:migrate
npm run serve
```

## 3. Chat smoke (local or Cloud Run)

```powershell
$base = "http://127.0.0.1:3921"   # or terraform output cloud_run_uri
$secret = $env:KNOWLEDGE_RETRIEVE_API_SECRET
$headers = @{ Authorization = "Bearer $secret"; "Content-Type" = "application/json" }

$body = @{ query = "what is catamorphism"; title = "Catamorphism chat" } | ConvertTo-Json
$r1 = Invoke-RestMethod -Uri "$base/v1/chat" -Method POST -Headers $headers -Body $body
$r1.conversation_id

$body2 = @{ query = "how does that relate to anamorphism"; conversation_id = $r1.conversation_id } | ConvertTo-Json
Invoke-RestMethod -Uri "$base/v1/chat" -Method POST -Headers $headers -Body $body2

Invoke-RestMethod -Uri "$base/v1/conversations/$($r1.conversation_id)/messages" -Headers @{ Authorization = "Bearer $secret" }
```

## 4. Cloud Run (extends Feature 005)

```powershell
# infra/gcp/terraform.tfvars (gitignored)
enable_chat_persistence = true
postgres_url              = "postgresql://...@...-pooler....neon.tech/knowledge?sslmode=require"
gemini_api_key            = "..."

.\scripts\cloud-run\provision.ps1 -Phase runtime
npm run db:migrate          # once per Neon database
npm run test:e2e:cloud
```

Cloud Run stays **single-container**; Neon is external managed Postgres.

## 5. LLM spike

```powershell
.\scripts\spike\llm-decoder.ps1
```

## Troubleshooting

| Symptom | Check |
|---------|--------|
| 503 persistence | `POSTGRES_URL`, Neon project active, migrations applied |
| SSL errors | `sslmode=require` on Neon URL |
| LLM fallback | `LLM_PROVIDER`, `GEMINI_API_KEY` |
| Wrong database | Dedicated Neon DB — not agentic-foundation auth DB |
