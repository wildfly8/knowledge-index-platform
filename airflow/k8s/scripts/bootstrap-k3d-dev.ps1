# Bootstrap local k3d cluster + Feature 004 Airflow install + SC-001 smoke.
# Usage (from repo root):
#   .\airflow\k8s\scripts\bootstrap-k3d-dev.ps1
#   .\airflow\k8s\scripts\bootstrap-k3d-dev.ps1 -SkipSmoke

param(
    [string]$ClusterName = "knowledge-airflow",
    [switch]$SkipSmoke,
    [switch]$SkipImageBuild,
    [switch]$RecreateCluster
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
Set-Location $RepoRoot

$K3dExe = Join-Path $PSScriptRoot ".tools\k3d.exe"
$K3dImage = "ghcr.io/k3d-io/k3d:5.8.3"

function Ensure-K3d {
    if (Get-Command k3d -ErrorAction SilentlyContinue) { return (Get-Command k3d).Source }
    if (Test-Path $K3dExe) { return $K3dExe }
    $toolsDir = Split-Path $K3dExe -Parent
    New-Item -ItemType Directory -Path $toolsDir -Force | Out-Null
    Write-Host "==> Downloading k3d to $K3dExe"
    Invoke-WebRequest -Uri "https://github.com/k3d-io/k3d/releases/download/v5.8.3/k3d-windows-amd64.exe" -OutFile $K3dExe
    return $K3dExe
}

function Invoke-K3d {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)
    $bin = Ensure-K3d
    & $bin @Args
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

function Set-K3dKubeconfig {
    param([string]$Name)
    $kubeDir = Join-Path $env:TEMP "k3d-$Name-kube"
    if (Test-Path $kubeDir) { Remove-Item $kubeDir -Recurse -Force }
    New-Item -ItemType Directory -Path $kubeDir -Force | Out-Null
    $kubeConfigPath = Join-Path $kubeDir "config.yaml"
    Invoke-K3d kubeconfig write $Name --output $kubeConfigPath
    (Get-Content $kubeConfigPath -Raw) `
        -replace 'host\.docker\.internal', '127.0.0.1' `
        -replace '0\.0\.0\.0', '127.0.0.1' |
        Set-Content $kubeConfigPath -NoNewline
    $env:KUBECONFIG = $kubeConfigPath
    kubectl config use-context "k3d-$Name" | Out-Null
    Write-Host "Using KUBECONFIG=$kubeConfigPath (context k3d-$Name)"
}

function Invoke-Kubectl {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)
    & kubectl @Args
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

function Invoke-Helm {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)
    & (Join-Path $PSScriptRoot "helm-docker.ps1") @Args
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

function Load-DotEnv($Path) {
    $vars = @{}
    if (-not (Test-Path $Path)) { return $vars }
    Get-Content $Path | ForEach-Object {
        if ($_ -match '^\s*([^#=]+)=(.*)$') {
            $vars[$matches[1].Trim()] = $matches[2].Trim().Trim('"')
        }
    }
    return $vars
}

Write-Host "==> Ensuring k3d cluster $ClusterName"
$existing = (& (Ensure-K3d) cluster list 2>&1 | Out-String) -match $ClusterName
if ($RecreateCluster -and $existing) {
    Invoke-K3d cluster delete $ClusterName
    $existing = $false
}
if (-not $existing) {
    Invoke-K3d cluster create $ClusterName `
        --agents 1 `
        --port 8080:80@loadbalancer `
        --volume "C:\my_projects\knowledge-index-platform:/mnt/c/my_projects/knowledge-index-platform@all" `
        --volume "C:\my_projects\agentic-foundation:/mnt/c/my_projects/agentic-foundation@all" `
        --volume "knowledge-airflow-logs:/var/lib/knowledge-airflow-logs@all" `
        --wait
}

Set-K3dKubeconfig $ClusterName
Invoke-Kubectl get nodes

Write-Host "==> Building worker image"
if (-not $SkipImageBuild) {
    docker build -t knowledge-index-airflow-worker:latest airflow
} else {
    Write-Host "(skipped docker build -SkipImageBuild; reusing local image tag)"
}
if (-not $existing) {
    Invoke-K3d image import knowledge-index-airflow-worker:latest -c $ClusterName
} elseif (-not $SkipImageBuild) {
    Invoke-K3d image import knowledge-index-airflow-worker:latest -c $ClusterName
}

Write-Host "==> Creating namespace, PVC, secrets, ingress"
Invoke-Kubectl apply -f airflow/k8s/manifests/namespace.yaml
Invoke-Kubectl apply -f airflow/k8s/manifests/xenova-cache-pvc.yaml
Invoke-Kubectl apply -f airflow/k8s/manifests/ingress-local.yaml

Write-Host "==> Ensuring Airflow log directory permissions (hostPath UID 50000)"
Invoke-Kubectl delete job airflow-logs-perms -n knowledge-airflow --ignore-not-found 2>$null
Invoke-Kubectl apply -f airflow/k8s/manifests/airflow-logs-perms-job.yaml
Invoke-Kubectl wait --for=condition=complete job/airflow-logs-perms -n knowledge-airflow --timeout=120s

$envFile = if (Test-Path "airflow/.env") { "airflow/.env" } else { ".env" }
$secrets = Load-DotEnv $envFile
if (-not $secrets["UPSTASH_VECTOR_REST_URL"] -or -not $secrets["UPSTASH_VECTOR_REST_TOKEN"]) {
    throw "Missing UPSTASH_VECTOR_REST_URL/TOKEN in $envFile"
}
kubectl create secret generic knowledge-index-secrets `
    -n knowledge-airflow `
    --from-literal=UPSTASH_VECTOR_REST_URL="$($secrets['UPSTASH_VECTOR_REST_URL'])" `
    --from-literal=UPSTASH_VECTOR_REST_TOKEN="$($secrets['UPSTASH_VECTOR_REST_TOKEN'])" `
    --dry-run=client -o yaml | kubectl apply -f -
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$PlatformChart = "airflow/k8s/chart/platform-local"
Write-Host "==> Installing platform-local chart"
Invoke-Helm upgrade --install platform-local $PlatformChart `
    -n knowledge-airflow `
    -f "$PlatformChart/values.yaml" `
    -f "$PlatformChart/values-rancher.yaml" `
    --wait --timeout 2m

Write-Host "==> Waiting for dev Postgres"
Invoke-Kubectl wait --for=condition=available deployment/knowledge-postgres -n knowledge-airflow --timeout=180s

Write-Host "==> Installing Apache Airflow"
Invoke-Helm repo add apache-airflow https://airflow.apache.org 2>$null
Invoke-Helm repo update | Out-Null
Invoke-Helm upgrade --install knowledge-airflow apache-airflow/airflow `
    --version 1.15.0 `
    -n knowledge-airflow `
    -f airflow/k8s/helm/values-k3s.yaml `
    -f airflow/k8s/helm/values-rancher.yaml `
    --wait=false

Write-Host "==> Running Airflow DB migrations"
kubectl delete job airflow-db-migrate -n knowledge-airflow --ignore-not-found 2>$null
$deadline = (Get-Date).AddSeconds(120)
while ((Get-Date) -lt $deadline) {
    if (kubectl get secret knowledge-airflow-metadata -n knowledge-airflow 2>$null) { break }
    Start-Sleep -Seconds 3
}
Invoke-Kubectl apply -f airflow/k8s/manifests/db-migrate-job.yaml
Invoke-Kubectl wait --for=condition=complete job/airflow-db-migrate -n knowledge-airflow --timeout=300s
Invoke-Kubectl delete job airflow-db-migrate -n knowledge-airflow --ignore-not-found 2>$null

Write-Host "==> Restarting Airflow control plane after migrations"
Invoke-Kubectl rollout restart deployment/knowledge-airflow-scheduler deployment/knowledge-airflow-webserver -n knowledge-airflow
Invoke-Kubectl delete pod knowledge-airflow-triggerer-0 -n knowledge-airflow --ignore-not-found 2>$null

Write-Host "==> Waiting for Airflow control plane"
Invoke-Kubectl wait --for=condition=ready pod -l component=scheduler -n knowledge-airflow --timeout=600s
Invoke-Kubectl wait --for=condition=ready pod -l component=webserver -n knowledge-airflow --timeout=300s

& (Join-Path $PSScriptRoot "ensure-admin-user.ps1")

if (-not $SkipSmoke) {
    & (Join-Path $PSScriptRoot "smoke-dag.ps1")
}

Write-Host "Bootstrap complete. UI:"
Write-Host "  Open:  http://localhost:8080/home  (admin / admin)"
