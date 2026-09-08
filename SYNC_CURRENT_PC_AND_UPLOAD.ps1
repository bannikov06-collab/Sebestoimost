#requires -Version 5.1
$ErrorActionPreference = 'Stop'

try {
  $BundleRoot = $PSScriptRoot
  $UserHome = [Environment]::GetFolderPath('UserProfile')
  $Candidates = New-Object System.Collections.Generic.List[string]
  $Candidates.Add((Join-Path $UserHome 'KLM-v32-recovery\source'))
  $Candidates.Add('C:\Users\Adm-KLM\KLM-v32-recovery\source')
  $ProfilesRoot = Split-Path -Parent $UserHome
  if ($ProfilesRoot -and (Test-Path -LiteralPath $ProfilesRoot)) {
    foreach ($Profile in Get-ChildItem -LiteralPath $ProfilesRoot -Directory -ErrorAction SilentlyContinue) {
      $Candidates.Add((Join-Path $Profile.FullName 'KLM-v32-recovery\source'))
    }
  }

  $WorkingSource = @($Candidates | Select-Object -Unique | Where-Object {
    (Test-Path -LiteralPath (Join-Path $_ 'wrangler.jsonc')) -and
    (Test-Path -LiteralPath (Join-Path $_ 'app\page.tsx'))
  } | Select-Object -First 1)

  if ($WorkingSource.Count -eq 0) {
    throw 'Working KLM source was not found. Run this file on the computer that contains KLM-v32-recovery\source.'
  }
  $WorkingSource = [string]$WorkingSource[0]
  Write-Host ('Working source: ' + $WorkingSource) -ForegroundColor Green

  $TargetSource = Join-Path $BundleRoot 'source'
  New-Item -ItemType Directory -Path $TargetSource -Force | Out-Null
  & robocopy.exe $WorkingSource $TargetSource /E /R:1 /W:1 /XD node_modules dist .next .wrangler .git /XF .env .env.* *.pem *.key
  $RoboCode = $LASTEXITCODE
  if ($RoboCode -ge 8) { throw ('Copy of the working source failed. Robocopy exit code: ' + $RoboCode) }

  $DatabaseDir = Join-Path $BundleRoot 'database'
  New-Item -ItemType Directory -Path $DatabaseDir -Force | Out-Null
  $D1Export = Join-Path $DatabaseDir 'klm-v32-db-production-current.sql'
  Push-Location $TargetSource
  try {
    Write-Host 'Exporting the current production D1 database...' -ForegroundColor Cyan
    & npx.cmd wrangler d1 export klm-v32-db --remote --output $D1Export --config (Join-Path $TargetSource 'wrangler.jsonc')
    if ($LASTEXITCODE -ne 0) { throw ('D1 export failed. Exit code: ' + $LASTEXITCODE) }
  } finally {
    Pop-Location
  }

  Push-Location $BundleRoot
  try {
    if (-not (Get-Command git.exe -ErrorAction SilentlyContinue)) { throw 'Git for Windows is not installed or is not available in PATH.' }
    if (-not (Test-Path -LiteralPath '.git')) { & git.exe init }
    & git.exe branch -M main
    & git.exe remote get-url origin 2>$null
    if ($LASTEXITCODE -ne 0) {
      & git.exe remote add origin 'https://github.com/bannikov06-collab/Sebestoimost.git'
    } else {
      & git.exe remote set-url origin 'https://github.com/bannikov06-collab/Sebestoimost.git'
    }
    & git.exe add -A
    & git.exe diff --cached --quiet
    if ($LASTEXITCODE -ne 0) {
      & git.exe commit -m 'KLM v32: sync working source and current D1 export'
      if ($LASTEXITCODE -ne 0) { throw ('Git commit failed. Exit code: ' + $LASTEXITCODE) }
    }
    Write-Host 'Uploading to GitHub. Git Credential Manager may ask you to sign in.' -ForegroundColor Cyan
    & git.exe push -u origin main
    if ($LASTEXITCODE -ne 0) { throw ('GitHub did not accept the upload. Exit code: ' + $LASTEXITCODE) }
  } finally {
    Pop-Location
  }

  Write-Host 'DONE: https://github.com/bannikov06-collab/Sebestoimost' -ForegroundColor Green
}
catch {
  Write-Host ''
  Write-Host 'ERROR: upload was not completed.' -ForegroundColor Red
  Write-Host ('Message: ' + $_.Exception.Message) -ForegroundColor Yellow
  Write-Host 'No Cloudflare data was changed.'
  Read-Host 'Press Enter to close'
  exit 1
}

Read-Host 'Press Enter to close'
