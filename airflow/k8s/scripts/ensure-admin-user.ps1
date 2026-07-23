# Ensure dev admin user exists (createUserJob may not run on helm install --wait=false).
param(
    [string]$Namespace = "knowledge-airflow"
)

$ErrorActionPreference = "Stop"

if (-not $env:KUBECONFIG) {
    $defaultKube = Join-Path $env:TEMP "k3d-knowledge-airflow-kube\config.yaml"
    if (Test-Path $defaultKube) { $env:KUBECONFIG = $defaultKube }
}

$sched = kubectl get pods -n $Namespace -l component=scheduler -o jsonpath='{.items[0].metadata.name}' 2>$null
if (-not $sched) { throw "Scheduler pod not found in $Namespace" }

kubectl wait --for=condition=ready pod -l component=scheduler -n $Namespace --timeout=300s | Out-Null
$users = kubectl exec -n $Namespace $sched -c scheduler -- airflow users list 2>&1 | Out-String
if ($users -match 'No data found') {
    Write-Host "==> Creating admin user (admin / admin)"
    kubectl exec -n $Namespace $sched -c scheduler -- airflow users create `
        --username admin --password admin `
        --firstname Admin --lastname User `
        --role Admin --email admin@example.com | Out-Null
} else {
    Write-Host "==> Admin user already exists"
}
