param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Start', 'Stop')]
    [string]$Action
)

$ErrorActionPreference = 'Stop'
$splashScript = Join-Path $PSScriptRoot 'Show-CMRF-Splash.ps1'
$targetScript = Join-Path $PSScriptRoot "$Action-CMRF.ps1"
$signalFile = Join-Path ([IO.Path]::GetTempPath()) "crmf-splash-$([guid]::NewGuid().ToString('N')).stop"
$readyFile = "$signalFile.ready"
$splashProcess = $null
$exitCode = 0

try {
    try {
        $arguments = "-NoLogo -NoProfile -ExecutionPolicy Bypass -Sta -WindowStyle Hidden -File `"$splashScript`" -Action $Action -SignalFile `"$signalFile`" -ReadyFile `"$readyFile`" -ParentPid $PID"
        $splashProcess = Start-Process -FilePath (Get-Command powershell.exe).Source -ArgumentList $arguments -WindowStyle Hidden -PassThru
        for ($i = 0; $i -lt 30; $i++) {
            if ((Test-Path -LiteralPath $readyFile) -or $splashProcess.HasExited) { break }
            Start-Sleep -Milliseconds 100
        }
    }
    catch {
        Write-Host "Could not show CRMF splash: $($_.Exception.Message)" -ForegroundColor Yellow
    }

    $startedAt = Get-Date
    & $targetScript
}
catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    $exitCode = 1
}
finally {
    if ($splashProcess) {
        $remaining = 2 - ((Get-Date) - $startedAt).TotalSeconds
        if ($remaining -gt 0) { Start-Sleep -Milliseconds ([int]($remaining * 1000)) }
        Set-Content -LiteralPath $signalFile -Value 'done' -Encoding ASCII
        if (-not $splashProcess.WaitForExit(3000)) {
            Stop-Process -Id $splashProcess.Id -Force -ErrorAction SilentlyContinue
        }
    }
    Remove-Item -LiteralPath $signalFile, $readyFile -Force -ErrorAction SilentlyContinue
}

exit $exitCode
