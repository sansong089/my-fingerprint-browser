$ErrorActionPreference = "Stop"

$downloadUrl = "https://github.com/adryfish/fingerprint-chromium/releases/download/144.0.7559.132/ungoogled-chromium_144.0.7559.132-1.1_windows_x64.zip"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$vendorDir = Join-Path $repoRoot "vendor\fingerprint-chromium"
$chromeExe = Join-Path $vendorDir "chrome.exe"
$cacheDir = Join-Path $repoRoot ".cache\fingerprint-browser"
$zipPath = Join-Path $cacheDir "ungoogled-chromium_144.0.7559.132-1.1_windows_x64.zip"
$extractDir = Join-Path $cacheDir "extract"

if (Test-Path -LiteralPath $chromeExe) {
  Write-Host "Fingerprint Chromium already prepared: $chromeExe"
  exit 0
}

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
    try {
      Remove-Item -LiteralPath $zipPath -Force
    } catch {
      $zipPath = Join-Path $cacheDir "ungoogled-chromium_144.0.7559.132-1.1_windows_x64.$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds()).zip"
      Write-Warning "Could not remove cached archive because it is locked; using $zipPath"
    }
  }
}

if (-not (Test-Path -LiteralPath $zipPath)) {
  Write-Host "Downloading Fingerprint Chromium..."
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

Write-Host "Fingerprint Chromium ready: $chromeExe"
