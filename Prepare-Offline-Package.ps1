$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot

Write-Host 'Preparing the self-contained CRMF offline package...' -ForegroundColor Cyan
& (Join-Path $Root 'Build-Portable-Runtime.ps1')
if ($LASTEXITCODE -ne 0) { throw 'Portable runtime preparation failed.' }

Push-Location (Join-Path $Root 'backend')
try { npm ci --omit=dev } finally { Pop-Location }
if ($LASTEXITCODE -ne 0) { throw 'Backend dependency installation failed.' }

Push-Location (Join-Path $Root 'frontend')
try {
    npm ci
    if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency installation failed.' }
    npm run build
} finally { Pop-Location }
if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }

foreach ($Path in @(
    (Join-Path $Root 'runtime\node\node.exe'),
    (Join-Path $Root 'runtime\postgres\bin\postgres.exe'),
    (Join-Path $Root 'runtime\postgres\lib\timescaledb-2.28.3.dll'),
    (Join-Path $Root 'runtime\postgres\share\extension\timescaledb.control'),
    (Join-Path $Root 'backend\node_modules\pg\package.json'),
    (Join-Path $Root 'frontend\node_modules\vite\package.json'),
    (Join-Path $Root 'frontend\dist\index.html')
)) {
    if (-not (Test-Path -LiteralPath $Path)) { throw "Offline package validation failed: missing $Path" }
}

Write-Host ''
Write-Host 'Offline package is ready.' -ForegroundColor Green
Write-Host 'Copy the complete project folder to the offline PC, run Create-CMRF-Desktop-Shortcuts.bat, then use Start-CMRF.'
Write-Host 'Do not include portable.env or portable-data from a machine that already contains secrets or telemetry.' -ForegroundColor Yellow
