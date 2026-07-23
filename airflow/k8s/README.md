# Airflow on Kubernetes (Feature 004)

Operator path for **KubernetesExecutor** on local **k3s**.

| Artifact | Purpose |
|----------|---------|
| [chart/platform-local/](./chart/platform-local/) | Helm chart — **pod template ConfigMap** (`knowledge-airflow-pod-template`) |
| [helm/values-k3s.yaml](./helm/values-k3s.yaml) | Base overlay for `apache-airflow/airflow` |
| [helm/values-rancher.yaml](./helm/values-rancher.yaml) | Rancher/k3d hostPath overlay (DAGs, shared logs, pod template mount) |
| [hostpaths.example.yaml](./hostpaths.example.yaml) | Path tuning reference (Windows `/mnt/c/...`) |
| [manifests/pod-template.yaml](./manifests/pod-template.yaml) | Reference copy of worker pod spec (SSOT: chart template) |
| [manifests/ingress-local.yaml](./manifests/ingress-local.yaml) | Traefik Ingress — `http://localhost:8080` |
| [manifests/namespace.yaml](./manifests/namespace.yaml) | `knowledge-airflow` namespace |
| [manifests/xenova-cache-pvc.yaml](./manifests/xenova-cache-pvc.yaml) | Xenova ONNX cache PVC |
| [manifests/airflow-logs-perms-job.yaml](./manifests/airflow-logs-perms-job.yaml) | One-shot chown for shared log hostPath (UID 50000) |
| [manifests/db-migrate-job.yaml](./manifests/db-migrate-job.yaml) | Airflow DB migrations (Helm hooks disabled) |
| [manifests/secrets.example.yaml](./manifests/secrets.example.yaml) | Secret template (do not commit values) |
| [manifests/hpa-scheduler-notes.md](./manifests/hpa-scheduler-notes.md) | HPA / parallelism scope (US3) |
| [docs/observability.md](./docs/observability.md) | Shared task logs, k3d named volume |
| [scripts/bootstrap-k3d-dev.ps1](./scripts/bootstrap-k3d-dev.ps1) | Full k3d dev bootstrap (cluster + install + smoke) |
| [scripts/install-k3s-airflow.ps1](./scripts/install-k3s-airflow.ps1) | Install into existing k3s/Rancher cluster |
| [scripts/ensure-admin-user.ps1](./scripts/ensure-admin-user.ps1) | Create `admin`/`admin` when Helm create-user job skipped |
| [scripts/smoke-dag.ps1](./scripts/smoke-dag.ps1) | SC-001 dry-run smoke |
| [scripts/port-forward-airflow.ps1](./scripts/port-forward-airflow.ps1) | Prints Ingress URL (legacy `-UsePortForward` optional) |

**Quickstart**: [specs/004-k8s-airflow-executor/quickstart.md](../../specs/004-k8s-airflow-executor/quickstart.md)

**Design contract**: [specs/004-k8s-airflow-executor/contracts/k8s-airflow-deployment.md](../../specs/004-k8s-airflow-executor/contracts/k8s-airflow-deployment.md)

## Install (summary)

**Existing k3s / Rancher Desktop:**

```powershell
.\airflow\k8s\scripts\install-k3s-airflow.ps1
.\airflow\k8s\scripts\smoke-dag.ps1
```

**No cluster yet (Docker Desktop + k3d):**

```powershell
.\airflow\k8s\scripts\bootstrap-k3d-dev.ps1
```

**Reset local k3d cluster** (pick up latest manifests/values):

```powershell
.\airflow\k8s\scripts\bootstrap-k3d-dev.ps1 -RecreateCluster
```

Install order:

1. `kubectl apply` namespace, PVC, ingress, log-perms job
2. `helm upgrade --install platform-local` → ConfigMap with `pod-template.yaml`
3. `helm upgrade --install knowledge-airflow apache-airflow/airflow` with `values-k3s.yaml` + `values-rancher.yaml`
4. DB migrate job → restart control plane → `ensure-admin-user.ps1`

**UI**: `http://localhost:8080/home` (`admin` / `admin`) via k3d Traefik LoadBalancer (`8080→80`).

**Scheduled backfill**: `embed_archive_backfill` runs at **01:00 UTC** daily with real writes. Manual smoke uses `{"dry_run": true}` only.

Legacy Docker Compose is **deprecated** — see [../README.md](../README.md).
