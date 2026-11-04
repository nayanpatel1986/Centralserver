#!/usr/bin/env node
'use strict';
// =====================================================================
// MOCK EDGE FLEET — demo/visualisation data for CRMF. NOT FOR PRODUCTION.
//
// Simulates several rig-edge sync agents. Each mock rig is registered through
// the admin API (with an ONGC-asset location and its own device token), then
// streams the same wire contract a real edge uses (POST /ingest):
//   - telemetry snapshots modelled on test/fixtures/edge-rig-latest.json
//   - activity events (RIH / POOH / MAKE_UP / ... and occasional NPT)
//   - well.started (well name + field) and alarm counters
//   - cmms.snapshot: assets, PM, work orders, logbook, downtime, instruments,
//     with ~60 days of downtime history so the reliability KPIs have data.
//
// Mock rig ids all start with MOCK- so they are easy to find and delete
// (Config Registry, or DELETE /api/rigs/MOCK-...). Re-running the script rotates
// the mock rigs' device tokens and continues streaming.
//
// Usage (from the repo root, stack running):
//   CRMF_ADMIN_PASSWORD=... node backend/scripts/mock-edge.js
//   Options: --portal http://127.0.0.1:8090  (API, via nginx)
//            --ingest http://127.0.0.1:8090  (/ingest; not :6000, fetch blocks it)
//            --rigs 8                         (1-20; rigs 11-20 add a second rig per asset)
//            --interval 5                     (seconds between live batches)
//            --once                           (backfill + one live batch, then exit)
//            --no-history                     (skip the 30 min trend backfill on start; use when the
//                                              rigs already have history, so the Data Quality
//                                              Monitor does not count it as a backfill)
// =====================================================================
const crypto = require('crypto');
const path = require('path');

const FIXTURE = require(path.join(__dirname, '..', 'test', 'fixtures', 'edge-rig-latest.json'));

function parseArgs(argv) {
    // Ingest goes through nginx (8090 proxies /ingest): fetch() refuses port 6000,
    // which is on the WHATWG Fetch "bad ports" list (X11).
    const o = { portal: 'http://127.0.0.1:8090', ingest: 'http://127.0.0.1:8090', rigs: 8, interval: 5, once: false };
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--portal') o.portal = argv[++i];
        else if (a === '--ingest') o.ingest = argv[++i];
        else if (a === '--rigs') o.rigs = Math.max(1, Math.min(20, Number(argv[++i]) || 8));
        else if (a === '--interval') o.interval = Math.max(2, Number(argv[++i]) || 5);
        else if (a === '--once') o.once = true;
        else if (a === '--no-history') o.noHistory = true;
        else if (a === '--help' || a === '-h') { console.log(require('fs').readFileSync(__filename, 'utf8').split('\n').slice(2, 27).join('\n')); process.exit(0); }
    }
    return o;
}

// Mock rigs at real ONGC onshore asset locations (approximate field centroids).
const SITES = [
    { field: 'Ankleshwar', assetUnit: 'Ankleshwar Asset', lat: 21.626, lon: 73.015, wellPrefix: 'ANK' },
    { field: 'Mehsana', assetUnit: 'Mehsana Asset', lat: 23.588, lon: 72.369, wellPrefix: 'NK' },
    { field: 'Kalol', assetUnit: 'Ahmedabad Asset', lat: 23.246, lon: 72.497, wellPrefix: 'KL' },
    { field: 'Cambay', assetUnit: 'Cambay Asset', lat: 22.307, lon: 72.623, wellPrefix: 'CB' },
    { field: 'Geleki', assetUnit: 'Assam Asset', lat: 26.886, lon: 94.632, wellPrefix: 'GK' },
    { field: 'Lakwa', assetUnit: 'Assam Asset', lat: 26.948, lon: 94.856, wellPrefix: 'LK' },
    { field: 'Rajahmundry', assetUnit: 'Rajahmundry Asset', lat: 16.985, lon: 81.781, wellPrefix: 'RJ' },
    { field: 'Narimanam', assetUnit: 'Cauvery Asset', lat: 10.873, lon: 79.792, wellPrefix: 'NRM' },
    { field: 'Agartala Dome', assetUnit: 'Tripura Asset', lat: 23.887, lon: 91.335, wellPrefix: 'AD' },
    { field: 'Jodhpur Wadi', assetUnit: 'Jodhpur Asset', lat: 26.271, lon: 72.981, wellPrefix: 'JW' },
];

