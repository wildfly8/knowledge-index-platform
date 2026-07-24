[CmdletBinding()]
param(
  [string]$Provider = 'gemini'
)

$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$envFile = Join-Path $root '.env'
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*([^#=]+)=(.*)$') {
      $name = $matches[1].Trim()
      $value = $matches[2].Trim().Trim('"')
      Set-Item -Path "Env:$name" -Value $value
    }
  }
}

if ($Provider -ne 'gemini') {
  throw "Only gemini spike is implemented (got: $Provider)"
}
if ([string]::IsNullOrWhiteSpace($env:GEMINI_API_KEY)) {
  throw 'Set GEMINI_API_KEY in .env before running the spike.'
}

$model = if ($env:GEMINI_MODEL) { $env:GEMINI_MODEL } else { 'gemini-2.0-flash' }
$queries = @(
  'what is catamorphism',
  'how does anamorphism relate to catamorphism',
  'give a one-sentence definition of hylomorphism'
)

foreach ($query in $queries) {
  Write-Host "Query: $query"
  $url = "https://generativelanguage.googleapis.com/v1beta/models/$([uri]::EscapeDataString($model)):generateContent?key=$($env:GEMINI_API_KEY)"
  $body = @{
    contents = @(
      @{
        role  = 'user'
        parts = @(@{ text = $query })
      }
    )
  } | ConvertTo-Json -Depth 6
  $response = Invoke-RestMethod -Uri $url -Method POST -ContentType 'application/json' -Body $body
  $text = $response.candidates[0].content.parts[0].text
  Write-Host "Answer: $text`n"
}

Write-Host 'LLM spike completed.'
