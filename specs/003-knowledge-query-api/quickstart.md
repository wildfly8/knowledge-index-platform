# Quickstart: Knowledge Query API (Feature 003)

**Feature**: 003-knowledge-query-api

## Prerequisites

1. Features **001** / **002** index populated (`npm run embed:sync` at least once).
2. `.env` with `UPSTASH_VECTOR_*`, `CORPUS_ROOT`, and `KNOWLEDGE_RETRIEVE_API_SECRET`.
3. Xenova models: run `npm run prefetch:xenova` or symlink/copy
   `models/transformers-cache` from producer checkout.

## Start the API

```powershell
cd C:\my_projects\knowledge-index-platform
npm run serve
# http://127.0.0.1:3921
```

## Smoke test

```powershell
$secret = $env:KNOWLEDGE_RETRIEVE_API_SECRET
$h = @{ Authorization = "Bearer $secret" }

Invoke-RestMethod http://127.0.0.1:3921/health

Invoke-RestMethod http://127.0.0.1:3921/v1/status -Headers $h

Invoke-RestMethod http://127.0.0.1:3921/v1/retrieve -Method POST -Headers $h `
  -ContentType 'application/json' `
  -Body '{"query":"what is catamorphism","top_k":3}'
```

## Consumer wiring

Set on the read consumer (agentic-foundation):

- `KNOWLEDGE_INDEX_PLATFORM_URL=http://127.0.0.1:3921`
- `KNOWLEDGE_RETRIEVE_API_SECRET` (same value as platform)

The consumer keeps user auth and rate limits on `/api/knowledge/**`; it proxies
retrieve/status/warm to this service.
