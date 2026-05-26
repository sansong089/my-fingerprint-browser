$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$vendorDir = Join-Path $repoRoot "vendor\fingerprint-chromium"
$chromeExe = Join-Path $vendorDir "chrome.exe"
$versionFile = Join-Path $vendorDir ".version"
$cacheDir = Join-Path $repoRoot ".cache\fingerprint-browser"
$extractDir = Join-Path $cacheDir "extract"

function Get-LatestReleaseTag {
  Write-Host "Checking latest fingerprint-chromium release..."
  $req = [System.Net.HttpWebRequest]::Create('https://github.com/adryfish/fingerprint-chromium/releases/latest')
  $req.AllowAutoRedirect = $true
  $req.MaximumAutomaticRedirections = 10
  $req.Timeout = 15000
  $resp = $req.GetResponse()
  $finalUrl = $resp.ResponseUri.ToString()
  $resp.Close()
  $tag = ($finalUrl -split '/')[-1]
  if ($tag -notmatch '^\d+\.\d+\.\d+\.\d+$') {
    throw "Invalid release tag: $tag"
  }
  return $tag
}

function Get-InstalledVersion {
  if (Test-Path -LiteralPath $versionFile) {
    return (Get-Content -LiteralPath $versionFile -Raw).Trim()
  }
  if (Test-Path -LiteralPath $chromeExe) {
    try {
      $v = (Get-Item -LiteralPath $chromeExe).VersionInfo.ProductVersion
      if ($v) { return $v.Trim() }
    } catch { }
  }
  return $null
}

$targetVersion = Get-LatestReleaseTag
$installedVersion = Get-InstalledVersion

if ($installedVersion -eq $targetVersion -and (Test-Path -LiteralPath $chromeExe)) {
  if (-not (Test-Path -LiteralPath $versionFile)) {
    Set-Content -LiteralPath $versionFile -Value $targetVersion -NoNewline -Encoding UTF8
  }
  Write-Host "Fingerprint Chromium $targetVersion already prepared: $chromeExe"
  exit 0
}

if ($installedVersion -and $installedVersion -ne $targetVersion) {
  Write-Host "Upgrading Fingerprint Chromium: $installedVersion -> $targetVersion"
}

$zipName = "ungoogled-chromium_$targetVersion-1.1_windows_x64.zip"
$downloadUrl = "https://github.com/adryfish/fingerprint-chromium/releases/download/$targetVersion/$zipName"
$zipPath = Join-Path $cacheDir $zipName

New-Item -ItemType Directory -Force -Path $cacheDir | Out-Null
New-Item -ItemType Directory -Force -Path $vendorDir | Out-Null

$expectedLength = $null
try {
  $head = Invoke-WebRequest -Uri $downloadUrl -Method Head -MaximumRedirection 5
  $expectedLength = [int64]$head.Headers["Content-Length"]
} catch {
  Write-Warning "Could not check remote archive size; continuing with local cache if present."
}

if ((Test-Path -LiteralPath $zipPath) -and $expectedLength) {
  $actualLength = (Get-Item -LiteralPath $zipPath).Length
  if ($actualLength -ne $expectedLength) {
    Write-Host "Cached archive is incomplete ($actualLength of $expectedLength bytes); downloading again."
    Remove-Item -LiteralPath $zipPath -Force
  }
}

if (-not (Test-Path -LiteralPath $zipPath)) {
  Write-Host "Downloading Fingerprint Chromium $targetVersion..."
  Invoke-WebRequest -Uri $downloadUrl -OutFile $zipPath
}

if (Test-Path -LiteralPath $extractDir) {
  Remove-Item -LiteralPath $extractDir -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $extractDir | Out-Null
Write-Host "Extracting Fingerprint Chromium..."
Expand-Archive -LiteralPath $zipPath -DestinationPath $extractDir -Force

$extractedChrome = Get-ChildItem -LiteralPath $extractDir -Recurse -Filter "chrome.exe" -File |
  Select-Object -First 1

if (-not $extractedChrome) {
  throw "Downloaded archive did not contain chrome.exe"
}

$sourceDir = $extractedChrome.Directory.FullName
Write-Host "Installing Fingerprint Chromium into $vendorDir"
Copy-Item -Path (Join-Path $sourceDir "*") -Destination $vendorDir -Recurse -Force

if (-not (Test-Path -LiteralPath $chromeExe)) {
  throw "Fingerprint Chromium install failed: $chromeExe was not created"
}

Set-Content -LiteralPath $versionFile -Value $targetVersion -NoNewline -Encoding UTF8

Write-Host "Fingerprint Chromium $targetVersion ready: $chromeExe"

