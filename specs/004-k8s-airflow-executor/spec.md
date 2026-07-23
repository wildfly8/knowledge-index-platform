# Feature Specification: Kubernetes Executor for Airflow (k3s)

**Feature Branch**: `004-k8s-airflow-executor`

**Created**: 2026-07-22

**Status**: Approved

**Input**: Use the Kubernetes executor for Airflow on local **k3s** so Airflow
only schedules and defines tasks, while Kubernetes creates **one pod per task**
with elastic capacity (HPA and cluster autoscaling). Airflow owns *when* and
*what* runs; Kubernetes owns *where* and *how many* workers run concurrently.

## Summary

- **What this feature delivers**: Replace the current **standalone Docker
  Compose** Airflow deployment (in-process / sequential task execution inside one
  container) with an **Airflow + KubernetesExecutor** stack on **k3s** for local
  development and as the reference operator topology. Each DAG task (e.g.
  `run_budgeted_batch`) runs in its own ephemeral pod; the scheduler and webserver
  remain lightweight control-plane components.
- **Surface type**: Operator infrastructure — Helm/manifests, k3s bootstrap,
  pod templates, secrets wiring. **No** change to Upstash index semantics or
  public HTTP contract.
- **Who it affects**: Operators running Feature **002** archive backfill;
  read consumers and query API (**003**) are unchanged.
- **Public contract**: [`contracts/public/knowledge-index`](../../contracts/public/knowledge-index/README.md)
  @ 3.0.0 — **unchanged** (backfill CLI behavior and saga remain normative).
- **Works with**: Feature **002** DAG `embed_archive_backfill`; reuses existing
  `npm run embed:backfill` CLI inside task pods.
- **Must not break**: SAGA-BACKFILL-001 correctness, INV-BACKFILL-001–003,
  single-writer split, budget fail-closed rules, idempotent vector ids.

*Spec changes are reviewed editorially and validated with `npm test` and
`npm run validate` (constitution Quality Gates).*

## Domain Mapping

**Primary bounded context**: Knowledge (operator orchestration)

| Entity | Role | Owner context |
|--------|------|---------------|
| Airflow Control Plane | aggregate root (scheduler, webserver, metadata DB) | Knowledge |
| DAG Definition | referenced (`embed_archive_backfill`) | Knowledge |
| Kubernetes Task Pod | created per task instance | Knowledge (orchestrated) |
| Workload Secret Bundle | referenced (Upstash, corpus paths) | Knowledge |
| Embedding Backfill Plan | referenced (002) | Knowledge |
| Backfill Batch Run | created inside task pod via CLI | Knowledge |

**Cross-feature dependencies**:

| Feature | Relationship | Contract / SSOT |
|---------|--------------|-----------------|
| 002 | DAG and CLI unchanged semantically | `specs/002-archive-embed-backfill/spec.md`, SAGA-BACKFILL-001 |
| 001 | shared index; no deploy-sync in k8s path | public contract single-writer split |
| 003 | orthogonal | query HTTP not run in backfill pods |

**Invariants**:

- **INV-K8S-001**: Task pods MUST invoke the same `embed:backfill` CLI entrypoints
  as Compose; saga transitions (BF01–BF08) remain owned by the CLI, not Airflow
- **INV-K8S-002**: Upstash and corpus credentials MUST be injected via Kubernetes
  Secrets / env — never baked into container images or DAG source
- **INV-K8S-003**: At most one **write** backfill batch per archive cursor per
  schedule window (`max_active_runs=1` preserved); Kubernetes scale-out MUST NOT
  violate INV-BACKFILL-002 (duplicate vector ids)
- **INV-K8S-004**: Failed or evicted pods MUST be retryable by Airflow task
  retry policy without manual cursor repair (BF06 resume semantics)
- **INV-BACKFILL-001–003**: Unchanged from Feature 002

## Saga and state machines

Airflow task lifecycle is **orthogonal** to SAGA-BACKFILL-001: Kubernetes
only affects **pod** state; backfill saga state remains in `__backfill_manifest__`.

### SAGA-K8S-TASK-001 — Kubernetes task pod lifecycle

| ID | From | Event | To | Side effects |
|----|------|-------|-----|--------------|
| K01 | `pending` | `scheduler_queues` | `pod_creating` | Airflow submits Pod spec to API server |
| K02 | `pod_creating` | `pod_running` | `running` | Container runs bash → `npm run embed:backfill …` |
| K03 | `running` | `cli_exit_0` | `succeeded` | Pod terminates; Airflow marks task success |
| K04 | `running` | `cli_exit_nonzero` | `failed` | Pod logs retained; Airflow retry or fail per task config |
| K05 | `running` | `pod_evicted` / `oom_killed` | `failed` | Same as K04; cursor unchanged if CLI did not commit |
| K06 | `failed` | `airflow_retry` | `pod_creating` | New pod; CLI resumes from last committed cursor (BF06) |

## User Scenarios & Testing

### User Story 1 - Operator brings up k3s Airflow (Priority: P1)

As an operator, I want a documented k3s bootstrap so Airflow runs with
`KubernetesExecutor` locally, matching production topology.

**Acceptance**:

1. **Given** a workstation with k3s installed, **When** I apply the Feature 004
   manifests/Helm values, **Then** Airflow webserver and scheduler pods are Ready
   and the UI is reachable.
2. **Given** a fresh cluster, **When** I import DAGs, **Then**
   `embed_archive_backfill` appears without parse errors.

