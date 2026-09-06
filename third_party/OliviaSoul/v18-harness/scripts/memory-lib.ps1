# Memory compaction library. No param block: safe to dot-source.
# 最近 5 封保留全文；再往前 5 封逐封一行；更早的合成一段。
# PowerShell 5.x. UTF-8 BOM.

. (Join-Path $PSScriptRoot "ds-call.ps1")
. (Join-Path $PSScriptRoot "score-temp.ps1")

$script:FullKeep = 5
$script:PerLetterKeep = 5
$script:LetterSummaryPromptVersion = "v2-source-attribution"
$script:BulkSummaryPromptVersion = "v4-source-attribution"

function Get-MemCacheDir {
    param([string]$Root)
    $cache = Join-Path $Root "_probe\mem_cache"
    if (-not (Test-Path -LiteralPath $cache)) { New-Item -ItemType Directory -Path $cache | Out-Null }
    return $cache
}

$script:SqliteMemory = $null
function Get-OliviaSqlitePath {
    param([string]$Root)
    $candidates = @(
        (Join-Path (Split-Path -Parent $Root) "data\olivia-local.sqlite")
        (Join-Path $env:APPDATA "OliviaSoul\data\olivia-local.sqlite")
    )
    foreach ($path in $candidates) {
        if (-not [string]::IsNullOrWhiteSpace($path) -and (Test-Path -LiteralPath $path)) { return $path }
    }
    return $null
}

function Import-SqliteMemory {
    param([string]$Root)
    if ($null -ne $script:SqliteMemory) { return }
    $script:SqliteMemory = @{ ByMd5 = @{}; BulkByHashes = @{} }
    $db = Get-OliviaSqlitePath -Root $Root
    if ([string]::IsNullOrWhiteSpace($db)) { return }
    $loader = Join-Path $PSScriptRoot "sqlite-memory-load.cjs"
    if (-not (Test-Path -LiteralPath $loader)) { return }
    $node = Join-Path ${env:ProgramFiles} "OliviaSoul\runtime\node.exe"
    if (-not (Test-Path -LiteralPath $node)) { $node = "node" }
    $tmp = Join-Path $env:TEMP ("olivia-sqlite-memory-" + [guid]::NewGuid().ToString("N") + ".json")
    try {
        $p = Start-Process -FilePath $node -ArgumentList @($loader, $db, $tmp) -Wait -PassThru -NoNewWindow
        if ($p.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $tmp)) { return }
        $data = (Read-Utf8 $tmp) | ConvertFrom-Json
        if ($data.byMd5) {
            foreach ($prop in $data.byMd5.PSObject.Properties) {
                $summary = ([string]$prop.Value).Trim()
                if ($summary.Length -gt 0) { $script:SqliteMemory.ByMd5[$prop.Name] = $summary }
            }
        }
        foreach ($bulk in @($data.bulks)) {
            $hashes = [string]$bulk.hashes
            $summary = ([string]$bulk.summary).Trim()
            if ($hashes.Length -gt 0 -and $summary.Length -gt 0) {
                $script:SqliteMemory.BulkByHashes[$hashes] = $summary
            }
        }
    }
    catch {
        return
    }
    finally {
        Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
    }
}

function ConvertTo-SqliteHashJson {
    param([string[]]$Hashes)
    if (@($Hashes).Count -lt 1) { return "[]" }
    return ("[" + ([string]::Join(",", ($Hashes | ForEach-Object { '"' + $_ + '"' }))) + "]")
}

function Get-ExchangeMd5 {
    param($Exchange)
    $utf8 = New-Object System.Text.UTF8Encoding $false
    $md5 = [Security.Cryptography.MD5]::Create()
    try {
        $bytes = $utf8.GetBytes(([string]$Exchange.Him).Trim() + "`n---`n" + ([string]$Exchange.Her).Trim())
        return ([BitConverter]::ToString($md5.ComputeHash($bytes))).Replace("-", "").ToLowerInvariant()
    }
    finally {
        $md5.Dispose()
    }
}

