# Quickstart: Kubernetes Airflow on k3s (Feature 004)

**Feature**: 004-k8s-airflow-executor

Prerequisites: Feature **002** CLI works locally (`npm run embed:backfill -- --dry-run`).
Design: [contracts/k8s-airflow-deployment.md](./contracts/k8s-airflow-deployment.md).

## 1. Install k3s (Windows)

**Option A — Rancher Desktop (recommended)**

1. Install [Rancher Desktop](https://rancherdesktop.io/) → Kubernetes settings → **k3s**
2. Enable file sharing for `C:\my_projects`
3. Verify: `kubectl get nodes`

**Option B — k3d via Docker Desktop (dev smoke, no Rancher)**

From repo root (downloads k3d/helm into `airflow/k8s/scripts/.tools/` on first run):

```powershell
.\airflow\k8s\scripts\bootstrap-k3d-dev.ps1
```

Use `-RecreateCluster` to reset the local cluster; `-SkipImageBuild` on repeat runs.

**Option C — WSL2**

```bash
curl -sfL https://get.k3s.io | sh -
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
kubectl get nodes
```

## 2. Install Helm

```powershell
choco install kubernetes-helm
# or: winget install Helm.Helm
helm version
```

## 3. Build worker image

```powershell
cd C:\my_projects\knowledge-index-platform\airflow
docker build -t knowledge-index-airflow-worker:latest .
# Import into k3s if not using Docker Desktop integration:
# k3s ctr images import <(docker save knowledge-index-airflow-worker:latest)
```

On Rancher Desktop, built images are usually visible to k3s automatically.

## 4. Create namespace and secrets

```powershell
cd C:\my_projects\knowledge-index-platform
kubectl apply -f airflow/k8s/manifests/namespace.yaml
kubectl apply -f airflow/k8s/manifests/xenova-cache-pvc.yaml

# Copy template, fill values from airflow/.env (never commit)
Copy-Item airflow/k8s/manifests/secrets.example.yaml airflow/k8s/manifests/secrets.local.yaml
# Edit secrets.local.yaml — set UPSTASH_VECTOR_* base64 or use kubectl create secret:

kubectl create secret generic knowledge-index-secrets `
  -n knowledge-airflow `
  --from-literal=UPSTASH_VECTOR_REST_URL="$env:UPSTASH_VECTOR_REST_URL" `
  --from-literal=UPSTASH_VECTOR_REST_TOKEN="$env:UPSTASH_VECTOR_REST_TOKEN" `
  --dry-run=client -o yaml | kubectl apply -f -
```

## 5. Adjust host paths (if needed)

Tune paths for your workstation — see [airflow/k8s/hostpaths.example.yaml](../../../airflow/k8s/hostpaths.example.yaml).

Edit **both**:

1. `airflow/k8s/chart/platform-local/values-rancher.yaml` — task pod `hostPath` (platform + corpus)
2. `airflow/k8s/helm/values-rancher.yaml` — scheduler DAG `hostPath`

Rancher Desktop requires `/mnt/c/my_projects/...` inside manifests (enable file sharing for `C:\my_projects`).

## 6. Install Airflow (Helm)

Install the **platform-local** chart first (pod template ConfigMap), then Apache Airflow:

```powershell
cd C:\my_projects\knowledge-index-platform

# One-shot (recommended)
.\airflow\k8s\scripts\install-k3s-airflow.ps1

# Or manually:
kubectl apply -f airflow/k8s/manifests/namespace.yaml
kubectl apply -f airflow/k8s/manifests/xenova-cache-pvc.yaml

helm upgrade --install platform-local airflow/k8s/chart/platform-local `
  -n knowledge-airflow `
  -f airflow/k8s/chart/platform-local/values.yaml `
  -f airflow/k8s/chart/platform-local/values-rancher.yaml

helm repo add apache-airflow https://airflow.apache.org
helm repo update

helm upgrade --install knowledge-airflow apache-airflow/airflow `
  -n knowledge-airflow `
  -f airflow/k8s/helm/values-k3s.yaml `
  -f airflow/k8s/helm/values-rancher.yaml `
  --wait --timeout 10m
```

## 7. Access UI

k3d/k3s ships **Traefik** as the ingress controller. Apply the local Ingress rule:

```powershell
kubectl apply -f airflow/k8s/manifests/ingress-local.yaml
```

Open **http://localhost:8080/home** — login `admin` / `admin` (dev default in `values-k3s.yaml`).

k3d maps host port **8080** to Traefik; bootstrap does this on new clusters.

Legacy port-forward (optional):

```powershell
.\airflow\k8s\scripts\port-forward-airflow.ps1 -UsePortForward
```

## 8. Smoke test

```powershell
.\airflow\k8s\scripts\smoke-dag.ps1
```

Manual checks:

1. **DAG visible**: `embed_archive_backfill` in UI (unpaused)
2. **Trigger** with conf `{"dry_run": true}`:
   ```json
   {"dry_run": true}
   ```
3. **Watch pods**:
   ```powershell
   kubectl get pods -n knowledge-airflow -w
   ```
   Expect one short-lived pod per task (`validate_budget`, `scan_and_plan`, …).
4. **Logs**:
   ```powershell
   kubectl logs -n knowledge-airflow -l airflow-worker -f
   ```
   Look for `[embed:backfill]` output matching Compose runs.

### SC-003 (optional): kill mid-batch retry

```powershell
.\airflow\k8s\scripts\smoke-dag.ps1 -KillMidBatch
```

Verify Airflow retries `run_budgeted_batch` in a **new** pod and the backfill cursor did not corrupt (BF06 resume).

## 9. Live backfill (optional)

Trigger without `dry_run` only when Upstash quota allows. Keep `max_active_runs=1`.

**Scheduled runs** (`0 1 * * *` UTC) always execute real writes — they do not inherit manual `dry_run` conf. Pause the DAG in the UI during dev if you only want dry-run smoke tests.

## 10. Validation gates

```powershell
cd C:\my_projects\knowledge-index-platform
npm test
npm run validate
```

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Pod `Pending` | `kubectl describe pod` — hostPath / image pull |
| `EACCES` on Xenova cache | PVC mounted at `/opt/airflow/xenova-cache`, `TRANSFORMERS_CACHE` set |
| OOMKilled | Increase memory limit in pod template (≥ 4Gi) |
| 401 / missing Upstash | Secret `knowledge-index-secrets` keys |
| DAG not listed | `kubectl logs deploy/knowledge-airflow-scheduler` — DAG mount path |
| Task log "Could not read served logs" / DNS error on worker pod name | Shared logs volume missing on webserver/workers or worker pod missing `airflow.cfg` mount — see [airflow/k8s/docs/observability.md](../../../airflow/k8s/docs/observability.md). Re-run `install-k3s-airflow.ps1` or `bootstrap-k3d-dev.ps1 -RecreateCluster` |
| `admin`/`admin` login fails on fresh cluster | Run `.\airflow\k8s\scripts\ensure-admin-user.ps1` or re-bootstrap |

## Legacy Compose

`airflow/docker-compose.yml` is **deprecated** (see [airflow/README.md](../../../airflow/README.md)). Use k3s as the default operator path. Compose remains available for emergency local smoke only:

```powershell
cd airflow
docker compose up -d
```