const ACTIVITIES = [
    { activity: 'RIH', label: 'Run In Hole', productive: true },
    { activity: 'MAKE_UP', label: 'Make-Up Connection', productive: true },
    { activity: 'CIRCULATE', label: 'Circulate', productive: true },
    { activity: 'POOH', label: 'Pull Out Of Hole', productive: true },
    { activity: 'BREAK_OUT', label: 'Break-Out Connection', productive: true },
    { activity: 'WAIT', label: 'Waiting on Weather / Logistics', productive: false },
    { activity: 'REPAIR', label: 'Equipment Repair', productive: false },
];
const SERVICES = ['Tubing change', 'Sand cleaning', 'Zone transfer', 'ESP replacement', 'Well activation'];
const CREW = ['R. Shah', 'A. Gogoi', 'K. Patel', 'S. Reddy', 'M. Baruah', 'V. Iyer', 'P. Das', 'N. Desai'];

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const iso = (ms) => new Date(ms).toISOString();
const HOUR = 3600_000;
const DAY = 24 * HOUR;

// ---------- equipment profiles ----------
// Each mock rig's equipment runs a little differently (a stable +/-3% per
// measurement), and a few rigs carry a clear fault signature so fleet
// comparisons have something to find. Keys are rig index (0-based).
const FAULTS = {
    0: { 'cat_engine.fuel_rate': 0.9 },                                        // most fuel-efficient engine
    2: { 'cat_engine.oil_pressure': 0.74, 'cat_engine.fuel_rate': 1.18 },      // worn engine
    4: { 'htd.torque': 1.25 },                                                 // top drive working hard
    6: { 'hpu.oil_temp': 1.22, 'hpu.oil_level': 0.82 },                        // HPU running hot, low oil
    9: { 'cat_engine.coolant_temp': 1.11 },                                    // cooling problem
    11: { 'cwk.clamp_pressure': 0.83, 'cwk.clamp_force': 0.85 },               // catwalk clamp weak
    13: { 'mudpump.delta_pressure': 1.5, 'mudpump.pressure': 1.12 },           // pump restriction
    16: { 'pct.clamp_up_pressure': 0.8, 'pct.makeup_torque': 0.88 },           // tong clamp leak
    18: { 'hpu.discharge_pressure': 0.86 },                                    // HPU pump wear
};
function hash01(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return ((h >>> 0) % 10000) / 10000;
}
const biasFor = (rig, key) => (FAULTS[rig.index] && FAULTS[rig.index][key]) || (1 + (hash01(`${rig.rigId}:${key}`) - 0.5) * 0.06);

// ---------- telemetry ----------
// Flatten the edge "latest" capture exactly like the edge sync agent, with a
// per-rig phase so the fleet's gauges don't move in lockstep.
function telemetry(rig, t) {
    const out = {};
    const wave = (period, amp) => amp * Math.sin((t / 1000 / period) * 2 * Math.PI + rig.phase);
    for (const [meas, fields] of Object.entries(FIXTURE)) {
        if (meas.startsWith('_') || meas === 'opcua_demo' || !fields || typeof fields !== 'object') continue;
        for (const [f, v] of Object.entries(fields)) {
            const n = Number(v);
            if (!Number.isFinite(n)) continue;
            const key = `${meas}.${f}`;
            // Status/enumeration fields (small integers) stay as captured.
            if (Number.isInteger(n) && Math.abs(n) <= 10) { out[key] = n; continue; }
            out[key] = Number((n * biasFor(rig, key) * (1 + wave(90, 0.04) + rnd(-0.01, 0.01))).toFixed(2));
        }
    }
    const npt = !rig.activity.productive;
    out['drawworks.hook_load'] = Number((npt ? rnd(8, 12) : 60 + wave(40, 25)).toFixed(2));
    out['drawworks.block_position'] = Number((45 + wave(30, 40)).toFixed(1));
    out['drilling.bit_depth'] = Number((rig.depth + wave(600, 20)).toFixed(1));
    out['drilling.hole_depth'] = Number(rig.depth.toFixed(1));
    out['htd.rpm'] = npt ? 0 : Number((60 + wave(25, 20)).toFixed(1));
    out['htd.torque'] = npt ? 0 : Number((4 + wave(20, 2)).toFixed(2));
    // Engine load follows the operation; fuel burn follows load (with that
    // engine's own efficiency), so fuel-per-load separates good and bad engines.
    const load = Math.max(8, (npt ? rnd(18, 26) : 50 + wave(45, 12)) * biasFor(rig, 'cat_engine.load'));
    out['cat_engine.load'] = Number(load.toFixed(1));
    out['cat_engine.fuel_rate'] = Number(((16 + 1.85 * load) * biasFor(rig, 'cat_engine.fuel_rate')).toFixed(1));
    out['cat_engine.rpm'] = Number(((npt ? 900 : 1250 + wave(50, 120)) * biasFor(rig, 'cat_engine.rpm')).toFixed(0));
    out['safety.esd_active'] = 0;
    out['safety.lockout_active'] = 0;
    // Run-hour counters keep counting up from the capture.
    out['cat_engine.run_hours'] = Number((rig.engineHours + (t - rig.started) / HOUR).toFixed(2));
    out['hpu.run_hours'] = Number((rig.hpuHours + (t - rig.started) / HOUR).toFixed(2));
    return out;
}

