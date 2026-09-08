#requires -Version 5.1
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$Stage = 'startup'
$Project = $null
$Patch = $null
$Checkpoint = $null
$GitHeadBefore = $null
$GitCommitCreated = $false
$GitBranch = $null
$Changed = @(
  'app\page.tsx',
  'app\globals.css',
  'app\components\MaterialsPlanningPanel.tsx',
  'tests\contrast-procurement-analysis.test.mjs',
  'docs\CHANGE_05P_CONTRAST_PROCUREMENT_ANALYSIS.md'
)

function Show-Step([string]$Text) {
  Write-Host ''
  Write-Host '============================================================'
  Write-Host $Text
  Write-Host '============================================================'
}

function Restore-Checkpoint {
  if (-not $Checkpoint -or -not (Test-Path -LiteralPath $Checkpoint)) { return }
  foreach ($rel in $Changed) {
    $saved = Join-Path $Checkpoint $rel
    $target = Join-Path $Project $rel
    $missing = $saved + '.MISSING'
    if (Test-Path -LiteralPath $saved) {
      $parent = Split-Path -Parent $target
      if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
      Copy-Item -LiteralPath $saved -Destination $target -Force
    }
    elseif (Test-Path -LiteralPath $missing) {
      if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Force }
    }
  }
}

