# Install Feature 004 Airflow on local k3s (Rancher Desktop / WSL2 / k3d).
# Usage (from repo root):
#   .\airflow\k8s\scripts\install-k3s-airflow.ps1
#   .\airflow\k8s\scripts\bootstrap-k3d-dev.ps1   # includes k3d cluster + this install

param(
    [switch]$SkipAirflow,
    [string]$ReleaseName = "knowledge-airflow",
    [string]$Namespace = "knowledge-airflow"
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
Set-Location $RepoRoot

function Require-Command($Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command not found: $Name. See specs/004-k8s-airflow-executor/quickstart.md"
    }
}

function Invoke-Helm {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)
    & (Join-Path $PSScriptRoot "helm-docker.ps1") @Args
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Require-Command kubectl

Write-Host "==> Applying namespace and PVC"
kubectl apply -f airflow/k8s/manifests/namespace.yaml
kubectl apply -f airflow/k8s/manifests/xenova-cache-pvc.yaml
kubectl apply -f airflow/k8s/manifests/ingress-local.yaml

Write-Host "==> Ensuring Airflow log directory permissions (hostPath UID 50000)"
kubectl delete job airflow-logs-perms -n $Namespace --ignore-not-found 2>$null
kubectl apply -f airflow/k8s/manifests/airflow-logs-perms-job.yaml
kubectl wait --for=condition=complete job/airflow-logs-perms -n $Namespace --timeout=120s

if (-not (kubectl get secret knowledge-index-secrets -n $Namespace 2>$null)) {
    Write-Warning "Secret knowledge-index-secrets not found in $Namespace."
    Write-Warning "Create it from airflow/.env before running backfill (see quickstart §4)."
}

$PlatformChart = Join-Path $RepoRoot "airflow/k8s/chart/platform-local"
$RancherValues = Join-Path $PlatformChart "values-rancher.yaml"

Write-Host "==> Installing platform-local chart (pod template ConfigMap)"
Invoke-Helm upgrade --install platform-local $PlatformChart `
    -n $Namespace `
    -f (Join-Path $PlatformChart "values.yaml") `
    -f $RancherValues `
    --wait --timeout 2m

if ($SkipAirflow) {
    Write-Host "Skipping apache-airflow Helm install (-SkipAirflow)."
    exit 0
}

Write-Host "==> Adding apache-airflow Helm repo"
Invoke-Helm repo add apache-airflow https://airflow.apache.org 2>$null
Invoke-Helm repo update | Out-Null

Write-Host "==> Installing $ReleaseName (KubernetesExecutor)"
Invoke-Helm upgrade --install $ReleaseName apache-airflow/airflow `
    --version 1.15.0 `
    -n $Namespace `
    -f airflow/k8s/helm/values-k3s.yaml `
    -f airflow/k8s/helm/values-rancher.yaml `
    --wait --timeout 15m

& (Join-Path $PSScriptRoot "ensure-admin-user.ps1")

Write-Host ""
Write-Host "Done. Airflow UI (Traefik Ingress):"
Write-Host "  Open:          http://localhost:8080/home  (admin / admin)"
Write-Host "Smoke test:"
Write-Host "  .\airflow\k8s\scripts\smoke-dag.ps1"