// ---------- CMMS snapshot ----------
const ASSET_DEFS = [
    { id: 'cat-engine', name: 'CAT Engine', category: 'Power generation', intervalH: 250 },
    { id: 'hpu', name: 'HPU', category: 'Hydraulic power unit', intervalH: 500 },
    { id: 'htd', name: 'HTD', category: 'Top drive', intervalH: 250 },
    { id: 'pct', name: 'PCT', category: 'Power casing tong', intervalH: 250 },
    { id: 'catwalk', name: 'Catwalk', category: 'Pipe handling', intervalH: 250 },
    { id: 'mud-pump', name: 'Mud Pump', category: 'Circulating system', intervalH: 500 },
];
const DT_REASONS = [
    ['hpu', 'HPU', 'HYD-LEAK', 'Hydraulic hose leak on HPU return line'],
    ['cat-engine', 'CAT Engine', 'ENG-OVERHEAT', 'Coolant temperature high; radiator cleaned'],
    ['htd', 'HTD', 'HTD-TRIP', 'Top drive tripped on overtorque'],
    ['pct', 'PCT', 'PCT-CLAMP', 'Tong clamp pressure low; seal replaced'],
    ['mud-pump', 'Mud Pump', 'PUMP-VALVE', 'Mud pump valve and seat replaced'],
    ['catwalk', 'Catwalk', 'CWK-SENSOR', 'Catwalk carrier position sensor fault'],
];

// Downtime history: a reliability profile per rig (some rigs much worse).
function buildDowntime(rig, now) {
    const out = [];
    const events = Math.round(rig.unreliability * 10) + 2;
    for (let i = 0; i < events; i++) {
        const [assetId, asset, code, note] = pick(DT_REASONS);
        const start = now - rnd(0.5, 60) * DAY;
        const durMin = Math.round(rnd(25, 60 * (4 + 10 * rig.unreliability)));
        out.push({
            id: `${rig.rigId}-DT-${i + 1}`, assetId, asset, reasonCode: code, notes: note,
            notificationNo: `NTF-${4100000 + Math.floor(rnd(0, 99999))}`,
            start: iso(start), end: iso(start + durMin * 60_000), durationMin: durMin,
        });
    }
    // Yesterday's NPT on most rigs, and one breakdown still open on the worst.
    const y = new Date(now - DAY); y.setHours(6, 30, 0, 0);
    const [aId, a, c, nt] = pick(DT_REASONS);
    const yDur = Math.round(rnd(30, 180));
    out.push({ id: `${rig.rigId}-DT-Y`, assetId: aId, asset: a, reasonCode: c, notes: nt,
        start: iso(y.getTime()), end: iso(y.getTime() + yDur * 60_000), durationMin: yDur });
    if (rig.unreliability > 0.6) {
        const [oId, o, oc, on] = pick(DT_REASONS);
        out.push({ id: `${rig.rigId}-DT-OPEN`, assetId: oId, asset: o, reasonCode: oc, notes: `${on} (in progress)`,
            start: iso(now - rnd(1, 5) * HOUR), end: null, durationMin: null });
    }
    return out.sort((x, y2) => String(y2.start).localeCompare(String(x.start)));
}

