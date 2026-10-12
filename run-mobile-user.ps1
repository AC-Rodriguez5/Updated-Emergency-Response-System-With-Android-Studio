# Runs the Flutter User app with API_BASE_URL pointing at the active Cloudflare
# tunnel (read from tunnel-url.txt). Run .\start-tunnel.ps1 first in another
# terminal.
#
# -Apn provisions the panic-button wearable for DIRECT cellular delivery, so it
# posts alerts and GPS fixes to the backend itself instead of relaying through
# this phone over Bluetooth. Without it the wearable still works, but every
# delivery depends on the phone being in range.
#
# -CaFile is the filename of a root CA ALREADY loaded into the modem's own
# filesystem with AT+CCERTDOWN (see firmware/esp32/README.md). Supply it and the
# wearable verifies the backend's certificate. Omit it and traffic is still
# encrypted but the server is not authenticated, which exposes the device token to
# a man-in-the-middle — fine for a bench run, not for deployment.

param(
  [string]$Apn = $env:TANZALERT_APN,
  [string]$CaFile = $env:TANZALERT_MODEM_CA,
  [string]$DeviceId
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$urlFile = Join-Path $root 'tunnel-url.txt'

if (-not (Test-Path $urlFile)) {
  Write-Host "tunnel-url.txt not found." -ForegroundColor Red
  Write-Host "Start the tunnel first: .\start-tunnel.ps1" -ForegroundColor Yellow
  exit 1
}

$base = (Get-Content $urlFile -Raw).Trim()
if (-not $base) {
  Write-Host "tunnel-url.txt is empty." -ForegroundColor Red
  exit 1
}

$api = "$base/api"
Write-Host "Mobile User app -> API_BASE_URL=$api" -ForegroundColor Cyan

$defines = @("--dart-define=API_BASE_URL=$api")

if ($Apn) {
  $defines += "--dart-define=CELLULAR_APN=$Apn"
  if ($CaFile) {
    $defines += "--dart-define=MODEM_CA_FILE=$CaFile"
    Write-Host "Direct cellular delivery -> ON (apn=$Apn, server cert verified against $CaFile)" -ForegroundColor Green
  } else {
    Write-Host "Direct cellular delivery -> ON (apn=$Apn)" -ForegroundColor Green
    Write-Host "  WARNING: no -CaFile, so the wearable will NOT verify the backend's" -ForegroundColor Yellow
    Write-Host "  certificate. Traffic is encrypted but the device token is exposed to a" -ForegroundColor Yellow
    Write-Host "  man-in-the-middle. Load a CA onto the modem and pass -CaFile before" -ForegroundColor Yellow
    Write-Host "  deploying. See firmware/esp32/README.md." -ForegroundColor Yellow
  }
  Write-Host "  Re-pair the wearable after this launch for the change to reach it." -ForegroundColor Cyan
} else {
  Write-Host "Direct cellular delivery -> OFF (pass -Apn <carrier apn> to enable)" -ForegroundColor DarkGray
  Write-Host "  The wearable will relay alerts through this phone over Bluetooth." -ForegroundColor DarkGray
}

if ($DeviceId) { $defines += @('-d', $DeviceId) }

Set-Location (Join-Path $root 'MobileAppFlutter\mobileUser')
flutter run @defines
