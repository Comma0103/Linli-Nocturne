# 接收 Node 从 SQLite 导出的结构化任务，只输出结构化摘要结果。
# 不读写正式 Markdown，也不读写 _probe/mem_cache。

param(
    [Parameter(Mandatory = $true)][string]$InputFile,
    [Parameter(Mandatory = $true)][string]$OutputFile,
    [string]$Root = ""
)

$ErrorActionPreference = "Stop"
$utf8 = New-Object System.Text.UTF8Encoding $false
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8
if ([string]::IsNullOrWhiteSpace($Root)) { $Root = (Get-Location).Path }
$letterSummaryPromptVersion = "v2-source-attribution"
$bulkSummaryPromptVersion = "v4-source-attribution"

. (Join-Path $PSScriptRoot "ds-call.ps1")
Initialize-Ds -Root $Root

$task = [IO.File]::ReadAllText((Resolve-Path -LiteralPath $InputFile).Path, $utf8) | ConvertFrom-Json
$exchanges = @($task.exchanges)
if ($exchanges.Count -lt 1) { throw "memory task has no exchanges" }

$summarySystem = @"
你是资料员，不是林离。把一则往来压成一到两行中文。
必须保留：他要什么、她给了什么或挡了什么、外号与专名、约定与欠账、有没有身体接触或情话、硬事实（职业、城市、家庭、日程）。
来源必须分开写：来信人的自称、愿望和单方面声称写成“他声称/他称呼”；只有林离回信里明确说过、承认过或实际给过的，才能写成“她明确承认/她给过”。称呼不等于婚姻、同居或法律关系，不得自行推导。
来信为空表示这是一封只有林离回信的官方记录；只整理回信中已有的信息，不补造来信。
不要润色，不要照抄整句，不要评价。只输出摘要本身，不要编号，不要标签。
"@

$summaries = @{}
$pending = New-Object System.Collections.Generic.List[object]
$completed = 0
foreach ($exchange in $exchanges) {
    $summary = ([string]$exchange.summary).Trim()
    if ([string]::IsNullOrWhiteSpace($summary)) {
        $pending.Add($exchange)
        continue
    }
    $summaries[[string]$exchange.letterId] = $summary
    $completed += 1
    Write-Output ("MEMORY_PROGRESS|summaries|{0}|{1}" -f $completed, $exchanges.Count)
}

$script:summaryJobs = @()
$script:summaryValues = $summaries
$script:summaryCompleted = $completed
function Receive-SummaryJob {
    $job = Wait-Job -Job $script:summaryJobs -Any
    try {
        $items = @(Receive-Job -Job $job -ErrorAction Stop)
        $result = @($items | Where-Object { $_.PSObject.Properties["letterId"] }) | Select-Object -Last 1
        if ($null -eq $result) { throw "summary job returned no result" }
        $summary = ([string]$result.summary).Trim()
        if ([string]::IsNullOrWhiteSpace($summary)) { throw "empty summary: $($result.letterId)" }
        $script:summaryValues[[string]$result.letterId] = $summary
        $script:summaryCompleted += 1
        Write-Output ("MEMORY_PROGRESS|summaries|{0}|{1}" -f $script:summaryCompleted, $exchanges.Count)
    }
    finally {
        Remove-Job -Job $job -Force -ErrorAction SilentlyContinue
        $script:summaryJobs = @($script:summaryJobs | Where-Object { $_.Id -ne $job.Id })
    }
}

$dsCallPath = Join-Path $PSScriptRoot "ds-call.ps1"
try {
    foreach ($exchange in $pending) {
        $user = @"
往来 $($exchange.order)

他（来信）：
$($exchange.incoming)

她（回信）：
$($exchange.reply)
"@
        $script:summaryJobs += Start-Job -ScriptBlock {
            param($DsCallPath, $Root, $System, $User, $LetterId)
            . $DsCallPath
            Initialize-Ds -Root $Root
            [pscustomobject]@{
                letterId = $LetterId
                summary = (Invoke-Ds -System $System -User $User).Trim()
            }
        } -ArgumentList $dsCallPath, $Root, $summarySystem, $user, ([string]$exchange.letterId)
        if ($script:summaryJobs.Count -ge 8) { Receive-SummaryJob }
    }
    while ($script:summaryJobs.Count -gt 0) { Receive-SummaryJob }
}
finally {
    $script:summaryJobs | Stop-Job -ErrorAction SilentlyContinue
    $script:summaryJobs | Remove-Job -Force -ErrorAction SilentlyContinue
}

$completed = $script:summaryCompleted
$results = New-Object System.Collections.Generic.List[object]
foreach ($exchange in $exchanges) {
    $summary = ([string]$script:summaryValues[[string]$exchange.letterId]).Trim()
    if ([string]::IsNullOrWhiteSpace($summary)) { throw "empty summary: $($exchange.letterId)" }
    $results.Add([ordered]@{
        letterId = [string]$exchange.letterId
        contentMd5 = [string]$exchange.contentMd5
        summary = $summary
    })
}

$oldHashes = @($task.oldMemory.contentMd5s | ForEach-Object { [string]$_ })
$bulk = ([string]$task.oldMemory.summary).Trim()
if ($oldHashes.Count -gt 0 -and [string]::IsNullOrWhiteSpace($bulk)) {
    Write-Output ("MEMORY_PROGRESS|bulk|{0}|{1}" -f $completed, $exchanges.Count)
    $oldSet = @{}
    foreach ($hash in $oldHashes) { $oldSet[$hash] = $true }
    $lines = @($results | Where-Object { $oldSet.ContainsKey([string]$_.contentMd5) } | ForEach-Object {
        "往来 md5:$($_.contentMd5)：$($_.summary)"
    })
    $bulkSystem = @"
你是资料员，不是林离。把下面十封以前的逐封摘要整理成五段式回忆。
只输出以下五行，标签和顺序固定：
来信人人设：职业、城市、家庭、稳定性格与长期处境；未知写无；变化写清早期与后来
未兑现的约定：最多保留最近三个仍未兑现的明确约定；没有写无
聊过的话题：按首次出现顺序保留最近十个有辨识度的话题；没有写无
你们的关系：当前关系；分开写他单方面声称的称呼、林离回信中明确承认的称呼、她给过的亲密动作与边界；称呼不得推导成婚姻、同居或法律关系
你们关系进展的关键点：按时间顺序压缩真正改变关系的节点
只依据材料，不评价，不补造，不引用整句。五行总计不超过800个汉字。
"@
    $bulk = (Invoke-Ds -System $bulkSystem -User ([string]::Join("`n", $lines))).Trim()
}

$output = [ordered]@{
    schema = "olivia-memory.summary-result"
    letterSummaryPromptVersion = $letterSummaryPromptVersion
    bulkSummaryPromptVersion = $bulkSummaryPromptVersion
    summaries = $results.ToArray()
    oldMemory = [ordered]@{
        contentMd5s = @($oldHashes)
        summary = $bulk
    }
} | ConvertTo-Json -Depth 6
[IO.File]::WriteAllText($OutputFile, $output + "`n", $utf8)
Write-Output ("MEMORY_PROGRESS|done|{0}|{1}" -f $completed, $exchanges.Count)
Write-Output ("refreshed memory task: exchanges={0}" -f $exchanges.Count)