function buildLogbook(rig, now) {
    const out = [];
    const texts = [
        ['MAINTENANCE', 'Engine oil and filter changed', 'cat-engine', 'CAT Engine'],
        ['MAINTENANCE', 'HPU return filter element replaced', 'hpu', 'HPU'],
        ['INSPECTION', 'Daily walk-around inspection completed; no abnormality', null, null],
        ['MAINTENANCE', 'Top drive gearbox oil level topped up', 'htd', 'HTD'],
        ['LUBRICATION', 'Catwalk rollers and kicker pins greased', 'catwalk', 'Catwalk'],
        ['MAINTENANCE', 'Tong jaws inspected; dies replaced', 'pct', 'PCT'],
        ['OPERATIONS', 'Crew change and toolbox talk held', null, null],
    ];
    for (let d = 0; d < 7; d++) {
        for (let k = 0; k < 3; k++) {
            const [cat, text, assetId, asset] = pick(texts);
            const at = now - d * DAY - rnd(0.5, 20) * HOUR;
            const shift = new Date(at).getHours() < 18 && new Date(at).getHours() >= 6 ? 'Day' : 'Night';
            out.push({
                id: `${rig.rigId}-LOG-${d}-${k}`, logType: cat === 'OPERATIONS' ? 'OPERATIONS' : 'MAINTENANCE', category: cat,
                assetId, asset, text, entry: text, by: pick(CREW), shift,
                notificationNo: cat === 'MAINTENANCE' || cat === 'LUBRICATION' ? `NTF-${4200000 + Math.floor(rnd(0, 99999))}` : null,
                at: iso(at), ts: iso(at),
            });
        }
    }
    return out.sort((x, y) => String(y.at).localeCompare(String(x.at)));
}

function buildCmms(rig, now, downtime, logbook) {
    const openDt = downtime.filter((d) => !d.end);
    const assets = ASSET_DEFS.map((a, i) => {
        const hours = Math.round(rig.engineHours * (0.6 + 0.08 * i) + (now - rig.started) / HOUR);
        const due = Math.round(a.intervalH - ((hours + rig.pmOffset * (i + 1)) % a.intervalH) - (rig.unreliability > 0.6 && i < 2 ? a.intervalH * 0.9 : 0));
        const pmStatus = due < 0 ? 'overdue' : due < 40 ? 'due-soon' : 'ok';
        return {
            id: a.id, name: a.name, category: a.category, hours, source: i < 2 ? 'measured' : 'derived',
            nextDueInHours: due, pmStatus, openDowntime: openDt.filter((d) => d.assetId === a.id).length,
            health: a.id === 'cat-engine'
                ? [{ label: 'Load %', value: rnd(35, 75) }, { label: 'Oil press', value: rnd(42, 55) }, { label: 'Coolant', value: rnd(80, 92) }]
                : a.id === 'hpu'
                    ? [{ label: 'Oil temp', value: rnd(45, 62) }, { label: 'Discharge', value: rnd(150, 190) }]
                    : [],
        };
    });
    const pm = assets.map((a) => {
        const def = ASSET_DEFS.find((d) => d.id === a.id);
        return {
            id: `${rig.rigId}-PM-${a.id}`, assetId: a.id, asset: a.name, assetName: a.name,
            task: `${def.intervalH} h service`, intervalH: def.intervalH,
            dueInHours: a.nextDueInHours, nextDueInHours: a.nextDueInHours, status: a.pmStatus,
        };
    });
    const workOrders = [];
    let woSeq = 1;
    for (const a of assets.filter((x) => x.pmStatus !== 'ok')) {
        workOrders.push({ id: `${rig.rigId}-WO-${woSeq}`, woNo: `WO-${8800000 + Math.floor(rnd(0, 99999))}`, type: 'PM',
            assetId: a.id, assetName: a.name, title: `${a.name} scheduled service`, priority: a.pmStatus === 'overdue' ? 'P2' : 'P3',
            status: 'OPEN', raisedAt: iso(now - rnd(1, 72) * HOUR), assignedTo: pick(CREW) });
        woSeq++;
    }
    for (const d of openDt) {
        workOrders.push({ id: `${rig.rigId}-WO-${woSeq}`, woNo: `WO-${8800000 + Math.floor(rnd(0, 99999))}`, type: 'BREAKDOWN',
            assetId: d.assetId, assetName: d.asset, title: d.notes, priority: 'P1', status: 'IN_PROGRESS', raisedAt: d.start, assignedTo: pick(CREW) });
        woSeq++;
    }
    const instruments = [
        ['PT-101', 'Standpipe pressure transmitter', 'Pressure'], ['PT-205', 'HPU discharge pressure', 'Pressure'],
        ['LT-301', 'Trip tank level', 'Level'], ['WT-401', 'Hookload load cell', 'Load'], ['TT-110', 'Engine coolant temperature', 'Temperature'],
    ].map(([tag, name, type], i) => {
        const overdue = rig.unreliability > 0.5 && i === 0;
        const last = now - (overdue ? 200 : rnd(10, 150)) * DAY;
        const next = last + 180 * DAY;
        return { id: `${rig.rigId}-${tag}`, tag, name, type, lastCalDate: iso(last), nextCalDate: iso(next), calStatus: next < now ? 'overdue' : 'ok' };
    });
    const runHours = [];
    for (let d = 0; d < 7; d++) {
        const date = new Date(now - d * DAY).toISOString().slice(0, 10);
        runHours.push({ date, assets: Object.fromEntries(ASSET_DEFS.map((a) => [a.id, Number(rnd(8, 20).toFixed(1))])) });
    }
    return {
        generatedAt: iso(now),
        assets, pm, workOrders, logbook, downtime, instruments, runHours,
        counts: {
            overdue: assets.filter((a) => a.pmStatus === 'overdue').length,
            dueSoon: assets.filter((a) => a.pmStatus === 'due-soon').length,
            ok: assets.filter((a) => a.pmStatus === 'ok').length,
            openDowntime: openDt.length,
        },
        cmmsSummary: { workOrders: {
            open: workOrders.length,
            breakdownOpen: workOrders.filter((w) => w.type === 'BREAKDOWN').length,
            p1Open: workOrders.filter((w) => w.priority === 'P1').length,
        } },
        instrumentSummary: { total: instruments.length, overdue: instruments.filter((n) => n.calStatus === 'overdue').length },
    };
}

