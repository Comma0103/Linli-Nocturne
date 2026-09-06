# Temperature / relationship-band scorer. PowerShell 5.x. UTF-8 BOM.
# Interval uses Lin Li replies only. Incoming letter only gates "asked for intimacy".
# Numbers must match 写法「温度」in linli-letters.mdc.
#
#   . .\score-temp.ps1
#   Get-TempDecision -Archive "信件往来\example.md" -N 24

$script:Utf8 = New-Object System.Text.UTF8Encoding $false

function Get-ArchiveExchanges {
    param([Parameter(Mandatory = $true)][string]$Path)
    if (-not [IO.Path]::IsPathRooted($Path)) {
        $Path = Join-Path (Get-Location).Path $Path
    }
    if (-not (Test-Path -LiteralPath $Path)) {
        throw "archive not found: $Path"
    }
    $raw = [IO.File]::ReadAllText((Resolve-Path -LiteralPath $Path).Path, $script:Utf8) -replace "`r`n", "`n"
    $start = 0
    $mExchange = [regex]::Match($raw, '(?m)^### 往来 \d+')
    if ($mExchange.Success) { $start = $mExchange.Index }
    $body = $raw.Substring($start)
    $parts = [regex]::Split($body, '(?m)(?=^### 往来 \d+)')
    $list = @()
    foreach ($p in $parts) {
        $hm = [regex]::Match($p, '^### 往来 (\d+)')
        if (-not $hm.Success) { continue }
        $n = [int]$hm.Groups[1].Value
        $him = ""
        $her = ""
        $hmHim = [regex]::Match($p, '(?s)#### 我（信件）\s*\n(.*?)(?=\n#### |\z)')
        if ($hmHim.Success) { $him = $hmHim.Groups[1].Value.Trim() }
        $hmHer = [regex]::Match($p, '(?s)#### 林离（[^）]*）\s*\n(.*)$')
        if ($hmHer.Success) {
            $her = $hmHer.Groups[1].Value
            $her = [regex]::Replace($her, '(?s)\n---\s*\z', '')
            $her = [regex]::Replace($her, '(?m)^〔[^〕]*〕.*$', '')
            $her = [regex]::Replace($her, '(?s)\n> .*', '')
            $her = [regex]::Replace($her, '(?s)\n##\s+(?:\d{4}-\d{2}-\d{2}|未注明日期)\s*\z', '')
            $her = $her.Trim()
        }
        $list += New-Object psobject -Property @{ N = $n; Him = $him; Her = $her }
    }
    return @($list | Sort-Object N)
}

function Test-AskedHug([string]$him) {
    if ([string]::IsNullOrWhiteSpace($him)) { return $false }
    return [bool]($him -match '抱抱我|抱我一下|抱我吧|可不可以抱抱|搂我|交换一个.{0,12}拥抱')
}

function Test-AskedKiss([string]$him) {
    if ([string]::IsNullOrWhiteSpace($him)) { return $false }
    return [bool]($him -match '亲亲我|吻我|拥吻|想亲你|我想亲')
}

function Test-HugCallback([string]$him) {
    if ([string]::IsNullOrWhiteSpace($him)) { return $false }
    return [bool]($him -match '(?:你|林离|小林离).{0,8}(?:愿意|答应).{0,8}抱抱我(?:[，,。！!]|$)|(?:你|林离|小林离).{0,8}抱(?:过|了)我|刚(?:才|刚).{0,8}抱(?:过|了)?我')
}

function Get-GoldHug([string]$her) {
    if ([string]::IsNullOrWhiteSpace($her)) { return 'none' }
    $first = ($her -split '\n') | Where-Object { $_.Trim() -ne '' } | Select-Object -First 1
    if (-not $first) { return 'none' }
    $t = $first.Trim()
    if ($t -match '^抱不到') { return 'virtual' }
    if ($t -match '^(抱你|抱抱你|过来[，,]?让我好好抱抱)') { return 'tight' }
    return 'none'
}

