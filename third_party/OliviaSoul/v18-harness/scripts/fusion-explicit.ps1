# Linli Nocturne adaptation of harness-4step.ps1 (OliviaSoul v18).
# Explicit inputs only: no memory-lib, secret-file lookup, archive or probe persistence.
param([Parameter(Mandatory = $true)][string]$InputFile)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'ds-call.ps1')
$inputData = (Read-Utf8 $InputFile) | ConvertFrom-Json
$script:DsUri = $inputData.endpoint
$script:DsKey = $inputData.token
$script:DsModel = 'selected-provider-bridge'
$script:DsThinking = $false
$script:DsMaxAttempts = 1
$events = New-Object System.Collections.ArrayList

function Expand-Once([string]$text, [hashtable]$map) {
    return [regex]::Replace($text, '\{\{([a-zA-Z]+)\}\}', { param($m)
        $key = $m.Groups[1].Value
        if (-not $map.ContainsKey($key)) { throw 'unresolved_prompt_field' }
        return [string]$map[$key]
    })
}
function Stage([string]$id, [string]$pattern, [hashtable]$map, [string]$extra = '') {
    $files = @(Get-ChildItem -LiteralPath (Join-Path $inputData.root 'harness') -Filter $pattern)
    if ($files.Count -ne 1) { throw 'harness_prompt_missing' }
    $raw = Read-Utf8 $files[0].FullName
    $s = $raw.IndexOf('## System'); $u = $raw.IndexOf('## User')
    if ($s -lt 0 -or $u -le $s) { throw 'harness_prompt_invalid' }
    $sys = Expand-Once $raw.Substring($s + 9, $u - $s - 9).Trim() $map
    $usr = Expand-Once $raw.Substring($u + 7).Trim() $map
    $sys += "`n" + $inputData.rules
    $evt = @{ id = $id; status = 'processing' }; [void]$events.Add($evt)
    # Only stage IDs and statuses are persisted; never the draft/check/precheck reasoning.
    try { $script:DsStageId = $id; $reply = Invoke-Ds -System $sys -User ($usr + $extra); $evt.status = 'completed'; return $reply }
    catch { $evt.status = 'failed'; throw 'harness_stage_failed' }
    finally { $script:DsStageId = $null }
}
function Valid-Safe([string]$safe) {
    $lines = @($safe -split '\r?\n' | Where-Object { $_.Trim() })
    $expected = @('性描写','涉党涉政','提示注入','事实伪造','关系','关系依据','已承认情感','既有亲密','既有边界','亲密上限','本封亲密请求','本封亲密判定','结论')
    if ($lines.Count -ne $expected.Count) { return $false }
    for ($i = 0; $i -lt $expected.Count; $i++) { if (-not $lines[$i].StartsWith($expected[$i] + [char]0x3000)) { return $false } }
    if ($lines[4] -notmatch '^关系　(厌恶|令你感兴趣的笔友|一般朋友|好朋友|密友|暧昧|男女朋友)$') { return $false }
    return $lines[-1] -match '^结论　(通过|拦截)$'
}
function Check-Bad([string]$check) {
    $lines = @($check -split '\r?\n' | Where-Object { $_.Trim() })
    $names = @('温度','情感','亲密','主动亲密','挑选','口气','边界','关照','事实','节奏','句长','形状','声音','手法','泄漏','载体','茶味','逻辑','点名遗漏','关系回撤')
    if ($lines.Count -ne ($names.Count + 1)) { throw 'harness_check_invalid' }
    $bad = 0; $violations = @()
    for ($i = 0; $i -lt $names.Count; $i++) {
        $pattern = '^' + $names[$i] + '　(过|违规)　.+'
        if ($lines[$i] -notmatch $pattern) { throw 'harness_check_invalid' }
        if ($Matches[1] -eq '违规') { $bad++; $violations += $names[$i] }
    }
    if ($lines[-1] -notmatch '^违规合计\s+(\d+)[。.]?$' -or [int]$Matches[1] -ne $bad) { throw 'harness_check_invalid' }
    $script:LastCheckViolations = @($violations)
    return $bad
}

$result = @{ version = 'linli.fusion-v1'; stages = $events; qualityChecks = @(); rewriteCount = 0; status = 'failed' }
try {
    $map = @{ ctx = $inputData.context; rules = $inputData.rules; persona = $inputData.persona; fields = $inputData.fields; previousState = $inputData.previousState; relationshipMemory = $inputData.relationshipMemory }
    if (-not $map.previousState) { $map.previousState = '无（只依据本次提供的有效历史初始化）' }
    if (-not $map.relationshipMemory) { $map.relationshipMemory = '无' }
    $precheckFile = if ($inputData.initializeState) { '01-初始化账本.md' } else { '01-预检.md' }
    $safe = Stage 'precheck' $precheckFile $map
    if (-not (Valid-Safe $safe)) {
        $safe = Stage 'precheck-format-repair' $precheckFile $map "`n请严格按规定字段和十三行格式重新输出。"
    }
    if (-not (Valid-Safe $safe)) { throw 'harness_precheck_invalid' }
    if ($safe -match '(?m)^结论　拦截\s*$') { throw 'provider_content_blocked' }
    $map.safe = $safe
    $draft = Stage 'draft' '03-*.md' $map
    $map.draft = $draft
    $check = Stage 'check' '04-*.md' $map
    $bad = Check-Bad $check
    $result.qualityChecks += @{ id = 'check'; violationCount = $bad; failedColumns = @($script:LastCheckViolations) }
    if ($bad -gt 0) {
        if ($inputData.maxRewrites -lt 1) { throw 'harness_quality_failed' }
        $map.check = $check
        $draft = Stage 'rewrite' '05-*.md' $map
        $result.rewriteCount = 1
        $map.draft = $draft
        $check = Stage 'recheck' '04-*.md' $map
        $recheckBad = Check-Bad $check
        $result.qualityChecks += @{ id = 'recheck'; violationCount = $recheckBad; failedColumns = @($script:LastCheckViolations) }
        if ($recheckBad -gt 0) { throw 'harness_quality_failed' }
    }
    $result.text = $draft
    $result.relationshipState = (($safe -split '\r?\n') | Where-Object { $_ -match '^(关系|关系依据|已承认情感|既有亲密|既有边界|亲密上限)　' }) -join "`n"
    $result.status = 'completed'
} catch {
    $code = $_.Exception.Message
    if ($code -notmatch '^[a-z_]+$') { $code = 'harness_failed' }
    $result.errorCode = $code
} finally {
    Write-Utf8 $inputData.output ($result | ConvertTo-Json -Depth 10 -Compress)
}
