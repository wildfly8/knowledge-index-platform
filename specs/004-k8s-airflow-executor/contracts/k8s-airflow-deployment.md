# Kubernetes Airflow deployment contract (Feature 004)

**Feature**: 004-k8s-airflow-executor | **Date**: 2026-07-22

Internal operator contract — **not** published in `contracts/public/`. Normative
backfill behavior remains
[`contracts/public/knowledge-index`](../../../contracts/public/knowledge-index/README.md)
@ 3.0.0.

## Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│ k3s cluster (namespace: knowledge-airflow)                  │
│                                                             │
│  Helm: apache-airflow/airflow (values-k3s.yaml)             │
│  Traefik Ingress → http://localhost:8080 (k3d LB)           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │  Webserver   │  │  Scheduler   │  │  Triggerer   │       │
│  │  :8080       │  │              │  │              │       │
│  └──────┬───────┘  └──────┬───────┘  └──────────────┘       │
│         │                 │ creates Pod per task            │
│         │                 ▼                                 │
│         │     ┌───────────────────────────────┐             │
│         │     │ KubernetesExecutor worker Pod │  (×N)       │
│         │     │  image: knowledge-index-worker│             │
│         │     │  bash: npm run embed:backfill │             │
│         │     └───────────────┬───────────────┘             │
│         │                     │                             │
└─────────┼─────────────────────┼─────────────────────────────┘
          │                     │
          ▼                     ▼
     Operator UI          Upstash Vector (002 writes)
```

**Surface projection**: Operator CLI / Airflow UI only — no App Router, no MDX.

**Separation of concerns**:

| Component | Owns |
|-----------|------|
| Airflow scheduler | Cron, DAG structure, task retries, `max_active_runs` |
| Kubernetes API | Pod create/delete, resource limits, node placement |
| `embed:backfill` CLI | BF01–BF08 saga, budget, cursor, Upstash writes |

## Repository layout (design)

```text
airflow/
├── Dockerfile                          # worker + optional control-plane base
├── docker-compose.yml                  # legacy standalone (deprecated after 004)
├── dags/embed_archive_backfill.py      # BashOperator (unchanged commands)
└── k8s/
    ├── README.md
    ├── chart/platform-local/         # Helm — pod template ConfigMap
    ├── helm/values-k3s.yaml
    ├── helm/values-rancher.yaml
    ├── hostpaths.example.yaml
    ├── scripts/bootstrap-k3d-dev.ps1
    ├── scripts/install-k3s-airflow.ps1
    ├── scripts/ensure-admin-user.ps1
    ├── scripts/smoke-dag.ps1
    ├── docs/observability.md
    └── manifests/
        ├── namespace.yaml
        ├── ingress-local.yaml
        ├── secrets.example.yaml
        ├── pod-template.yaml         # reference copy (SSOT: chart template)
        ├── xenova-cache-pvc.yaml
        ├── airflow-logs-perms-job.yaml
        └── db-migrate-job.yaml
```

## Helm values (summary)

File: [`airflow/k8s/helm/values-k3s.yaml`](../../../airflow/k8s/helm/values-k3s.yaml)

| Key | Value | Purpose |
|-----|-------|---------|
| `executor` | `KubernetesExecutor` | Pod-per-task |
| `airflow.podTemplate` | *(file)* or `podTemplateFile` | Worker volumes, secrets, resources |
| `dags.persistence` / git-sync | hostPath or PVC | Mount `airflow/dags` |
| `postgresql.enabled` | `true` (dev) | Metadata DB |
| `config.logging.base_log_folder` | `/opt/airflow/shared-logs` | Persist task logs across worker pod delete |
| `config.kubernetes_executor.delete_worker_pods` | `True` | Ephemeral workers; logs on shared hostPath |
| `webserver.env` | `AIRFLOW__WEBSERVER__BASE_URL=http://localhost:8080` | Ingress UI links |

Install (two charts):

```bash
helm upgrade --install platform-local airflow/k8s/chart/platform-local \
  -n knowledge-airflow -f airflow/k8s/chart/platform-local/values-rancher.yaml

helm upgrade --install knowledge-airflow apache-airflow/airflow \
  -n knowledge-airflow \
  -f airflow/k8s/helm/values-k3s.yaml \
  -f airflow/k8s/helm/values-rancher.yaml
```

## Pod template contract

**SSOT**: [`airflow/k8s/chart/platform-local/templates/_pod-template.tpl`](../../../airflow/k8s/chart/platform-local/templates/_pod-template.tpl) rendered into ConfigMap `knowledge-airflow-pod-template` (key `pod-template.yaml`).

Reference copy: [`airflow/k8s/manifests/pod-template.yaml`](../../../airflow/k8s/manifests/pod-template.yaml)

Every task pod MUST:

1. Use image `knowledge-index-airflow-worker` (built from `airflow/Dockerfile`)
2. Mount platform repo + corpus (hostPath for k3s dev)
3. Inject secrets via `envFrom: secretRef: knowledge-index-secrets`
4. Set `TRANSFORMERS_CACHE=/opt/airflow/xenova-cache` (PVC)
5. Run an **initContainer** `npm ci` when `node_modules` emptyDir is cold (optional but recommended for dev hostPath code mount)
6. Request ≥ `4Gi` memory for `run_budgeted_batch`
7. Mount shared log hostPath at `/opt/airflow/shared-logs` and set `AIRFLOW__LOGGING__BASE_LOG_FOLDER`
8. Mount `knowledge-airflow-config` (`airflow.cfg`) so workers use the same logging path as the webserver

## DAG contract

- **Operator**: `BashOperator` (not `KubernetesPodOperator` unless template insufficient)
- **Commands**: identical to Feature 002 Compose path
- **No** embed logic in Python beyond bash invocation

## RBAC

Helm chart creates Airflow service account with permissions to `create/get/delete pods` in namespace. Operator applies chart defaults unless restricted by org policy.

## Health / smoke

| Check | Command |
|-------|---------|
| Control plane | `kubectl get pods -n knowledge-airflow` |
| UI | `http://localhost:8080/home` (Traefik Ingress; k3d `--port 8080:80@loadbalancer`) |
| DAG parse | Airflow UI → DAGs list |
| Task pod | Trigger DAG → `kubectl get pods -n knowledge-airflow -w` |
| Task logs after pod delete | Shared volume — see [observability.md](../../../airflow/k8s/docs/observability.md) |

## Non-goals (this contract)

- Feature 003 query HTTP on Kubernetes
- Multi-tenant Airflow RBAC
- GitOps (Argo CD) — optional follow-up
