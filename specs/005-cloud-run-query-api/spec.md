# Feature Specification: Cloud Run Query API (IaC)

**Feature Branch**: `005-cloud-run-query-api`

**Created**: 2026-07-23

**Status**: Approved

**Input**: Containerize the Feature **003** knowledge query API (`npm run serve`)
and deploy to **GCP Cloud Run** (free-tier region) using **Terraform IaC**.
Reuse GCP project credentials from the sibling `otel-collector-platform` repo.
Provide **unit tests** for deploy config and **E2E cloud tests** against the live service.

## Summary

- **What this feature delivers**: Production-shaped hosting for the query HTTP API
  on Cloud Run — Docker image, Artifact Registry, Secret Manager, Terraform,
  provision scripts, and automated cloud E2E verification.
- **Who it affects**: Operators deploying Feature **003** for read consumers;
  local `npm run serve` remains the dev path.
- **Public contract**: [`contracts/public/knowledge-index`](../../contracts/public/knowledge-index/README.md)
  @ **3.0.0** — transport security (FR-007) already documented; no new HTTP shapes.
- **Works with**: Feature **003** server image (`server/Dockerfile`), HTTPS proxy
  semantics (`lib/server/transport-security.ts`).
- **Must not break**: INV-RETRIEVE-001–004; bearer auth on `/v1/*`; index read-only.

## Domain Mapping

**Primary bounded context**: Knowledge (operator deployment)

| Entity | Role | Owner context |
|--------|------|---------------|
| Query API Container Image | aggregate root (immutable deploy unit) | Knowledge |
| Cloud Run Service | runtime host (TLS at edge, HTTP in container) | Knowledge |
| Workload Secret Bundle | referenced (Upstash + retrieve bearer) | Knowledge |
| Semantic Vector Index | referenced (read via Upstash) | Knowledge |

**Cross-feature dependencies**:

| Feature | Relationship |
|---------|--------------|
| 003 | HTTP surface, auth, Xenova retrieve pipeline |
| otel-collector-platform | Shared GCP `project_id` / `region` (sibling repo tfvars) |

**Invariants**:

- **INV-DEPLOY-001**: Terraform MUST NOT commit secrets; `terraform.tfvars` gitignored
- **INV-DEPLOY-002**: Cloud E2E MUST use bearer auth on `/v1/*` (same as 003)
- **INV-DEPLOY-003**: Container MUST NOT terminate TLS (Cloud Run owns TLS)

## Saga and state machines

### SAGA-DEPLOY-001 — Cloud Run release

| ID | From | Event | To | Side effects |
|----|------|-------|-----|--------------|
| DR01 | `absent` | `foundation_apply` | `registry_ready` | APIs + Artifact Registry |
| DR02 | `registry_ready` | `image_push` | `image_pinned` | Tagged image URI in tfvars |
| DR03 | `image_pinned` | `runtime_apply` | `serving` | Secrets + Cloud Run revision |
| DR04 | `serving` | `e2e_pass` | `verified` | Cloud test suite green |

## User stories

### US1 — Operator provisions GCP foundation (P1)

As an operator, I run a scripted Terraform **foundation** phase so Artifact Registry
and required APIs exist in the shared GCP project (seeded from otel-collector-platform).

### US2 — Operator deploys query API to Cloud Run (P1)

As an operator, I build/push the query image and apply Terraform **runtime** so
Cloud Run serves `GET /health` and authenticated `/v1/*` over HTTPS.

### US3 — CI verifies deploy config (P1)

As a developer, unit tests validate cloud E2E config resolution and required
fields without calling GCP.

### US4 — Operator runs cloud E2E suite (P1)

As an operator, after deploy I run `npm run test:e2e:cloud` to verify `/health`,
`/v1/status`, and a minimal `/v1/retrieve` against the live Cloud Run URL.

## Functional requirements

- **FR-001**: Terraform under `infra/gcp/` with phased `enable_foundation` / `enable_runtime`
- **FR-002**: Secret Manager for `UPSTASH_VECTOR_*` and `KNOWLEDGE_RETRIEVE_API_SECRET`
- **FR-003**: Cloud Run service `knowledge-query-api` (configurable) in free-tier region
- **FR-004**: `scripts/cloud-run/provision.ps1` — check, foundation, image, runtime, e2e-cloud
- **FR-005**: Seed `project_id` and `region` from `../otel-collector-platform/infra/gcp/terraform.tfvars` when local tfvars missing
- **FR-006**: Unit tests in `lib/deploy/cloud-config.test.ts`
- **FR-007**: E2E cloud tests in `scripts/e2e/cloud/` reading Terraform outputs or env overrides

## Success criteria

- **SC-001**: `terraform validate` passes in `infra/gcp/`
- **SC-002**: `npm test` includes deploy config unit tests
- **SC-003**: Cloud E2E passes against deployed revision (`/health`, `/v1/status`, `/v1/retrieve`)

## Out of scope

- Custom domain / managed SSL certs (default `*.run.app` HTTPS is sufficient)
- In-container TLS/mTLS
- GKE / Cloud Run Jobs for query API
- Consumer app deploy (agentic-foundation)