function Get-LetterSummary {
    param([string]$Root, [string]$Person, $Exchange, [switch]$Force)
    $hash = Get-ExchangeMd5 -Exchange $Exchange
    $p = Join-Path (Get-MemCacheDir -Root $Root) ("{0}_ex_{1}_{2}.txt" -f $Person, $hash, $script:LetterSummaryPromptVersion)
    if ((Test-Path -LiteralPath $p) -and -not $Force) {
        $summary = (Read-Utf8 $p).Trim()
        return ("往来 {0:D2}（md5:{1}）：{2}" -f $Exchange.N, $hash, $summary)
    }
    Import-SqliteMemory -Root $Root
    $sqliteSummary = [string]$script:SqliteMemory.ByMd5[$hash]
    if (-not $Force -and $sqliteSummary.Trim().Length -gt 0) {
        Write-Utf8 $p $sqliteSummary.Trim()
        return ("往来 {0:D2}（md5:{1}）：{2}" -f $Exchange.N, $hash, $sqliteSummary.Trim())
    }
    $sys = @"
你是资料员，不是林离。把一则往来压成一到两行中文。
必须保留：他要什么、她给了什么或挡了什么、外号与专名、约定与欠账、有没有身体接触或情话、硬事实（职业、城市、家庭、日程）。
来源必须分开写：来信人的自称、愿望和单方面声称写成“他声称/他称呼”；只有林离回信里明确说过、承认过或实际给过的，才能写成“她明确承认/她给过”。称呼不等于婚姻、同居或法律关系，不得自行推导。
来信为空表示这是一封只有林离回信的官方记录；只整理回信中已有的信息，不补造来信。
不要润色，不要照抄整句，不要评价。只输出摘要本身，不要编号，不要标签。
"@
    $usr = @"
往来 $($Exchange.N)

他（来信）：
$($Exchange.Him)

她（回信）：
$($Exchange.Her)
"@
    $out = Invoke-Ds -System $sys -User $usr
    $summary = $out.Trim()
    Write-Utf8 $p $summary
    return ("往来 {0:D2}（md5:{1}）：{2}" -f $Exchange.N, $hash, $summary)
}

function Get-BulkSummary {
    param([string]$Root, [string]$Person, $Lines, [int]$UpTo)
    $p = Join-Path (Get-MemCacheDir -Root $Root) ("{0}_bulk_01-{1:D2}_{2}.txt" -f $Person, $UpTo, $script:BulkSummaryPromptVersion)
    if (Test-Path -LiteralPath $p) { return (Read-Utf8 $p).Trim() }
    $sys = @"
你是资料员，不是林离。把下面逐封摘要合成一段中文，不超过 250 字。
写关系怎么走到现在、他是谁（职业城市家庭）、私有外号和梗、没兑现的约定、她给过的身体接触或情话、她挡过什么。
按时间顺序讲，不要逐条罗列，不要编号，不要评价，不要引用整句。
会变的事实（城市、岗位、项目、住处）写成当时的状态，注明「早期」「后来」，不要写成现在仍然如此。
"@
    $out = Invoke-Ds -System $sys -User ([string]::Join("`n", @($Lines)))
    Write-Utf8 $p $out
    return $out.Trim()
}

