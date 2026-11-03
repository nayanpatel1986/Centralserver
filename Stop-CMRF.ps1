$ErrorActionPreference = 'Continue'
$Root = $PSScriptRoot
$Run = Join-Path $Root 'run'
foreach ($Name in @('https-proxy','backend')) {
    $PidFile = Join-Path $Run "$Name.pid"
    if (Test-Path -LiteralPath $PidFile) {
        $PidValue = 0
        if ([int]::TryParse((Get-Content -LiteralPath $PidFile -Raw), [ref]$PidValue)) {
            Stop-Process -Id $PidValue -Force -ErrorAction SilentlyContinue
            Write-Host "Stopped $Name (PID $PidValue)."
        }
        Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
    }
}

$pgCtl = Join-Path $Root 'runtime\postgres\bin\pg_ctl.exe'
$pgData = Join-Path $Root 'portable-data\postgres'
if ((Test-Path -LiteralPath $pgCtl) -and (Test-Path -LiteralPath (Join-Path $pgData 'PG_VERSION'))) {
    & $pgCtl -D $pgData -m fast -w stop
    if ($LASTEXITCODE -eq 0) { Write-Host 'Stopped postgres cleanly.' }
    elseif (Test-Path -LiteralPath (Join-Path $pgData 'postmaster.pid')) {
        throw 'PostgreSQL did not stop cleanly. Check its process before copying the data folder.'
    }
}
Remove-Item -LiteralPath (Join-Path $Run 'postgres.pid') -Force -ErrorAction SilentlyContinue
