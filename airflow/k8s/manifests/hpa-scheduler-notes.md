# Horizontal Pod Autoscaler (HPA) — Feature 004 notes

KubernetesExecutor creates **one pod per task try**; there is no fixed worker Deployment to scale.

## What HPA applies to

- **Cluster / node pool**: Rancher Desktop or cloud autoscaler adds nodes when pending pods cannot schedule (US3).
- **Scheduler parallelism**: `AIRFLOW__CORE__PARALLELISM` and `MAX_ACTIVE_TASKS_PER_DAG` in `helm/values-k3s.yaml` cap concurrent task pods.
- **DAG concurrency**: `max_active_runs=1` on `embed_archive_backfill` prevents parallel write runs (INV-K8S-003).

## What HPA does not apply to

- Per-task worker pods are ephemeral; HPA on a Deployment is not used for KubernetesExecutor task workers.

## Optional follow-up

For managed clusters, document node pool autoscaling and resource quotas in operator runbooks — not required for local k3s smoke (SC-001–SC-003).
