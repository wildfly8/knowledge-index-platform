[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$gcpDir = Join-Path $root 'infra\gcp'

Push-Location $gcpDir
try {
  terraform init -input=false -backend=false | Out-Host
  if ($LASTEXITCODE -ne 0) { throw 'terraform init failed' }
  terraform validate | Out-Host
  if ($LASTEXITCODE -ne 0) { throw 'terraform validate failed' }
}
finally {
  Pop-Location
}

Write-Host 'test:iac OK (infra/gcp terraform validate)'
