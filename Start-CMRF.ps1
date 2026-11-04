param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot
$Runtime = Join-Path $Root 'runtime'
$Data = Join-Path $Root 'portable-data'
$Run = Join-Path $Root 'run'
$Logs = Join-Path $Root 'logs'
$Settings = Join-Path $Root 'portable.env'
$Node = Join-Path $Runtime 'node\node.exe'
$PgCtl = Join-Path $Runtime 'postgres\bin\pg_ctl.exe'
$InitDb = Join-Path $Runtime 'postgres\bin\initdb.exe'
$Psql = Join-Path $Runtime 'postgres\bin\psql.exe'
$Backend = Join-Path $Root 'backend\server.js'
$HttpsProxy = Join-Path $Root 'backend\https-proxy.js'
$FrontendDist = Join-Path $Root 'frontend\dist'

function Fail([string]$Message) { throw $Message }
function Ensure-Dir([string]$Path) { New-Item -ItemType Directory -Force -Path $Path | Out-Null }
function New-RandomHex([int]$ByteCount) {
    $bytes = New-Object byte[] $ByteCount
    $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $generator.GetBytes($bytes) }
    finally { $generator.Dispose() }
    return ([BitConverter]::ToString($bytes).Replace('-', '')).ToLowerInvariant()
}
function Test-Port([int]$Port) {
    $client = New-Object Net.Sockets.TcpClient
    try { $task = $client.ConnectAsync('127.0.0.1', $Port); return $task.Wait(500) -and $client.Connected }
    catch { return $false }
    finally { $client.Dispose() }
}
function Test-BackendReady([int]$Port) {
    try {
        $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/healthz" -TimeoutSec 2
        return ($health.ok -eq $true -and $health.service -eq 'crmf-backend')
    }
    catch { return $false }
}
function Load-Env([string]$File) {
    if (-not (Test-Path -LiteralPath $File)) { return }
    Get-Content -LiteralPath $File | ForEach-Object {
        $line = $_.Trim().TrimStart([char]0xFEFF)
        if ($line -and -not $line.StartsWith('#') -and $line -match '^([^=]+)=(.*)$') {
            [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2], 'Process')
        }
    }
}
function Start-Managed([string]$Name, [string]$File, [string]$Arguments, [string]$WorkingDirectory) {
    $PidFile = Join-Path $Run "$Name.pid"
    if (Test-Path -LiteralPath $PidFile) {
        $oldPid = 0
        if ([int]::TryParse((Get-Content -LiteralPath $PidFile -Raw), [ref]$oldPid) -and (Get-Process -Id $oldPid -ErrorAction SilentlyContinue)) {
            Write-Host "$Name is already running (PID $oldPid)."; return
        }
        Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
    }
    $Out = Join-Path $Logs "$Name.log"
    $Err = Join-Path $Logs "$Name.err.log"
    $Process = Start-Process -FilePath $File -ArgumentList $Arguments -WorkingDirectory $WorkingDirectory -WindowStyle Hidden -RedirectStandardOutput $Out -RedirectStandardError $Err -PassThru
    Set-Content -LiteralPath $PidFile -Value $Process.Id -Encoding ASCII
    Write-Host "Started $Name (PID $($Process.Id))."
}
function Start-HttpsProxy {
    $configPath = Join-Path $Data 'tls\config.json'
    if (-not (Test-Path -LiteralPath $configPath)) { return }
    if (-not (Test-Path -LiteralPath $HttpsProxy)) { Fail "Missing HTTPS proxy: $HttpsProxy" }
    $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
    $httpsPort = [int]$config.httpsPort
    $env:CRMF_TLS_PFX_FILE = Join-Path $Data 'tls\server.pfx'
    $env:CRMF_TLS_PASSPHRASE_FILE = Join-Path $Data 'tls\passphrase.txt'
    $env:CRMF_HTTPS_PORT = [string]$httpsPort
    $env:CRMF_HTTP_PORT = $env:PORT
    foreach ($required in @($env:CRMF_TLS_PFX_FILE, $env:CRMF_TLS_PASSPHRASE_FILE)) {
        if (-not (Test-Path -LiteralPath $required)) { Fail "Missing HTTPS certificate file: $required" }
    }
    if (-not (Test-Port $httpsPort)) {
        Start-Managed 'https-proxy' $Node "`"$HttpsProxy`"" $Root
        for ($i = 0; $i -lt 20 -and -not (Test-Port $httpsPort); $i++) { Start-Sleep -Milliseconds 500 }
    }
    if (-not (Test-Port $httpsPort)) { Fail 'CRMF HTTPS did not start. Review logs\https-proxy.err.log.' }
    Write-Host "CRMF HTTPS is available at https://$($config.hostIp):$httpsPort" -ForegroundColor Green
}

Ensure-Dir $Data; Ensure-Dir $Run; Ensure-Dir $Logs
if (-not (Test-Path -LiteralPath $Settings)) {
    $adminPassword = Read-Host 'Create the CRMF local admin password (minimum 8 characters)'
    if ([string]::IsNullOrWhiteSpace($adminPassword) -or $adminPassword.Length -lt 8) { Fail 'Admin password must be at least 8 characters.' }
    $jwt = New-RandomHex 48
    $ingest = New-RandomHex 48
    $pgPassword = New-RandomHex 32
    @(
        "ADMIN_PASSWORD=$adminPassword",
        "JWT_SECRET=$jwt",
        "INGEST_TOKEN=$ingest",
        'FLEET_SIZE=50',
        "PGPASSWORD=$pgPassword"
    ) | Set-Content -LiteralPath $Settings -Encoding UTF8
    Write-Host "Created $Settings. Keep it private." -ForegroundColor Yellow
}
Load-Env $Settings
$env:NODE_ENV = 'production'
$env:PGHOST = '127.0.0.1'
$env:PGPORT = if ($env:PGPORT) { $env:PGPORT } else { '55432' }
$env:PGUSER = if ($env:PGUSER) { $env:PGUSER } else { 'crmf_app' }
$env:PGDATABASE = if ($env:PGDATABASE) { $env:PGDATABASE } else { 'crmf' }
if (-not $env:PGPASSWORD) { Fail 'PGPASSWORD is missing from portable.env.' }
$env:PORT = if ($env:PORT) { $env:PORT } else { '8090' }
$env:FRONTEND_DIST_DIR = $FrontendDist
$env:FRONTEND_PORT = $env:PORT
$env:INGEST_PORT = $env:PORT
# The backend port is reachable on the LAN; only the local HTTPS proxy may set
# X-Forwarded-For, so login rate limits key on the real client address.
$env:TRUST_PROXY = 'loopback'
$env:TILE_CACHE_DIR = Join-Path $Data 'tiles'

foreach ($Required in @($Node, $PgCtl, $InitDb, $Psql, $Backend)) {
    if (-not (Test-Path -LiteralPath $Required)) { Fail "Missing portable runtime file: $Required. Run Build-Portable-Runtime.ps1 first." }
}
if (-not (Test-Path -LiteralPath (Join-Path $FrontendDist 'index.html'))) { Fail 'Frontend build is missing. Run npm run build in frontend first.' }
$AppUrl = "http://127.0.0.1:$($env:PORT)"
if (Test-Port ([int]$env:PORT)) {
    if (Test-BackendReady ([int]$env:PORT)) {
        Start-HttpsProxy
        Start-Process -FilePath $AppUrl
        Write-Host "CRMF is already running at $AppUrl" -ForegroundColor Green
        return
    }
    Fail "Port $($env:PORT) is already in use, but CRMF is not ready there."
}

$DbData = Join-Path $Data 'postgres'
if (-not (Test-Path -LiteralPath (Join-Path $DbData 'PG_VERSION'))) {
    Ensure-Dir $DbData
    $DbPasswordFile = Join-Path $Run 'initdb-password.txt'
    Set-Content -LiteralPath $DbPasswordFile -Value $env:PGPASSWORD -NoNewline -Encoding UTF8
    & $InitDb -D $DbData -U 'crmf' --encoding=UTF8 --locale=C --pwfile=$DbPasswordFile
    Remove-Item -LiteralPath $DbPasswordFile -Force -ErrorAction SilentlyContinue
    if ($LASTEXITCODE -ne 0) { Fail 'PostgreSQL initialization failed.' }
    Add-Content -LiteralPath (Join-Path $DbData 'postgresql.conf') -Value "port = $($env:PGPORT)`nlisten_addresses = '127.0.0.1'`nshared_preload_libraries = 'timescaledb'"
}
if (-not (Test-Port ([int]$env:PGPORT))) {
    Start-Managed 'postgres' $PgCtl "-D `"$DbData`" -o `"-p $($env:PGPORT)`" -w start" (Join-Path $Runtime 'postgres\bin')
    for ($i = 0; $i -lt 60 -and -not (Test-Port ([int]$env:PGPORT)); $i++) { Start-Sleep -Seconds 1 }
}
if (-not (Test-Port ([int]$env:PGPORT))) { Fail 'Portable PostgreSQL did not start. Review logs\postgres.err.log.' }

$DbMarker = Join-Path $DbData '.crmf-initialized'
if (-not (Test-Path -LiteralPath $DbMarker)) {
    $env:PGUSER = 'crmf'
    & $Psql -h 127.0.0.1 -p $env:PGPORT -U crmf -d postgres -c "CREATE DATABASE $($env:PGDATABASE);" 2>$null
    & $Psql -h 127.0.0.1 -p $env:PGPORT -U crmf -d $env:PGDATABASE -f (Join-Path $Root 'db\init.sql')
    if ($LASTEXITCODE -ne 0) { Fail 'CRMF database schema initialization failed. Review logs\postgres.err.log.' }
    & $Psql -h 127.0.0.1 -p $env:PGPORT -U crmf -d $env:PGDATABASE -c "ALTER ROLE crmf_app PASSWORD '$($env:PGPASSWORD.Replace("'", "''"))';"
    if ($LASTEXITCODE -ne 0) { Fail 'Could not set the CRMF application database password.' }
    Set-Content -LiteralPath $DbMarker -Value (Get-Date -Format o) -Encoding ASCII
    $env:PGUSER = 'crmf_app'
}

# Existing portable databases skip init.sql. Apply this idempotent access-scope
# migration as the schema owner before starting the least-privilege backend.
$env:PGUSER = 'crmf'
& $Psql -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $env:PGPORT -U crmf -d $env:PGDATABASE -c 'ALTER TABLE users ADD COLUMN IF NOT EXISTS asset_unit TEXT;'
if ($LASTEXITCODE -ne 0) { Fail 'Could not update the CRMF user access schema.' }
$env:PGUSER = 'crmf_app'

$env:PGAPPNAME = 'crmf-portable'
Start-Managed 'backend' $Node "`"$Backend`"" $Root
$BackendReady = $false
for ($i = 0; $i -lt 60; $i++) {
    if (Test-BackendReady ([int]$env:PORT)) { $BackendReady = $true; break }
    Start-Sleep -Seconds 1
}
if (-not $BackendReady) { Fail 'CRMF backend did not become ready. Review logs\backend.err.log.' }
Start-HttpsProxy
if (-not $NoBrowser) { Start-Process -FilePath $AppUrl }
Write-Host "CRMF is running at $AppUrl" -ForegroundColor Green
