# Immutable history snapshot and bounded local retrieval. PowerShell 5.x.

function Get-HistoryUtf8 {
    return New-Object System.Text.UTF8Encoding $false
}

function Get-HistoryHash {
    param(
        [Parameter(Mandatory = $true)][string]$Text,
        [ValidateSet("MD5", "SHA256")][string]$Algorithm = "SHA256"
    )
    $encoding = Get-HistoryUtf8
    $hasher = if ($Algorithm -eq "MD5") {
        [Security.Cryptography.MD5]::Create()
    }
    else {
        [Security.Cryptography.SHA256]::Create()
    }
    try {
        return ([BitConverter]::ToString($hasher.ComputeHash($encoding.GetBytes($Text)))).Replace("-", "").ToLowerInvariant()
    }
    finally {
        $hasher.Dispose()
    }
}

function Get-HistoryContentMd5 {
    param([string]$Incoming, [string]$Reply)
    return Get-HistoryHash -Algorithm MD5 -Text ($Incoming.Trim() + "`n---`n" + $Reply.Trim())
}

function Get-HistoryExactSha256 {
    param([string]$Incoming, [string]$Reply)
    return Get-HistoryHash -Text ($Incoming.Trim() + "`n---`n" + $Reply.Trim())
}

function Get-HistorySnapshotId {
    param([Parameter(Mandatory = $true)]$Snapshot)
    $encoding = Get-HistoryUtf8
    $builder = New-Object Text.StringBuilder
    $append = {
        param($Value)
        $text = [string]$Value
        [void]$builder.Append($encoding.GetByteCount($text))
        [void]$builder.Append(":")
        [void]$builder.Append($text)
    }
    & $append ([string]$Snapshot.schema)
    & $append ([int]$Snapshot.version)
    & $append ([string]$Snapshot.person)
    & $append ([int]$Snapshot.maxOrder)
    & $append @($Snapshot.exchanges).Count
    foreach ($exchange in @($Snapshot.exchanges)) {
        foreach ($field in @("letterId", "order", "date", "time", "contentMd5", "exactSha256", "summary", "incoming", "reply")) {
            & $append $exchange.$field
        }
    }
    return Get-HistoryHash -Text $builder.ToString()
}

function Get-ArchiveExchangeMetadata {
    param([Parameter(Mandatory = $true)][string]$ArchivePath)
    $raw = Read-Utf8 $ArchivePath
    $metadata = @{}
    $matches = [regex]::Matches($raw, '(?m)^### \u5F80\u6765\s+(\d+)(?:\s*\u00B7\s*(\d{2}:\d{2}))?')
    foreach ($match in $matches) {
        $prefix = $raw.Substring(0, $match.Index)
        $dateMatches = [regex]::Matches($prefix, '(?m)^##\s+(\d{4}-\d{2}-\d{2})\s*$')
        $date = ""
        if ($dateMatches.Count -gt 0) { $date = $dateMatches[$dateMatches.Count - 1].Groups[1].Value }
        $time = $match.Groups[2].Value
        if ([string]::IsNullOrWhiteSpace($time)) { $time = "12:00" }
        $metadata[[int]$match.Groups[1].Value] = [ordered]@{ date = $date; time = $time }
    }
    return $metadata
}

