# Tasks: Kubernetes Executor for Airflow (k3s)

**Input**: Design documents from `/specs/004-k8s-airflow-executor/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/k8s-airflow-deployment.md

**Tests**: No automated test tasks — k3s smoke per quickstart §8 validates SC-001–SC-003.

**Organization**: Tasks grouped by user story (US1–US4) for independent verification.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Maps to spec.md user stories (US1–US4)

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Helm chart skeleton and operator scripts for local k3s

- [x] T001 Create `airflow/k8s/chart/platform-local/Chart.yaml` for local ConfigMap + namespace resources
- [x] T002 [P] Add `airflow/k8s/scripts/install-k3s-airflow.ps1` bootstrap (namespace, PVC, platform-local, Airflow Helm)
- [x] T003 [P] Add `airflow/k8s/scripts/smoke-dag.ps1` for SC-001 dry-run DAG trigger and pod verification

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: ConfigMap pod template, hostPath overlays, secrets contract — blocks all user stories

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Implement Helm ConfigMap template in `airflow/k8s/chart/platform-local/templates/pod-template-configmap.yaml` (Kubernetes Task Pod entity per data-model.md)
- [x] T005 [P] Add Rancher Desktop hostPath defaults in `airflow/k8s/chart/platform-local/values-rancher.yaml` and `airflow/k8s/helm/values-rancher.yaml`
- [x] T006 [P] Add `airflow/k8s/hostpaths.example.yaml` documenting WSL vs Rancher `/mnt/c/...` paths (NFR-002)
- [x] T007 Wire `airflow/k8s/helm/values-k3s.yaml` to mount ConfigMap `knowledge-airflow-pod-template` at `/opt/pod-template`
- [x] T008 [P] Update `airflow/k8s/manifests/pod-template.yaml` header to reference Helm chart as SSOT
- [x] T009 Document install order in `specs/004-k8s-airflow-executor/quickstart.md` (platform-local before apache-airflow)

**Checkpoint**: `helm template` renders ConfigMap; values mount pod template file for KubernetesExecutor

---

## Phase 3: User Story 1 - Operator brings up k3s Airflow (Priority: P1) 🎯 MVP

**Goal**: Documented bootstrap; scheduler + webserver Ready; DAG parses in UI

**Independent Test**: `kubectl get pods -n knowledge-airflow` all Ready; `embed_archive_backfill` visible unparsed errors in Airflow UI

### Implementation for User Story 1

- [x] T010 [US1] Finalize `airflow/k8s/helm/values-k3s.yaml` (KubernetesExecutor, worker image, DAG hostPath via rancher overlay)
- [x] T011 [P] [US1] Expand `airflow/k8s/README.md` with chart install commands and artifact table
- [x] T012 [US1] Update `specs/004-k8s-airflow-executor/quickstart.md` §6 with two-chart install (`platform-local` + `apache-airflow`)
- [x] T013 [US1] Bootstrap + smoke scripts verified on k3d (SC-001 pass, SC-003 pass with `-KillMidBatch`)

**Checkpoint**: Operator can reach Airflow UI and see DAG list (US1 acceptance 1–2)

---

## Phase 4: User Story 2 - Scheduled backfill runs in its own pod (Priority: P1)

**Goal**: Each DAG task runs in an isolated worker pod with same CLI output as Compose

**Independent Test**: Trigger `embed_archive_backfill` with `{"dry_run": true}`; one pod per task; logs contain `[embed:backfill]`

### Implementation for User Story 2

- [x] T014 [US2] Ensure pod template in `airflow/k8s/chart/platform-local/templates/_pod-template.tpl` sets env, secrets, Xenova PVC per k8s-airflow-deployment.md
- [x] T015 [US2] Verify `airflow/dags/embed_archive_backfill.py` BashOperator commands unchanged (INV-K8S-001)
- [x] T016 [US2] Implement `airflow/k8s/scripts/smoke-dag.ps1` SC-001 checks (trigger dry_run, watch worker pods, tail logs)

**Checkpoint**: SC-001 pass — distinct pods per task with CLI exit code 0 on dry run

---

## Phase 5: User Story 3 - Elastic capacity for concurrent work (Priority: P2)

**Goal**: Document HPA / parallelism policy; preserve `max_active_runs=1`

**Independent Test**: Scheduler env caps parallelism; DAG `max_active_runs=1` prevents concurrent writes

### Implementation for User Story 3

- [x] T017 [P] [US3] Document HPA scope and scheduler parallelism in `specs/004-k8s-airflow-executor/research.md` § HPA
- [x] T018 [US3] Confirm `max_active_runs=1` in `airflow/dags/embed_archive_backfill.py` (INV-K8S-003)
- [x] T019 [P] [US3] Add optional `airflow/k8s/manifests/hpa-scheduler-notes.md` pointer in `airflow/k8s/README.md`

**Checkpoint**: Operator understands scale limits; no duplicate cursor writes from parallel DAG runs

---

## Phase 6: User Story 4 - Failure and retry without cursor corruption (Priority: P1)

**Goal**: Pod kill mid-batch retries in new pod; BF06 resume semantics

**Independent Test**: SC-003 — kill `run_budgeted_batch` pod; retry succeeds without manifest repair

### Implementation for User Story 4

- [x] T020 [US4] Document SC-003 manual kill/retry procedure in `specs/004-k8s-airflow-executor/quickstart.md` §8
- [x] T021 [US4] Add retry verification steps to `airflow/k8s/scripts/smoke-dag.ps1` (`-KillMidBatch` optional flag)

**Checkpoint**: SC-003 documented and scriptable for operators

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Deprecate Compose, constitution gate, validation

- [x] T022 [P] Create `airflow/README.md` marking `docker-compose.yml` deprecated; k3s as default operator path
- [x] T023 [P] Add deprecation banner to `airflow/docker-compose.yml` header comment
- [x] T024 Update `.specify/memory/constitution.md` Quality Gates — k3s smoke as primary Airflow gate after SC-001–SC-003
- [x] T025 Run `npm test` and `npm run validate` (SC-004)
- [x] T026 [P] Update `specs/004-k8s-airflow-executor/contracts/k8s-airflow-deployment.md` repository layout for `chart/platform-local`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Phase 1 — **blocks all user stories**
- **US1 (Phase 3)**: Depends on Phase 2
- **US2 (Phase 4)**: Depends on US1 (cluster must be up)
- **US3 (Phase 5)**: Can start after Phase 2 (docs); full verify after US2
- **US4 (Phase 6)**: Depends on US2 (needs working task pods)
- **Polish (Phase 7)**: After SC-001–SC-003 verified on k3s

### User Story Dependencies

| Story | Depends on | Independent test |
|-------|------------|------------------|
| US1 | Foundational | UI + DAG parse |
| US2 | US1 | Dry-run pods + logs |
| US3 | Foundational (docs) | `max_active_runs=1` + parallelism docs |
| US4 | US2 | Kill/retry SC-003 |

### Parallel Opportunities

- T002 + T003 (scripts) in parallel after T001
- T005 + T006 + T008 in parallel during Foundational
- T011 + T012 after T010
- T017 + T019 (US3 docs) in parallel
- T022 + T023 + T026 in parallel during Polish

---

## Parallel Example: Foundational Phase

```bash
# After T004 ConfigMap template exists:
Task T005: values-rancher.yaml host paths
Task T006: hostpaths.example.yaml
Task T008: manifests/pod-template.yaml header sync note
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Complete Phase 1 + Phase 2 (ConfigMap + values)
2. Complete Phase 3 (US1 bootstrap)
3. **STOP and VALIDATE**: UI reachable, DAG listed

### Incremental Delivery

1. US1 → cluster up
2. US2 → SC-001 dry-run smoke
3. US3 → elasticity docs
4. US4 → SC-003 retry doc/script
5. Polish → deprecate Compose after SC-001–SC-003

### Suggested MVP Scope

**Phases 1–3 (T001–T013)** — operator can install Airflow on k3s and see DAGs.

---

## Notes

- Entity **Workload Secret Bundle**: `airflow/k8s/manifests/secrets.example.yaml` — apply via kubectl, never commit values (INV-K8S-002)
- Public contract @ 3.0.0 unchanged — no semver bump
- Rancher Desktop paths use `/mnt/c/my_projects/...` inside cluster; tune via `values-rancher.yaml`
