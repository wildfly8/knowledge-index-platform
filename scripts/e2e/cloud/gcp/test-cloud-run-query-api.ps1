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

try {
  $chat1 = Invoke-Api -Method POST -Path '/v1/chat' -Body @{
    query = $Query
    title = 'Cloud E2E chat thread'
    use_external_llm = $false
  }
  if (-not $chat1.conversation_id) {
    throw '/v1/chat missing conversation_id for persisted thread'
  }
  Write-Host "  /v1/chat (new thread) OK (conversation_id=$($chat1.conversation_id))"

  $chat2 = Invoke-Api -Method POST -Path '/v1/chat' -Body @{
    query            = 'follow-up question about the same topic'
    conversation_id  = $chat1.conversation_id
    use_external_llm = $false
  }
  if (-not $chat2.answer) { throw '/v1/chat follow-up missing answer' }
  Write-Host '  /v1/chat (follow-up) OK'

  $messages = Invoke-Api -Method GET -Path "/v1/conversations/$($chat1.conversation_id)/messages"
  if (-not $messages.messages -or $messages.messages.Count -lt 2) {
    throw '/v1/conversations/:id/messages expected at least 2 messages'
  }
  Write-Host "  /v1/conversations/:id/messages OK ($($messages.messages.Count) messages)"
}
catch {
  $status = $_.Exception.Response.StatusCode.value__
  if ($status -eq 503) {
    Write-Host '  chat persistence 503 — skipped (enable_chat_persistence not deployed)'
  }
  else {
    throw
  }
}

Write-Host 'Cloud Run query API E2E passed.'
