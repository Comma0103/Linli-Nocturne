# Shared DeepSeek call + file helpers. PowerShell 5.x. UTF-8 BOM.
# Dot-source this; call Initialize-Ds once, then Invoke-Ds.

$script:Utf8NoBom = New-Object System.Text.UTF8Encoding $false

function Read-Utf8([string]$path) {
    if (-not (Test-Path -LiteralPath $path)) { throw "missing file: $path" }
    return [IO.File]::ReadAllText((Resolve-Path -LiteralPath $path).Path, $script:Utf8NoBom)
}

function Write-Utf8([string]$path, [string]$text) {
    $dir = [IO.Path]::GetDirectoryName($path)
    if ($dir -and -not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
    [IO.File]::WriteAllText($path, $text.TrimEnd() + "`n", $script:Utf8NoBom)
}

function Strip-Yaml([string]$text) {
    $t = $text -replace "`r`n", "`n"
    if ($t.StartsWith("---")) {
        $rest = $t.Substring(3)
        $end = $rest.IndexOf("`n---`n")
        if ($end -ge 0) { return $rest.Substring($end + 5).Trim() }
    }
    return $t.Trim()
}

function Take-FromHeading([string]$text, [string]$heading) {
    $t = $text -replace "`r`n", "`n"
    $idx = $t.IndexOf($heading)
    if ($idx -lt 0) { return $t.Trim() }
    return $t.Substring($idx).Trim()
}

function Initialize-Ds {
    param([string]$Root)
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $envFile = Join-Path $Root ".cursor\secrets\deepseek.env"
    if (Test-Path -LiteralPath $envFile) {
        foreach ($line in [IO.File]::ReadAllLines((Resolve-Path -LiteralPath $envFile).Path, $script:Utf8NoBom)) {
            if ($line -match "^\s*#" -or $line -match "^\s*$") { continue }
            $eq = $line.IndexOf("=")
            if ($eq -lt 1) { continue }
            Set-Item -Path ("Env:" + $line.Substring(0, $eq).Trim()) -Value $line.Substring($eq + 1).Trim()
        }
    }
    $script:DsKey = $env:DEEPSEEK_API_KEY
    if ([string]::IsNullOrWhiteSpace($script:DsKey)) { throw "DEEPSEEK_API_KEY not set" }
    $script:DsModel = $env:DEEPSEEK_MODEL
    if ([string]::IsNullOrWhiteSpace($script:DsModel)) { $script:DsModel = "deepseek-v4-pro" }
    $b = $env:DEEPSEEK_BASE
    if ([string]::IsNullOrWhiteSpace($b)) { $b = "https://api.deepseek.com" }
    $script:DsUri = $b.TrimEnd("/") + "/chat/completions"
    $script:DsThinking = $true
}

function Set-DsThinking {
    param([Parameter(Mandatory = $true)][bool]$On)
    $script:DsThinking = $On
}

function Set-DsModel {
    param([Parameter(Mandatory = $true)][string]$Model)
    if ([string]::IsNullOrWhiteSpace($Model)) { throw "DeepSeek model cannot be empty" }
    $script:DsModel = $Model
}

function Invoke-DsOnce {
    param(
        [Parameter(Mandatory = $true)][string]$System,
        [Parameter(Mandatory = $true)][string]$User
    )
    $payload = @{
        model = $script:DsModel
        stream = $false
        messages = @(
            @{ role = "system"; content = $System }
            @{ role = "user"; content = $User }
        )
    }
    if ($script:DsThinking) {
        $payload.reasoning_effort = "high"
        $payload.thinking = @{ type = "enabled" }
    }
    else {
        $payload.thinking = @{ type = "disabled" }
    }
    $bytes = $script:Utf8NoBom.GetBytes(($payload | ConvertTo-Json -Depth 8 -Compress))
    $req = [Net.HttpWebRequest]::Create($script:DsUri)
    $req.Method = "POST"
    $req.ContentType = "application/json; charset=utf-8"
    $req.Accept = "application/json"
    $req.Timeout = 500000
    $req.ReadWriteTimeout = 500000
    $req.Headers.Add("Authorization", "Bearer " + $script:DsKey)
    $rs = $req.GetRequestStream()
    $rs.Write($bytes, 0, $bytes.Length)
    $rs.Close()
    try {
        $httpResp = $req.GetResponse()
        $sr = New-Object IO.StreamReader($httpResp.GetResponseStream(), $script:Utf8NoBom)
        $raw = $sr.ReadToEnd()
        $sr.Close()
        $httpResp.Close()
    }
    catch {
        $webEx = $_.Exception
        if ($webEx -is [Net.WebException] -and $webEx.Response) {
            $errReader = New-Object IO.StreamReader($webEx.Response.GetResponseStream(), $script:Utf8NoBom)
            throw ("DeepSeek HTTP {0}: {1}" -f [int]$webEx.Response.StatusCode, $errReader.ReadToEnd())
        }
        throw
    }
    $response = $raw | ConvertFrom-Json
    $script:DsLastFinishReason = [string]$response.choices[0].finish_reason
    $script:DsLastUsage = $response.usage
    $content = $response.choices[0].message.content
    if ([string]::IsNullOrWhiteSpace($content)) { throw "DeepSeek returned empty content" }
    return $content.Trim()
}

function Invoke-Ds {
    param(
        [Parameter(Mandatory = $true)][string]$System,
        [Parameter(Mandatory = $true)][string]$User
    )
    for ($attempt = 1; $attempt -le 3; $attempt++) {
        try {
            return Invoke-DsOnce -System $System -User $User
        }
        catch {
            $message = $_.Exception.Message
            $retryable =
                $message -match "DeepSeek returned empty content" -or
                $message -match "DeepSeek HTTP (408|409|425|429|5\d\d)" -or
                $_.Exception -is [Net.WebException]
            if (-not $retryable -or $attempt -eq 3) { throw }
            Write-Host ("DS RETRY attempt={0} reason={1}" -f ($attempt + 1), $message)
            Start-Sleep -Seconds ([Math]::Pow(2, $attempt - 1))
        }
    }
}

function ConvertFrom-DsJson {
    param([Parameter(Mandatory = $true)][string]$Text)
    $clean = $Text.Trim()
    if ($clean -match '(?s)^```(?:json)?\s*(.*?)\s*```$') { $clean = $Matches[1].Trim() }
    if (-not ($clean.StartsWith("{") -and $clean.EndsWith("}"))) { throw "DeepSeek JSON envelope invalid" }
    $value = $clean | ConvertFrom-Json
    if ($null -eq $value -or $value -is [array]) { throw "DeepSeek JSON object required" }
    return $value
}

function Invoke-DsJson {
    param(
        [Parameter(Mandatory = $true)][string]$System,
        [Parameter(Mandatory = $true)][string]$User
    )
    $raw = Invoke-Ds -System $System -User $User
    try {
        return ConvertFrom-DsJson -Text $raw
    }
    catch {
        $repairSystem = $System + "`n`nThe previous output was not one strict JSON object. Return only the required JSON object."
        $repairUser = $User + "`n`nInvalid previous output:`n" + $raw
        return ConvertFrom-DsJson -Text (Invoke-Ds -System $repairSystem -User $repairUser)
    }
}
