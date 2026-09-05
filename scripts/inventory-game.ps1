param(
  [string]$GameRoot = "D:\Program Files (x86)\Steam\steamapps\common\BSide Olivia Lin Test",
  [string]$Version = "0.0.9.627",
  [string]$Output = ""
)
$ErrorActionPreference = "Stop"
$root = [IO.Path]::GetFullPath($GameRoot)
$files = @(
  "$Version/resources/feapp.dat",
  "$Version/resources/webplayer.dat",
  "$Version/resources/feplayer.dat",
  "$Version/plugins/Studio/NutStudioUI.dll",
  "$Version/plugins/Container/NutContainerPlugin.dll",
  "$Version/NutBase.dll",
  "$Version/assets/songlist.dat"
)
$result = [ordered]@{
  schema = "linli-nocturne.client-baseline"
  provenance = "observed-install"
  provenanceNote = "该输出只记录当前目录，不代表原装文件；如果目录曾被第三方工具修改，必须另行取得并审核原版基线。"
  capturedAt = (Get-Date).ToUniversalTime().ToString("o")
  gameRoot = $root
  version = $Version
  files = @()
}
foreach ($relative in $files) {
  $path = Join-Path $root $relative
  if (-not (Test-Path -LiteralPath $path)) {
    $result.files += [ordered]@{ path = $relative; exists = $false }
    continue
  }
  $item = Get-Item -LiteralPath $path
  $hash = Get-FileHash -Algorithm SHA256 -LiteralPath $path
  $result.files += [ordered]@{ path = $relative; exists = $true; length = $item.Length; sha256 = $hash.Hash.ToLowerInvariant() }
}
$json = $result | ConvertTo-Json -Depth 8
if ($Output) {
  $parent = Split-Path -Parent $Output
  if ($parent) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
  [IO.File]::WriteAllText([IO.Path]::GetFullPath($Output), $json + [Environment]::NewLine, (New-Object Text.UTF8Encoding($false)))
} else { $json }