// ---------- HTTP ----------
async function login(o, password) {
    const r = await fetch(`${o.portal}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: process.env.CRMF_ADMIN_USER || 'admin', password }),
    });
    if (!r.ok) throw new Error(`admin login failed (${r.status}); check CRMF_ADMIN_PASSWORD`);
    return (r.headers.get('set-cookie') || '').split(';')[0];
}

async function api(o, cookie, method, url, body) {
    const r = await fetch(`${o.portal}/api${url}`, {
        method, headers: { Cookie: cookie, 'X-CRMF-Request': '1', 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
    });
    const data = await r.json().catch(() => ({}));
    return { status: r.status, data };
}

// Register the mock rig (or rotate its token when it already exists).
async function provision(o, cookie, rig) {
    const body = { rigId: rig.rigId, name: rig.name, rigType: 'AHWR_WORKOVER', assetUnit: rig.site.assetUnit,
        field: rig.site.field, latitude: rig.site.lat, longitude: rig.site.lon };
    let r = await api(o, cookie, 'POST', '/rigs', body);
    if (r.status === 409) r = await api(o, cookie, 'POST', `/rigs/${encodeURIComponent(rig.rigId)}/rotate-token`);
    if (!r.data || !r.data.device_token) throw new Error(`provisioning ${rig.rigId} failed (${r.status}): ${JSON.stringify(r.data)}`);
    rig.token = r.data.device_token;
}

async function send(o, rig, channels, events) {
    rig.seq += 1;
    const r = await fetch(`${o.ingest}/ingest`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${rig.token}`, 'Content-Type': 'application/json', 'X-Device-Id': rig.rigId },
        body: JSON.stringify({ deviceId: rig.rigId, seq: rig.seq, epoch: rig.epoch, schemaVersion: '1.0',
            createdAt: new Date().toISOString(), channels, events }),
    });
    if (!r.ok) throw new Error(`${rig.rigId} ingest ${r.status}: ${await r.text()}`);
    return r.json();
}

