param(
    [Parameter(Mandatory = $true)]
    [string]$HostIp,
    [ValidateRange(1, 65535)]
    [int]$HttpsPort = 8443,
    [switch]$Reconfigure
)

$ErrorActionPreference = 'Stop'
$parsedIp = $null
if (-not [Net.IPAddress]::TryParse($HostIp, [ref]$parsedIp) -or
    $parsedIp.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork) {
    throw 'HostIp must be the IPv4 address that the Edge PC uses to reach CRMF.'
}

$tlsDir = Join-Path $PSScriptRoot 'portable-data\tls'
$configPath = Join-Path $tlsDir 'config.json'
$pfxPath = Join-Path $tlsDir 'server.pfx'
$caPath = Join-Path $tlsDir 'crmf-ca.crt'
$passphrasePath = Join-Path $tlsDir 'passphrase.txt'
if (Test-Path -LiteralPath $configPath) {
    $existing = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
    if (-not $Reconfigure) {
        if ($existing.hostIp -ne $HostIp -or [int]$existing.httpsPort -ne $HttpsPort) {
            throw "HTTPS is configured for $($existing.hostIp):$($existing.httpsPort). Stop CRMF and rerun with -Reconfigure for this PC's new IP address."
        }
        Write-Host "CRMF HTTPS is already configured for $HostIp`:$HttpsPort" -ForegroundColor Green
        return
    }
    $client = New-Object Net.Sockets.TcpClient
    $isOpen = $false
    try {
        $connecting = $client.ConnectAsync('127.0.0.1', [int]$existing.httpsPort)
        try { $isOpen = $connecting.Wait(500) -and $client.Connected }
        catch [AggregateException] {
            if ($_.Exception.InnerException -isnot [Net.Sockets.SocketException]) { throw }
        }
    } finally {
        $client.Dispose()
    }
    if ($isOpen) { throw 'Stop CRMF before changing its HTTPS certificate, then rerun with -Reconfigure.' }
}

New-Item -ItemType Directory -Path $tlsDir -Force | Out-Null
# Private key material is only for the CRMF account and Windows SYSTEM.
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls.exe $tlsDir /inheritance:r /grant:r "${identity}:(OI)(CI)F" 'SYSTEM:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Could not restrict access to $tlsDir" }

$ca = New-SelfSignedCertificate -Type Custom -Subject 'CN=CRMF Offline CA' `
    -CertStoreLocation 'Cert:\CurrentUser\My' -KeyAlgorithm RSA -KeyLength 3072 `
    -HashAlgorithm SHA256 -KeyUsage CertSign, CRLSign -KeyUsageProperty Sign `
    -KeyExportPolicy NonExportable -NotAfter (Get-Date).AddYears(5) `
    -TextExtension @('2.5.29.19={critical}{text}CA=1&pathlength=0')
$server = New-SelfSignedCertificate -Type Custom -Subject "CN=$HostIp" `
    -CertStoreLocation 'Cert:\CurrentUser\My' -KeyAlgorithm RSA -KeyLength 3072 `
    -HashAlgorithm SHA256 -KeyUsage DigitalSignature, KeyEncipherment `
    -KeyExportPolicy Exportable -Signer $ca -NotAfter (Get-Date).AddDays(825) `
    -TextExtension @("2.5.29.17={text}IPAddress=$HostIp", '2.5.29.37={text}1.3.6.1.5.5.7.3.1')

$bytes = New-Object byte[] 32
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
$passphrase = [BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()
$securePassphrase = ConvertTo-SecureString -String $passphrase -AsPlainText -Force
$pfxNext = "$pfxPath.new"
$passphraseNext = "$passphrasePath.new"
$caNext = "$caPath.new"
$configNext = "$configPath.new"
Export-PfxCertificate -Cert $server -FilePath $pfxNext -Password $securePassphrase -Force `
    -ChainOption EndEntityCertOnly | Out-Null
Set-Content -LiteralPath $passphraseNext -Value $passphrase -NoNewline -Encoding ASCII

$pem = '-----BEGIN CERTIFICATE-----' + "`n" +
    [Convert]::ToBase64String($ca.RawData, [Base64FormattingOptions]::InsertLineBreaks) +
    "`n-----END CERTIFICATE-----`n"
Set-Content -LiteralPath $caNext -Value $pem -NoNewline -Encoding ASCII
@{ hostIp = $HostIp; httpsPort = $HttpsPort; caThumbprint = $ca.Thumbprint; serverThumbprint = $server.Thumbprint } |
    ConvertTo-Json | Set-Content -LiteralPath $configNext -Encoding UTF8

# Keep the old live files intact until the replacement certificate is complete.
Copy-Item -LiteralPath $pfxNext -Destination $pfxPath -Force
Copy-Item -LiteralPath $passphraseNext -Destination $passphrasePath -Force
Copy-Item -LiteralPath $caNext -Destination $caPath -Force
Copy-Item -LiteralPath $configNext -Destination $configPath -Force
foreach ($temporary in @($pfxNext, $passphraseNext, $caNext, $configNext)) {
    Remove-Item -LiteralPath $temporary -Force
}

Write-Host "CRMF HTTPS certificate created for $HostIp`:$HttpsPort" -ForegroundColor Green
Write-Host "Copy the current $caPath to the Edge PC after every reconfiguration. Keep server.pfx and passphrase.txt on CRMF." -ForegroundColor Yellow
