# Data Model: Kubernetes Airflow Executor (k3s)

**Feature**: 004-k8s-airflow-executor | **Date**: 2026-07-22

Entity **ownership** is declared in [spec.md Domain Mapping](./spec.md). This file is field SSOT for orchestration entities only — not Upstash manifests (002).

## Airflow Control Plane

Kubernetes Deployments installed by Helm (scheduler, webserver, triggerer, optional statsd).

| Field | Type | Notes |
|-------|------|-------|
| `namespace` | string | e.g. `knowledge-airflow` |
| `executor` | enum | `KubernetesExecutor` (fixed) |
| `airflow_version` | string | `2.9.x` aligned with `airflow/Dockerfile` |
| `metadata_db_url` | secret ref | Chart-managed Postgres subchart or external |
| `dag_folder` | path | `/opt/airflow/dags` (ConfigMap or git-sync) |
| `pod_template_file` | path | `airflow/k8s/manifests/pod-template.yaml` |
| `parallelism` | number | Global cap; tune with INV-K8S-003 |

**Persistence**: Helm release state; Airflow metadata DB.

## DAG Definition

Logical graph — unchanged from Feature 002.

| Field | Type | Notes |
|-------|------|-------|
| `dag_id` | string | `embed_archive_backfill` |
| `schedule` | cron | `0 1 * * *` UTC |
| `max_active_runs` | number | `1` |
| `tasks` | list | `validate_budget` → `scan_and_plan` → `run_budgeted_batch` → `finalize_run_record` |
| `task_operator` | string | `BashOperator` (runs inside executor pods) |

## Kubernetes Task Pod

Ephemeral pod created per task instance try (SAGA-K8S-TASK-001).

| Field | Type | Notes |
|-------|------|-------|
| `pod_name` | string | Airflow-generated |
| `task_id` | string | DAG task id |
| `try_number` | number | Airflow retry counter |
| `image` | string | `knowledge-index-airflow-worker:latest` |
| `phase` | enum | `pending` \| `running` \| `succeeded` \| `failed` |
| `exit_code` | number \| null | CLI exit code |
| `resources.requests.memory` | string | e.g. `4Gi` (Xenova embed) |
| `resources.limits.memory` | string | e.g. `6Gi` |
| `env.CORPUS_ROOT` | string | `/opt/agentic-foundation` |
| `env.KNOWLEDGE_INDEX_REPO` | string | `/opt/knowledge-index-platform` |
| `env.TRANSFORMERS_CACHE` | string | `/opt/airflow/xenova-cache` |

**Validation**:
- Pod MUST NOT run without `UPSTASH_VECTOR_*` secret refs
- `run_budgeted_batch` pods MUST set `KNOWLEDGE_INFERENCE_WORKER=0`

## Workload Secret Bundle

Kubernetes Secret consumed by task pods.

| Key | Required | Notes |
|-----|----------|-------|
| `UPSTASH_VECTOR_REST_URL` | yes | |
| `UPSTASH_VECTOR_REST_TOKEN` | yes | |
| `UPSTASH_DAILY_WRITE_CAP` | no | default `10000` via env in pod template |
| `EMBED_BACKFILL_WRITE_BUDGET` | no | default `9500` |

**Not stored in git** — apply from operator workstation (INV-K8S-002).

## Embedding Backfill Plan / Backfill Batch Run

Referenced from Feature **002** — unchanged. Task pods invoke CLI; saga state in `__backfill_manifest__`.