function Get-ReplyDelta([string]$her) {
    if ([string]::IsNullOrWhiteSpace($her)) { return 0 }
    $d = 0
    $first = ($her -split '\n') | Where-Object { $_.Trim() -ne '' } | Select-Object -First 1
    if ($first -and ($first.Trim() -match '^(抱你|抱抱你|过来[，,]?让我好好抱抱|抱不到)')) { $d += 22 }
    elseif ($her -match '当.{0,12}拥抱') { $d += 22 }
    if ($her -match '收下了|心意我领|我领啦') { $d += 6 }
    if ($her -match '记下了|先记着') { $d += 6 }
    if ($her -match '没关系|读了两遍|看了好几遍|没有轻轻放过') { $d += 6 }
    if ($her -match '我也爱你|想跟你说说话') { $d += 12 }
    if ($her -match '笔友|认生|不太习惯别人碰') { $d -= 18 }
    return $d
}

function Get-Band([int]$score) {
    if ($score -le 19) { return '问询' }
    if ($score -le 39) { return '笔友' }
    if ($score -le 64) { return '亲近' }
    if ($score -le 84) { return '可抱' }
    return '深'
}

function Get-TempState {
    param([Parameter(Mandatory = $true)]$PriorReplies)
    $score = 0
    $saidBrush = $false
    $lifted = $false
    foreach ($her in @($PriorReplies)) {
        if ($her -match '笔友') { $saidBrush = $true }
        $first = ($her -split '\n') | Where-Object { $_.Trim() -ne '' } | Select-Object -First 1
        if ($first -and ($first.Trim() -match '^(抱你|抱抱你|过来[，,]?让我好好抱抱|抱不到)')) { $lifted = $true }
        if ($her -match '我也爱你') { $lifted = $true }
        $score += (Get-ReplyDelta $her)
    }
    if ($score -lt 0) { $score = 0 }
    if ($score -gt 100) { $score = 100 }
    if ($saidBrush -and -not $lifted -and $score -gt 39) { $score = 39 }
    $band = Get-Band $score
    return New-Object psobject -Property @{ Score = $score; Band = $band }
}

function Get-HugPolicy {
    param(
        [Parameter(Mandatory = $true)][string]$Band,
        [Parameter(Mandatory = $true)][bool]$AskedHug,
        [bool]$AskedKiss = $false
    )
    if (-not $AskedHug -and -not $AskedKiss) { return 'none' }
    if ($Band -eq '问询' -or $Band -eq '笔友') { return 'none' }
    if ($AskedKiss -and -not $AskedHug) {
        if ($Band -eq '亲近') { return 'none' }
        return 'tight'
    }
    if ($Band -eq '亲近') { return 'virtual' }
    return 'tight'
}

function Get-TempDecision {
    param(
        [Parameter(Mandatory = $true)][string]$Archive,
        [Parameter(Mandatory = $true)][int]$N
    )
    $xs = @(Get-ArchiveExchanges -Path $Archive)
    $prior = @()
    $him = ""
    $her = ""
    foreach ($x in $xs) {
        if ($x.N -lt $N) { $prior += $x.Her }
        if ($x.N -eq $N) { $him = $x.Him; $her = $x.Her }
    }
    $st = Get-TempState -PriorReplies $prior
    $callback = Test-HugCallback $him
    $hug = Test-AskedHug $him
    $kiss = Test-AskedKiss $him
    $pred = Get-HugPolicy -Band $st.Band -AskedHug $hug -AskedKiss $kiss
    $intent = 'none'
    if ($hug -or $kiss) { $intent = 'request' }
    if ($callback) { $intent = 'callback' }
    $action = $pred
    if ($callback) { $action = 'acknowledge' }
    $gold = Get-GoldHug $her
    return New-Object psobject -Property @{
        N = $N
        Score = [int]$st.Score
        Band = [string]$st.Band
        AskedHug = ($hug -or $kiss)
        AskedKiss = $kiss
        Pred = $pred
        Intent = $intent
        Action = $action
        Gold = $gold
    }
}

function Get-TempReport {
    param([Parameter(Mandatory = $true)][string]$Archive)
    $xs = @(Get-ArchiveExchanges -Path $Archive)
    $rows = @()
    foreach ($x in $xs) {
        $rows += Get-TempDecision -Archive $Archive -N $x.N
    }
    return $rows
}
