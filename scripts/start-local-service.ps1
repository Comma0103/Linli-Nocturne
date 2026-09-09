param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]] $NodeArguments
)

$ErrorActionPreference = 'Stop'
$scriptPath = Join-Path $PSScriptRoot 'start-local-service.mjs'
$nodeCandidates = @()

try {
  $command = Get-Command node -ErrorAction Stop
  if ($command.Source) { $nodeCandidates += $command.Source }
} catch {}

$nodeCandidates += @(
  (Join-Path ${env:ProgramFiles} 'nodejs/node.exe'),
  (Join-Path ${env:LOCALAPPDATA} 'Programs/nodejs/node.exe'),
  (Join-Path ${env:USERPROFILE} 'scoop/apps/nodejs/current/node.exe'),
  (Join-Path ${env:LOCALAPPDATA} 'Volta/bin/node.exe')
)

$node = $nodeCandidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
if (-not $node) {
  Write-Error 'Node.js was not found. Install Node.js 22 or newer, reopen PowerShell, or add node.exe to PATH.'
  exit 1
}

Write-Host "Using Node.js: $node"
& $node $scriptPath @NodeArguments
exit $LASTEXITCODE
