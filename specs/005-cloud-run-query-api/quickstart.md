# Quickstart: Cloud Run Query API (Feature 005)

**Feature**: 005-cloud-run-query-api

Prerequisites: Feature **003** works locally (`npm run serve`); Xenova models
prefetched (`npm run prefetch:xenova`); sibling
[`otel-collector-platform`](../../../otel-collector-platform) GCP project configured.

## 1. Tools

```powershell
terraform version
docker version
gcloud version
gcloud auth login
gcloud auth application-default login
```

## 2. Seed GCP project from otel repo

```powershell
cd C:\my_projects\knowledge-index-platform
.\scripts\cloud-run\provision.ps1 -Phase check
```

Creates `infra/gcp/terraform.tfvars` (gitignored) with `project_id` / `region` from
`..\otel-collector-platform\infra\gcp\terraform.tfvars` if missing.

Edit `infra/gcp/terraform.tfvars` and set:

- `upstash_vector_rest_url` / `upstash_vector_rest_token` (from `.env`)
- `retrieve_api_secret` (same as `KNOWLEDGE_RETRIEVE_API_SECRET`, 32+ chars)

## 3. Deploy

```powershell
.\scripts\cloud-run\provision.ps1 -Phase foundation
.\scripts\cloud-run\provision.ps1 -Phase image
.\scripts\cloud-run\provision.ps1 -Phase runtime
```

Note the `cloud_run_uri` output — set on read consumer as `KNOWLEDGE_INDEX_PLATFORM_URL`.

## 4. Unit + IaC tests (no GCP calls)

```powershell
npm test
npm run test:iac
```

## 5. Cloud E2E

```powershell
npm run test:e2e:cloud
# or
.\scripts\cloud-run\provision.ps1 -Phase e2e-cloud
```

Optional env overrides:

```powershell
$env:CLOUD_RUN_URI = "https://knowledge-query-api-xxxxx-uc.a.run.app"
$env:KNOWLEDGE_RETRIEVE_API_SECRET = "your-secret"
npm run test:e2e:cloud
```

## Troubleshooting

| Symptom | Check |
|---------|--------|
| `terraform validate` fails | `terraform init` in `infra/gcp/` |
| `docker push` denied | `gcloud auth configure-docker us-central1-docker.pkg.dev` |
| E2E 401 | `retrieve_api_secret` matches deployed secret |
| E2E 503 on retrieve | Upstash index populated (001/002) |
| Cold start timeout | Re-run E2E; first request may take 60–120s |