try {
  $Stage = 'paths'
  $UserHome = [Environment]::GetFolderPath('UserProfile')
  if ([string]::IsNullOrWhiteSpace($UserHome)) { $UserHome = $env:USERPROFILE }
  $Patch = Join-Path $PSScriptRoot 'patch'
  $CheckpointRoot = Join-Path $UserHome 'KLM-v32-checkpoints'
  $Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $Checkpoint = Join-Path $CheckpointRoot ('before-change-05P-' + $Stamp)

  # The Windows account can be renamed while its existing KLM source remains in
  # another profile folder (for example C:\Users\Adm-KLM). Find only an exact
  # KLM-v32-recovery\source tree and validate it before selecting the project.
  $ProjectCandidates = New-Object System.Collections.Generic.List[string]
  $ProjectCandidates.Add((Join-Path $UserHome 'KLM-v32-recovery\source'))
  $ProjectCandidates.Add('C:\Users\Adm-KLM\KLM-v32-recovery\source')
  $ProfilesRoot = Split-Path -Parent $UserHome
  if ($ProfilesRoot -and (Test-Path -LiteralPath $ProfilesRoot)) {
    foreach ($profile in Get-ChildItem -LiteralPath $ProfilesRoot -Directory -ErrorAction SilentlyContinue) {
      $ProjectCandidates.Add((Join-Path $profile.FullName 'KLM-v32-recovery\source'))
    }
  }
  $Project = @($ProjectCandidates | Select-Object -Unique | Where-Object {
    (Test-Path -LiteralPath $_) -and
    (Test-Path -LiteralPath (Join-Path $_ 'wrangler.jsonc')) -and
    (Test-Path -LiteralPath (Join-Path $_ 'app\page.tsx'))
  } | Select-Object -First 1)
  if ($Project.Count -gt 0) { $Project = [string]$Project[0] } else { $Project = $null }

  Show-Step 'KLM v32 - CUMULATIVE CHANGE 05P R2 CONTRAST AND PROCUREMENT ANALYSIS'
  if (-not $Project) {
    $Attempted = ($ProjectCandidates | Select-Object -Unique) -join '; '
    Write-Host ('Automatic search checked: ' + $Attempted) -ForegroundColor Yellow
    $ManualProject = Read-Host 'Paste the full path to the working KLM source folder (the folder containing wrangler.jsonc), or press Enter to stop'
    $ManualProject = [Environment]::ExpandEnvironmentVariables(($ManualProject -as [string]).Trim().Trim('"'))
    if ($ManualProject -and (Test-Path -LiteralPath (Join-Path $ManualProject 'source\wrangler.jsonc'))) {
      $ManualProject = Join-Path $ManualProject 'source'
    }
    if ($ManualProject -and (Test-Path -LiteralPath (Join-Path $ManualProject 'wrangler.jsonc')) -and (Test-Path -LiteralPath (Join-Path $ManualProject 'app\page.tsx'))) {
      $Project = $ManualProject
    } else {
      throw ('Working KLM source was not found. Checked: ' + $Attempted)
    }
  }
  $Wrangler = Join-Path $Project 'wrangler.jsonc'
  $VinextCli = Join-Path $Project 'node_modules\vinext\dist\cli.js'

  Write-Host ('Project: ' + $Project)
  Write-Host ('Patch:   ' + $Patch)

  if (-not (Test-Path -LiteralPath $Patch)) { throw ('Patch folder not found: ' + $Patch) }
  if (-not (Test-Path -LiteralPath $Wrangler)) { throw ('wrangler.jsonc not found: ' + $Wrangler) }
  if (-not (Test-Path -LiteralPath $VinextCli)) {
    $Stage = 'dependencies'
    Show-Step 'Restore local project dependencies'
    $PackageJson = Join-Path $Project 'package.json'
    if (-not (Test-Path -LiteralPath $PackageJson)) { throw ('package.json not found: ' + $PackageJson) }
    Push-Location $Project
    try {
      Write-Host 'Local Vinext CLI is missing. RUN: npm.cmd install --no-audit --no-fund' -ForegroundColor Yellow
      & npm.cmd install --no-audit --no-fund
      if ($LASTEXITCODE -ne 0) { throw ('npm install failed. Exit code: ' + $LASTEXITCODE) }
    } finally { Pop-Location }
    if (-not (Test-Path -LiteralPath $VinextCli)) { throw ('Dependencies were installed, but Vinext CLI is still missing: ' + $VinextCli) }
  }

  $Stage = 'preflight'
  Show-Step '0/6 Preflight - verify cumulative CHANGE 05L source'
  $RequiredBase = @(
    'app\page.tsx',
    'app\components\MaterialsPlanningPanel.tsx',
    'app\components\ControlCalculationPanel.tsx',
    'app\lib\manufacturingRules.ts',
    'app\lib\sectionFormulaCode.ts',
    'tests'
  )
  foreach ($rel in $RequiredBase) {
    if (-not (Test-Path -LiteralPath (Join-Path $Project $rel))) { throw ('Required cumulative KLM v32 source is missing: ' + $rel + '. Do not deploy; restore the latest working source first.') }
  }
  $PageText = Get-Content -LiteralPath (Join-Path $Project 'app\page.tsx') -Raw -Encoding UTF8
  $ManufacturingText = Get-Content -LiteralPath (Join-Path $Project 'app\lib\manufacturingRules.ts') -Raw -Encoding UTF8
  if ($PageText -notmatch 'exportProjectResourceSpecification' -or $PageText -notmatch 'applyNominalScenario' -or $ManufacturingText -notmatch 'isJointSpecificationRow') { throw 'CHANGE 05L cumulative working source was not detected. Update stopped before changing files.' }
  Write-Host 'Preflight OK: cumulative CHANGE 05L source detected. This package includes CHANGE 05M-05O and CHANGE 05P. Existing D1/R2 bindings will be reused; no migration is required.' -ForegroundColor Green
  $ManifestPath = Join-Path $PSScriptRoot 'PATCH_SHA256.txt'
  if (-not (Test-Path -LiteralPath $ManifestPath)) { throw 'PATCH_SHA256.txt is missing.' }
  foreach ($line in Get-Content -LiteralPath $ManifestPath -Encoding UTF8) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    $parts = $line -split '\s{2,}',2
    if ($parts.Count -ne 2) { throw ('Invalid checksum line: ' + $line) }
    $expected = $parts[0].Trim().ToLowerInvariant()
    $rel = $parts[1].Trim().Replace('/','\')
    $file = Join-Path $Patch $rel
    if (-not (Test-Path -LiteralPath $file)) { throw ('Patch file missing during checksum verification: ' + $rel) }
    $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $file).Hash.ToLowerInvariant()
    if ($actual -ne $expected) { throw ('Patch checksum mismatch: ' + $rel) }
  }
  Write-Host 'Patch SHA256 verification: OK' -ForegroundColor Green

  $Stage = 'checkpoint'
  Show-Step '1/6 Checkpoint'
  New-Item -ItemType Directory -Path $Checkpoint -Force | Out-Null
  foreach ($rel in $Changed) {
    $target = Join-Path $Project $rel
    $saved = Join-Path $Checkpoint $rel
    $parent = Split-Path -Parent $saved
    if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    if (Test-Path -LiteralPath $target) {
      Copy-Item -LiteralPath $target -Destination $saved -Force
    } else {
      New-Item -ItemType File -Path ($saved + '.MISSING') -Force | Out-Null
    }
  }
  Copy-Item -LiteralPath $Wrangler -Destination (Join-Path $Checkpoint 'wrangler.jsonc') -Force
  Write-Host ('Checkpoint: ' + $Checkpoint)

  $Stage = 'install patch'
  Show-Step '2/6 Install patch'
  foreach ($rel in $Changed) {
    $from = Join-Path $Patch $rel
    $to = Join-Path $Project $rel
    if (-not (Test-Path -LiteralPath $from)) { throw ('Patch file missing: ' + $rel) }
    $parent = Split-Path -Parent $to
    if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    Copy-Item -LiteralPath $from -Destination $to -Force
  }

  $Stage = 'build'
  Show-Step '3/6 Clean build'
  Push-Location $Project
  try {
    $dist = Join-Path $Project 'dist'
    if (Test-Path -LiteralPath $dist) { Remove-Item -LiteralPath $dist -Recurse -Force }
    Write-Host ('RUN: node.exe "' + $VinextCli + '" build')
    & node.exe $VinextCli build
    $code = $LASTEXITCODE
    if ($code -ne 0) { throw ('vinext build failed. Exit code: ' + $code) }
    if (-not (Test-Path -LiteralPath (Join-Path $Project 'dist\client'))) { throw 'Build completed but dist\client is missing.' }
  } finally { Pop-Location }

  $Stage = 'tests'
  Show-Step '4/6 Tests'
  Push-Location $Project
  try {
    $tests = @(Get-ChildItem -LiteralPath (Join-Path $Project 'tests') -Filter '*.test.mjs' | Sort-Object Name | ForEach-Object { $_.FullName })
    & node.exe --experimental-strip-types --test @tests
    $code = $LASTEXITCODE
    if ($code -ne 0) { throw ('Tests failed. Exit code: ' + $code) }
  } finally { Pop-Location }

  Show-Step '5/6 Git version commit'
  $Stage = 'git availability'

  # Resolve Git without assuming git.exe is already present in PATH.
  $GitExe = $null
  $gitCmd = Get-Command git.exe -ErrorAction SilentlyContinue
  if ($gitCmd) { $GitExe = $gitCmd.Source }
  if (-not $GitExe) {
    $gitCandidates = @( @(
      (Join-Path $env:ProgramFiles 'Git\cmd\git.exe'),
      (Join-Path ${env:ProgramFiles(x86)} 'Git\cmd\git.exe'),
      (Join-Path $env:LOCALAPPDATA 'Programs\Git\cmd\git.exe')
    ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } )
    if ($gitCandidates.Count -gt 0) { $GitExe = [string]$gitCandidates[0] }
  }

  if (-not $GitExe) {
    Write-Host 'Git was not found. Trying to install Git for Windows with winget...' -ForegroundColor Yellow
    $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
    if (-not $winget) {
      throw 'Git is not installed and winget is unavailable. Install Git for Windows, then run this updater again.'
    }
    & $winget.Source install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements --silent
    if ($LASTEXITCODE -ne 0) { throw ('Git for Windows installation failed. Exit code: ' + $LASTEXITCODE) }
    $gitCandidates = @( @(
      (Join-Path $env:ProgramFiles 'Git\cmd\git.exe'),
      (Join-Path ${env:ProgramFiles(x86)} 'Git\cmd\git.exe'),
      (Join-Path $env:LOCALAPPDATA 'Programs\Git\cmd\git.exe')
    ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } )
    if ($gitCandidates.Count -eq 0) { throw 'Git installation finished, but git.exe could not be located.' }
    $GitExe = [string]$gitCandidates[0]
  }

  if ([string]::IsNullOrWhiteSpace($GitExe) -or -not (Test-Path -LiteralPath $GitExe)) { throw ('Resolved Git path is invalid: ' + $GitExe) }
  Write-Host ('Git: ' + $GitExe) -ForegroundColor DarkGray
  & $GitExe --version | Out-Host
  if ($LASTEXITCODE -ne 0) { throw ('git --version failed. Exit code: ' + $LASTEXITCODE) }
  $Stage = 'git commit'
  Push-Location $Project
  try {
    if (-not (Test-Path -LiteralPath (Join-Path $Project '.git'))) {
      & $GitExe init | Out-Host
      if ($LASTEXITCODE -ne 0) { throw ('git init failed. Exit code: ' + $LASTEXITCODE) }
    }

    # Detect an unborn repository without running a Git command that exits non-zero.
    # PowerShell 5.1 with ErrorActionPreference=Stop can promote native stderr to a terminating error,
    # so `git rev-parse --verify HEAD` is intentionally not used here.
    $GitBranch = ((& $GitExe symbolic-ref --short HEAD 2>$null) | Select-Object -First 1)
    if ($GitBranch) { $GitBranch = $GitBranch.Trim() }

    $headCandidates = @(& $GitExe for-each-ref --format='%(objectname)' --count=1 refs/heads)
    if ($LASTEXITCODE -ne 0) { throw ('git for-each-ref failed. Exit code: ' + $LASTEXITCODE) }
    $headCandidate = ($headCandidates | Select-Object -First 1)
    if (-not [string]::IsNullOrWhiteSpace($headCandidate)) {
      $GitHeadBefore = $headCandidate.Trim()
    } else {
      $GitHeadBefore = $null
      Write-Host 'Git: empty repository detected; creating initial full-project commit.' -ForegroundColor DarkGray
    }

    $email = (& $GitExe config user.email) 2>$null
    if ([string]::IsNullOrWhiteSpace($email)) { & $GitExe config user.email 'klm-local@bannikov.local' }
    $name = (& $GitExe config user.name) 2>$null
    if ([string]::IsNullOrWhiteSpace($name)) { & $GitExe config user.name 'KLM Local Versioning' }
    if ([string]::IsNullOrWhiteSpace($GitHeadBefore)) {
      # First commit is the project baseline. .gitignore excludes node_modules/dist/runtime artifacts.
      & $GitExe add -A
      if ($LASTEXITCODE -ne 0) { throw ('git add -A failed for initial baseline. Exit code: ' + $LASTEXITCODE) }
    } else {
      foreach ($rel in $Changed) {
        & $GitExe add -- $rel
        if ($LASTEXITCODE -ne 0) { throw ('git add failed for ' + $rel + '. Exit code: ' + $LASTEXITCODE) }
      }
    }

    & $GitExe diff --cached --quiet
    $stagedExit = $LASTEXITCODE
    if ($stagedExit -eq 0) {
      Write-Host 'Git: no staged changes; commit is not required.' -ForegroundColor DarkGray
    } elseif ($stagedExit -eq 1) {
      & $GitExe commit -m 'KLM v32 CHANGE 05P: contrast and procurement comparison'
      if ($LASTEXITCODE -ne 0) { throw ('git commit failed. Exit code: ' + $LASTEXITCODE) }
      $GitCommitCreated = $true
    } else {
      throw ('git diff --cached --quiet failed. Exit code: ' + $stagedExit)
    }
  } finally { Pop-Location }

  $Stage = 'deploy'
  Show-Step '6/6 Deploy'
  Push-Location $Project
  try {
    Write-Host ('RUN: npx.cmd wrangler deploy --config "' + $Wrangler + '"')
    & npx.cmd wrangler deploy --config $Wrangler
    $code = $LASTEXITCODE
    if ($code -ne 0) { throw ('wrangler deploy failed. Exit code: ' + $code) }
  } finally { Pop-Location }

  $Stage = 'done'
  Show-Step 'DONE'
  Write-Host 'https://klm-v32.bannikov-06.workers.dev'
  Write-Host ('Checkpoint: ' + $Checkpoint)
  Write-Host 'Installed: cumulative CHANGE 05P. Theme contrast, requirements Excel export and comparative procurement workbook are enabled. CHANGE 05M-05O are included. Existing D1/R2 bindings are preserved.'
  Read-Host 'Press Enter to close'
}
catch {
  Write-Host ''
  Write-Host 'ERROR - deployment was NOT accepted.' -ForegroundColor Red
  Write-Host ('Stage: ' + $Stage) -ForegroundColor Yellow
  Write-Host ('Message: ' + $_.Exception.Message) -ForegroundColor Red
  if ($_.InvocationInfo -and $_.InvocationInfo.PositionMessage) {
    Write-Host $_.InvocationInfo.PositionMessage -ForegroundColor DarkYellow
  }
  if ($Project -and $Checkpoint -and (Test-Path -LiteralPath $Checkpoint)) {
    try {
      if ($GitCommitCreated -and $Project -and (Test-Path -LiteralPath (Join-Path $Project '.git'))) {
    Push-Location $Project
    try {
      if ($GitExe) {
        if (-not [string]::IsNullOrWhiteSpace($GitHeadBefore)) {
          & $GitExe reset --hard $GitHeadBefore | Out-Host
        } else {
          # The failed deployment followed the repository's first commit. Remove the branch ref
          # so the project returns to an unborn/empty Git history, then clear the index only.
          if (-not [string]::IsNullOrWhiteSpace($GitBranch)) { & $GitExe update-ref -d ('refs/heads/' + $GitBranch) 2>$null | Out-Null }
          & $GitExe rm --cached -r --ignore-unmatch . 2>$null | Out-Null
        }
      }
    } catch {} finally { Pop-Location }
  }
  Restore-Checkpoint
      Write-Host 'Project files restored from checkpoint.' -ForegroundColor Green
    } catch {
      Write-Host ('Rollback error: ' + $_.Exception.Message) -ForegroundColor Red
    }
  }
  Write-Host 'D1 and R2 were not changed by this updater.' -ForegroundColor Yellow
  Write-Host 'Send a screenshot of the final lines including Stage and Message.' -ForegroundColor Yellow
  Read-Host 'Press Enter to close'
  exit 1
}