function Get-RollingBulkSummary {
    param([string]$Root, [string]$Person, $Old)
    if (@($Old).Count -lt 1) { return "" }
    $cache = Get-MemCacheDir -Root $Root
    $metaPath = Join-Path $cache ("{0}_bulk_five_{1}_md5.json" -f $Person, $script:BulkSummaryPromptVersion)
    $hashes = @($Old | ForEach-Object { Get-ExchangeMd5 -Exchange $_ })
    Import-SqliteMemory -Root $Root
    $sqliteBulk = [string]$script:SqliteMemory.BulkByHashes[(ConvertTo-SqliteHashJson -Hashes $hashes)]
    if ($sqliteBulk.Trim().Length -gt 0) {
        $metadata = [ordered]@{
            hashes = $hashes
            summary = $sqliteBulk.Trim()
        } | ConvertTo-Json -Depth 4
        Write-Utf8 $metaPath $metadata
        return $sqliteBulk.Trim()
    }
    $priorHashes = @()
    $priorSummary = ""
    if (Test-Path -LiteralPath $metaPath) {
        try {
            $meta = (Read-Utf8 $metaPath) | ConvertFrom-Json
            $priorHashes = @($meta.hashes)
            $priorSummary = ([string]$meta.summary).Trim()
        }
        catch {
            $priorHashes = @()
            $priorSummary = ""
        }
    }

    $canReuse = $priorSummary.Length -gt 0 -and $priorHashes.Count -le $hashes.Count
    if ($canReuse) {
        for ($i = 0; $i -lt $priorHashes.Count; $i++) {
            if ([string]$priorHashes[$i] -ne [string]$hashes[$i]) {
                $canReuse = $false
                break
            }
        }
    }
    if ($canReuse -and $priorHashes.Count -eq $hashes.Count) { return $priorSummary }

    $lines = @()
    $system = ""
    if ($canReuse) {
        $newOld = @($Old[$priorHashes.Count..($Old.Count - 1)])
        foreach ($exchange in $newOld) {
            $lines += Get-LetterSummary -Root $Root -Person $Person -Exchange $exchange
        }
        $system = @"
你是资料员，不是林离。把已有的五段式旧信回忆与新进入旧区的逐封摘要，重写成五段式回忆。
只输出以下五行，标签和顺序固定：
来信人人设：只写来信人“他”的职业、城市、家庭、稳定性格与长期处境；严禁把林离的身份、专业、家庭或住处写进本段；未知写无；会变化的事实写清早期与后来
未兑现的约定：只收双方明确答应在未来完成、且目前尚无完成结果的具体动作或交付；持续许可、相处规则、称呼边界、关系状态、愿望、请求、条件、玩笑和比喻都不算约定，应放进关系或话题；同一件事的改写、续写和近义表达只保留一项并更新状态，不得拆成多项；按首次答应的顺序保留最近三个不同约定，新约定进入时丢掉最旧的，已兑现、拒绝或明确取消的删除；没有写无
聊过的话题：按首次出现顺序保留最近十个有辨识度的话题；新话题进入时丢掉最旧的；没有写无
你们的关系：当前关系；分开写他单方面声称的称呼、林离回信中明确承认的称呼、她给过的亲密动作与边界；称呼不得推导成婚姻、同居或法律关系
你们关系进展的关键点：按时间顺序压缩真正改变关系的节点，包括明确靠近、确认、亲密、拒绝或撤回
只依据材料更新，不评价，不补造，不引用整句。五行总计不超过800个汉字。
"@
        $user = "已有旧信总结：`n$priorSummary`n`n新进入旧区的信：`n" + [string]::Join("`n", $lines)
    }
    else {
        foreach ($exchange in $Old) {
            $lines += Get-LetterSummary -Root $Root -Person $Person -Exchange $exchange
        }
        $system = @"
你是资料员，不是林离。把下面十封以前的逐封摘要整理成五段式回忆。
只输出以下五行，标签和顺序固定：
来信人人设：只写来信人“他”的职业、城市、家庭、稳定性格与长期处境；严禁把林离的身份、专业、家庭或住处写进本段；未知写无；会变化的事实写清早期与后来
未兑现的约定：只收双方明确答应在未来完成、且目前尚无完成结果的具体动作或交付；持续许可、相处规则、称呼边界、关系状态、愿望、请求、条件、玩笑和比喻都不算约定，应放进关系或话题；同一件事的改写、续写和近义表达只保留一项并更新状态，不得拆成多项；按首次答应的顺序保留最近三个不同约定，新约定进入时丢掉最旧的，已兑现、拒绝或明确取消的删除；没有写无
聊过的话题：按首次出现顺序保留最近十个有辨识度的话题；新话题进入时丢掉最旧的；没有写无
你们的关系：当前关系；分开写他单方面声称的称呼、林离回信中明确承认的称呼、她给过的亲密动作与边界；称呼不得推导成婚姻、同居或法律关系
你们关系进展的关键点：按时间顺序压缩真正改变关系的节点，包括明确靠近、确认、亲密、拒绝或撤回
只依据材料整理，不评价，不补造，不引用整句。五行总计不超过800个汉字。
"@
        $user = [string]::Join("`n", $lines)
    }

    $summary = (Invoke-Ds -System $system -User $user).Trim()
    $metadata = [ordered]@{
        hashes = $hashes
        summary = $summary
    } | ConvertTo-Json -Depth 4
    Write-Utf8 $metaPath $metadata
    return $summary
}

