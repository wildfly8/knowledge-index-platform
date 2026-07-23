# Airflow — Feature 002 / 004 operator orchestration

**Default path (Feature 004)**: KubernetesExecutor on local **k3s** — one pod per DAG task.

| Path | When to use |
|------|-------------|
| [k8s/](./k8s/README.md) | **Recommended** — Rancher Desktop or WSL2 k3s |
| [docker-compose.yml](./docker-compose.yml) | **Deprecated** — legacy standalone smoke only |

## Quick start (k3s)

**No cluster yet (Docker Desktop):**

```powershell
.\airflow\k8s\scripts\bootstrap-k3d-dev.ps1
```

Reset cluster with latest configs:

```powershell
.\airflow\k8s\scripts\bootstrap-k3d-dev.ps1 -RecreateCluster
```

UI after bootstrap: **http://localhost:8080/home** (`admin` / `admin`)

**Existing Rancher Desktop / k3s:**

Full guide: [specs/004-k8s-airflow-executor/quickstart.md](../specs/004-k8s-airflow-executor/quickstart.md)

Tune Windows host paths: [k8s/hostpaths.example.yaml](./k8s/hostpaths.example.yaml)

## DAG

- `dags/embed_archive_backfill.py` — daily archive backfill (Feature 002)
- Trigger dry run: conf `{"dry_run": true}`

## Legacy Docker Compose (deprecated)

`docker-compose.yml` remains for emergency local smoke until you have k3s. It runs all tasks **in-process** inside one container (not pod-per-task). Prefer k3s for parity with production topology.

```powershell
cd airflow
docker compose up -d   # legacy only
```
