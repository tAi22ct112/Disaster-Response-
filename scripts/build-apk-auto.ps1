param(
  [string]$BackendDir = "C:\Users\Admin\Downloads\back-end",
  [string]$FrontendDir = "C:\Users\Admin\Downloads\DisasterResponseNetwork",
  [switch]$SkipBuild,
  [ValidateSet("auto", "quick", "named")]
  [string]$TunnelMode = "auto"
)

$ErrorActionPreference = "Stop"

function Get-CloudflaredPath {
  $candidates = @(
    (Join-Path ${env:ProgramFiles(x86)} "cloudflared\cloudflared.exe"),
    "C:\Program Files\Cloudflare\Cloudflared\cloudflared.exe"
  )

  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path $candidate)) {
      return $candidate
    }
  }

  throw "cloudflared.exe was not found. Please install cloudflared first."
}

function Assert-BackendHealth {
  $healthUrl = "http://localhost:4000/health"
  try {
    $resp = Invoke-RestMethod -Uri $healthUrl -Method Get -TimeoutSec 3
    if (-not $resp.status -or $resp.status -ne "ok") {
      throw "Unexpected health response from backend."
    }
  } catch {
    throw "Backend is not reachable at $healthUrl. Please start backend first (`cd $BackendDir; npm run dev`)."
  }
}

function Wait-TunnelUrl {
  param(
    [string]$LogPath,
    [int]$TimeoutSeconds = 30
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-Path $LogPath) {
      $content = Get-Content $LogPath -Raw -ErrorAction SilentlyContinue
      if ($content) {
        $matches = [regex]::Matches($content, "https://[a-z0-9-]+\.trycloudflare\.com")
        if ($matches.Count -gt 0) {
          return $matches[$matches.Count - 1].Value
        }
      }
    }
    Start-Sleep -Milliseconds 700
  }

  throw "Could not detect trycloudflare URL from tunnel log in time."
}

function Read-EnvFileValue {
  param(
    [string]$FilePath,
    [string]$Key
  )

  if (-not (Test-Path $FilePath)) {
    return $null
  }

  foreach ($line in (Get-Content $FilePath)) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#")) {
      continue
    }

    $parts = $trimmed.Split("=", 2)
    if ($parts.Count -ne 2) {
      continue
    }

    if ($parts[0].Trim() -ne $Key) {
      continue
    }

    $value = $parts[1].Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      return $value.Substring(1, $value.Length - 2).Trim()
    }
    return $value
  }

  return $null
}

function Stop-ExistingAutoTunnel {
  param(
    [string]$MetaPath
  )

  if (-not (Test-Path $MetaPath)) {
    return
  }

  try {
    $meta = Get-Content $MetaPath -Raw | ConvertFrom-Json
    $existingPid = [int]$meta.pid
    if ($existingPid -gt 0) {
      $existingProcess = Get-Process -Id $existingPid -ErrorAction SilentlyContinue
      if ($existingProcess) {
        Stop-Process -Id $existingPid -Force
      }
    }
  } catch {
    # ignore malformed metadata
  } finally {
    Remove-Item $MetaPath -Force -ErrorAction SilentlyContinue
  }
}

function Update-AppConfig {
  param(
    [string]$AppJsonPath,
    [string]$TunnelUrl
  )

  $raw = Get-Content $AppJsonPath -Raw
  $app = $raw | ConvertFrom-Json

  if (-not $app.expo) {
    throw "Invalid app.json: missing expo object."
  }
  if (-not $app.expo.extra) {
    $app.expo | Add-Member -NotePropertyName "extra" -NotePropertyValue ([pscustomobject]@{})
  }

  $app.expo.extra.apiBaseUrl = $TunnelUrl
  $app.expo.extra.apiDiscoveryUrl = "$TunnelUrl/api/system/discovery"

  $json = $app | ConvertTo-Json -Depth 100
  Set-Content -Path $AppJsonPath -Value $json -Encoding UTF8
}

function Normalize-PublicUrl {
  param([string]$Url)

  if ([string]::IsNullOrWhiteSpace($Url)) {
    return $null
  }

  $trimmed = $Url.Trim().TrimEnd("/")
  if (-not ($trimmed -match "^https://")) {
    throw "Named tunnel public URL must start with https://"
  }
  return $trimmed
}

Write-Output "1) Checking backend health..."
Assert-BackendHealth

$cloudflaredPath = Get-CloudflaredPath
$tunnelLogPath = Join-Path $BackendDir "tunnel-auto.log"
$tunnelMetaPath = Join-Path $BackendDir "tunnel-auto.json"
$tunnelEnvPath = Join-Path $BackendDir ".env.tunnel"

