$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot
$Runtime = Join-Path $Root 'runtime'
$Downloads = Join-Path $Root '.portable-downloads'
$NodeVersion = if ($args.Count -gt 0) { $args[0] } else { '20.19.5' }
$PgVersion = if ($args.Count -gt 1) { $args[1] } else { '15.14-1' }
$TimescaleVersion = if ($args.Count -gt 2) { $args[2] } else { '2.28.3' }

New-Item -ItemType Directory -Force -Path $Runtime, $Downloads | Out-Null
if ((Test-Path (Join-Path $Runtime 'node\node.exe')) -and
    (Test-Path (Join-Path $Runtime 'postgres\bin\postgres.exe')) -and
    (Test-Path (Join-Path $Runtime 'postgres\share\extension\timescaledb.control'))) {
    Write-Host 'Portable runtime is already prepared.' -ForegroundColor Green
    exit 0
}
function Download([string]$Url, [string]$Path) {
    if (Test-Path -LiteralPath $Path) { return }
    Write-Host "Downloading $Url" -ForegroundColor Cyan
    Invoke-WebRequest -Uri $Url -OutFile $Path -UseBasicParsing
}
function Expand([string]$Zip, [string]$Destination) {
    if (Test-Path -LiteralPath $Destination) { return }
    New-Item -ItemType Directory -Force -Path $Destination | Out-Null
    Expand-Archive -LiteralPath $Zip -DestinationPath $Destination
}

$NodeZip = Join-Path $Downloads "node-v$NodeVersion-win-x64.zip"
$PgZip = Join-Path $Downloads "postgresql-$PgVersion-windows-x64-binaries.zip"
$TsZip = Join-Path $Downloads "timescaledb-postgresql-15-windows-amd64.zip"
Download "https://nodejs.org/dist/v$NodeVersion/node-v$NodeVersion-win-x64.zip" $NodeZip
Download "https://get.enterprisedb.com/postgresql/postgresql-$PgVersion-windows-x64-binaries.zip" $PgZip
Download "https://github.com/timescale/timescaledb/releases/download/$TimescaleVersion/timescaledb-postgresql-15-windows-amd64.zip" $TsZip

$NodeStage = Join-Path $Runtime '.node-stage'
$PgStage = Join-Path $Runtime '.pg-stage'
$TsStage = Join-Path $Runtime '.ts-stage'
Expand $NodeZip $NodeStage
Expand $PgZip $PgStage
Expand $TsZip $TsStage

$NodeRoot = Get-ChildItem -LiteralPath $NodeStage -Directory | Select-Object -First 1
if (-not (Test-Path (Join-Path $Runtime 'node\node.exe'))) {
    Move-Item -LiteralPath $NodeRoot.FullName -Destination (Join-Path $Runtime 'node')
}
$PgRoot = Get-ChildItem -LiteralPath $PgStage -Directory | Select-Object -First 1
if (-not (Test-Path (Join-Path $Runtime 'postgres\bin\postgres.exe'))) {
    Move-Item -LiteralPath $PgRoot.FullName -Destination (Join-Path $Runtime 'postgres')
}
$TsRoot = Get-ChildItem -LiteralPath $TsStage -Directory | Select-Object -First 1
Copy-Item -Path (Join-Path $TsRoot.FullName '*') -Destination (Join-Path $Runtime 'postgres') -Recurse -Force
Get-ChildItem -LiteralPath (Join-Path $Runtime 'postgres') -File -Filter 'timescaledb*.dll' | Move-Item -Destination (Join-Path $Runtime 'postgres\lib') -Force
Get-ChildItem -LiteralPath (Join-Path $Runtime 'postgres') -File -Filter 'timescaledb*.sql' | Move-Item -Destination (Join-Path $Runtime 'postgres\share\extension') -Force
Get-ChildItem -LiteralPath (Join-Path $Runtime 'postgres') -File -Filter 'timescaledb*.control' | Move-Item -Destination (Join-Path $Runtime 'postgres\share\extension') -Force
Get-ChildItem -LiteralPath (Join-Path $Runtime 'postgres') -File -Filter 'timescaledb*.exe' | Move-Item -Destination (Join-Path $Runtime 'postgres\bin') -Force
Remove-Item -LiteralPath $NodeStage,$PgStage,$TsStage -Recurse -Force -ErrorAction SilentlyContinue
Write-Host 'Portable Node.js, PostgreSQL 15, and TimescaleDB runtime prepared.' -ForegroundColor Green
Write-Host 'Run npm install/build in backend and frontend, then copy the folder to the offline PC.'
