[CmdletBinding()]
param(
  [ValidateSet('check', 'foundation', 'image', 'runtime', 'e2e-cloud', 'all')]
  [string]$Phase = 'check',
  [switch]$PlanOnly,
  [string]$OtelRepoRoot = ''
)

$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
if ([string]::IsNullOrWhiteSpace($OtelRepoRoot)) {
  $OtelRepoRoot = Join-Path (Split-Path $root -Parent) 'otel-collector-platform'
}
$gcpDir = Join-Path $root 'infra\gcp'
$gcpTfvars = Join-Path $gcpDir 'terraform.tfvars'
$otelGcpTfvars = Join-Path $OtelRepoRoot 'infra\gcp\terraform.tfvars'
$imageTag = '0.1.1'

function Test-Placeholder([string]$Value) {
  return [string]::IsNullOrWhiteSpace($Value) -or $Value -match '^(REPLACE_|your-|replace-with|$)'
}

function Get-Tfvar([string]$Path, [string]$Name) {
  if (-not (Test-Path $Path)) { return $null }
  $line = Select-String -LiteralPath $Path -Pattern "^\s*$Name\s*=" | Select-Object -First 1
  if (-not $line) { return $null }
  return ($line.Line -replace "^\s*$Name\s*=\s*", '').Trim().Trim('"')
}

function Load-DotEnv([string]$Path) {
  $vars = @{}
  if (-not (Test-Path $Path)) { return $vars }
  Get-Content $Path | ForEach-Object {
    if ($_ -match '^\s*([^#=]+)=(.*)$') {
      $vars[$matches[1].Trim()] = $matches[2].Trim().Trim('"')
    }
  }
  return $vars
}

function Ensure-Tfvars {
  if (Test-Path $gcpTfvars) { return }

  $project = $null
  $region = 'us-central1'
  if (Test-Path $otelGcpTfvars) {
    $project = Get-Tfvar $otelGcpTfvars 'project_id'
    $region = Get-Tfvar $otelGcpTfvars 'region'
    if ([string]::IsNullOrWhiteSpace($region)) { $region = 'us-central1' }
    Write-Host "Seeding terraform.tfvars from otel repo: $otelGcpTfvars"
  }

  $envFile = if (Test-Path (Join-Path $root '.env')) { Join-Path $root '.env' } else { $null }
  $dot = if ($envFile) { Load-DotEnv $envFile } else { @{} }

  $retrieveSecret = $dot['KNOWLEDGE_RETRIEVE_API_SECRET']
  if ([string]::IsNullOrWhiteSpace($retrieveSecret)) {
    $retrieveSecret = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 48 | ForEach-Object { [char]$_ })
  }

  if (Test-Placeholder $project) { $project = 'REPLACE_WITH_GCP_PROJECT_ID' }

  @"
# Local only — gitignored. project_id/region seeded from otel-collector-platform when possible.
project_id = "$project"
region     = "$region"
enable_foundation = false
enable_runtime    = false
service_name      = "knowledge-query-api"
query_image       = ""

upstash_vector_rest_url   = "$($dot['UPSTASH_VECTOR_REST_URL'])"
upstash_vector_rest_token = "$($dot['UPSTASH_VECTOR_REST_TOKEN'])"
retrieve_api_secret       = "$retrieveSecret"
"@ | Set-Content -LiteralPath $gcpTfvars -Encoding utf8
  Write-Host "Created $gcpTfvars"
}

function Invoke-Terraform([string]$Dir, [string[]]$ExtraArgs) {
  Push-Location $Dir
  try {
    terraform init -input=false | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "terraform init failed in $Dir" }
    & terraform @ExtraArgs
    if ($LASTEXITCODE -ne 0) { throw "terraform $($ExtraArgs -join ' ') failed in $Dir" }
  }
  finally {
    Pop-Location
  }
}

