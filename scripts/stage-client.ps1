param(
  [Parameter(Mandatory = $true)][string]$GameRoot,
  [Parameter(Mandatory = $true)][string]$StageRoot,
  [Parameter(Mandatory = $true)][string]$OriginalFeapp,
  [string]$OriginalWebplayer = "",
  [string]$OriginalStudio = "",
  [string]$OriginalContainer = "",
  [switch]$UseHardLinks
)

$ErrorActionPreference = "Stop"
$source = [IO.Path]::GetFullPath($GameRoot).TrimEnd("\")
$stage = [IO.Path]::GetFullPath($StageRoot).TrimEnd("\")
if ($source -eq $stage -or $stage.StartsWith($source + "\", [StringComparison]::OrdinalIgnoreCase)) {
  throw "StageRoot must be outside GameRoot"
}
if (Test-Path -LiteralPath $stage) { throw "StageRoot already exists: $stage" }
if (-not (Test-Path -LiteralPath $source -PathType Container)) { throw "GameRoot not found: $source" }
if (-not (Test-Path -LiteralPath $OriginalFeapp -PathType Leaf)) { throw "Original feapp.dat not found" }

New-Item -ItemType Directory -Path $stage -Force | Out-Null
try {
  $sourcePrefix = $source + "\"
  Get-ChildItem -LiteralPath $source -File -Recurse -Force |
    Where-Object { -not $_.FullName.StartsWith($sourcePrefix + "work\", [StringComparison]::OrdinalIgnoreCase) } |
    ForEach-Object {
      $relative = $_.FullName.Substring($sourcePrefix.Length)
      $target = Join-Path $stage $relative
      New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
      if ($UseHardLinks) {
        New-Item -ItemType HardLink -Path $target -Target $_.FullName | Out-Null
      } else {
        Copy-Item -LiteralPath $_.FullName -Destination $target -Force
      }
    }

  $replacements = @(
    @{ Source = $OriginalFeapp; Relative = "0.0.9.627\resources\feapp.dat" },
    @{ Source = $OriginalWebplayer; Relative = "0.0.9.627\resources\webplayer.dat" },
    @{ Source = $OriginalStudio; Relative = "0.0.9.627\plugins\Studio\NutStudioUI.dll" },
    @{ Source = $OriginalContainer; Relative = "0.0.9.627\plugins\Container\NutContainerPlugin.dll" }
  )
  foreach ($replacement in $replacements) {
    if ([string]::IsNullOrWhiteSpace($replacement.Source)) { continue }
    if (-not (Test-Path -LiteralPath $replacement.Source -PathType Leaf)) { throw "Original replacement not found: $($replacement.Source)" }
    $target = Join-Path $stage $replacement.Relative
    if (-not (Test-Path -LiteralPath $target)) { throw "Stage target not found: $($replacement.Relative)" }
    Copy-Item -LiteralPath $replacement.Source -Destination $target -Force
  }
  Write-Output "staged=$stage"
  Write-Output "mode=$(if ($UseHardLinks) { 'hardlink' } else { 'copy' })"
  Write-Output "files=$((Get-ChildItem -LiteralPath $stage -File -Recurse -Force).Count)"
} catch {
  Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
  throw
}