function New-HistorySnapshotFromArchive {
    param(
        [Parameter(Mandatory = $true)][string]$ArchivePath,
        [Parameter(Mandatory = $true)][string]$Person,
        [int]$BeforeN = [int]::MaxValue
    )
    $metadata = Get-ArchiveExchangeMetadata -ArchivePath $ArchivePath
    $exchanges = @()
    foreach ($exchange in @(Get-ArchiveExchanges -Path $ArchivePath | Where-Object { $_.N -lt $BeforeN })) {
        $incoming = ([string]$exchange.Him).Trim()
        $reply = ([string]$exchange.Her).Trim()
        $meta = $metadata[[int]$exchange.N]
        $date = ""
        $time = "12:00"
        if ($null -ne $meta) {
            $date = [string]$meta.date
            $time = [string]$meta.time
        }
        $contentMd5 = Get-HistoryContentMd5 -Incoming $incoming -Reply $reply
        $exchanges += [ordered]@{
            letterId = "archive-{0:D4}-{1}" -f [int]$exchange.N, $contentMd5.Substring(0, 8)
            order = [int]$exchange.N
            date = $date
            time = $time
            contentMd5 = $contentMd5
            exactSha256 = Get-HistoryExactSha256 -Incoming $incoming -Reply $reply
            summary = ""
            incoming = $incoming
            reply = $reply
        }
    }
    $payload = [ordered]@{
        schema = "olivia-history.snapshot"
        version = 1
        person = $Person
        maxOrder = if ($exchanges.Count) { [int]$exchanges[$exchanges.Count - 1].order } else { 0 }
        exchanges = $exchanges
    }
    $snapshotId = Get-HistorySnapshotId -Snapshot ([pscustomobject]$payload)
    return [pscustomobject]([ordered]@{
        schema = $payload.schema
        version = $payload.version
        person = $payload.person
        maxOrder = $payload.maxOrder
        exchanges = $payload.exchanges
        snapshotId = $snapshotId
    })
}

