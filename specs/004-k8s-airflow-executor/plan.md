# Implementation Plan: Kubernetes Executor for Airflow (k3s)

**Branch**: `004-k8s-airflow-executor` | **Date**: 2026-07-22 | **Spec**: [spec.md](./spec.md)

Deploy Airflow 2.9.x with **KubernetesExecutor** on local **k3s**. Airflow
schedules Feature **002** `embed_archive_backfill`; each task runs in an
ephemeral worker pod executing `npm run embed:backfill`. Public contract
unchanged @ 3.0.0.

*Prerequisite: `spec.md` Approved; `npm test` and `npm run validate` green.*

## Summary

| Layer | Choice |
|-------|--------|
| Cluster | k3s (Rancher Desktop or WSL2) |
| Airflow install | Official **Helm chart** + `airflow/k8s/helm/values-k3s.yaml` |
| Worker pods | **KubernetesExecutor** + global **pod template** |
| DAG | Keep **BashOperator** (commands unchanged) |
| Worker image | `airflow/Dockerfile` → `knowledge-index-airflow-worker` |
| Secrets | K8s Secret `knowledge-index-secrets` (not in git) |

## Technical Context

**Language/Version**: Airflow 2.9.x (Python), Node 20 in task pods (TypeScript CLI)

**Primary Dependencies**: Apache Airflow Helm chart, k3s, kubectl, Helm 3

**Storage**: Upstash Vector (002 — unchanged); PVC `xenova-cache`; hostPath dev mounts

**Testing**: `npm test`; k3s smoke per [quickstart.md](./quickstart.md); DAG parse in Airflow UI

**Target Platform**: k3s local dev; portable to managed Kubernetes

**Corpus**: Producer checkout at `CORPUS_ROOT` → `/opt/agentic-foundation` in pods

## Constitution Check

- [x] `npm test` passed (no lib changes in plan phase)
- [x] `npm run validate` passed (no public contract change)
- [x] Single-writer split preserved — only 002 backfill in pods; `max_active_runs=1`
- [x] No auth/user/session scope introduced
- [x] Budget fail-closed unchanged (CLI in pods, Principle V)
- [x] k3s smoke gate — `bootstrap-k3d-dev.ps1` + `smoke-dag.ps1` verified on k3d (SC-001 pass; SC-003 pass via `-KillMidBatch`)

## Domain Alignment

| Entity (from spec) | `data-model.md` section | Implementation (tasks phase) | Contract |
|--------------------|-------------------------|------------------------------|----------|
| Airflow Control Plane | § Airflow Control Plane | `airflow/k8s/helm/values-k3s.yaml` | [k8s-airflow-deployment.md](./contracts/k8s-airflow-deployment.md) |
| DAG Definition | § DAG Definition | `airflow/dags/embed_archive_backfill.py` | Feature 002 spec |
| Kubernetes Task Pod | § Kubernetes Task Pod | `airflow/k8s/manifests/pod-template.yaml` | k8s-airflow-deployment.md |
| Workload Secret Bundle | § Workload Secret Bundle | `airflow/k8s/manifests/secrets.example.yaml` | k8s-airflow-deployment.md |
| Embedding Backfill Plan | (002 ref) | `lib/knowledge/backfill-*.ts` | public contract @ 3.0.0 |
| Backfill Batch Run | (002 ref) | `scripts/embed-posts/backfill.ts` | public contract @ 3.0.0 |

## Project Structure

```text
specs/004-k8s-airflow-executor/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/k8s-airflow-deployment.md

airflow/
├── Dockerfile
├── docker-compose.yml          # legacy — deprecate after k3s verified
├── dags/embed_archive_backfill.py
└── k8s/
    ├── README.md
    ├── docs/observability.md
    ├── helm/values-k3s.yaml
    ├── scripts/bootstrap-k3d-dev.ps1
    └── manifests/
        ├── namespace.yaml
        ├── ingress-local.yaml
        ├── secrets.example.yaml
        └── pod-template.yaml
```

## Phase 0: Research

See [research.md](./research.md) — Helm + pod template, BashOperator retained,
HPA scope, Windows k3s path, secrets model.

## Phase 1: Design

- [data-model.md](./data-model.md)
- [contracts/k8s-airflow-deployment.md](./contracts/k8s-airflow-deployment.md)
- [quickstart.md](./quickstart.md)
- Helm/manifest stubs under `airflow/k8s/` (design artifacts for implement)

## Phase 2: Tasks

Generate via `/speckit-tasks` — expected work:

1. Finalize `values-k3s.yaml` and pod template for Rancher Desktop paths
2. Build/push worker image; document `docker build` in quickstart
3. Wire `podTemplateFile` in Helm values
4. Apply secrets + namespace; Helm install smoke
5. Optional initContainer `npm ci` in pod template
6. Deprecate Compose in `airflow/README.md` after k3s green
7. Constitution gate: document k3s smoke in quality gates

## Risks

| Risk | Mitigation |
|------|------------|
| Windows hostPath paths differ | Document Rancher Desktop file sharing paths in quickstart |
| Cold `npm ci` exceeds NFR-001 | PVC for `node_modules` or bake deps in image |
| OOM on Xenova embed | 4–6Gi memory limits on `run_budgeted_batch` pod template |
| Parallel DAG runs | `max_active_runs=1` + scheduler parallelism caps |

## Out of Scope (plan)

- `KubernetesPodOperator` per-task migration (unnecessary with pod template)
- Query API on k8s (Feature 003 stays `npm run serve`)
- Public contract semver bump
