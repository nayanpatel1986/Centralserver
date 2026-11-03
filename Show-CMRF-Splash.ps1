param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Start', 'Stop')]
    [string]$Action,
    [Parameter(Mandatory = $true)]
    [string]$SignalFile,
    [Parameter(Mandatory = $true)]
    [string]$ReadyFile,
    [Parameter(Mandatory = $true)]
    [int]$ParentPid
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$imagePath = Join-Path $PSScriptRoot 'assets\CRMF-splash.png'
$iconPath = Join-Path $PSScriptRoot 'assets\CRMF.ico'
$image = [System.Drawing.Image]::FromFile($imagePath)
$icon = New-Object System.Drawing.Icon($iconPath)

try {
    $workingArea = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
    $imageHeight = [Math]::Min(650, $workingArea.Height - 100)
    $imageWidth = [int][Math]::Round($image.Width * $imageHeight / $image.Height)

    $form = New-Object System.Windows.Forms.Form
    $form.Text = "CRMF - $Action"
    $form.Icon = $icon
    $form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
    $form.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
    $form.ClientSize = New-Object System.Drawing.Size($imageWidth, ($imageHeight + 38))
    $form.BackColor = [System.Drawing.Color]::FromArgb(11, 18, 32)
    $form.ShowInTaskbar = $true
    $form.TopMost = $true
    $form.KeyPreview = $true

    $picture = New-Object System.Windows.Forms.PictureBox
    $picture.Image = $image
    $picture.SizeMode = [System.Windows.Forms.PictureBoxSizeMode]::StretchImage
    $picture.Location = New-Object System.Drawing.Point(0, 0)
    $picture.Size = New-Object System.Drawing.Size($imageWidth, $imageHeight)
    $picture.Add_MouseClick({
        param($sender, $eventArgs)
        if ($eventArgs.X -ge ($sender.Width * 0.85) -and $eventArgs.Y -le ($sender.Height * 0.16)) {
            $form.Close()
        }
    })
    $form.Controls.Add($picture)

    $status = New-Object System.Windows.Forms.Label
    $status.Text = if ($Action -eq 'Start') { 'Starting CRMF...' } else { 'Stopping CRMF...' }
    $status.ForeColor = [System.Drawing.Color]::White
    $status.BackColor = [System.Drawing.Color]::FromArgb(11, 18, 32)
    $status.Font = New-Object System.Drawing.Font('Segoe UI', 11)
    $status.TextAlign = [System.Drawing.ContentAlignment]::MiddleCenter
    $status.Location = New-Object System.Drawing.Point(0, $imageHeight)
    $status.Size = New-Object System.Drawing.Size($imageWidth, 38)
    $form.Controls.Add($status)

    $timer = New-Object System.Windows.Forms.Timer
    $timer.Interval = 250
    $timer.Add_Tick({
        if ((Test-Path -LiteralPath $SignalFile) -or
            -not (Get-Process -Id $ParentPid -ErrorAction SilentlyContinue)) {
            $form.Close()
        }
    })
    $form.Add_Shown({
        Set-Content -LiteralPath $ReadyFile -Value 'ready' -Encoding ASCII
        $timer.Start()
    })
    $form.Add_KeyDown({ if ($_.KeyCode -eq [System.Windows.Forms.Keys]::Escape) { $form.Close() } })

    [void]$form.ShowDialog()
}
finally {
    if ($timer) { $timer.Dispose() }
    if ($form) { $form.Dispose() }
    $image.Dispose()
    $icon.Dispose()
}
