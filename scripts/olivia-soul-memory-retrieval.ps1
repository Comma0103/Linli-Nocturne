# SQLite supplies the snapshot; reuse the upstream retrieval functions unchanged.
param([string]$InputFile)
$ErrorActionPreference = 'Stop'
function Read-Utf8([string]$Path) { [IO.File]::ReadAllText($Path, [Text.Encoding]::UTF8) }
$inputData = (Read-Utf8 $InputFile) | ConvertFrom-Json
. (Join-Path $inputData.root 'scripts/history-retrieval.ps1')
$snapshot = $inputData.snapshot
$snapshot | Add-Member snapshotId (Get-HistorySnapshotId -Snapshot $snapshot)
$snapshotPath = Join-Path (Split-Path -Parent $InputFile) 'snapshot.json'
[IO.File]::WriteAllText($snapshotPath, ($snapshot | ConvertTo-Json -Depth 20), (Get-HistoryUtf8))
$snapshot = Read-HistorySnapshot -Path $snapshotPath
$budget = New-HistoryBudget
$result = @{ snapshotId = $snapshot.snapshotId; evidence = @(); audit = @(); candidates = @() }
try {
    $first = Invoke-HistoryRetrieval -Snapshot $snapshot -Intent @{ lookups = $inputData.lookups } -Budget $budget
    $result.evidence = @($first.evidence); $result.candidates = @($first.candidates); $result.audit = @($first.audit)
    if ($inputData.autoRead -and $first.candidates.Count -gt 0) {
        $anchor = $first.candidates[0].letterId
        # One exact read plus its neighbors; the upstream budget deduplicates evidence.
        $second = Invoke-HistoryRetrieval -Snapshot $snapshot -Intent @{ lookups = @(
            @{ operation = 'read'; letterId = $anchor },
            @{ operation = 'neighbors'; letterId = $anchor; before = 1; after = 1 }
        ) } -Budget $budget
        $result.evidence += @($second.evidence); $result.audit += @($second.audit)
    }
} catch { $result.errorCode = 'history_lookup_limited' }
$result.queryCount = $budget.queryCount
[IO.File]::WriteAllText($inputData.output, ($result | ConvertTo-Json -Depth 20 -Compress), (Get-HistoryUtf8))
