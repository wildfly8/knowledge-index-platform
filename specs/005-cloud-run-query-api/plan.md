# Implementation Plan: Cloud Run Query API (Feature 005)

**Branch**: `005-cloud-run-query-api` | **Date**: 2026-07-23 | **Spec**: [spec.md](./spec.md)

Deploy Feature **003** query HTTP API to GCP Cloud Run via Terraform, reusing the
GCP project from `otel-collector-platform`. Public contract @ 3.0.0 unchanged.

## Summary

| Layer | Choice |
|-------|--------|
| Image | `server/Dockerfile` → Artifact Registry `knowledge-query-api` |
| IaC | `infra/gcp/` Terraform (google provider ~> 6.0) |
| Provision | `scripts/cloud-run/provision.ps1` |
| Unit tests | `lib/deploy/cloud-config.ts` |
| E2E cloud | `scripts/e2e/cloud/` |

## Constitution Check

- [x] No public contract semver bump (deploy-only)
- [x] INV-RETRIEVE-001–004 preserved (read-only API)
- [x] Secrets not committed (tfvars gitignored)

## Project Structure

```text
infra/gcp/                    # Terraform (foundation + runtime)
scripts/cloud-run/provision.ps1
scripts/e2e/cloud/            # Live Cloud Run tests
scripts/e2e/lib/CloudConfig.ps1
lib/deploy/cloud-config.ts    # Unit-tested config resolver
server/Dockerfile             # (003) query API image
specs/005-cloud-run-query-api/
```

## Phase 2: Tasks

See [tasks.md](./tasks.md).