function Read-HistorySnapshot {
    param([Parameter(Mandatory = $true)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { throw "history snapshot missing" }
    $snapshot = (Read-Utf8 $Path) | ConvertFrom-Json
    if ([string]$snapshot.schema -ne "olivia-history.snapshot" -or [int]$snapshot.version -ne 1) {
        throw "history snapshot schema invalid"
    }
    if ([string]$snapshot.snapshotId -notmatch '^[a-f0-9]{64}$') { throw "history snapshot id invalid" }
    if ((Get-HistorySnapshotId -Snapshot $snapshot) -ne [string]$snapshot.snapshotId) {
        throw "history snapshot digest invalid"
    }
    $seenIds = @{}
    $seenOrders = @{}
    foreach ($exchange in @($snapshot.exchanges)) {
        $letterId = [string]$exchange.letterId
        $order = [int]$exchange.order
        if ([string]::IsNullOrWhiteSpace($letterId) -or $order -lt 1) { throw "history exchange identity invalid" }
        if ($seenIds.ContainsKey($letterId) -or $seenOrders.ContainsKey($order)) { throw "history exchange identity duplicated" }
        $seenIds[$letterId] = $true
        $seenOrders[$order] = $true
        $incoming = [string]$exchange.incoming
        $reply = [string]$exchange.reply
        if ((Get-HistoryContentMd5 -Incoming $incoming -Reply $reply) -ne [string]$exchange.contentMd5) {
            throw "history exchange md5 invalid"
        }
        if ((Get-HistoryExactSha256 -Incoming $incoming -Reply $reply) -ne [string]$exchange.exactSha256) {
            throw "history exchange sha256 invalid"
        }
    }
    return $snapshot
}

function Test-HistorySearchText {
    param([string]$Text)
    if ([string]::IsNullOrWhiteSpace($Text)) { throw "history search query empty" }
    if ($Text.Length -gt 120) { throw "history search query too long" }
    if ($Text -match '://|(?:^|[\\/])\.\.(?:[\\/]|$)|^[a-zA-Z]:[\\/]|(?i)\b(select|insert|update|delete|drop|pragma|attach)\b') {
        throw "history search query forbidden"
    }
    if ($Text -match '[\[\]\{\}\^\$\|\\]') { throw "history search regex forbidden" }
}

function Get-HistorySnippet {
    param([string]$Text, [string]$Query, [int]$MaxLength = 280)
    $index = $Text.IndexOf($Query, [StringComparison]::OrdinalIgnoreCase)
    if ($index -lt 0) { $index = 0 }
    $start = [Math]::Max(0, $index - 90)
    $length = [Math]::Min($MaxLength, $Text.Length - $start)
    return $Text.Substring($start, $length)
}

function Get-HistorySearchTerms {
    param([string]$Query)
    $terms = @([regex]::Split($Query.Trim().ToLowerInvariant(), '[\s\p{P}\p{S}]+') |
        Where-Object { $_.Length -ge 2 } | Select-Object -Unique)
    $compact = [regex]::Replace($Query.Trim().ToLowerInvariant(), '\s+', '')
    if ($terms.Count -eq 0 -and $compact.Length -gt 0) { $terms = @($compact) }
    if ($compact.Length -ge 3) {
        for ($i = 0; $i -le $compact.Length - 3; $i++) {
            $fragment = $compact.Substring($i, 3)
            if ($terms -notcontains $fragment) { $terms += $fragment }
        }
    }
    return $terms
}

function Search-HistorySnapshot {
    param(
        [Parameter(Mandatory = $true)]$Snapshot,
        [Parameter(Mandatory = $true)][string]$Query,
        [ValidateSet("any", "incoming", "reply")][string]$Side = "any",
        [string]$Date = "",
        [string]$LetterId = "",
        [int]$Order = 0,
        [int]$Limit = 5
    )
    Test-HistorySearchText -Text $Query
    $terms = @(Get-HistorySearchTerms -Query $Query)
    $results = @()
    foreach ($exchange in @($Snapshot.exchanges)) {
        if ($Date -and [string]$exchange.date -ne $Date) { continue }
        if ($LetterId -and [string]$exchange.letterId -ne $LetterId) { continue }
        if ($Order -gt 0 -and [int]$exchange.order -ne $Order) { continue }
        $sides = if ($Side -eq "any") { @("incoming", "reply") } else { @($Side) }
        foreach ($candidateSide in $sides) {
            $text = [string]$exchange.$candidateSide
            $lower = $text.ToLowerInvariant()
            $score = 0
            if ($lower.Contains($Query.ToLowerInvariant())) { $score += 1000 + $Query.Length }
            foreach ($term in $terms) {
                if ($lower.Contains($term)) { $score += 10 + $term.Length }
            }
            if ($score -lt 1) { continue }
            $results += [pscustomobject]([ordered]@{
                kind = "candidate"
                letterId = [string]$exchange.letterId
                order = [int]$exchange.order
                date = [string]$exchange.date
                side = $candidateSide
                score = $score
                contentMd5 = [string]$exchange.contentMd5
                exactSha256 = [string]$exchange.exactSha256
                snippet = Get-HistorySnippet -Text $text -Query $Query
            })
        }
    }
    return @($results | Sort-Object @{ Expression = "score"; Descending = $true }, @{ Expression = "order"; Descending = $true } |
        Select-Object -First ([Math]::Min(5, [Math]::Max(1, $Limit))))
}

function Read-HistoryExchange {
    param(
        [Parameter(Mandatory = $true)]$Snapshot,
        [string]$LetterId = "",
        [int]$Order = 0,
        [string]$Date = ""
    )
    $matches = @($Snapshot.exchanges | Where-Object {
        (-not $LetterId -or [string]$_.letterId -eq $LetterId) -and
        ($Order -lt 1 -or [int]$_.order -eq $Order) -and
        (-not $Date -or [string]$_.date -eq $Date)
    })
    return @($matches | Sort-Object order)
}

function Get-HistoryNeighbors {
    param(
        [Parameter(Mandatory = $true)]$Snapshot,
        [Parameter(Mandatory = $true)][string]$LetterId,
        [ValidateRange(0, 2)][int]$Before = 1,
        [ValidateRange(0, 2)][int]$After = 1
    )
    $anchor = @($Snapshot.exchanges | Where-Object { [string]$_.letterId -eq $LetterId })
    if ($anchor.Count -ne 1) { return @() }
    $min = [int]$anchor[0].order - $Before
    $max = [int]$anchor[0].order + $After
    return @($Snapshot.exchanges | Where-Object {
        [int]$_.order -ge $min -and [int]$_.order -le $max
    } | Sort-Object order)
}

function New-HistoryBudget {
    return [pscustomobject]@{
        queryCount = 0
        fullReads = 0
        characters = 0
        startedAt = [DateTime]::UtcNow
        seenQueries = @{}
        seenLetters = @{}
        terminationReason = ""
    }
}

function Add-HistoryBudgetedResult {
    param(
        [Parameter(Mandatory = $true)]$Budget,
        [Parameter(Mandatory = $true)]$Result,
        [switch]$Full
    )
    $textLength = if ($Full) {
        ([string]$Result.incoming).Length + ([string]$Result.reply).Length
    }
    else {
        ([string]$Result.snippet).Length
    }
    if ($Full -and $Budget.seenLetters.ContainsKey([string]$Result.letterId)) {
        throw "history duplicate full read"
    }
    if ($Full) {
        if ([int]$Budget.fullReads -ge 3) { throw "history full-read budget exceeded" }
        $Budget.fullReads = [int]$Budget.fullReads + 1
        $Budget.seenLetters[[string]$Result.letterId] = $true
    }
    if ([int]$Budget.characters + $textLength -gt 12000) { throw "history character budget exceeded" }
    $Budget.characters = [int]$Budget.characters + $textLength
}

function ConvertTo-HistoryEvidence {
    param($Exchange)
    return [pscustomobject]([ordered]@{
        kind = "evidence"
        letterId = [string]$Exchange.letterId
        order = [int]$Exchange.order
        date = [string]$Exchange.date
        time = [string]$Exchange.time
        contentMd5 = [string]$Exchange.contentMd5
        exactSha256 = [string]$Exchange.exactSha256
        incoming = [string]$Exchange.incoming
        reply = [string]$Exchange.reply
    })
}

function Test-HistoryLookup {
    param(
        [Parameter(Mandatory = $true)]$Snapshot,
        [Parameter(Mandatory = $true)]$Query
    )
    $operation = [string]$Query.operation
    if ($operation -notin @("search", "read", "neighbors")) { throw "history operation invalid" }
    $date = [string]$Query.date
    if ($date -and $date -notmatch '^\d{4}-\d{2}-\d{2}$') { throw "history date invalid" }
    if ($operation -eq "search") {
        Test-HistorySearchText -Text ([string]$Query.query)
        $side = [string]$Query.side
        if ($side -and $side -notin @("any", "incoming", "reply")) { throw "history side invalid" }
        return
    }
    if ($operation -eq "read") {
        if (-not [string]$Query.letterId -and [int]$Query.order -lt 1 -and -not $date) {
            throw "history read selector missing"
        }
        return
    }
    if (-not [string]$Query.letterId) { throw "history neighbor selector missing" }
    if ([int]$Query.before -lt 0 -or [int]$Query.before -gt 2 -or [int]$Query.after -lt 0 -or [int]$Query.after -gt 2) {
        throw "history neighbor range invalid"
    }
}

function Invoke-HistoryRetrieval {
    param(
        [Parameter(Mandatory = $true)]$Snapshot,
        [Parameter(Mandatory = $true)]$Intent,
        [Parameter(Mandatory = $true)]$Budget
    )
    if (([DateTime]::UtcNow - $Budget.startedAt).TotalSeconds -gt 45) { throw "history time budget exceeded" }
    $queries = @($Intent.lookups)
    if ($queries.Count -lt 1 -or $queries.Count -gt 2) { throw "history query-count invalid" }
    foreach ($query in $queries) { Test-HistoryLookup -Snapshot $Snapshot -Query $query }
    $candidates = @()
    $evidence = @()
    $audit = @()
    foreach ($query in $queries) {
        if ([int]$Budget.queryCount -ge 4) { throw "history total-query budget exceeded" }
        $canonical = [ordered]@{
            operation = [string]$query.operation
            query = [string]$query.query
            side = [string]$query.side
            date = [string]$query.date
            letterId = [string]$query.letterId
            order = [int]$query.order
            before = [int]$query.before
            after = [int]$query.after
        } | ConvertTo-Json -Compress
        $queryHash = Get-HistoryHash -Text $canonical
        if ($Budget.seenQueries.ContainsKey($queryHash)) { throw "history duplicate query" }
        $Budget.seenQueries[$queryHash] = $true
        $Budget.queryCount = [int]$Budget.queryCount + 1
        $operation = [string]$query.operation
        $queryResults = @()
        if ($operation -eq "search") {
            $side = [string]$query.side
            if ([string]::IsNullOrWhiteSpace($side)) { $side = "any" }
            $queryResults = @(Search-HistorySnapshot -Snapshot $Snapshot -Query ([string]$query.query) -Side $side -Date ([string]$query.date) -LetterId ([string]$query.letterId) -Order ([int]$query.order) -Limit 5)
            foreach ($result in $queryResults) {
                Add-HistoryBudgetedResult -Budget $Budget -Result $result
                $candidates += $result
            }
        }
        elseif ($operation -eq "read") {
            $queryResults = @(Read-HistoryExchange -Snapshot $Snapshot -LetterId ([string]$query.letterId) -Order ([int]$query.order) -Date ([string]$query.date))
            if ($queryResults.Count -gt (3 - [int]$Budget.fullReads)) { throw "history full-read budget exceeded" }
            $readCharacters = ($queryResults | ForEach-Object { ([string]$_.incoming).Length + ([string]$_.reply).Length } | Measure-Object -Sum).Sum
            if ([int]$Budget.characters + [int]$readCharacters -gt 12000) { throw "history character budget exceeded" }
            foreach ($exchange in $queryResults) {
                $result = ConvertTo-HistoryEvidence -Exchange $exchange
                Add-HistoryBudgetedResult -Budget $Budget -Result $result -Full
                $evidence += $result
            }
        }
        elseif ($operation -eq "neighbors") {
            $queryResults = @(Get-HistoryNeighbors -Snapshot $Snapshot -LetterId ([string]$query.letterId) -Before ([int]$query.before) -After ([int]$query.after))
            $newResults = @($queryResults | Where-Object { -not $Budget.seenLetters.ContainsKey([string]$_.letterId) })
            if ($newResults.Count -gt (3 - [int]$Budget.fullReads)) { throw "history full-read budget exceeded" }
            $readCharacters = ($newResults | ForEach-Object { ([string]$_.incoming).Length + ([string]$_.reply).Length } | Measure-Object -Sum).Sum
            if ([int]$Budget.characters + [int]$readCharacters -gt 12000) { throw "history character budget exceeded" }
            foreach ($exchange in $newResults) {
                $result = ConvertTo-HistoryEvidence -Exchange $exchange
                Add-HistoryBudgetedResult -Budget $Budget -Result $result -Full
                $evidence += $result
            }
        }
        else {
            throw "history operation invalid"
        }
        $audit += [pscustomobject]([ordered]@{
            queryHash = $queryHash
            operation = $operation
            intent = [string]$query.intent
            returned = @($queryResults).Count
        })
    }
    if (([DateTime]::UtcNow - $Budget.startedAt).TotalSeconds -gt 45) { throw "history time budget exceeded" }
    $uniqueEvidence = @()
    $seenEvidence = @{}
    foreach ($item in @($evidence | Sort-Object order)) {
        if (-not $seenEvidence.ContainsKey([string]$item.letterId)) {
            $uniqueEvidence += $item
            $seenEvidence[[string]$item.letterId] = $true
        }
    }
    return [pscustomobject]([ordered]@{
        candidates = @($candidates | Sort-Object score -Descending | Select-Object -First 5)
        evidence = $uniqueEvidence
        audit = $audit
    })
}
