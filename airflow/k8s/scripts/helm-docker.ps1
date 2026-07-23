# Run Helm (native binary in .tools, or Docker fallback).
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$HelmArgs
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$HelmExe = Join-Path $ScriptDir ".tools\helm.exe"

function Ensure-Helm {
    if (Get-Command helm -ErrorAction SilentlyContinue) { return (Get-Command helm).Source }
    if (Test-Path $HelmExe) { return $HelmExe }
    $toolsDir = Split-Path $HelmExe -Parent
    New-Item -ItemType Directory -Path $toolsDir -Force | Out-Null
    $zip = Join-Path $env:TEMP "helm-windows-amd64.zip"
    Write-Host "==> Downloading Helm to $HelmExe"
    Invoke-WebRequest -Uri "https://get.helm.sh/helm-v3.16.4-windows-amd64.zip" -OutFile $zip
    Expand-Archive -Path $zip -DestinationPath $toolsDir -Force
    Move-Item -Force (Join-Path $toolsDir "windows-amd64\helm.exe") $HelmExe
    Remove-Item $zip -Force
    Remove-Item (Join-Path $toolsDir "windows-amd64") -Recurse -Force
    return $HelmExe
}

$bin = Ensure-Helm
& $bin @HelmArgs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
