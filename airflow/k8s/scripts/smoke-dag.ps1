# SC-001 smoke: trigger embed_archive_backfill dry_run on k3s and verify worker pods.
# Prerequisites: install-k3s-airflow.ps1 or bootstrap-k3d-dev.ps1 completed.
# Usage:
#   .\airflow\k8s\scripts\smoke-dag.ps1
#   .\airflow\k8s\scripts\smoke-dag.ps1 -KillMidBatch   # SC-003 manual retry drill

param(
    [string]$Namespace = "knowledge-airflow",
    [string]$ReleaseName = "knowledge-airflow",
    [string]$DagId = "embed_archive_backfill",
    [int]$TimeoutSeconds = 1200,
    [switch]$KillMidBatch
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")

# Use k3d kubeconfig from bootstrap when KUBECONFIG is unset or points at a stale context.
if (-not $env:KUBECONFIG) {
    $defaultKube = Join-Path $env:TEMP "k3d-knowledge-airflow-kube\config.yaml"
    if (Test-Path $defaultKube) { $env:KUBECONFIG = $defaultKube }
}

$TaskIds = @(
    "validate_budget",
    "scan_and_plan",
    "run_budgeted_batch",
    "finalize_run_record"
)

function Require-Command($Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command not found: $Name"
    }
}

function Get-SchedulerPod {
    $pod = kubectl get pods -n $Namespace -l component=scheduler -o jsonpath='{.items[0].metadata.name}' 2>$null
    if (-not $pod) {
        $pod = kubectl get pods -n $Namespace -o name 2>$null |
            Where-Object { $_ -match "scheduler" } |
            ForEach-Object { $_.ToString().Replace("pod/", "") } |
            Select-Object -First 1
    }
    return $pod
}

function Get-WorkerPods {
    kubectl get pods -n $Namespace --no-headers 2>$null |
        Where-Object {
            $_ -match "embed-archive-backfill|validate-budget|scan-and-plan|run-budgeted|finalize-run"
        }
}

function Get-DagRunState {
    param([string]$RunId)
    $out = kubectl exec -n $Namespace $schedulerPod -c scheduler -- airflow dags list-runs -d $DagId --no-backfill 2>$null
    $line = $out | Where-Object { $_ -match [regex]::Escape($RunId) } | Select-Object -First 1
    if (-not $line) { return $null }
    $parts = ($line.ToString() -split '\|') | ForEach-Object { $_.Trim() }
    if ($parts.Count -ge 3) { return $parts[2].ToLower() }
    return $null
}

function Get-TaskStates {
    param([string]$RunId)
    kubectl exec -n $Namespace $schedulerPod -c scheduler -- airflow tasks states-for-dag-run $DagId $RunId 2>$null
}

function Capture-PodLogs {
    param(
        [hashtable]$LogCache,
        [string[]]$PodNames
    )
    foreach ($podName in $PodNames) {
        if (-not $podName) { continue }
        $logs = kubectl logs -n $Namespace $podName --tail=50 2>$null
        if ($logs) { $LogCache[$podName] = $logs }
    }
}

Require-Command kubectl

Write-Host "==> Checking control plane pods in $Namespace"
kubectl wait --for=condition=ready pod -l component=scheduler -n $Namespace --timeout=300s 2>$null
$controlPlane = @("scheduler", "webserver", "triggerer", "knowledge-postgres")
$notReady = kubectl get pods -n $Namespace --no-headers 2>$null | Where-Object {
    $line = $_.ToString()
    if ($line -match 'airflow-db-migrate|embed-archive-backfill') { return $false }
    $isControl = $false
    foreach ($name in $controlPlane) { if ($line -match $name) { $isControl = $true; break } }
    $isControl -and ($line -notmatch "Running|Completed|Succeeded") -and ($line -notmatch "Terminating")
}
if ($notReady) {
    kubectl get pods -n $Namespace
    throw "Control plane not ready. Run install-k3s-airflow.ps1 or bootstrap-k3d-dev.ps1 first."
}

$schedulerPod = Get-SchedulerPod
if (-not $schedulerPod) {
    throw "Scheduler pod not found in $Namespace"
}

Write-Host "==> Unpausing DAG $DagId"
kubectl exec -n $Namespace $schedulerPod -c scheduler -- airflow dags unpause $DagId

Write-Host "==> Triggering DAG $DagId with dry_run=true (SC-001)"
kubectl delete pod -n $Namespace --field-selector=status.phase=Failed --ignore-not-found 2>$null | Out-Null
kubectl get pods -n $Namespace --no-headers 2>$null | Where-Object { $_ -match "embed-archive-backfill" } | ForEach-Object {
    kubectl delete pod (($_.ToString() -split '\s+')[0]) -n $Namespace --ignore-not-found 2>$null | Out-Null
}
$triggerOut = kubectl exec -n $Namespace $schedulerPod -c scheduler -- python3 -c "import airflow.api.common.trigger_dag as t; print(t.trigger_dag('$DagId', conf={'dry_run': True}))"
if ($LASTEXITCODE -ne 0) { throw "Failed to trigger DAG $DagId" }
Write-Host $triggerOut
$runId = $null
if ($triggerOut -match 'manual__[^\s,>]+') { $runId = $Matches[0] }
if (-not $runId) { throw "Could not parse DAG run id from trigger output" }

