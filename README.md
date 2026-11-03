# CRMF - Centralised Rig Monitoring Facility

A **separately deployable** central platform for the ONGC AHWR fleet, implementing
the *Central Facility* of the DGC proposal (§3 architecture, §5 hardware sizing,
§6 software requirements). It aggregates live data from up to 50+ rig-edge digital
twins and provides fleet-wide surveillance, a data-quality monitor, an alarm
command centre, a workover-performance view, automated reporting, and a governance
& rollout workspace.

> **No control path.** The CRMF *receives* telemetry and events from the rig edge,
> and its only downstream channel is read-only operator **text messages** to a
> rig HMI (acknowledged by the operator). It can never write a PLC tag or actuate
> equipment — monitoring + one-way messaging, never remote control (proposal §6.6;
> ESD/lockout surface as read-only alarms on the top alarm strip).

This project is fully self-contained and **does not modify the rig-edge app**. The
edge's existing store-and-forward sync agent (`../backend/lib/sync.js`) already
POSTs gzipped batches to `/ingest` in exactly the contract this backend accepts —
point its `CENTRAL_URL` here and a real rig streams in with zero code changes.

---

## Quickstart

```bash
cd central
cp .env.example .env
# Required — the backend refuses to start without these:
#   PGPASSWORD    openssl rand -hex 16
#   JWT_SECRET    openssl rand -hex 32   (>=32 chars; placeholders are rejected)
#   ADMIN_PASSWORD  your initial portal admin password (no default)
#   INGEST_TOKEN  openssl rand -hex 24   (only the fallback for unprovisioned rigs)
#   MCP_API_KEY   openssl rand -hex 24   (guards the optional /mcp endpoint)
docker compose up -d --build
```

Open **http://localhost:8090** and sign in as `admin` with the `ADMIN_PASSWORD`
you set. There is **no default admin password** — a published one would be an
open door on every deployment.

### Windows offline bundle (Docker-free)

The project also supports a self-contained Windows bundle. On an internet-connected
build PC, run `Prepare-Offline-Package.ps1`; it prepares Node.js, PostgreSQL 15,
TimescaleDB 2.28.3, backend production dependencies, and the frontend bundle under
the project folder.

The project folder contains icon-bearing **Start-CMRF.exe** and **Stop-CMRF.exe**
launchers plus matching `.bat` files. Run `Create-CMRF-Desktop-Shortcuts.bat` once
after extracting or moving the project to create rig-icon shortcuts in the project
folder and on the desktop.
Windows cannot put a custom icon directly on an individual `.bat` file.

Use **Start-CMRF.exe** in the project folder to initialize the portable database on first
run, start the CRMF backend, perform a health check, and open the browser. Use
**Stop-CMRF.exe** to stop the managed processes.

For an Edge PC on another machine, use the HTTPS listener described below. The
portable backend's local HTTP listener is on port **8090** (the Docker backend
default is 6000). The Edge Central URL must be a network address that PC can
reach, not `localhost`. Keep the Edge device token aligned with its provisioned
CRMF token or the CRMF ingest token.

### HTTPS for a separate Edge PC

On the CRMF PC, run this once in PowerShell with its IP address on the Edge
network, then start CRMF normally:

```powershell
.\Initialize-CMRF-Https.ps1 -HostIp 192.168.0.93
.\launchers\Start-CMRF.bat
```

The launcher starts HTTPS on port **8443** and keeps the local portal at
`http://localhost:8090`. The certificate is issued for the given IP address;
changing that address requires a new certificate. Only copy the public
`portable-data\tls\crmf-ca.crt` to the Edge PC. Never copy `server.pfx` or
`passphrase.txt` from the CRMF PC.

On the Edge PC, place the CA file at a stable path such as
`C:\AHWR-150-EDGE\certs\crmf-ca.crt`. In its `settings.env`, set
`NODE_EXTRA_CA_CERTS=C:\AHWR-150-EDGE\certs\crmf-ca.crt` (using the actual
path). Restart the Edge backend so Node reads that setting. If Edge runs as an
installed `AHWR-Backend` service, re-register it with
`Install-AHWR-EDGE-Services.ps1` after changing `NODE_EXTRA_CA_CERTS`; the
service stores this setting in its startup environment. For an Edge installation
managed by `Apply-Settings.bat`, put the public CA at its configured `certs`
path and use that installer workflow to apply the certificate.

In the Edge Sync Configuration page, set Central URL to
`https://192.168.0.93:8443`, enable sync, and use the rig's provisioned token
or the CRMF ingest token. Do not append `/ingest`; the Edge app adds that path.
Network access to TCP 8443 must be permitted between the two PCs. A successful
local HTTPS check does not establish that the Edge PC can reach this port.

If CRMF and Edge are moved to different PCs or the CRMF IP changes, stop both
applications before copying their folders. On the new CRMF PC, find the IP that
the new Edge PC can reach and run:

```powershell
.\Initialize-CMRF-Https.ps1 -HostIp <new-CRMF-IP> -Reconfigure
.\launchers\Start-CMRF.bat
Get-FileHash .\portable-data\tls\crmf-ca.crt -Algorithm SHA256
```

This creates a certificate for the **new CRMF IP** and a new public CA file.
Use the displayed hash to verify the transferred CA file. Copy the new
`portable-data\tls\crmf-ca.crt` to the new Edge PC, update its
`NODE_EXTRA_CA_CERTS` path if needed, restart its backend, and change its
Central URL to `https://<new-CRMF-IP>:8443`. Check connectivity from the Edge
PC before saving Sync Configuration. The Edge PC's own IP is different and is
not entered in the Central URL. Do not reuse an old CA file after reconfiguring
the CRMF certificate.

