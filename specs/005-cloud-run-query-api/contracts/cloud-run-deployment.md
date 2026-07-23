# Cloud Run deployment contract (Feature 005)

Internal operator contract — not published in `contracts/public/`.

## Phases

| Phase | Script | Terraform flag |
|-------|--------|----------------|
| check | `provision.ps1 -Phase check` | validate only |
| foundation | `-Phase foundation` | `enable_foundation = true` |
| image | `-Phase image` | build + push to Artifact Registry |
| runtime | `-Phase runtime` | `enable_runtime = true` |
| e2e-cloud | `-Phase e2e-cloud` | HTTP tests against `cloud_run_uri` |

## GCP project seeding (otel sibling)

Default otel path: `../otel-collector-platform/infra/gcp/terraform.tfvars`

Copied fields when local `infra/gcp/terraform.tfvars` is missing:

- `project_id`
- `region`

Application secrets are **never** copied from otel — set in this repo's tfvars or `.env`:

- `upstash_vector_rest_url`
- `upstash_vector_rest_token`
- `retrieve_api_secret` (maps to `KNOWLEDGE_RETRIEVE_API_SECRET`)

## Outputs

| Output | Use |
|--------|-----|
| `cloud_run_uri` | Consumer `KNOWLEDGE_INDEX_PLATFORM_URL` |
| `artifact_registry_repository` | `docker push` target |
| `query_image_prefix` | Image URI prefix |

## E2E cloud (SC-003)

1. `GET {uri}/health` → 200 `{ ok: true }`
2. `GET {uri}/v1/status` + bearer → 200
3. `POST {uri}/v1/retrieve` + bearer + body → 200 or 503 (index unavailable)

Override via env: `CLOUD_RUN_URI`, `KNOWLEDGE_RETRIEVE_API_SECRET`.
