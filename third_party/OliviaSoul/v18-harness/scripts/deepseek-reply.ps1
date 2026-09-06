# Call DeepSeek V4 Pro to write a Lin Li letter. PowerShell 5.x. UTF-8.
# Blind (fitting): injects rules + persona + truncated ctx; model cannot read the repo.
# Live  (user):    injects rules + persona + memory + the incoming letter.
#
#   powershell -NoProfile -File .cursor/skills/fit-letters/scripts/deepseek-reply.ps1 -Mode Blind -Ctx "_probe\ctx_example_07.md"
#   powershell -NoProfile -File .cursor/skills/fit-letters/scripts/deepseek-reply.ps1 -Mode Live -Person "example" -Letter "inbox\latest.txt"

param(
    [ValidateSet("Blind", "Live")]
    [string]$Mode = "Blind",
    [string]$Ctx = "",
    [string]$Letter = "",
    [string]$Person = "",
    [string]$OutFile = "",
    [string]$RulesFile = "",
    [string]$Root = ""
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$utf8 = New-Object System.Text.UTF8Encoding $false

if ([string]::IsNullOrWhiteSpace($Root)) {
    $Root = (Get-Location).Path
}

function Read-Utf8([string]$path) {
    if (-not (Test-Path -LiteralPath $path)) {
        Write-Error "missing file: $path"
    }
    return [IO.File]::ReadAllText((Resolve-Path -LiteralPath $path).Path, $utf8)
}

function Strip-Yaml([string]$text) {
    $t = $text -replace "`r`n", "`n"
    if ($t.StartsWith("---")) {
        $rest = $t.Substring(3)
        $end = $rest.IndexOf("`n---`n")
        if ($end -ge 0) {
            return $rest.Substring($end + 5).Trim()
        }
    }
    return $t.Trim()
}

function Take-FromHeading([string]$text, [string]$heading) {
    $t = $text -replace "`r`n", "`n"
    $idx = $t.IndexOf($heading)
    if ($idx -lt 0) { return $t.Trim() }
    return $t.Substring($idx).Trim()
}

function Load-Secrets {
    $envFile = Join-Path $Root ".cursor\secrets\deepseek.env"
    if (Test-Path -LiteralPath $envFile) {
        foreach ($line in [IO.File]::ReadAllLines((Resolve-Path -LiteralPath $envFile).Path, $utf8)) {
            if ($line -match "^\s*#" -or $line -match "^\s*$") { continue }
            $eq = $line.IndexOf("=")
            if ($eq -lt 1) { continue }
            $k = $line.Substring(0, $eq).Trim()
            $v = $line.Substring($eq + 1).Trim()
            Set-Item -Path "Env:$k" -Value $v
        }
    }
}

Load-Secrets
$key = $env:DEEPSEEK_API_KEY
if ([string]::IsNullOrWhiteSpace($key)) {
    Write-Error "DEEPSEEK_API_KEY not set. Put it in .cursor/secrets/deepseek.env"
}
$model = $env:DEEPSEEK_MODEL
if ([string]::IsNullOrWhiteSpace($model)) { $model = "deepseek-v4-pro" }
$base = $env:DEEPSEEK_BASE
if ([string]::IsNullOrWhiteSpace($base)) { $base = "https://api.deepseek.com" }
$uri = $base.TrimEnd("/") + "/chat/completions"

$writeHeading = "# " + [string]::Concat([char]0x5199, [char]0x6CD5)
$personaHeading = "## " + [string]::Concat([char]0x57FA, [char]0x7840)
$rulesName = [string]::Concat([char]0x5199, [char]0x6CD5) + ".md"
$rulesPath = Join-Path (Join-Path $Root "harness") $rulesName
if (-not [string]::IsNullOrWhiteSpace($RulesFile)) {
    $rulesPath = $RulesFile
    if (-not [IO.Path]::IsPathRooted($rulesPath)) { $rulesPath = Join-Path $Root $RulesFile }
}
$rules = Take-FromHeading (Strip-Yaml (Read-Utf8 $rulesPath)) $writeHeading
$persona = Take-FromHeading (Read-Utf8 (Join-Path $Root "林离人设.md")) $personaHeading

$system = @"
你就是林离。按下面的规则与人设写信。
只输出回信正文本身，不要任何标签、前缀、分析、说明或英文。

# 规则
$rules

# 人设
$persona
"@

if ($Mode -eq "Blind") {
    if ([string]::IsNullOrWhiteSpace($Ctx)) {
        Write-Error "Blind mode requires -Ctx"
    }
    $ctxPath = $Ctx
    if (-not [IO.Path]::IsPathRooted($ctxPath)) {
        $ctxPath = Join-Path $Root $Ctx
    }
    $ctxText = Read-Utf8 $ctxPath
    $user = @"
下面是截断后的往来。末尾的「我（信件）」是刚收到的来信。按规则写出林离的回复正文。

$ctxText
"@
    if ([string]::IsNullOrWhiteSpace($OutFile)) {
        $name = [IO.Path]::GetFileName($ctxPath)
        $name = $name -replace "^ctx_", "gen_"
        $name = [IO.Path]::ChangeExtension($name, ".txt")
        $OutFile = Join-Path $Root ("_probe\" + $name)
    }
}
else {
    if ([string]::IsNullOrWhiteSpace($Person)) {
        Write-Error "Live mode requires -Person"
    }
    if ([string]::IsNullOrWhiteSpace($Letter)) {
        Write-Error "Live mode requires -Letter"
    }
    $letterPath = $Letter
    if (-not [IO.Path]::IsPathRooted($letterPath)) {
        $letterPath = Join-Path $Root $Letter
    }
    if ([string]::IsNullOrWhiteSpace($OutFile)) {
        $OutFile = Join-Path $Root "_probe\live_reply.txt"
    }
    $liveHarness = Join-Path $PSScriptRoot "harness-live.ps1"
    & $liveHarness -Person $Person -Letter $letterPath -OutFile $OutFile -RulesFile $rulesPath -Root $Root
    return
}

$payload = @{
    model = $model
    stream = $false
    reasoning_effort = "high"
    thinking = @{ type = "enabled" }
    messages = @(
        @{ role = "system"; content = $system }
        @{ role = "user"; content = $user }
    )
}
$json = ($payload | ConvertTo-Json -Depth 8 -Compress)
$bytes = $utf8.GetBytes($json)

$headers = @{
    Authorization = "Bearer $key"
}
try {
    $req = [Net.HttpWebRequest]::Create($uri)
    $req.Method = "POST"
    $req.ContentType = "application/json; charset=utf-8"
    $req.Accept = "application/json"
    $req.Timeout = 3600000
    $req.ReadWriteTimeout = 3600000
    $req.Headers.Add("Authorization", "Bearer $key")
    $rs = $req.GetRequestStream()
    $rs.Write($bytes, 0, $bytes.Length)
    $rs.Close()
    $httpResp = $req.GetResponse()
    $sr = New-Object IO.StreamReader($httpResp.GetResponseStream(), $utf8)
    $raw = $sr.ReadToEnd()
    $sr.Close()
    $httpResp.Close()
    $res = $raw | ConvertFrom-Json
}
catch {
    $webEx = $_.Exception.InnerException
    if ($_.Exception -is [Net.WebException]) { $webEx = $_.Exception }
    if ($webEx -and $webEx.Response) {
        $errReader = New-Object IO.StreamReader($webEx.Response.GetResponseStream(), $utf8)
        $errBody = $errReader.ReadToEnd()
        Write-Error ("DeepSeek HTTP {0}: {1}" -f [int]$webEx.Response.StatusCode, $errBody)
    }
    throw
}

$content = $res.choices[0].message.content
if ([string]::IsNullOrWhiteSpace($content)) {
    Write-Error "DeepSeek returned empty content"
}

$outDir = [IO.Path]::GetDirectoryName($OutFile)
if ($outDir -and -not (Test-Path -LiteralPath $outDir)) {
    New-Item -ItemType Directory -Path $outDir | Out-Null
}
[IO.File]::WriteAllText($OutFile, $content.Trim() + "`n", $utf8)
Write-Output ("wrote {0}" -f $OutFile)
Write-Output $content.Trim()