Stop-ExistingAutoTunnel -MetaPath $tunnelMetaPath

if (Test-Path $tunnelLogPath) {
  Remove-Item $tunnelLogPath -Force -ErrorAction SilentlyContinue
}
Set-Content -Path $tunnelLogPath -Value "" -Encoding UTF8

Write-Output "2) Starting Cloudflare tunnel..."

$namedToken = $env:CLOUDFLARED_TUNNEL_TOKEN
if ([string]::IsNullOrWhiteSpace($namedToken)) {
  $namedToken = Read-EnvFileValue -FilePath $tunnelEnvPath -Key "CLOUDFLARED_TUNNEL_TOKEN"
}

$namedPublicUrl = $env:CLOUDFLARED_PUBLIC_URL
if ([string]::IsNullOrWhiteSpace($namedPublicUrl)) {
  $namedPublicUrl = Read-EnvFileValue -FilePath $tunnelEnvPath -Key "CLOUDFLARED_PUBLIC_URL"
}
$namedPublicUrl = Normalize-PublicUrl -Url $namedPublicUrl

$useNamed = $false
if ($TunnelMode -eq "named") {
  $useNamed = $true
}
if ($TunnelMode -eq "auto" -and -not [string]::IsNullOrWhiteSpace($namedToken) -and -not [string]::IsNullOrWhiteSpace($namedPublicUrl)) {
  $useNamed = $true
}

if ($useNamed) {
  if ([string]::IsNullOrWhiteSpace($namedToken) -or [string]::IsNullOrWhiteSpace($namedPublicUrl)) {
    throw "TunnelMode=named but missing CLOUDFLARED_TUNNEL_TOKEN/CLOUDFLARED_PUBLIC_URL (env or $tunnelEnvPath)."
  }

  Write-Output "Using named tunnel mode (fixed URL)."
  $tunnelProcess = Start-Process `
    -FilePath $cloudflaredPath `
    -ArgumentList @("tunnel", "run", "--token", $namedToken, "--no-autoupdate", "--logfile", $tunnelLogPath, "--loglevel", "info") `
    -PassThru
} else {
  Write-Output "Using quick tunnel mode (temporary URL)."
  $tunnelProcess = Start-Process `
    -FilePath $cloudflaredPath `
    -ArgumentList @("tunnel", "--url", "http://localhost:4000", "--no-autoupdate", "--logfile", $tunnelLogPath, "--loglevel", "info") `
    -PassThru
}

Start-Sleep -Seconds 1
if ($tunnelProcess.HasExited) {
  throw "Tunnel process exited immediately. Please check cloudflared installation."
}

$tunnelUrl = if ($useNamed) { $namedPublicUrl } else { Wait-TunnelUrl -LogPath $tunnelLogPath -TimeoutSeconds 40 }
Write-Output "Tunnel URL: $tunnelUrl"

Write-Output "3) Updating frontend app.json..."
$appJsonPath = Join-Path $FrontendDir "app.json"
Update-AppConfig -AppJsonPath $appJsonPath -TunnelUrl $tunnelUrl

$meta = @{
  tunnelUrl = $tunnelUrl
  pid = $tunnelProcess.Id
  mode = if ($useNamed) { "named" } else { "quick" }
  startedAt = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssK")
  logPath = $tunnelLogPath
} | ConvertTo-Json
Set-Content -Path $tunnelMetaPath -Value $meta -Encoding UTF8

if ($SkipBuild) {
  Write-Output "SkipBuild enabled. Tunnel is running in background."
  Write-Output "PID: $($tunnelProcess.Id)"
  exit 0
}

Write-Output "4) Building release APK..."
Push-Location (Join-Path $FrontendDir "android")
try {
  & .\gradlew.bat assembleRelease
  if ($LASTEXITCODE -ne 0) {
    throw "Gradle build failed."
  }
} finally {
  Pop-Location
}

$apkPath = Join-Path $FrontendDir "android\app\build\outputs\apk\release\app-release.apk"
if (-not (Test-Path $apkPath)) {
  throw "Build finished but APK not found: $apkPath"
}

$apkFile = Get-Item $apkPath
Write-Output ""
Write-Output "DONE"
Write-Output "APK: $($apkFile.FullName)"
Write-Output "Size: $($apkFile.Length) bytes"
Write-Output "Tunnel URL: $tunnelUrl"
Write-Output "Tunnel PID: $($tunnelProcess.Id)"
Write-Output ""
Write-Output "Keep this terminal open if you want to monitor tunnel logs at:"
Write-Output $tunnelLogPath
