param(
    [Parameter(Mandatory = $true)][string]$Person,
    [Parameter(Mandatory = $true)][string]$Letter,
    [string]$OutFile = ".\reply.txt"
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$letterPath = (Resolve-Path -LiteralPath $Letter).Path
$outputPath = $OutFile
if (-not [IO.Path]::IsPathRooted($outputPath)) {
    $outputPath = Join-Path (Get-Location).Path $outputPath
}

& (Join-Path $root "scripts\harness-live.ps1") `
    -Person $Person `
    -Letter $letterPath `
    -OutFile $outputPath `
    -RulesFile (Join-Path $root "harness\写法.md") `
    -Root $root

Write-Output ("Reply: " + $outputPath)
