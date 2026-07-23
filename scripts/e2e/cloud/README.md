# Cloud Run E2E tests against deployed query API (Feature 005).
# Requires: terraform runtime applied or CLOUD_RUN_URI + KNOWLEDGE_RETRIEVE_API_SECRET.

See [specs/005-cloud-run-query-api/quickstart.md](../../specs/005-cloud-run-query-api/quickstart.md).

```powershell
npm run test:e2e:cloud
# or
.\scripts\cloud-run\provision.ps1 -Phase e2e-cloud
```

GCP `project_id` / `region` can be seeded from sibling `otel-collector-platform/infra/gcp/terraform.tfvars`.
