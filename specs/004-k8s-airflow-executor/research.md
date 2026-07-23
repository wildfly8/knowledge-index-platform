# Research: Kubernetes Executor for Airflow (k3s)

**Feature**: 004-k8s-airflow-executor | **Date**: 2026-07-22

## Decision 1 — Helm for control plane, raw manifests for platform-specific glue

**Decision**: Install Airflow with the **official Apache Airflow Helm chart** (`apache-airflow/airflow`) and a repo-owned **`values-k3s.yaml`** overlay. Supplement with small **raw manifests** in `airflow/k8s/manifests/` for namespace, secrets template, and the **worker pod template** file referenced by Helm values.

**Rationale**: Helm chart already ships scheduler, webserver, triggerer, metadata DB options, RBAC, and `KubernetesExecutor` wiring. Re-implementing those as hand-written YAML is error-prone. Pod template and secrets stay plain YAML for transparency and easy diff review.

**Alternatives considered**:

| Option | Rejected because |
|--------|------------------|
| 100% raw manifests | High maintenance; duplicate chart logic for Airflow 2.9 upgrades |
| 100% Helm only, no raw files | Pod template + secret examples are clearer as standalone files operators `kubectl apply` |
| CeleryExecutor on k8s | Spec requires KubernetesExecutor (pod-per-task, no Redis broker) |
| Keep Compose as primary | Spec FR-001 targets k3s as reference topology |

## Decision 2 — Keep `BashOperator` + global pod template (not per-task `KubernetesPodOperator`)

**Decision**: With `executor: KubernetesExecutor`, **existing `BashOperator` tasks already run in ephemeral worker pods**. Migrate by:

1. Setting `AIRFLOW__KUBERNETES_EXECUTOR__POD_TEMPLATE_FILE` to `airflow/k8s/manifests/pod-template.yaml`
2. Keeping the DAG task graph and bash commands unchanged (`npm run embed:backfill …`)

Use **`KubernetesPodOperator`** only if a future task needs a materially different image or volume layout (out of scope for 002 parity).

**Rationale**: Minimal DAG diff; preserves Jinja `dag_run.conf` fragments; aligns with Airflow docs for KubernetesExecutor + pod template.

**Alternatives**: One `KubernetesPodOperator` per task (verbose duplication); `KubernetesJobOperator` (different lifecycle semantics).

## Decision 3 — Worker image = existing `airflow/Dockerfile`

**Decision**: Build and tag `knowledge-index-airflow-worker:latest` from `airflow/Dockerfile` (Node 20 + Airflow base). Task pods use this image; control-plane pods use chart defaults.

**Rationale**: Same embed environment as Compose (tsx, npm, Xenova). Platform code mounted at `/opt/knowledge-index-platform`; corpus at `/opt/agentic-foundation`.

## Decision 4 — Volumes on k3s (local dev)

**Decision**:

| Mount | Source (k3s local) | Target in pod |
|-------|-------------------|---------------|
| Platform repo | `hostPath` (Windows: path via Rancher Desktop / WSL bind) | `/opt/knowledge-index-platform` |
| Corpus | `hostPath` read-only | `/opt/agentic-foundation` |
| `node_modules` | `emptyDir` or PVC | `.../node_modules` (linux deps; initContainer runs `npm ci` on cold start) |
| Xenova cache | PVC `xenova-cache` | `/opt/airflow/xenova-cache` (`TRANSFORMERS_CACHE`) |

**Rationale**: Mirrors proven Compose layout. `hostPath` is acceptable for single-node k3s dev; production plan uses PVC + git sync or baked image (out of scope).

**Alternatives**: Bake repo into image (slow iteration); NFS for corpus (heavier local setup).

## Decision 5 — HPA and autoscaling scope

**Decision**:

- **Task elasticity**: `KubernetesExecutor` creates **one pod per task try** — that is the primary scale dimension.
- **Node elasticity**: Document optional **cluster autoscaler** / additional k3s agents when the scheduler queues multiple tasks; not required for single-node dev.
- **HPA on a static Deployment**: **Not used** for executor workers (pods are Job-like, not a long-running Deployment). Do **not** HPA the scheduler.
- **Concurrency guard**: Keep `max_active_runs=1` on `embed_archive_backfill` (INV-K8S-003). Set chart `parallelism` / pool limits so only one `run_budgeted_batch` writes at a time.

**Rationale**: HPA targets steady-state Deployments; executor pods are short-lived. Real bottleneck is node CPU/RAM for Xenova embed batches.

## Decision 6 — Windows developer path

**Decision**: Document **Rancher Desktop** (k3s) or **k3s in WSL2** as supported local paths. `kubectl` and Helm run from PowerShell or WSL against the same kubeconfig.

**Rationale**: Native Windows k3s is uncommon; Rancher Desktop is the lowest-friction k8s API on Windows.

## Decision 7 — Secrets

**Decision**: `kubectl create secret generic knowledge-index-secrets` from `airflow/k8s/secrets.example.yaml` (gitignored apply flow). Keys: `UPSTASH_VECTOR_REST_URL`, `UPSTASH_VECTOR_REST_TOKEN`. Never commit values.

**Rationale**: Parity with `airflow/.env` Compose path (INV-K8S-002).

## Decision 8 — Compose standalone deprecation

**Decision**: Keep `airflow/docker-compose.yml` marked **deprecated** in `airflow/README.md` after Feature 004 implement (FR-009). Remove in a follow-up once all operators default to k3s.

**Alternatives**: Delete Compose immediately (breaks operators mid-migration).
