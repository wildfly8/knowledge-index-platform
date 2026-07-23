[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [string]$CloudRunUri,
  [Parameter(Mandatory)]
  [string]$RetrieveApiSecret,
  [string]$Query = 'what is catamorphism',
  [int]$TimeoutSec = 180
)

$ErrorActionPreference = 'Stop'

$base = $CloudRunUri.TrimEnd('/')
Write-Host "Cloud Run query API E2E: $base"

function Invoke-Api {
  param(
    [string]$Method,
    [string]$Path,
    [object]$Body = $null,
    [switch]$NoAuth
  )
  $headers = @{ Accept = 'application/json' }
  if (-not $NoAuth) {
    $headers['Authorization'] = "Bearer $RetrieveApiSecret"
  }
  $uri = "$base$Path"
  if ($Body -ne $null) {
    return Invoke-RestMethod -Uri $uri -Method $Method -Headers $headers `
      -ContentType 'application/json' -Body ($Body | ConvertTo-Json) -TimeoutSec $TimeoutSec
  }
  return Invoke-RestMethod -Uri $uri -Method $Method -Headers $headers -TimeoutSec $TimeoutSec
}

$health = Invoke-Api -Method GET -Path '/health' -NoAuth
if (-not $health.ok) { throw '/health did not return ok: true' }
Write-Host '  /health OK'

$status = Invoke-Api -Method GET -Path '/v1/status'
if (-not $status.index_status) { throw '/v1/status missing index_status' }
Write-Host "  /v1/status OK (index_status=$($status.index_status))"

try {
  $retrieve = Invoke-Api -Method POST -Path '/v1/retrieve' -Body @{
    query  = $Query
    top_k  = 2
    rerank = $false
  }
  if (-not $retrieve.chunks) { throw '/v1/retrieve missing chunks array' }
  Write-Host "  /v1/retrieve OK ($($retrieve.chunks.Count) chunks)"
}
catch {
  if ($_.Exception.Response.StatusCode.value__ -eq 503) {
    Write-Host '  /v1/retrieve 503 (index unavailable) — accepted for empty dev index'
  }
  else {
    throw
  }
}

Write-Host 'Cloud Run query API E2E passed.'
