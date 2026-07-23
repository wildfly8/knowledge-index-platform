# Research: Cloud Run Query API (Feature 005)

**Date**: 2026-07-23

## Decision 1 — TLS termination

**Choice**: Cloud Run edge TLS; container HTTP only (extends Feature 003 US3).

**Rationale**: Same pattern as `otel-collector-platform` — no cert management in Node.

## Decision 2 — GCP credential reuse

**Choice**: Read `project_id` and `region` from sibling
`../otel-collector-platform/infra/gcp/terraform.tfvars`; application secrets
stay in this repo's gitignored `infra/gcp/terraform.tfvars`.

**Rationale**: User already has a working GCP project and gcloud auth from otel work;
secrets differ (Upstash + retrieve bearer vs Grafana OTLP).

## Decision 3 — Phased Terraform

**Choice**: Mirror otel `enable_foundation` → push image → `enable_runtime`.

**Rationale**: Artifact Registry must exist before `docker push`; image URI required for Cloud Run.

## Decision 4 — Cloud Run sizing

**Choice**: `memory = 4Gi`, `cpu = 2`, `timeout = 300s`, `min_instances = 0`, `max_instances = 1`.

**Rationale**: Xenova embed + rerank cold start; aligns with Airflow worker pod template.
Free-tier dev: scale-to-zero when idle.

## Decision 5 — Public invoker + app bearer

**Choice**: `roles/run.invoker` for `allUsers` on Cloud Run; `/v1/*` still requires bearer secret.

**Rationale**: Same as otel ingest — Cloud Run IAM allows HTTPS reachability; app enforces auth.

## Decision 6 — Test layers

| Layer | Tool | Scope |
|-------|------|-------|
| Unit | `node:test` | `lib/deploy/cloud-config.ts` |
| IaC | `terraform validate` | `npm run test:iac` |
| E2E cloud | PowerShell | Live Cloud Run HTTP |
