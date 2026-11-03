param([switch]$FolderOnly)

$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
$desktop = [Environment]::GetFolderPath('DesktopDirectory')
$icon = Join-Path $root 'assets\CRMF.ico'

if (-not (Test-Path -LiteralPath $icon)) {
    throw "CRMF icon was not found: $icon"
}

$shell = New-Object -ComObject WScript.Shell

function New-CrmfShortcut {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Folder,

        [Parameter(Mandatory = $true)]
        [string]$Name,

        [Parameter(Mandatory = $true)]
        [string]$TargetFile,

        [Parameter(Mandatory = $true)]
        [string]$Description
    )

    $target = Join-Path $root $TargetFile
    if (-not (Test-Path -LiteralPath $target)) {
        throw "Launcher was not found: $target"
    }

    $shortcutPath = Join-Path $Folder "$Name.lnk"
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $target
    $shortcut.WorkingDirectory = $root
    $shortcut.IconLocation = "$icon,0"
    $shortcut.Description = $Description
    $shortcut.WindowStyle = 1
    $shortcut.Save()

    Write-Host "Created: $shortcutPath" -ForegroundColor Green
}

New-CrmfShortcut -Folder $root -Name 'Start CRMF' -TargetFile 'Start-CMRF.bat' -Description 'Start the CRMF application'
New-CrmfShortcut -Folder $root -Name 'Stop CRMF' -TargetFile 'Stop-CMRF.bat' -Description 'Stop the CRMF application'

if (-not $FolderOnly) {
    New-CrmfShortcut -Folder $desktop -Name 'Start CRMF' -TargetFile 'Start-CMRF.bat' -Description 'Start the CRMF application'
    New-CrmfShortcut -Folder $desktop -Name 'Stop CRMF' -TargetFile 'Stop-CMRF.bat' -Description 'Stop the CRMF application'
}

Write-Host 'CRMF rig-icon shortcuts are ready. Windows always shows its standard icon on the .bat files themselves.' -ForegroundColor Cyan