Run `Build-Offline-Zip.ps1` to create a fresh-install ZIP. Run
`Build-Offline-Zip.ps1 -IncludeExistingData` after CRMF has stopped cleanly to
create a migration ZIP containing the current database, credentials, and HTTPS
settings. Read `TRANSFER-README.md` before using that archive on a different PC.
The archive includes the full
React source, frontend build dependencies, compiled frontend, backend source and
dependencies, portable Node.js, PostgreSQL with TimescaleDB, database scripts, icons,
and launchers. This allows both offline operation and offline frontend source changes.

Docker remains available for the normal compose/Kubernetes deployment path; it is not
required by the offline launcher.

| User | Password | Role |
|------|----------|------|
| `admin` | `ADMIN_PASSWORD` from `.env` | admin (edit governance) |
| `operator` | `OPERATOR_PASSWORD` from `.env` | operator |
| `viewer` | `VIEWER_PASSWORD` from `.env` | viewer (read-only) |

Point rig-edge agents at the reachable CRMF HTTPS address via their `CENTRAL_URL`:
the configured HTTPS port for the Windows offline bundle, or the deployed
HTTPS gateway for Docker.
For a real fleet, issue each rig its own credential rather than sharing
`INGEST_TOKEN` — see `backend/scripts/provision-rigs.js`.

---
## Architecture

```
 rig-edge sync agents â”€â”€HTTPS gzip batchesâ”€â”€â–¶  crmf-backend (/ingest)
 (store-and-forward,     X-Device-Id + token        â”‚
  proposal §6.3)                                     â”œâ”€â–¶ TimescaleDB  (telemetry hypertable,
                                                     â”‚     1-min continuous aggregate, compression)
                                                     â”œâ”€â–¶ PostgreSQL   (rig/tag/governance masters)
                                                     â””â”€â–¶ Socket.IO â”€â”€â–¶ crmf-frontend (fleet portal)
```

| Service | Tech | Role |
|---------|------|------|
| `timescaledb` | TimescaleDB 2.17 / PostgreSQL 16 | Canonical telemetry + relational store (proposal §6.4) |
| `crmf-backend` | Node.js, Express, Socket.IO, `pg` | Ingestion, fleet API, live updates, RBAC |
| `crmf-frontend` | React 18, Vite, MUI, Recharts, nginx | Fleet portal UI |

The stack mirrors the rig-edge app's technology choices so the two are operationally
consistent.

---

## Portal modules (proposal §6.1)

- **Fleet Overview** — KPI bar, geographic field map, searchable/filterable rig list with live status, data-quality and alarm rollups.
- **Rig Drill-Down** — per-rig KPIs, live trend charts (TimescaleDB-backed), equipment/parameter groups, alarm and torque-turn connection history, deployment status.
- **Alarm Command Centre** — cross-rig active alarms, priority filters, P1 (ESD/lockout/well-control) surfacing.
- **Data Quality Monitor** — per-rig freshness + tag-completeness health score, sync-lag and stale/missing-tag flags.
- **Workover Performance** — torque-turn connection quality and fleet benchmarking, activity/NPT feed.
- **Governance & Rollout Workspace** — stage-gate funnel, per-rig rollout status (editable), value-realization KPIs (§7), escalation register, decision log.
- **Reports** — consolidated fleet operations report + CSV export.
- **Config Registry** — standard tag dictionary (§4.4) and rig master.

---

## Ingestion contract

`POST /ingest` accepts the edge sync agent's native payload:

```
Headers: X-Device-Id, X-Schema-Version, Content-Encoding: gzip,
         Authorization: Bearer <device-token>   (optional)
Body (gzipped JSON):
{ "seq": 123, "deviceId": "AHWR-50-3", "schemaVersion": "1.0",
  "createdAt": "<ISO>",
  "channels": [ { "ts": "<ISO>", "values": { "drawworks.hook_load": 96.2, ... } } ],
  "events":   [ { "ts": "<ISO>", "type": "alarm|connection|activity", "payload": {...} } ] }
Response: { "ack": true, "seq": 123, "receivedPoints": N, "receivedEvents": M }
```

Unknown devices auto-register as **pending** rigs so onboarding is visible in the
governance workspace.

---

## Connecting the existing rig-edge app

In the edge stack's `.env` (repo root), set:

```env
CENTRAL_URL=https://<reachable-crmf-host>:<https-port>
DEVICE_ID=AHWR-50-3
DEVICE_TOKEN=<token>        # must match the CRMF INGEST_TOKEN, if set
SYNC_ENABLED=true
```

When the CRMF HTTPS listener uses its private CA, also configure
`NODE_EXTRA_CA_CERTS` on the Edge PC as described above and restart its Node
backend. The Edge Sync Configuration page can set the Central URL and token
instead of editing their environment defaults.

The edge buffers during any WAN/central outage and replays oldest-first on
restoration — central downtime never affects rig operations (proposal §6.3).

---

## Configuration

See `.env.example`. Key variables: `PGPASSWORD`, `JWT_SECRET`, `INGEST_TOKEN`,
`FLEET_SIZE`, `FRONTEND_PORT`, `OFFLINE_SEC`, and `CENTRAL_LATENCY_TARGET`.

## Production notes

- Place `crmf-backend` behind the API gateway / MQTT broker on the ONGC WAN VPN; issue per-rig device certificates/tokens.
- TimescaleDB ships HA (Patroni) + streaming replication to the DR site (proposal §5.3); this compose runs a single node for the pilot.
- Federate Keycloak/ONGC AD for SSO on top of the built-in local accounts (proposal §6.5).