function Format-Exchange {
    param($Exchange)
    $her = [regex]::Replace($Exchange.Her, '(?s)\n-{3,}\s*(\n##[^\n]*)?\s*\z', '').Trim()
    return @"
### 往来 $("{0:D2}" -f $Exchange.N)

#### 我（信件）

$($Exchange.Him)

#### 林离（回信）

$her
"@
}

function Build-Memory {
    param(
        [Parameter(Mandatory = $true)][string]$Root,
        [Parameter(Mandatory = $true)][string]$Person,
        [Parameter(Mandatory = $true)][int]$N,
        [string]$ArchivePath = "",
        [string]$OpeningPath = ""
    )
    $arch = $ArchivePath
    if ([string]::IsNullOrWhiteSpace($arch)) { $arch = Join-Path $Root ("信件往来\{0}.md" -f $Person) }
    $xs = @(Get-ArchiveExchanges -Path $arch)
    $prior = @($xs | Where-Object { $_.N -lt $N })
    $cur = @($xs | Where-Object { $_.N -eq $N })
    if ($cur.Count -lt 1) { throw ("exchange not found: {0} {1}" -f $Person, $N) }

    $c = $prior.Count
    $fullFrom = [Math]::Max(0, $c - $script:FullKeep)
    $full = @()
    if ($c -gt 0) { $full = @($prior[$fullFrom..($c - 1)]) }
    $midTo = $fullFrom - 1
    $midFrom = [Math]::Max(0, $fullFrom - $script:PerLetterKeep)
    $mid = @()
    if ($midTo -ge $midFrom -and $midTo -ge 0) { $mid = @($prior[$midFrom..$midTo]) }
    $old = @()
    if ($midFrom -gt 0) { $old = @($prior[0..($midFrom - 1)]) }

    $sb = New-Object System.Text.StringBuilder
    [void]$sb.AppendLine("# 往来 · $Person")
    [void]$sb.AppendLine()
    [void]$sb.AppendLine("往来共 $c 封在前。越近越完整：十封以前整理成五段式回忆，再前5封逐封一行，最近 $($full.Count) 封是原文，末尾是要回的来信。摘要写的是当时状态，事实以靠后的为准；原文里的原话优先于摘要。")
    [void]$sb.AppendLine()

    if ([string]::IsNullOrWhiteSpace($OpeningPath)) { $OpeningPath = Join-Path $Root "harness\开信.md" }
    if (Test-Path -LiteralPath $OpeningPath) {
        $opening = (Read-Utf8 $OpeningPath).Trim()
        if (-not [string]::IsNullOrWhiteSpace($opening)) {
            [void]$sb.AppendLine("## 开信（固定注入；仅作最早历史，不进档案）")
            [void]$sb.AppendLine()
            [void]$sb.AppendLine("#### 林离（开信）")
            [void]$sb.AppendLine()
            [void]$sb.AppendLine($opening)
            [void]$sb.AppendLine()
        }
    }

    if ($old.Count -gt 0) {
        $bulk = Get-RollingBulkSummary -Root $Root -Person $Person -Old $old
        [void]$sb.AppendLine("## 十封以前五段式回忆（往来 01–$("{0:D2}" -f $old[$old.Count - 1].N)）")
        [void]$sb.AppendLine()
        [void]$sb.AppendLine($bulk)
        [void]$sb.AppendLine()
    }

    if ($mid.Count -gt 0) {
        [void]$sb.AppendLine("## 再前5封总结（往来 $("{0:D2}" -f $mid[0].N)–$("{0:D2}" -f $mid[$mid.Count - 1].N)，逐封摘要）")
        [void]$sb.AppendLine()
        foreach ($x in $mid) {
            [void]$sb.AppendLine((Get-LetterSummary -Root $Root -Person $Person -Exchange $x))
        }
        [void]$sb.AppendLine()
    }

    if ($full.Count -gt 0) {
        [void]$sb.AppendLine("## 最近 $($full.Count) 封全文")
        [void]$sb.AppendLine()
        foreach ($x in $full) {
            [void]$sb.AppendLine((Format-Exchange -Exchange $x))
            [void]$sb.AppendLine()
        }
    }

    [void]$sb.AppendLine("## 要回的来信（往来 $("{0:D2}" -f $N)）")
    [void]$sb.AppendLine()
    [void]$sb.AppendLine("#### 我（信件）")
    [void]$sb.AppendLine()
    [void]$sb.AppendLine($cur[0].Him)

    $text = $sb.ToString().TrimEnd()
    Write-Utf8 (Join-Path $Root ("_probe\mem_{0}_{1:D2}.md" -f $Person, $N)) $text
    return $text
}

