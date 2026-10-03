# PhDRacket quick installer for Windows.
#
# Downloads the newest PhDRacket release from GitHub, verifies its SHA-256
# checksum and starts the installer, which shows the Beta Terms of Use.
#
#   irm https://raw.githubusercontent.com/ouyang-matters/PhDRacket/main/install/install-windows.ps1 | iex
#
# Set $env:PHDRACKET_DRY_RUN = "1" to download and verify without installing.

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$repo = 'ouyang-matters/PhDRacket'
$headers = @{ 'User-Agent' = 'PhDRacket-installer'; 'Accept' = 'application/vnd.github+json' }

Write-Host 'PhDRacket installer'
Write-Host 'Looking for the latest release...'
$releases = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases?per_page=20" -Headers $headers
$release = $releases | Where-Object { -not $_.draft } | Select-Object -First 1
if (-not $release) { throw 'No PhDRacket release was found.' }
$asset = $release.assets | Where-Object { $_.name -like '*_x64-setup.exe' } | Select-Object -First 1
if (-not $asset) { throw "Release $($release.tag_name) has no Windows installer." }

$target = Join-Path $env:TEMP $asset.name
Write-Host "Downloading $($asset.name) ($([math]::Round($asset.size / 1MB, 1)) MB)..."
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $target -UseBasicParsing

if ($asset.digest -and $asset.digest.StartsWith('sha256:')) {
  $expected = $asset.digest.Substring(7).ToLowerInvariant()
  $actual = (Get-FileHash -Algorithm SHA256 -Path $target).Hash.ToLowerInvariant()
  if ($actual -ne $expected) {
    Remove-Item $target -Force
    throw 'The download does not match the checksum published by GitHub. Nothing was installed.'
  }
  Write-Host 'Checksum verified.'
}

if ($env:PHDRACKET_DRY_RUN -eq '1') {
  Write-Host "Dry run: $target is ready and was not installed."
  return
}

Write-Host 'Starting the installer...'
Start-Process -FilePath $target -Wait
Remove-Item $target -Force -ErrorAction SilentlyContinue
Write-Host 'Done. Start PhDRacket from the Start menu.'
