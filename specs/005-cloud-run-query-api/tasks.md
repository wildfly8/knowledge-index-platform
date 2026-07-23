# Tasks: Cloud Run Query API (Feature 005)

**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

## Phase 1: IaC foundation

- [x] T001 `infra/gcp/` Terraform — APIs, Artifact Registry, variables, outputs
- [x] T002 `infra/gcp/terraform.tfvars.example` + gitignore for `terraform.tfvars`
- [x] T003 `scripts/cloud-run/provision.ps1` — check, foundation, image, runtime, e2e-cloud

## Phase 2: Config + unit tests

- [x] T004 `lib/deploy/cloud-config.ts` — resolve/validate cloud E2E config
- [x] T005 `lib/deploy/cloud-config.test.ts` — unit tests (SC-002)
- [x] T006 `npm run test:iac` — `terraform validate` in `infra/gcp/`

## Phase 3: E2E cloud suite

- [x] T007 `scripts/e2e/lib/CloudConfig.ps1` — tf outputs + otel sibling fallback
- [x] T008 `scripts/e2e/cloud/gcp/test-cloud-run-query-api.ps1` — health, status, retrieve
- [x] T009 `scripts/e2e/cloud/run.ps1` + `npm run test:e2e:cloud`

## Phase 4: Docs

- [x] T010 [specs/005-cloud-run-query-api/quickstart.md](./quickstart.md)
- [x] T011 [specs/005-cloud-run-query-api/contracts/cloud-run-deployment.md](./contracts/cloud-run-deployment.md)
- [x] T012 Constitution feature table + `.specify/feature.json`
