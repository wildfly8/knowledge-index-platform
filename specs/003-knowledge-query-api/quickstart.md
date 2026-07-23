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

## Cloud Run (production HTTPS)

GCP **Cloud Run terminates TLS** at the edge. The container serves **plain HTTP**
on `PORT` (default `8080`); do not configure in-app TLS certificates.

```powershell
# Build (from repo root; requires models/transformers-cache — run prefetch:xenova first)
docker build -f server/Dockerfile -t knowledge-query-api:latest .

# Deploy (set secrets via Cloud Run console or --set-secrets)
gcloud run deploy knowledge-query-api `
  --image knowledge-query-api:latest `
  --region us-central1 `
  --port 8080 `
  --set-env-vars NODE_ENV=production,KNOWLEDGE_REQUIRE_HTTPS=true `
  --allow-unauthenticated   # still require bearer on /v1/* ; /health is public
```

Clients use the `https://….run.app` URL Cloud Run provides. Cloud Run sets
`X-Forwarded-Proto: https` on user traffic; the app adds **HSTS** and returns
**308** redirect if a client hits HTTP without TLS termination (when
`KNOWLEDGE_REQUIRE_HTTPS=true`, default in production).

Local dev stays `http://127.0.0.1:3921` unless you set `KNOWLEDGE_REQUIRE_HTTPS=true`.