function Invoke-Check {
  Ensure-Tfvars
  foreach ($tool in @('terraform', 'docker', 'gcloud')) {
    try {
      & $tool version | Out-Null
      Write-Host "[ok] $tool"
    }
    catch {
      Write-Warning "[missing] $tool"
    }
  }
  Invoke-Terraform $gcpDir @('validate')
  if (Test-Path $otelGcpTfvars) {
    Write-Host "[ok] otel sibling tfvars: $otelGcpTfvars"
  }
  else {
    Write-Warning "otel tfvars not found at $otelGcpTfvars - set project_id manually"
  }
}

function Sync-RuntimeSecretsFromEnv {
  $envFile = Join-Path $root '.env'
  if (-not (Test-Path $envFile)) { return }
  $dot = Load-DotEnv $envFile
  $retrieveSecret = $dot['KNOWLEDGE_RETRIEVE_API_SECRET']
  if ([string]::IsNullOrWhiteSpace($retrieveSecret) -or $retrieveSecret.Length -lt 32) {
    $retrieveSecret = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 48 | ForEach-Object { [char]$_ })
    Write-Host 'Generated retrieve_api_secret (32+ chars) for Cloud Run; update KNOWLEDGE_RETRIEVE_API_SECRET in .env for local/E2E.'
  }
  $content = Get-Content -LiteralPath $gcpTfvars -Raw
  $content = $content -replace '(?m)^upstash_vector_rest_url\s*=.*', "upstash_vector_rest_url   = `"$($dot['UPSTASH_VECTOR_REST_URL'])`""
  $content = $content -replace '(?m)^upstash_vector_rest_token\s*=.*', "upstash_vector_rest_token = `"$($dot['UPSTASH_VECTOR_REST_TOKEN'])`""
  $content = $content -replace '(?m)^retrieve_api_secret\s*=.*', "retrieve_api_secret       = `"$retrieveSecret`""
  Set-Content -LiteralPath $gcpTfvars -Value $content -Encoding utf8 -NoNewline
  if ($dot['KNOWLEDGE_RETRIEVE_API_SECRET'] -ne $retrieveSecret) {
    $lines = Get-Content $envFile
    $updated = $false
    $newLines = $lines | ForEach-Object {
      if ($_ -match '^\s*KNOWLEDGE_RETRIEVE_API_SECRET\s*=') {
        $updated = $true
        "KNOWLEDGE_RETRIEVE_API_SECRET=$retrieveSecret"
      }
      else { $_ }
    }
    if (-not $updated) { $newLines += "KNOWLEDGE_RETRIEVE_API_SECRET=$retrieveSecret" }
    Set-Content -LiteralPath $envFile -Value $newLines -Encoding utf8
  }
}

function Invoke-Foundation {
  Ensure-Tfvars
  $project = Get-Tfvar $gcpTfvars 'project_id'
  if (Test-Placeholder $project) { throw 'Set project_id in infra/gcp/terraform.tfvars' }
  $content = Get-Content -LiteralPath $gcpTfvars -Raw
  if ($content -notmatch 'enable_foundation\s*=\s*true') {
    $content = $content -replace '(?m)^enable_foundation\s*=.*', 'enable_foundation = true'
    Set-Content -LiteralPath $gcpTfvars -Value $content -Encoding utf8 -NoNewline
  }
  $args = @('plan', '-var-file=terraform.tfvars')
  if (-not $PlanOnly) { $args = @('apply', '-var-file=terraform.tfvars', '-auto-approve') }
  Invoke-Terraform $gcpDir $args
}

function Ensure-DockerRegistryAuth([string]$Region) {
  $registry = "https://$Region-docker.pkg.dev"
  $token = $null
  try {
    $token = (& gcloud auth print-access-token 2>$null | Out-String).Trim()
  }
  catch { }
  if ([string]::IsNullOrWhiteSpace($token)) {
    $token = (& gcloud auth application-default print-access-token 2>$null | Out-String).Trim()
  }
  if ([string]::IsNullOrWhiteSpace($token)) {
    throw 'Docker registry auth failed. Run: gcloud auth login && gcloud auth application-default login'
  }
  $script:DockerAuthConfig = Join-Path $env:TEMP "knowledge-docker-auth-$PID"
  New-Item -ItemType Directory -Path $script:DockerAuthConfig -Force | Out-Null
  $env:DOCKER_CONFIG = $script:DockerAuthConfig
  $token | docker login -u oauth2accesstoken --password-stdin $registry | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "docker login failed for $registry" }
}

function Invoke-Image {
  Ensure-Tfvars
  $project = Get-Tfvar $gcpTfvars 'project_id'
  $region = Get-Tfvar $gcpTfvars 'region'
  if (Test-Placeholder $project) { throw 'Set project_id before image push' }
  if ([string]::IsNullOrWhiteSpace($region)) { $region = 'us-central1' }
  $image = "$region-docker.pkg.dev/$project/knowledge-query-api/query:$imageTag"
  Push-Location $root
  try {
    Ensure-DockerRegistryAuth $region
    docker build --platform linux/amd64 -f server/Dockerfile -t $image .
    if ($PlanOnly) {
      Write-Host "[plan-only] Would push $image"
      return
    }
    docker push $image
    if ($LASTEXITCODE -ne 0) { throw "docker push failed for $image" }
    $content = Get-Content -LiteralPath $gcpTfvars -Raw
    $content = $content -replace '(?m)^query_image\s*=.*', "query_image       = `"$image`""
    Set-Content -LiteralPath $gcpTfvars -Value $content -Encoding utf8 -NoNewline
    Write-Host "Pushed and recorded query_image = $image"
  }
  finally {
    Pop-Location
  }
}

