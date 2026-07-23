[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\lib\CloudConfig.ps1')

$config = Resolve-CloudE2EConfig
Test-CloudE2EConfig $config

& (Join-Path $PSScriptRoot 'gcp\test-cloud-run-query-api.ps1') `
  -CloudRunUri $config.CloudRunUri `
  -RetrieveApiSecret $config.RetrieveApiSecret

Write-Host 'Cloud E2E suite passed (knowledge-query-api on GCP Cloud Run).'