// ---------- scenario ----------
function makeRig(i) {
    // Rigs 11-20 are a second rig at each asset, a few km from the first.
    const base = SITES[i % SITES.length];
    const second = i >= SITES.length;
    const site = second ? { ...base, lat: base.lat + 0.08, lon: base.lon - 0.06 } : base;
    const n = String(i + 1).padStart(2, '0');
    const now = Date.now();
    return {
        index: i, rigId: `MOCK-AHWR-${n}`, name: `AHWR-50 Mock ${n}`, site,
        phase: rnd(0, Math.PI * 2), depth: rnd(900, 2400), engineHours: rnd(2500, 9000), hpuHours: rnd(2000, 8000),
        pmOffset: Math.floor(rnd(0, 200)), unreliability: [0.15, 0.3, 0.75, 0.2, 0.5, 0.1, 0.85, 0.35, 0.25, 0.45][i % 10] * (second ? 0.6 : 1),
        // Stable per rig, so a re-run continues the same well instead of starting a new one.
        well: { wellId: `${site.wellPrefix}-${100 + ((i * 137 + 41) % 800)}`, service: SERVICES[i % SERVICES.length] },
        activity: ACTIVITIES[i % 5], activitySince: now, started: now,
        seq: 0, epoch: `mock-${crypto.randomBytes(4).toString('hex')}`, token: null, alarm: { active: 0, unack: 0, p1: 0, p2: 0, p3: 0, highest: null },
    };
}

function activityEvent(rig, ts) {
    return { type: 'activity', ts: iso(ts), payload: { ...rig.activity, source: 'mock', job: rig.well.wellId, wellName: rig.well.wellId, since: iso(ts) } };
}

async function backfill(o, rig) {
    const now = Date.now();
    const events = [];
    // Well under workover.
    events.push({ type: 'well.started', ts: iso(now - rnd(10, 40) * HOUR), payload: {
        wellId: rig.well.wellId, name: rig.well.wellId, field: rig.site.field, assetUnit: rig.site.assetUnit,
        service: rig.well.service, latitude: rig.site.lat + rnd(-0.03, 0.03), longitude: rig.site.lon + rnd(-0.03, 0.03),
        objective: rig.well.service, startedBy: pick(CREW), status: 'workover' } });
    // 12 h of activity segments for the activity timeline.
    for (let t = now - 12 * HOUR; t < now - 20 * 60_000; t += rnd(25, 70) * 60_000) {
        const a = Math.random() < 0.15 + rig.unreliability * 0.2 ? pick(ACTIVITIES.slice(5)) : pick(ACTIVITIES.slice(0, 5));
        events.push({ type: 'activity', ts: iso(t), payload: { ...a, source: 'mock', job: rig.well.wellId } });
    }
    events.push(activityEvent(rig, now - 15 * 60_000));
    const downtime = buildDowntime(rig, now);
    rig.downtime = downtime;
    rig.logbook = buildLogbook(rig, now);
    events.push({ type: 'cmms.snapshot', ts: iso(now), payload: buildCmms(rig, now, downtime, rig.logbook) });
    // 30 minutes of trend history at 15 s (skipped with --no-history).
    const channels = [];
    const from = o.noHistory ? now : now - 30 * 60_000;
    for (let t = from; t <= now; t += 15_000) channels.push({ ts: iso(t), values: telemetry(rig, t) });
    return send(o, rig, channels, events);
}

// Link faults, so the Data Quality Monitor has outages and backfill to show.
// every/down/offset in minutes from the script start. replay: the edge keeps a
// store-and-forward buffer and sends it on reconnect (backfill); without it the
// data for the outage is lost. replayChunk: snapshots per batch while draining
// (small = a slow, visible "backfilling" phase).
const LINK_FAULTS = {
    3: { every: 15, down: 4, offset: 3, replay: true },
    7: { every: 60, down: 12, offset: 6, replay: true, replayChunk: 20 },
    11: { every: 30, down: 5, offset: 9, replay: false },
    14: { every: 25, down: 6, offset: 12, replay: true },
};
function linkDown(rig, now) {
    const f = LINK_FAULTS[rig.index];
    if (!f) return false;
    const m = (now - rig.started) / 60_000 - f.offset;
    return m >= 0 && (m % f.every) < f.down;
}

