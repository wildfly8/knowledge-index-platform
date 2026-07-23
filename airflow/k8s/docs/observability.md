# Airflow logs (Feature 004, local k3d)

KubernetesExecutor writes task logs under `/opt/airflow/shared-logs` (chart keeps
`/opt/airflow/logs` as its own emptyDir). With
`delete_worker_pods: True`, the worker pod is removed after the task — but log
**files** persist when scheduler, webserver, and workers share the same directory.

## Local dev: k3d named volume (no cloud cost)

| Piece | Path / name |
|-------|-------------|
| **Docker named volume** | `knowledge-airflow-logs` |
| **Mount on k3d nodes** | `/var/lib/knowledge-airflow-logs` |
| **Mount in pods** | `/opt/airflow/shared-logs` |

Bootstrap creates the volume:

```text
--volume knowledge-airflow-logs:/var/lib/knowledge-airflow-logs@all
```

**Existing cluster** (k3d 5.8 has no `--volume-add`; pick one):

1. **Recreate** (recommended — true Docker named volume):
   ```powershell
   .\airflow\k8s\scripts\bootstrap-k3d-dev.ps1 -RecreateCluster
   ```
2. **Without recreate**: logs use `DirectoryOrCreate` on the k3d node at
   `/var/lib/knowledge-airflow-logs` (survives worker pod delete; lost if the node
   container is recreated). Or point `hostPaths.logs` at
   `/mnt/c/my_projects/knowledge-index-platform/airflow/logs` (repo bind mount).

### Why hostPath to a k3d volume (not a PVC)

- k3s `local-path` PVCs are **ReadWriteOnce** — concurrent worker pods cannot share one claim.
- A **hostPath** to the k3d named volume is writable from every pod on the node (fine for single-agent dev).
- Logs stay on the Docker volume across pod/cluster restarts (until you delete the volume).

### Inspect logs on disk

```powershell
docker volume inspect knowledge-airflow-logs
# Data lives inside the k3d node container filesystem at /var/lib/knowledge-airflow-logs
```

### Airflow UI

Worker pods mount `airflow.cfg` and write task logs to the shared hostPath
(`base_log_folder` = `/opt/airflow/shared-logs`). With `delete_worker_pods: True`,
the worker pod is removed after the task, but log **files** remain on the shared
volume and the webserver reads them from disk (no `:8793` fetch to a gone pod).

If you still see `Could not read served logs` / DNS errors for a deleted pod name,
the worker likely wrote logs to ephemeral storage (missing config mount). Re-run
`install-k3s-airflow.ps1` or upgrade the platform-local chart so the pod template
ConfigMap is updated.

## Production / cloud (later)

When Airflow runs outside local-only dev, use remote logging (S3/GCS) or
Grafana Alloy → Grafana Cloud Loki — see `otel-collector-platform` stack. Not
required for local k3d.

## Helm upgrade

```powershell
.\airflow\k8s\scripts\helm-docker.ps1 upgrade --install platform-local airflow/k8s/chart/platform-local `
  -n knowledge-airflow -f airflow/k8s/chart/platform-local/values.yaml `
  -f airflow/k8s/chart/platform-local/values-rancher.yaml --wait

.\airflow\k8s\scripts\helm-docker.ps1 upgrade knowledge-airflow apache-airflow/airflow `
  --version 1.15.0 -n knowledge-airflow `
  -f airflow/k8s/helm/values-k3s.yaml `
  -f airflow/k8s/helm/values-rancher.yaml --wait
```
