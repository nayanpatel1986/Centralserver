param(
    [switch]$IncludeExistingData
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$kind = if ($IncludeExistingData) { 'Migration' } else { 'Fresh' }
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$destination = Join-Path $root "CRMF-Offline-$kind-$stamp.zip"
$temporary = Join-Path $root "CRMF-Offline-$kind-$stamp.building.zip"

$required = @(
    'runtime\node\node.exe',
    'runtime\postgres\bin\postgres.exe',
    'runtime\postgres\share\extension\timescaledb.control',
    'backend\node_modules\pg\package.json',
    'frontend\node_modules\vite\package.json',
    'frontend\src\main.jsx',
    'frontend\dist\index.html',
    'db\init.sql',
    'assets\CRMF.ico',
    'assets\CRMF-splash.png',
    'backend\https-proxy.js',
    'Start-CMRF.bat',
    'Stop-CMRF.bat',
    'Start-CMRF.exe',
    'Stop-CMRF.exe',
    'launchers\Start-CMRF.bat',
    'launchers\Stop-CMRF.bat',
    'TRANSFER-README.md'
)
if ($IncludeExistingData) {
    $required += @(
        'portable.env',
        'portable-data\postgres\PG_VERSION',
        'portable-data\postgres\global\pg_control',
        'portable-data\postgres\.crmf-initialized',
        'portable-data\tls\config.json',
        'portable-data\tls\server.pfx',
        'portable-data\tls\passphrase.txt',
        'runtime\postgres\bin\pg_controldata.exe'
    )
}
foreach ($relativePath in $required) {
    $path = Join-Path $root $relativePath
    if (-not (Test-Path -LiteralPath $path)) { throw "Offline package dependency is missing: $path" }
}

if ($IncludeExistingData) {
    $data = Join-Path $root 'portable-data\postgres'
    if (Test-Path -LiteralPath (Join-Path $data 'postmaster.pid')) {
        throw 'PostgreSQL is still running or did not shut down cleanly. Stop CRMF before making a migration ZIP.'
    }
    $control = & (Join-Path $root 'runtime\postgres\bin\pg_controldata.exe') $data
    if ($LASTEXITCODE -ne 0 -or -not ($control -match 'Database cluster state:\s+shut down\s*$')) {
        throw 'PostgreSQL data is not in a clean shut-down state. Stop CRMF cleanly before packaging.'
    }
}

$items = @(
    'runtime',
    'backend',
    'db',
    'frontend',
    'assets',
    'launchers',
    'Start-CMRF.bat',
    'Stop-CMRF.bat',
    'Start-CMRF.exe',
    'Stop-CMRF.exe',
    'Start-CMRF.ps1',
    'Stop-CMRF.ps1',
    'Initialize-CMRF-Https.ps1',
    'Invoke-CMRF-Launcher.ps1',
    'Show-CMRF-Splash.ps1',
    'Create-CMRF-Desktop-Shortcuts.bat',
    'Create-CMRF-Desktop-Shortcuts.ps1',
    'Build-CMRF-Icon-Launchers.ps1',
    'Build-Portable-Runtime.ps1',
    'Prepare-Offline-Package.ps1',
    'Build-Offline-Zip.ps1',
    'portable.env.example',
    'docker-compose.yml',
    'README.md',
    'TRANSFER-README.md'
)
if ($IncludeExistingData) { $items += @('portable.env', 'portable-data') }

Write-Host "Creating CRMF $kind offline ZIP..." -ForegroundColor Cyan
Push-Location $root
try {
    & tar.exe -a -c -f $temporary @items
    if ($LASTEXITCODE -ne 0) { throw 'ZIP creation failed.' }
} finally {
    Pop-Location
}

$entries = & tar.exe -tf $temporary
if ($LASTEXITCODE -ne 0) { throw 'ZIP validation failed: cannot list archive entries.' }
foreach ($entry in @('frontend/src/main.jsx', 'frontend/dist/index.html', 'frontend/node_modules/vite/package.json', 'Start-CMRF.bat', 'Stop-CMRF.bat', 'Start-CMRF.exe', 'Stop-CMRF.exe', 'assets/CRMF.ico', 'TRANSFER-README.md')) {
    if ($entries -notcontains $entry) { throw "ZIP validation failed: missing $entry" }
}
if ($IncludeExistingData) {
    foreach ($entry in @('portable.env', 'portable-data/postgres/PG_VERSION', 'portable-data/postgres/global/pg_control', 'portable-data/tls/config.json')) {
        if ($entries -notcontains $entry) { throw "Migration ZIP validation failed: missing $entry" }
    }
    if ($entries -contains 'portable-data/postgres/postmaster.pid') { throw 'Migration ZIP contains a live PostgreSQL lock file.' }
} elseif ($entries -contains 'portable.env' -or $entries -contains 'portable-data/postgres/PG_VERSION') {
    throw 'Fresh ZIP unexpectedly contains existing CRMF secrets or data.'
}

Move-Item -LiteralPath $temporary -Destination $destination
$hash = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash
$checksumPath = "$destination.sha256.txt"
"SHA256  $hash  $(Split-Path -Leaf $destination)" | Set-Content -LiteralPath $checksumPath -Encoding ASCII
$archive = Get-Item -LiteralPath $destination
Write-Host "Created: $($archive.FullName)" -ForegroundColor Green
Write-Host "Checksum: $checksumPath"
Write-Host ('Size: {0:N2} MB' -f ($archive.Length / 1MB))
if ($IncludeExistingData) {
    Write-Host 'This ZIP contains the existing database, device credentials, administrator settings and HTTPS private key. Keep it private.' -ForegroundColor Yellow
}
