$ErrorActionPreference = "Stop"

$backendDir = "C:\Users\Admin\Downloads\back-end"
$metaPath = Join-Path $backendDir "tunnel-auto.json"

if (-not (Test-Path $metaPath)) {
  Write-Output "No tunnel metadata found at $metaPath"
  exit 0
}

$meta = Get-Content $metaPath -Raw | ConvertFrom-Json
$tunnelPid = [int]$meta.pid

if ($tunnelPid -gt 0) {
  $process = Get-Process -Id $tunnelPid -ErrorAction SilentlyContinue
  if ($process) {
    Stop-Process -Id $tunnelPid -Force
    Write-Output "Stopped tunnel process PID $tunnelPid"
  } else {
    Write-Output "Tunnel PID $tunnelPid is not running."
  }
}

Remove-Item $metaPath -Force -ErrorAction SilentlyContinue
Write-Output "Cleaned tunnel metadata."