async function tick(o, rig, n) {
    const now = Date.now();
    const events = [];
    // Change operation every ~2-4 minutes; NPT more likely on unreliable rigs.
    if (now - rig.activitySince > rnd(120, 240) * 1000) {
        rig.activity = Math.random() < 0.1 + rig.unreliability * 0.15 ? pick(ACTIVITIES.slice(5)) : pick(ACTIVITIES.slice(0, 5));
        rig.activitySince = now;
        events.push(activityEvent(rig, now));
    }
    // Occasional alarm rise / clear.
    if (Math.random() < 0.06) {
        const p1 = rig.unreliability > 0.6 && Math.random() < 0.4 ? 1 : 0;
        const p2 = Math.random() < 0.5 ? 1 : 0;
        const active = p1 + p2 + (Math.random() < 0.5 ? 1 : 0);
        rig.alarm = { active, unack: active, p1, p2, p3: active - p1 - p2, highest: p1 ? 'P1' : p2 ? 'P2' : active ? 'P3' : null };
        events.push({ type: 'alarm', ts: iso(now), payload: rig.alarm });
    } else if (rig.alarm.active && Math.random() < 0.08) {
        rig.alarm = { active: 0, unack: 0, p1: 0, p2: 0, p3: 0, highest: null };
        events.push({ type: 'alarm', ts: iso(now), payload: rig.alarm });
    }
    rig.depth += rig.activity.productive ? rnd(0, 0.4) : 0;
    // A fresh CMMS snapshot about once a minute (like the edge).
    if (n % Math.max(1, Math.round(60 / o.interval)) === 0) {
        events.push({ type: 'cmms.snapshot', ts: iso(now), payload: buildCmms(rig, now, rig.downtime, rig.logbook) });
    }
    const channels = [{ ts: iso(now), values: telemetry(rig, now) }];
    const fault = LINK_FAULTS[rig.index] || {};
    rig.buffer = rig.buffer || { channels: [], events: [] };
    if (linkDown(rig, now)) {
        // Simulated link fault: buffer (store-and-forward) or lose the data.
        if (fault.replay) { rig.buffer.channels.push(...channels); rig.buffer.events.push(...events); }
        trimBuffer(rig);
        return { skipped: true };
    }
    // Store-and-forward like the real edge: queue the live sample behind any
    // backlog, send oldest-first (a chunk per batch), and put it back on failure.
    rig.buffer.channels.push(...channels);
    rig.buffer.events.push(...events);
    const sendCh = rig.buffer.channels.splice(0, fault.replayChunk || 3600);
    const sendEv = rig.buffer.channels.length ? [] : rig.buffer.events.splice(0);
    try {
        return await send(o, rig, sendCh, sendEv);
    } catch (e) {
        rig.buffer.channels.unshift(...sendCh);
        rig.buffer.events.unshift(...sendEv);
        trimBuffer(rig);
        throw e;
    }
}

// Bound the buffer (~2 h at 5 s), dropping the oldest like a full edge buffer.
function trimBuffer(rig) {
    const max = 1440;
    if (rig.buffer.channels.length > max) rig.buffer.channels.splice(0, rig.buffer.channels.length - max);
    if (rig.buffer.events.length > max) rig.buffer.events.splice(0, rig.buffer.events.length - max);
}

async function main() {
    const o = parseArgs(process.argv);
    const password = process.env.CRMF_ADMIN_PASSWORD;
    if (!password) {
        console.error('Set CRMF_ADMIN_PASSWORD (the portal admin password) to register the mock rigs.');
        process.exit(2);
    }
    const cookie = await login(o, password);
    const rigs = Array.from({ length: o.rigs }, (_, i) => makeRig(i));
    for (const rig of rigs) {
        await provision(o, cookie, rig);
        const r = await backfill(o, rig);
        console.log(`[mock] ${rig.rigId} @ ${rig.site.field}: well ${rig.well.wellId}, backfilled ${r.receivedPoints} points, ${r.receivedEvents} events`);
    }
    let n = 0;
    const loop = async () => {
        n += 1;
        await Promise.all(rigs.map((rig) => tick(o, rig, n).catch((e) => console.warn('[mock]', e.message))));
        if (n % 12 === 0) console.log(`[mock] ${new Date().toLocaleTimeString()} streaming ${rigs.length} rigs (batch ${n})`);
    };
    await loop();
    if (o.once) return;
    console.log(`[mock] streaming every ${o.interval}s — Ctrl+C to stop`);
    setInterval(loop, o.interval * 1000);
}

main().catch((e) => { console.error('[mock] fatal:', e.message, e.cause ? `(${e.cause.code || e.cause.message})` : ''); process.exit(1); });
