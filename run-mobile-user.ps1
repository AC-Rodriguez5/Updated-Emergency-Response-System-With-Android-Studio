# Runs the Flutter User app with API_BASE_URL pointing at the active Cloudflare
# tunnel (read from tunnel-url.txt). Run .\start-tunnel.ps1 first in another
# terminal.
#
# Because the tunnel URL is HTTPS, this also provisions the panic-button wearable
# for DIRECT cellular delivery: it posts alerts and GPS fixes to the backend itself
# rather than relaying through this phone over Bluetooth. The wearable finds its own
# APN from the SIM (Globe/TM/GOMO, Smart/TNT, DITO, Sun), so no APN is needed here.
#
# -Apn is an override for a SIM the firmware's table does not cover — an MVNO or a
# private APN. Leave it off for any ordinary Philippine SIM.
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

if ($api.StartsWith('https://')) {
  Write-Host "Direct cellular delivery -> ON" -ForegroundColor Green
  if ($Apn) {
    $defines += "--dart-define=CELLULAR_APN=$Apn"
    Write-Host "  APN override: $Apn" -ForegroundColor Cyan
  } else {
    Write-Host "  APN: found from the SIM (Globe/TM/GOMO, Smart/TNT, DITO, Sun)" -ForegroundColor Cyan
  }
  if ($CaFile) {
    $defines += "--dart-define=MODEM_CA_FILE=$CaFile"
    Write-Host "  Server certificate verified against $CaFile" -ForegroundColor Cyan
  } else {
    Write-Host "  WARNING: no -CaFile, so the wearable will NOT verify the backend's" -ForegroundColor Yellow
    Write-Host "  certificate. Traffic is encrypted but the device token is exposed to a" -ForegroundColor Yellow
    Write-Host "  man-in-the-middle. Load a CA onto the modem and pass -CaFile before" -ForegroundColor Yellow
    Write-Host "  deploying. See firmware/esp32/README.md." -ForegroundColor Yellow
  }
  Write-Host "  Re-pair the wearable after this launch for the change to reach it." -ForegroundColor Cyan
} else {
  Write-Host "Direct cellular delivery -> OFF (the API URL is not https://)" -ForegroundColor DarkGray
  Write-Host "  The wearable will relay alerts through this phone over Bluetooth." -ForegroundColor DarkGray
}

# Preflight: a stale adb server sometimes loses a USB device's serial number and
# reports it as "(no serial number)". Flutter then cannot read the device's
# properties ("Error 1 retrieving device properties"), calls it unsupported, and
# the install never starts. Restarting the server re-reads the serial.
$adb = if ($env:ANDROID_HOME) { Join-Path $env:ANDROID_HOME 'platform-tools\adb.exe' }
       elseif ($env:ANDROID_SDK_ROOT) { Join-Path $env:ANDROID_SDK_ROOT 'platform-tools\adb.exe' }
       else { Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe' }

if (Test-Path $adb) {
  if ((& $adb devices) -match '\(no serial number\)') {
    Write-Host "adb lost a device's serial number -- restarting the adb server." -ForegroundColor Yellow
    & $adb kill-server | Out-Null
    Start-Sleep -Seconds 1
    & $adb start-server | Out-Null
    if ((& $adb devices) -match '\(no serial number\)') {
      Write-Host "Still no serial number. Unplug and replug the cable (use 'File transfer'" -ForegroundColor Red
      Write-Host "USB mode), or go wireless: adb tcpip 5555; adb connect <phone-ip>:5555" -ForegroundColor Red
      exit 1
    }
  }
}

if ($DeviceId) { $defines += @('-d', $DeviceId) }

Set-Location (Join-Path $root 'MobileAppFlutter\mobileUser')
flutter run @defines
