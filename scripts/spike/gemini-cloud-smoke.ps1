[CmdletBinding()]
param(
  [string]$CloudRunUri = 'https://knowledge-query-api-kxjtmypvfa-uc.a.run.app'
)

$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$dot = @{}
Get-Content (Join-Path $root '.env') | ForEach-Object {
  if ($_ -match '^\s*([^#=]+)=(.*)$') { $dot[$matches[1].Trim()] = $matches[2].Trim() }
}

$secret = $dot['KNOWLEDGE_RETRIEVE_API_SECRET']
if (-not $secret) { throw 'KNOWLEDGE_RETRIEVE_API_SECRET missing from .env' }

$base = $CloudRunUri.TrimEnd('/')
$headers = @{
  Authorization  = "Bearer $secret"
  'Content-Type' = 'application/json'
}
$body = @{
  query            = 'what is catamorphism'
  title            = 'gemini e2e smoke'
  use_external_llm = $true
  synthesize       = $false
  rerank           = $false
  top_k            = 3
} | ConvertTo-Json

Write-Host "POST $base/v1/chat (use_external_llm=true)..."
$r = Invoke-RestMethod -Uri "$base/v1/chat" -Method POST -Headers $headers -Body $body -TimeoutSec 180

$preview = if ($r.answer.Length -gt 200) { $r.answer.Substring(0, 200) + '...' } else { $r.answer }
Write-Host "conversation_id: $($r.conversation_id)"
Write-Host "answer preview: $preview"
Write-Host "llm_provider: $($r.meta.llm_provider)"
Write-Host "llm_model: $($r.meta.llm_model)"
Write-Host "llm_fallback: $($r.meta.llm_fallback)"
Write-Host "answer_mode: $($r.meta.answer_mode)"

if (-not $r.conversation_id) { throw 'missing conversation_id' }
if ($r.meta.llm_fallback -eq $true) { throw 'LLM fell back to extractive' }
if ($r.meta.llm_provider -ne 'gemini') { throw "expected gemini provider, got $($r.meta.llm_provider)" }
if ([string]::IsNullOrWhiteSpace($r.answer)) { throw 'empty answer' }

Write-Host 'Gemini end-to-end OK'
