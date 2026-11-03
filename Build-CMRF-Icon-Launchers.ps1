$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$source = Join-Path $root 'launchers\CrmfIconLauncher.cs'
$icon = Join-Path $root 'assets\CRMF.ico'
$compiler = @(
    (Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe'),
    (Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe')
) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1

if (-not $compiler) { throw 'Windows .NET Framework C# compiler is unavailable.' }
foreach ($required in @($source, $icon, (Join-Path $root 'Start-CMRF.bat'), (Join-Path $root 'Stop-CMRF.bat'))) {
    if (-not (Test-Path -LiteralPath $required)) { throw "Missing launcher dependency: $required" }
}

foreach ($name in @('Start-CMRF', 'Stop-CMRF')) {
    $output = Join-Path $root "$name.exe"
    & $compiler /nologo /target:winexe /platform:anycpu /reference:System.Windows.Forms.dll "/win32icon:$icon" "/out:$output" $source
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $output)) { throw "Could not build $name.exe" }
    & $output --check
    if ($LASTEXITCODE -ne 0) { throw "$name.exe cannot find its batch launcher" }
    Write-Host "Built portable icon launcher: $output" -ForegroundColor Green
}