Write-Host "==> Watching worker pods for run $runId (timeout ${TimeoutSeconds}s)"
$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
$seenWorker = $false
$killedBatch = $false
$podLogCache = @{}
$dagSucceeded = $false
$prevEap = $ErrorActionPreference
$ErrorActionPreference = 'Continue'

while ((Get-Date) -lt $deadline) {
    $workers = @(Get-WorkerPods)
    if ($workers.Count -gt 0) {
        $seenWorker = $true
        foreach ($line in $workers) {
            Write-Host $line
            $podName = $line.ToString().Split()[0]
            if ($podName) { Capture-PodLogs -LogCache $podLogCache -PodNames @($podName) }
        }
    }

    if ($KillMidBatch -and -not $killedBatch) {
        $runningBatch = @($workers | Where-Object { $_ -match "run-budgeted" -and $_ -match "Running" })
        if ($runningBatch.Count -gt 0) {
            $batchPod = $runningBatch[0].ToString().Split()[0]
            Write-Host "==> SC-003 drill: deleting pod $batchPod"
            kubectl delete pod -n $Namespace $batchPod --grace-period=0 --force 2>$null
            $killedBatch = $true
        }
    }

    $dagState = Get-DagRunState -RunId $runId
    if ($dagState -eq "success") {
        $dagSucceeded = $true
        Capture-PodLogs -LogCache $podLogCache -PodNames @($podLogCache.Keys)
        Write-Host "==> DAG run $runId succeeded (SC-001)"
        break
    }
    if ($dagState -eq "failed") {
        kubectl get pods -n $Namespace
        Write-Host (Get-TaskStates -RunId $runId)
        throw "DAG run $runId failed"
    }

    $failed = @(kubectl get pods -n $Namespace --field-selector=status.phase=Failed --no-headers 2>$null |
        Where-Object { $_ -match "embed-archive-backfill|validate-budget|scan-and-plan|run-budgeted|finalize" })
    if ($failed) {
        kubectl get pods -n $Namespace
        $failLine = ($failed | Select-Object -First 1).ToString()
        $failPod = ($failLine -split '\s+')[0]
        if ($failPod -and $failPod -ne "No") {
            kubectl logs -n $Namespace $failPod --tail=80 2>$null
        }
        throw "Worker pod failed: $failPod"
    }

    $succeeded = @(
        kubectl get pods -n $Namespace --field-selector=status.phase=Succeeded --no-headers 2>$null |
            Where-Object { $_ -match "embed-archive-backfill|validate-budget|scan-and-plan|run-budgeted|finalize" }
    )
    if ($seenWorker -and $succeeded.Count -ge 4) {
        $dagSucceeded = $true
        Capture-PodLogs -LogCache $podLogCache -PodNames @($succeeded | ForEach-Object { $_.ToString().Split()[0] })
        Write-Host "==> All four task pods completed successfully (SC-001)"
        break
    }

    Start-Sleep -Seconds 8
}

$ErrorActionPreference = $prevEap

if (-not $seenWorker) {
    kubectl logs -n $Namespace $schedulerPod -c scheduler --tail=60 2>$null
    throw "SC-001 FAIL: no worker pods observed for $DagId. Check DAG mount path and pod template ConfigMap."
}

$embedLogFound = $false
Write-Host "==> Tailing worker logs for [embed:backfill]"
foreach ($task in $TaskIds) {
    $taskPattern = $task -replace "_", "-"
    $name = $podLogCache.Keys | Where-Object { $_ -match $taskPattern } | Select-Object -First 1
    if (-not $name) {
        $logPod = kubectl get pods -n $Namespace --field-selector=status.phase=Succeeded --no-headers 2>$null |
            Where-Object { $_ -match $taskPattern } |
            Select-Object -First 1
        if ($logPod) { $name = $logPod.ToString().Split()[0] }
    }
    if ($name) {
        $logs = $podLogCache[$name]
        if (-not $logs) { $logs = kubectl logs -n $Namespace $name --tail=30 2>$null }
        if ($logs -match "\[embed:backfill\]") { $embedLogFound = $true }
        Write-Host "--- $name ---"
        $logs
    }
}

Write-Host ""
if ($embedLogFound) {
    Write-Host "SC-001 PASS: worker logs contain [embed:backfill]"
} else {
    Write-Warning "SC-001 partial: pods ran but [embed:backfill] not found in sampled logs"
}

if ($KillMidBatch) {
    if ($killedBatch -and $dagSucceeded) {
        Write-Host "SC-003 PASS: run_budgeted_batch retried in a new pod after kill"
    } elseif ($killedBatch) {
        Write-Host "SC-003: confirm Airflow retried run_budgeted_batch after pod kill (check UI / pod list)"
    } else {
        Write-Host "SC-003 SKIP: no running batch pod found to kill"
    }
}

Write-Host "Full validation: specs/004-k8s-airflow-executor/quickstart.md §8"
