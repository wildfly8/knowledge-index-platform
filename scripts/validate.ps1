[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'check-public-contract.ps1')
Write-Host 'validate: public contract OK'
