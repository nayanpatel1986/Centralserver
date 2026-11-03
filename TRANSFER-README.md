# Move this CRMF installation to another offline Windows PC

This migration ZIP includes the running application's React build and source,
portable Node.js and PostgreSQL, the current CRMF database, device registrations,
telemetry, settings, and credentials. No download or Docker installation is needed
on the destination PC. The ZIP is a point-in-time copy; new telemetry received on
the old PC after the ZIP was created is not in this copy.

## Before moving it

- Keep the ZIP and its USB drive private. The archive contains administrator and
  device credentials and the HTTPS private key.
- Stop the old CRMF instance before directing Edge PCs to the new one. Do not
  extract this ZIP over another running CRMF installation.
- Copy the ZIP and its `.sha256.txt` file to the destination. In PowerShell, use
  `Get-FileHash .\CRMF-Offline-Migration-*.zip -Algorithm SHA256` and compare the
  result with the checksum file.

## On the destination PC

1. Extract the ZIP to a new folder such as `C:\CRMF-Offline`.
2. Find the destination PC's IPv4 address on the network used by the Edge PC.
   This is the address Edge will use to reach CRMF; do not enter the Edge PC's IP.
3. Before starting CRMF, open PowerShell in the extracted folder and run:

   ```powershell
   .\Initialize-CMRF-Https.ps1 -HostIp <new-CRMF-IP> -Reconfigure
   ```

   This creates a certificate for the destination address. The old PC's HTTPS
   certificate was tied to its old IP and must not be used for a different IP.
4. Run `Create-CMRF-Desktop-Shortcuts.bat` once to put rig-icon Start and Stop
   shortcuts in the extracted folder and on the desktop. These shortcuts launch
   the matching `.bat` files. The `Start-CMRF.exe` and `Stop-CMRF.exe` files in
   the extracted folder also carry the rig icon. Windows displays its standard
   batch icon for `.bat` files; a custom icon cannot be embedded in a `.bat` file.
5. Double-click `Start-CMRF.exe` (or `Start-CMRF.bat`). The local portal opens at
   `http://localhost:8090`. Use `Stop-CMRF.exe` (or `Stop-CMRF.bat`) to stop it.

## Reconnect an Edge PC

- Transfer the **new** public certificate
  `portable-data\tls\crmf-ca.crt` from the destination CRMF PC to the Edge PC.
  Keep `server.pfx` and `passphrase.txt` on the CRMF PC.
- Update Edge's trusted CA path if the copied file moved, and restart its backend
  so it loads the new CA. Set its Central URL to
  `https://<new-CRMF-IP>:8443`. Do not append `/ingest`.
- The device IDs and tokens are preserved in this migration. Do not rotate them
  just because the PC or IP changed.
- Ensure the Edge PC can reach TCP 8443 on the destination CRMF PC. This package
  does not change Windows Firewall settings. Check for telemetry acknowledgements
  and central messages after the connection is updated.

If the destination PC uses the same CRMF IP as the source, reconfiguring HTTPS is
still safe: it creates a new certificate, and Edge must trust its new CA file.
