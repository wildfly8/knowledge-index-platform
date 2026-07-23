# Deprecated: use Traefik Ingress instead (no terminal to keep open).
#   Open: http://localhost:8080/home  (admin / admin)
# Apply: kubectl apply -f airflow/k8s/manifests/ingress-local.yaml
#
# Legacy port-forward (only if Ingress is unavailable):
#   kubectl port-forward svc/knowledge-airflow-webserver 8080:8080 -n knowledge-airflow

param(
    [string]$Namespace = "knowledge-airflow",
    [int]$LocalPort = 8080,
    [switch]$UsePortForward
)

$ErrorActionPreference = "Stop"

if (-not $env:KUBECONFIG) {
    $defaultKube = Join-Path $env:TEMP "k3d-knowledge-airflow-kube\config.yaml"
    if (Test-Path $defaultKube) { $env:KUBECONFIG = $defaultKube }
}

if (-not $UsePortForward) {
    Write-Host "Airflow UI (Ingress): http://localhost:8080/home"
    Write-Host "Login: admin / admin"
    Write-Host ""
    Write-Host "To use legacy port-forward instead:  .\port-forward-airflow.ps1 -UsePortForward"
    exit 0
}

Write-Host "==> Legacy port-forward: http://localhost:$LocalPort/home (admin / admin)"
Write-Host "==> Press Ctrl+C to stop"
kubectl port-forward "svc/knowledge-airflow-webserver" "${LocalPort}:8080" -n $Namespace
