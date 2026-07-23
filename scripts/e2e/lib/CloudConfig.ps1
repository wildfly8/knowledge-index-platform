function Get-TfvarValue([string]$Path, [string]$Name) {
  if (-not (Test-Path $Path)) { return $null }
  $line = Select-String -LiteralPath $Path -Pattern "^\s*$Name\s*=" | Select-Object -First 1
  if (-not $line) { return $null }
  return ($line.Line -replace "^\s*$Name\s*=\s*", '').Trim().Trim('"')
}

function Get-TerraformOutput([string]$Dir, [string]$Name) {
  if (-not (Test-Path $Dir)) { return $null }
  Push-Location $Dir
  try {
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'SilentlyContinue'
    $raw = terraform output -raw $Name 2>$null
    $ErrorActionPreference = $prev
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($raw)) { return $null }
    return $raw.Trim()
  }
  finally {
    Pop-Location
  }
}

function Resolve-CloudE2EConfig {
  param(
    [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')),
    [string]$OtelRepoRoot = (Join-Path (Split-Path $RepoRoot -Parent) 'otel-collector-platform')
  )

  $gcpDir = Join-Path $RepoRoot 'infra\gcp'
  $gcpTfvars = Join-Path $gcpDir 'terraform.tfvars'
  $otelTfvars = Join-Path $OtelRepoRoot 'infra\gcp\terraform.tfvars'

  $config = [ordered]@{
    CloudRunUri         = $env:CLOUD_RUN_URI
    RetrieveApiSecret   = $env:KNOWLEDGE_RETRIEVE_API_SECRET
  }

  if ([string]::IsNullOrWhiteSpace($config.CloudRunUri)) {
    $config.CloudRunUri = Get-TerraformOutput $gcpDir 'cloud_run_uri'
  }
  if ([string]::IsNullOrWhiteSpace($config.RetrieveApiSecret)) {
    $config.RetrieveApiSecret = Get-TfvarValue $gcpTfvars 'retrieve_api_secret'
  }
  if ([string]::IsNullOrWhiteSpace($config.RetrieveApiSecret)) {
    $config.RetrieveApiSecret = $env:RETRIEVE_API_SECRET
  }

  $config.OtelProjectId = Get-TfvarValue $otelTfvars 'project_id'
  $config.LocalProjectId = Get-TfvarValue $gcpTfvars 'project_id'

  return [pscustomobject]$config
}

function Test-CloudE2EConfig([pscustomobject]$Config) {
  $missing = @()
  if ([string]::IsNullOrWhiteSpace($Config.CloudRunUri)) { $missing += 'CloudRunUri' }
  if ([string]::IsNullOrWhiteSpace($Config.RetrieveApiSecret)) { $missing += 'RetrieveApiSecret' }
  elseif ($Config.RetrieveApiSecret.Length -lt 32) { $missing += 'RetrieveApiSecret(minLength32)' }
  if ($missing.Count -gt 0) {
    throw ("Missing cloud E2E configuration: {0}. Set env vars or apply infra/gcp runtime." -f ($missing -join ', '))
  }
}