function Build-FactMemory {
    param(
        [Parameter(Mandatory = $true)][string]$Root,
        [Parameter(Mandatory = $true)][string]$Person,
        [Parameter(Mandatory = $true)][int]$N,
        [string]$ArchivePath = "",
        [string]$OpeningPath = ""
    )
    $arch = $ArchivePath
    if ([string]::IsNullOrWhiteSpace($arch)) { $arch = Join-Path $Root ("信件往来\{0}.md" -f $Person) }
    $xs = @(Get-ArchiveExchanges -Path $arch)
    $prior = @($xs | Where-Object { $_.N -lt $N })
    $current = @($xs | Where-Object { $_.N -eq $N })
    if ($current.Count -lt 1) { throw ("exchange not found: {0} {1}" -f $Person, $N) }
    $fullFrom = [Math]::Max(0, $prior.Count - $script:FullKeep)
    $full = @()
    if ($prior.Count -gt 0) { $full = @($prior[$fullFrom..($prior.Count - 1)]) }

    $sb = New-Object System.Text.StringBuilder
    [void]$sb.AppendLine("# 事实上下文 · $Person")
    [void]$sb.AppendLine()
    [void]$sb.AppendLine("这里只包含近期原文和当前来信。更早事实必须来自带信件 ID 与哈希的检索证据；摘要不构成事实证据。")
    [void]$sb.AppendLine()

    if ([string]::IsNullOrWhiteSpace($OpeningPath)) { $OpeningPath = Join-Path $Root "harness\开信.md" }
    if (Test-Path -LiteralPath $OpeningPath) {
        $opening = (Read-Utf8 $OpeningPath).Trim()
        if (-not [string]::IsNullOrWhiteSpace($opening)) {
            [void]$sb.AppendLine("## 林离开信原文")
            [void]$sb.AppendLine()
            [void]$sb.AppendLine($opening)
            [void]$sb.AppendLine()
        }
    }

    if ($full.Count -gt 0) {
        [void]$sb.AppendLine("## 最近 $($full.Count) 封原文")
        [void]$sb.AppendLine()
        foreach ($exchange in $full) {
            [void]$sb.AppendLine((Format-Exchange -Exchange $exchange))
            [void]$sb.AppendLine()
        }
    }

    [void]$sb.AppendLine("## 要回的来信（往来 $("{0:D2}" -f $N)）")
    [void]$sb.AppendLine()
    [void]$sb.AppendLine("#### 我（信件）")
    [void]$sb.AppendLine()
    [void]$sb.AppendLine($current[0].Him)
    return $sb.ToString().TrimEnd()
}