function Invoke-Runtime {
  Ensure-Tfvars
  Sync-RuntimeSecretsFromEnv
  foreach ($key in @('project_id', 'query_image', 'upstash_vector_rest_url', 'upstash_vector_rest_token', 'retrieve_api_secret')) {
    $val = Get-Tfvar $gcpTfvars $key
    if (Test-Placeholder $val) {
      throw "Set $key in infra/gcp/terraform.tfvars (complete foundation + image phases first)."
    }
    if ($key -eq 'retrieve_api_secret' -and $val.Length -lt 32) {
      throw 'retrieve_api_secret must be at least 32 characters for Cloud Run runtime.'
    }
  }
  $content = Get-Content -LiteralPath $gcpTfvars -Raw
  if ($content -notmatch 'enable_runtime\s*=\s*true') {
    $content = $content -replace '(?m)^enable_runtime\s*=.*', 'enable_runtime = true'
    Set-Content -LiteralPath $gcpTfvars -Value $content -Encoding utf8 -NoNewline
  }
  $args = @('plan', '-var-file=terraform.tfvars')
  if (-not $PlanOnly) { $args = @('apply', '-var-file=terraform.tfvars', '-auto-approve') }
  Invoke-Terraform $gcpDir $args
  if (-not $PlanOnly) {
    Push-Location $gcpDir
    try {
      terraform output cloud_run_uri
      terraform output consumer_environment_hint
    }
    finally {
      Pop-Location
    }
  }
}

function Invoke-E2ECloud {
  & (Join-Path $root 'scripts\e2e\cloud\run.ps1')
}

Ensure-Tfvars

switch ($Phase) {
  'check' { Invoke-Check }
  'foundation' { Invoke-Foundation }
  'image' { Invoke-Image }
  'runtime' { Invoke-Runtime }
  'e2e-cloud' { Invoke-E2ECloud }
  'all' {
    Invoke-Check
    if (-not $PlanOnly) {
      Invoke-Foundation
      Invoke-Image
      Invoke-Runtime
      Invoke-E2ECloud
    }
  }
}