### User Story 2 - Scheduled backfill runs in its own pod (Priority: P1)

As an operator, I want each DAG task to run in an isolated pod so long-running
embed work does not block the scheduler or other tasks.

**Acceptance**:

1. **Given** a triggered DAG run, **When** `run_budgeted_batch` executes,
   **Then** Kubernetes creates exactly one worker pod for that task try and
   deletes or completes it after exit.
2. **Given** a successful pod, **When** I inspect logs, **Then** I see the same
   `[embed:backfill]` output as the Compose path.

### User Story 3 - Elastic capacity for concurrent work (Priority: P2)

As an operator, I want the cluster to add worker capacity when multiple tasks or
DAG runs need resources, using Kubernetes HPA and (optionally) cluster
autoscaling.

**Acceptance**:

1. **Given** HPA configured on the worker node pool or pod quota, **When** task
   concurrency increases within policy, **Then** additional pods can be scheduled
   without manual VM resize (subject to cluster autoscaler limits).
2. **Given** `max_active_runs=1` on `embed_archive_backfill`, **When** the daily
   schedule fires, **Then** only one DAG run writes to the backfill cursor at a
   time (INV-K8S-003).

### User Story 4 - Failure and retry without cursor corruption (Priority: P1)

As an operator, I want OOM/eviction or CLI failure to retry in a **new** pod
without duplicate Upstash writes.

**Acceptance**:

1. **Given** a pod killed mid-batch, **When** Airflow retries the task,
   **Then** a new pod resumes from the last committed cursor (BF06) and does not
   duplicate vector ids.

## Requirements

### Functional Requirements

- **FR-001**: Deploy Airflow 2.9.x with **`executor = KubernetesExecutor`**
  on k3s (local reference cluster); scheduler + webserver + metadata DB as
  separate Deployments or Helm subcharts.
- **FR-002**: Provide a **pod template** (or `pod_override`) for Feature 002 tasks
  that includes: platform image (Node 20 + `npm ci`), `CORPUS_ROOT` volume
  (producer checkout), `KNOWLEDGE_INDEX_REPO` mount, Xenova cache volume, and
  env from Secrets.
- **FR-003**: Migrate `embed_archive_backfill` tasks from `BashOperator` in the
  scheduler container to commands that run **inside worker pods** (still
  `npm run embed:backfill` with the same flags and Jinja `dag_run.conf`).
- **FR-004**: Document **k3s local bootstrap** (install, kubeconfig, namespace,
  secrets apply order) in `specs/004-k8s-airflow-executor/quickstart.md`.
- **FR-005**: Configure **resource requests/limits** on task pods (CPU/memory) so
  Xenova embed fits; document minimum node size.
- **FR-006**: Support **Horizontal Pod Autoscaler** on the worker pool or a
  dedicated “backfill worker” Deployment pattern compatible with KubernetesExecutor
  (document chosen pattern in plan).
- **FR-007**: Preserve DAG structure: `validate_budget` → `scan_and_plan` →
  `run_budgeted_batch` → `finalize_run_record`; preserve schedule `0 1 * * *`,
  `max_active_runs=1`, and task retry policy on `run_budgeted_batch`.
- **FR-008**: Secrets: `UPSTASH_VECTOR_*` from Kubernetes Secret; never commit
  values to git (parity with `airflow/.env` Compose path).
- **FR-009**: Keep **Docker Compose standalone** documented as optional legacy
  smoke path until Feature 004 quickstart is verified; mark deprecated in plan
  after k3s path is default.
- **FR-010**: Add constitution quality gate: k3s Airflow smoke (`kubectl`,
  trigger DAG, pod success) alongside existing Compose gate during transition.

### Non-functional Requirements

- **NFR-001**: Task pod startup (image pull + `npm ci` if needed) SHOULD complete
  within 10 minutes on a typical dev node (cold cache).
- **NFR-002**: Operator docs MUST state Windows dev path (k3s via WSL2 / Rancher
  Desktop / multipass) if applicable.

## Success Criteria

- **SC-001**: Operator can trigger `embed_archive_backfill` on k3s and see each
  task execute in a distinct pod with exit code matching CLI success/failure.
- **SC-002**: A full daily run on k3s produces the same backfill manifest cursor
  advancement as an equivalent Compose run for the same corpus slice (no duplicate
  vector ids).
- **SC-003**: Deliberate pod kill mid-`run_budgeted_batch` retries successfully
  without manual manifest repair.
- **SC-004**: `npm test` and `npm run validate` remain green (no public contract
  drift unless explicitly versioned later).

## Assumptions

- **k3s** is the local Kubernetes distribution; production may use managed K8s
  with the same executor model.
- Feature 002 CLI and saga remain the **source of truth** for backfill correctness;
  Airflow+k8s change **placement** only.
- Corpus producer checkout is available to pods via hostPath, PVC, or synced
  volume (plan chooses one).
- Single-operator cluster; no multi-tenant Airflow RBAC beyond namespace scope.

## Out of Scope

- Rewriting embed/backfill business logic (`lib/knowledge/backfill-*.ts`)
- Running Feature **001** deploy sync or Feature **003** query API on Kubernetes
- Multi-region Airflow, Celery executor, or Spark operators
- GitOps for DAG publishing beyond mounting `airflow/dags` (plan may add)
- Replacing Upstash with an in-cluster vector database
- End-user auth, chat UI, or Vercel deployment of Airflow
