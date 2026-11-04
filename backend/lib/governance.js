'use strict';
// Governance & rollout workspace + workover performance + reporting queries
// (proposal §6.1 governance workspace, workover performance, reporting; §7 value realization).
const { query } = require('./db');
const { rigIdsForUnit } = require('./fleet');

const GATES = ['gate0', 'discovery', 'implementation', 'operation', 'live'];
const GATE_LABEL = {
    gate0: 'Gate 0 — Approval', discovery: 'Phase 1a — Discovery',
    implementation: 'Phase 1b — Implementation', operation: 'Phase 1c — Operation',
    live: 'Phase 2 — Live / Fleet',
};

// ----- Governance workspace -----
async function getGovernance() {
    const rigs = await query(`
        SELECT r.rig_id, r.name, r.field, r.status, r.commissioned_at,
               d.gate, d.commissioning, d.site_ready, d.security_review,
               d.adoption_pct, d.open_issues, d.wave, d.edge_version, d.notes
        FROM rigs r LEFT JOIN deployment_status d ON d.rig_id = r.rig_id
        ORDER BY r.rig_id`);
    const escalations = await query(
        `SELECT e.*, r.name AS rig_name FROM escalations e
         LEFT JOIN rigs r ON r.rig_id = e.rig_id ORDER BY
         CASE e.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
         CASE e.severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, e.opened_at DESC`);
    const decisions = await query('SELECT * FROM decisions ORDER BY ts DESC LIMIT 100');
    const value = await query('SELECT * FROM value_metrics ORDER BY id');

    // Stage-gate funnel counts.
    const funnel = GATES.map((g) => ({
        gate: g, label: GATE_LABEL[g],
        count: rigs.rows.filter((r) => (r.gate || 'gate0') === g).length,
    }));
    const adoptionAvg = rigs.rows.length
        ? Math.round(rigs.rows.reduce((s, r) => s + (r.adoption_pct || 0), 0) / rigs.rows.length) : 0;

    return {
        rigs: rigs.rows,
        funnel,
        gates: GATES.map((g) => ({ value: g, label: GATE_LABEL[g] })),
        escalations: escalations.rows,
        decisions: decisions.rows,
        valueMetrics: value.rows,
        summary: {
            total: rigs.rows.length,
            commissioned: rigs.rows.filter((r) => r.commissioning === 'commissioned').length,
            live: rigs.rows.filter((r) => (r.gate || '') === 'live').length,
            openEscalations: escalations.rows.filter((e) => e.status !== 'resolved').length,
            adoptionAvg,
        },
    };
}

// ----- Governance write validation -----
// Every write is checked against the schema's vocabularies before it reaches
// the database, so a bad value is a 400 with a reason (not a 500, and not a
// silently stored gate/status the portal cannot display).
const COMMISSIONING = ['planned', 'in_progress', 'commissioned'];
const SEVERITIES = ['low', 'medium', 'high'];
const ESC_STATUSES = ['open', 'in_progress', 'resolved'];
const bad = (msg) => Object.assign(new Error(msg), { status: 400 });
const notFound = (msg) => Object.assign(new Error(msg), { status: 404 });
const oneOf = (k, v, list) => { if (!list.includes(v)) throw bad(`${k} must be one of: ${list.join(', ')}`); return v; };
const intIn = (k, v, lo, hi) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < lo || (hi != null && n > hi)) throw bad(`${k} must be a whole number${hi != null ? ` from ${lo} to ${hi}` : ` ≥ ${lo}`}`);
    return n;
};
const text = (k, v, max, required = false) => {
    const t = v == null ? '' : String(v).trim();
    if (required && !t) throw bad(`${k} is required`);
    if (t.length > max) throw bad(`${k} must be ${max} characters or less`);
    return t || null;
};
async function assertRig(rigId) {
    const { rows } = await query('SELECT 1 FROM rigs WHERE rig_id = $1', [rigId]);
    if (!rows.length) throw notFound(`rig ${rigId} not found`);
}

async function updateDeployment(rigId, patch, actor) {
    const p = patch || {};
    const clean = {};
    if ('gate' in p) clean.gate = oneOf('gate', p.gate, GATES);
    if ('commissioning' in p) clean.commissioning = oneOf('commissioning', p.commissioning, COMMISSIONING);
    if ('site_ready' in p) clean.site_ready = !!p.site_ready;
    if ('security_review' in p) clean.security_review = !!p.security_review;
    if ('adoption_pct' in p) clean.adoption_pct = intIn('adoption_pct', p.adoption_pct, 0, 100);
    if ('open_issues' in p) clean.open_issues = intIn('open_issues', p.open_issues, 0, 10000);
    if ('wave' in p) clean.wave = p.wave == null || p.wave === '' ? null : intIn('wave', p.wave, 0, 1000);
    if ('edge_version' in p) clean.edge_version = text('edge_version', p.edge_version, 64);
    if ('notes' in p) clean.notes = text('notes', p.notes, 2000);
    const keys = Object.keys(clean);
    if (!keys.length) throw bad('no updatable fields');
    await assertRig(rigId);
    const sets = keys.map((k, i) => `${k} = $${i + 2}`).concat('updated_at = now()');
    await query(
        `INSERT INTO deployment_status (rig_id) VALUES ($1) ON CONFLICT (rig_id) DO NOTHING`, [rigId]);
    await query(`UPDATE deployment_status SET ${sets.join(', ')} WHERE rig_id = $1`, [rigId, ...keys.map((k) => clean[k])]);
    await query('INSERT INTO audit_log (actor, action, target, detail) VALUES ($1,$2,$3,$4)',
        [actor || 'system', 'deployment.update', rigId, clean]);
    const { rows } = await query('SELECT * FROM deployment_status WHERE rig_id = $1', [rigId]);
    return rows[0];
}

async function addEscalation({ rigId, title, severity, owner, notes } = {}, actor) {
    const rig = text('rigId', rigId, 64);
    if (rig) await assertRig(rig);
    const t = text('title', title, 200, true);
    const sev = severity == null || severity === '' ? 'medium' : oneOf('severity', severity, SEVERITIES);
    const { rows } = await query(
        `INSERT INTO escalations (rig_id, title, severity, owner, notes)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [rig, t, sev, text('owner', owner, 120), text('notes', notes, 2000)]);
    await query('INSERT INTO audit_log (actor, action, target, detail) VALUES ($1,$2,$3,$4)',
        [actor || 'system', 'escalation.add', rig, { title: t, severity: sev }]);
    return rows[0];
}

async function updateEscalation(id, patch, actor) {
    const p = patch || {};
    if (!/^[0-9]{1,18}$/.test(String(id))) throw bad('invalid escalation id');
    const clean = {};
    if ('status' in p) clean.status = oneOf('status', p.status, ESC_STATUSES);
    if ('severity' in p) clean.severity = oneOf('severity', p.severity, SEVERITIES);
    if ('owner' in p) clean.owner = text('owner', p.owner, 120);
    if ('notes' in p) clean.notes = text('notes', p.notes, 2000);
    const keys = Object.keys(clean);
    if (!keys.length) throw bad('no updatable fields');
    const sets = keys.map((k, i) => `${k} = $${i + 2}`);
    // resolved_at follows the status both ways (re-opening clears it).
    if ('status' in clean) sets.push(clean.status === 'resolved' ? 'resolved_at = COALESCE(resolved_at, now())' : 'resolved_at = NULL');
    const { rowCount } = await query(`UPDATE escalations SET ${sets.join(', ')} WHERE id = $1`, [id, ...keys.map((k) => clean[k])]);
    if (!rowCount) throw notFound('escalation not found');
    await query('INSERT INTO audit_log (actor, action, target, detail) VALUES ($1,$2,$3,$4)',
        [actor || 'system', 'escalation.update', String(id), clean]);
    const { rows } = await query('SELECT * FROM escalations WHERE id = $1', [id]);
    return rows[0];
}

async function addDecision({ title, detail } = {}, actor) {
    const { rows } = await query(
        'INSERT INTO decisions (title, detail, author) VALUES ($1,$2,$3) RETURNING *',
        [text('title', title, 200, true), text('detail', detail, 4000), actor || 'system']);
    // Audit the mutation like its sibling governance writes (audit #14).
    await query('INSERT INTO audit_log (actor, action, target, detail) VALUES ($1,$2,$3,$4)',
        [actor || 'system', 'decision.add', String(rows[0].id), { title }]);
    return rows[0];
}


// ---------------------------------------------------------------------------
// Maintenance & reliability KPIs (ISO 14224 / CMMS-standard): availability,
// MTBF, MTTR, NPT hours, downtime Pareto by reason, monthly trend, plus fleet
// PM / work-order / calibration posture from the latest CMMS snapshots.
async function getMaintenanceKpis({ days = 30, tz = 'Asia/Kolkata', unit } = {}) {
    const ids = await rigIdsForUnit(unit); // null = whole fleet
    const d = Math.min(Math.max(Number(days) || 30, 1), 365);
    const zone = /^[A-Za-z0-9_/+:-]{1,64}$/.test(String(tz || '')) ? String(tz) : 'Asia/Kolkata';
    const win = `${d} days`;
    const windowHours = d * 24;

    // Per-rig reliability from the accumulated downtime history. NPT is the part
    // of each record that overlaps the window, so a breakdown that is still OPEN
    // (no end_ts yet) or began before the window still counts against
    // availability; it used to be ignored, showing a down rig as 100% available.
    // A closed record's length is the edge's own duration_min when it has one.
    // MTTR stays closed-records-only (an open repair has no repair time yet).
    const dtQ = await query(
        `SELECT dt.rig_id,
                r.name,
                count(*) FILTER (WHERE dt.end_ts IS NOT NULL)                       AS breakdowns,
                count(*) FILTER (WHERE dt.end_ts IS NULL)                           AS open_records,
                COALESCE(sum(GREATEST(0, EXTRACT(EPOCH FROM (
                    LEAST(CASE WHEN dt.end_ts IS NULL THEN now()
                               ELSE COALESCE(dt.start_ts + dt.duration_min * interval '1 minute', dt.end_ts) END, now())
                    - GREATEST(dt.start_ts, now() - ($1)::interval))))), 0) / 3600.0 AS npt_hours,
                avg(dt.duration_min) FILTER (WHERE dt.end_ts IS NOT NULL) / 60.0    AS mttr_hours
         FROM rig_downtime dt
         LEFT JOIN rigs r ON r.rig_id = dt.rig_id
         WHERE dt.rig_id IS NOT NULL AND dt.start_ts IS NOT NULL
           AND COALESCE(dt.end_ts, now()) > now() - ($1)::interval
           AND ($2::text[] IS NULL OR dt.rig_id = ANY($2))
         GROUP BY dt.rig_id, r.name`,
        [win, ids]);

    // Downtime Pareto by EQUIPMENT, cumulated over the fleet.
    const parQ = await query(
        `SELECT COALESCE(NULLIF(trim(asset), ''), asset_id, 'Unspecified') AS equipment,
                COALESCE(sum(duration_min), 0) / 60.0                       AS hours,
                count(*)                                                    AS records
         FROM rig_downtime
         WHERE start_ts > now() - ($1)::interval AND end_ts IS NOT NULL
           AND ($2::text[] IS NULL OR rig_id = ANY($2))
         GROUP BY 1 ORDER BY hours DESC LIMIT 10`,
        [win, ids]);

    // Monthly trend — last 6 calendar months in the operating timezone.
    const monQ = await query(
        `WITH months AS (
            SELECT to_char(date_trunc('month', (now() AT TIME ZONE $1)) - (i || ' months')::interval, 'YYYY-MM') AS ym
            FROM generate_series(0, 5) AS g(i)
         ),
         dt AS (
            SELECT to_char(date_trunc('month', start_ts AT TIME ZONE $1), 'YYYY-MM') AS ym,
                   COALESCE(sum(duration_min), 0) / 60.0 AS npt_hours,
                   count(*) FILTER (WHERE end_ts IS NOT NULL) AS breakdowns
            FROM rig_downtime WHERE start_ts > now() - interval '6 months'
              AND ($2::text[] IS NULL OR rig_id = ANY($2))
            GROUP BY 1
         )
         SELECT m.ym, COALESCE(dt.npt_hours, 0) AS npt_hours, COALESCE(dt.breakdowns, 0) AS breakdowns
         FROM months m LEFT JOIN dt ON dt.ym = m.ym
         ORDER BY m.ym`,
        [zone, ids]);

    // Fleet CMMS posture from the latest snapshot per rig (PM counts, open
    // work orders, calibration). ->> on absent keys is NULL; sum() skips NULLs.
    const cmmsQ = await query(
        `SELECT count(*)                                                              AS rigs_reporting,
                sum((snapshot->'counts'->>'overdue')::int)                            AS pm_overdue,
                sum((snapshot->'counts'->>'dueSoon')::int)                            AS pm_due_soon,
                sum((snapshot->'counts'->>'ok')::int)                                 AS pm_ok,
                sum((snapshot->'cmmsSummary'->'workOrders'->>'open')::int)            AS wo_open,
                sum((snapshot->'cmmsSummary'->'workOrders'->>'breakdownOpen')::int)   AS wo_breakdown,
                sum((snapshot->'cmmsSummary'->'workOrders'->>'p1Open')::int)          AS wo_p1,
                sum((snapshot->'instrumentSummary'->>'overdue')::int)                 AS inst_overdue,
                sum((snapshot->'instrumentSummary'->>'total')::int)                   AS inst_total
         FROM rig_cmms
         WHERE ($1::text[] IS NULL OR rig_id = ANY($1))`, [ids]);

    // PM posture per EQUIPMENT class, cumulated across every rig's latest
    // CMMS snapshot (status values per the edge shape: overdue | due-soon | ok).
    const pmEqQ = await query(
        `SELECT COALESCE(NULLIF(trim(COALESCE(p->>'asset', p->>'assetName')), ''), p->>'assetId', 'Unspecified') AS equipment,
                count(*)                                              AS units,
                count(*) FILTER (WHERE p->>'status' = 'overdue')      AS overdue,
                count(*) FILTER (WHERE p->>'status' = 'due-soon')     AS due_soon,
                count(*) FILTER (WHERE p->>'status' = 'ok')           AS ok,
                avg(COALESCE(p->>'nextDueInHours', p->>'dueInHours')::double precision)
                    FILTER (WHERE COALESCE(p->>'nextDueInHours', p->>'dueInHours') ~ '^-?[0-9]+(\\.[0-9]+)?$') AS avg_next_due_h
         FROM rig_cmms, jsonb_array_elements(COALESCE(snapshot->'pm', '[]'::jsonb)) AS p
         WHERE ($1::text[] IS NULL OR rig_cmms.rig_id = ANY($1))
         GROUP BY 1
         ORDER BY overdue DESC, due_soon DESC, equipment`, [ids]);

    // Fleet availability/MTBF are averaged over rigs that have ever reported
    // (telemetry or a CMMS snapshot). Counting registered-but-silent rigs as
    // 100% available inflated the fleet figure.
    const rigCountQ = await query(
        `SELECT count(*) AS n FROM rigs r
         WHERE (r.last_data_at IS NOT NULL
                OR EXISTS (SELECT 1 FROM rig_cmms c WHERE c.rig_id = r.rig_id))
           AND ($1::text[] IS NULL OR r.rig_id = ANY($1))`, [ids]);
    const totalRigs = Number(rigCountQ.rows[0].n) || 0;
    const num = (v) => (v == null ? null : Number(v));

    const rigs = dtQ.rows.map((r) => {
        const nptH = Number(r.npt_hours) || 0;
        const bd = Number(r.breakdowns) || 0;
        return {
            rigId: r.rig_id,
            name: r.name || r.rig_id,
            breakdowns: bd,
            openDowntime: Number(r.open_records) || 0,
            nptHours: nptH,
            mttrHours: num(r.mttr_hours),
            mtbfHours: bd > 0 ? Math.max(0, (windowHours - nptH) / bd) : null,
            availabilityPct: Math.max(0, Math.min(100, (1 - nptH / windowHours) * 100)),
        };
    }).sort((a, b) => a.availabilityPct - b.availabilityPct || String(a.rigId || '').localeCompare(String(b.rigId || '')));

    const totNpt = rigs.reduce((a, r) => a + r.nptHours, 0);
    const totBd = rigs.reduce((a, r) => a + r.breakdowns, 0);
    const totDurMin = dtQ.rows.reduce((a, r) => a + ((Number(r.mttr_hours) || 0) * 60 * (Number(r.breakdowns) || 0)), 0);
    const c = cmmsQ.rows[0] || {};
    const pmTotal = (Number(c.pm_overdue) || 0) + (Number(c.pm_due_soon) || 0) + (Number(c.pm_ok) || 0);

    return {
        windowDays: d,
        timezone: zone,
        fleet: {
            availabilityPct: totalRigs > 0 ? Math.max(0, (1 - totNpt / (windowHours * totalRigs)) * 100) : null,
            mtbfHours: totBd > 0 && totalRigs > 0 ? Math.max(0, (windowHours * totalRigs - totNpt) / totBd) : null,
            mttrHours: totBd > 0 ? (totDurMin / 60) / totBd : null,
            nptHours: totNpt,
            breakdowns: totBd,
            openDowntime: rigs.reduce((a, r) => a + r.openDowntime, 0),
            pmOverdue: num(c.pm_overdue),
            pmDueSoon: num(c.pm_due_soon),
            pmCompliancePct: pmTotal > 0 ? ((pmTotal - (Number(c.pm_overdue) || 0)) / pmTotal) * 100 : null,
            woOpen: num(c.wo_open),
            woBreakdown: num(c.wo_breakdown),
            woP1: num(c.wo_p1),
            instOverdue: num(c.inst_overdue),
            instTotal: num(c.inst_total),
            rigsReporting: Number(c.rigs_reporting) || 0,
            totalRigs,
        },
        rigs,
        pmByEquipment: pmEqQ.rows.map((r) => {
            const units = Number(r.units) || 0;
            const overdue = Number(r.overdue) || 0;
            return {
                equipment: r.equipment,
                units,
                overdue,
                dueSoon: Number(r.due_soon) || 0,
                ok: Number(r.ok) || 0,
                avgNextDueH: r.avg_next_due_h != null ? Number(r.avg_next_due_h) : null,
                compliancePct: units > 0 ? ((units - overdue) / units) * 100 : null,
            };
        }),
        pareto: parQ.rows.map((r) => ({ equipment: r.equipment, hours: Number(r.hours) || 0, records: Number(r.records) || 0 })),
        monthly: monQ.rows.map((m) => ({ month: m.ym, nptHours: Number(m.npt_hours) || 0, breakdowns: Number(m.breakdowns) || 0 })),
    };
}

// ---------------------------------------------------------------------------
// Workover KPIs (industry-standard job metrics — IADC-style daily report
// aggregates): avg days per well, NPT per well, make-up / break-out connection
// times, diesel consumption per well and per month. Sources: well_runs
// (job windows + productive/NPT/joints, backfilled at run close), connections
// (op + durationSec payload), telemetry_1m (cat_engine.fuel_rate integration),
// rig_downtime (maintenance NPT minutes).
async function getWorkoverKpis({ days = 30, tz = 'Asia/Kolkata', unit } = {}) {
    const ids = await rigIdsForUnit(unit); // null = whole fleet
    const d = Math.min(Math.max(Number(days) || 30, 1), 365);
    const zone = /^[A-Za-z0-9_/+:-]{1,64}$/.test(String(tz || '')) ? String(tz) : 'Asia/Kolkata';
    const win = `${d} days`;

    // Per-rig job stats from completed runs in the window.
    const runsQ = await query(
        `SELECT wr.rig_id,
                r.name,
                count(*)                                        AS runs,
                count(DISTINCT wr.well_id)                      AS wells,
                avg(EXTRACT(EPOCH FROM (wr.ended_at - wr.started_at)))  AS avg_run_sec,
                sum(EXTRACT(EPOCH FROM (wr.ended_at - wr.started_at)))  AS total_run_sec,
                sum(wr.productive_sec)                          AS productive_sec,
                sum(wr.npt_sec)                                 AS npt_sec,
                sum(wr.joints)                                  AS joints
         FROM well_runs wr
         LEFT JOIN rigs r ON r.rig_id = wr.rig_id
         WHERE wr.rig_id IS NOT NULL AND wr.ended_at IS NOT NULL AND wr.ended_at > now() - ($1)::interval
           AND ($2::text[] IS NULL OR wr.rig_id = ANY($2))
         GROUP BY wr.rig_id, r.name`,
        [win, ids]);

    // Per-rig connection stats (make-up vs break-out via the payload op;
    // durationSec present for edge rigs and the fleet sim).
    const connQ = await query(
        `SELECT c.rig_id,
                count(*) FILTER (WHERE COALESCE(c.payload->>'op','MAKE_UP') = 'MAKE_UP')  AS makeups,
                count(*) FILTER (WHERE COALESCE(c.payload->>'op','MAKE_UP') = 'MAKE_UP' AND c.result = 'PASS') AS makeup_pass,
                avg((c.payload->>'durationSec')::double precision)
                    FILTER (WHERE COALESCE(c.payload->>'op','MAKE_UP') = 'MAKE_UP'
                            AND (c.payload->>'durationSec') ~ '^[0-9]+(\\.[0-9]+)?$')               AS makeup_sec,
                count(*) FILTER (WHERE c.payload->>'op' = 'BREAK_OUT')                    AS breakouts,
                avg((c.payload->>'durationSec')::double precision)
                    FILTER (WHERE c.payload->>'op' = 'BREAK_OUT'
                            AND (c.payload->>'durationSec') ~ '^[0-9]+(\\.[0-9]+)?$')               AS breakout_sec
         FROM connections c
         WHERE c.ts > now() - ($1)::interval
           AND ($2::text[] IS NULL OR c.rig_id = ANY($2))
         GROUP BY c.rig_id`,
        [win, ids]);

    // Per-rig diesel by fuel-rate integration over 1-minute buckets (l/h / 60).
    const fuelQ = await query(
        `SELECT rig_id, sum(avg) / 60.0 AS liters
         FROM telemetry_1m
         WHERE metric = 'cat_engine.fuel_rate' AND bucket > now() - ($1)::interval
           AND ($2::text[] IS NULL OR rig_id = ANY($2))
         GROUP BY rig_id`,
        [win, ids]);

    const connBy = new Map(connQ.rows.map((r) => [r.rig_id, r]));
    const fuelBy = new Map(fuelQ.rows.map((r) => [r.rig_id, r]));
    const num = (v) => (v == null ? null : Number(v));

    const rigs = runsQ.rows.map((r) => {
        const c = connBy.get(r.rig_id) || {};
        const f = fuelBy.get(r.rig_id) || {};
        const wellsN = Number(r.wells) || 0;
        const prod = num(r.productive_sec); const npt = num(r.npt_sec);
        return {
            rigId: r.rig_id,
            name: r.name || r.rig_id,
            wellsCompleted: wellsN,
            runs: Number(r.runs) || 0,
            avgDaysPerWell: r.avg_run_sec != null ? Number(r.avg_run_sec) / 86400 : null,
            nptPct: prod != null && npt != null && (prod + npt) > 0 ? (npt / (prod + npt)) * 100 : null,
            nptHoursPerWell: npt != null && wellsN > 0 ? npt / 3600 / wellsN : null,
            joints: num(r.joints),
            avgMakeupSec: num(c.makeup_sec),
            avgBreakoutSec: num(c.breakout_sec),
            makeups: Number(c.makeups) || 0,
            breakouts: Number(c.breakouts) || 0,
            makeupPassRate: c.makeups > 0 ? Math.round((Number(c.makeup_pass) / Number(c.makeups)) * 100) : null,
            dieselLiters: f.liters != null ? Number(f.liters) : null,
            dieselPerWellL: f.liters != null && wellsN > 0 ? Number(f.liters) / wellsN : null,
        };
    }).sort((a, b) => b.wellsCompleted - a.wellsCompleted || String(a.rigId || '').localeCompare(String(b.rigId || '')));

    // Fleet rollup.
    const totWells = rigs.reduce((a, r) => a + r.wellsCompleted, 0);
    const totRunSec = runsQ.rows.reduce((a, r) => a + (Number(r.total_run_sec) || 0), 0);
    const totRuns = rigs.reduce((a, r) => a + r.runs, 0);
    const totProd = runsQ.rows.reduce((a, r) => a + (Number(r.productive_sec) || 0), 0);
    const totNpt = runsQ.rows.reduce((a, r) => a + (Number(r.npt_sec) || 0), 0);
    const wAvg = (sel, wSel) => {
        let sum = 0; let w = 0;
        for (const r of rigs) { const v = sel(r); const ww = wSel(r); if (v != null && ww > 0) { sum += v * ww; w += ww; } }
        return w > 0 ? sum / w : null;
    };
    const totDiesel = rigs.reduce((a, r) => a + (r.dieselLiters || 0), 0);

    // Monthly series — last 6 calendar months in the operating timezone.
    const monthsQ = await query(
        `WITH months AS (
            SELECT to_char(date_trunc('month', (now() AT TIME ZONE $1)) - (i || ' months')::interval, 'YYYY-MM') AS ym
            FROM generate_series(0, 5) AS g(i)
         ),
         runs_m AS (
            SELECT to_char(date_trunc('month', ended_at AT TIME ZONE $1), 'YYYY-MM') AS ym,
                   count(DISTINCT well_id) AS wells,
                   avg(EXTRACT(EPOCH FROM (ended_at - started_at))) AS avg_run_sec,
                   sum(npt_sec) AS npt_sec
            FROM well_runs WHERE ended_at IS NOT NULL AND ended_at > now() - interval '6 months'
              AND ($2::text[] IS NULL OR rig_id = ANY($2))
            GROUP BY 1
         ),
         npt_m AS (
            SELECT to_char(date_trunc('month', start_ts AT TIME ZONE $1), 'YYYY-MM') AS ym,
                   sum(duration_min) / 60.0 AS npt_hours
            FROM rig_downtime WHERE start_ts > now() - interval '6 months'
              AND ($2::text[] IS NULL OR rig_id = ANY($2))
            GROUP BY 1
         ),
         fuel_m AS (
            SELECT to_char(date_trunc('month', bucket AT TIME ZONE $1), 'YYYY-MM') AS ym,
                   sum(avg) / 60.0 AS liters
            FROM telemetry_1m
            WHERE metric = 'cat_engine.fuel_rate' AND bucket > now() - interval '6 months'
              AND ($2::text[] IS NULL OR rig_id = ANY($2))
            GROUP BY 1
         )
         SELECT m.ym,
                COALESCE(r.wells, 0)      AS wells,
                r.avg_run_sec             AS avg_run_sec,
                r.npt_sec                 AS run_npt_sec,
                n.npt_hours               AS downtime_npt_hours,
                f.liters                  AS diesel_liters
         FROM months m
         LEFT JOIN runs_m r ON r.ym = m.ym
         LEFT JOIN npt_m  n ON n.ym = m.ym
         LEFT JOIN fuel_m f ON f.ym = m.ym
         ORDER BY m.ym`,
        [zone, ids]);
    const monthly = monthsQ.rows.map((m) => ({
        month: m.ym,
        wellsCompleted: Number(m.wells) || 0,
        avgDaysPerWell: m.avg_run_sec != null ? Number(m.avg_run_sec) / 86400 : null,
        nptHours: m.downtime_npt_hours != null ? Number(m.downtime_npt_hours)
            : (m.run_npt_sec != null ? Number(m.run_npt_sec) / 3600 : null),
        dieselLiters: m.diesel_liters != null ? Number(m.diesel_liters) : null,
    }));
    const monthsWithFuel = monthly.filter((m) => m.dieselLiters != null);

    return {
        windowDays: d,
        timezone: zone,
        fleet: {
            wellsCompleted: totWells,
            runsCompleted: totRuns,
            avgDaysPerWell: totRuns > 0 ? (totRunSec / totRuns) / 86400 : null,
            avgNptHoursPerWell: totWells > 0 && totNpt > 0 ? totNpt / 3600 / totWells : null,
            nptPct: (totProd + totNpt) > 0 ? (totNpt / (totProd + totNpt)) * 100 : null,
            productivePct: (totProd + totNpt) > 0 ? (totProd / (totProd + totNpt)) * 100 : null,
            avgMakeupSec: wAvg((r) => r.avgMakeupSec, (r) => r.makeups),
            avgBreakoutSec: wAvg((r) => r.avgBreakoutSec, (r) => r.breakouts),
            makeups: rigs.reduce((a, r) => a + r.makeups, 0),
            makeupPassRate: (() => {
                const mk = rigs.reduce((a, r) => a + r.makeups, 0);
                const pass = rigs.reduce((a, r) => a + (r.makeupPassRate != null ? (r.makeupPassRate / 100) * r.makeups : 0), 0);
                return mk > 0 ? Math.round((pass / mk) * 100) : null;
            })(),
            dieselLiters: totDiesel > 0 ? totDiesel : null,
            dieselPerWellL: totDiesel > 0 && totWells > 0 ? totDiesel / totWells : null,
            dieselPerMonthL: monthsWithFuel.length ? monthsWithFuel.reduce((a, m) => a + m.dieselLiters, 0) / monthsWithFuel.length : null,
        },
        rigs,
        monthly,
    };
}


// ----- Workover performance (proposal §6.1) -----
async function getWorkover({ hours = 24, unit } = {}) {
    const h = Math.min(Math.max(Number(hours) || 24, 1), 24 * 30);
    const ids = await rigIdsForUnit(unit); // null = whole fleet
    // Connection quality fleet-wide.
    const conn = await query(`
        SELECT c.rig_id, r.name,
               count(*) AS total,
               count(*) FILTER (WHERE c.result = 'PASS') AS pass,
               count(*) FILTER (WHERE c.result = 'FAIL') AS fail,
               round(avg(c.peak_torque)::numeric, 0) AS avg_peak,
               max(c.peak_torque) AS max_peak
        FROM connections c LEFT JOIN rigs r ON r.rig_id = c.rig_id
        WHERE c.ts > now() - ($1 || ' hours')::interval
          AND ($2::text[] IS NULL OR c.rig_id = ANY($2))
        GROUP BY c.rig_id, r.name ORDER BY total DESC`, [h, ids]);
    // Recent activity events (NPT/activity tracking).
    const activity = await query(`
        SELECT e.rig_id, r.name, e.ts, e.payload
        FROM events e LEFT JOIN rigs r ON r.rig_id = e.rig_id
        WHERE e.type = 'activity' AND e.ts > now() - ($1 || ' hours')::interval
          AND ($2::text[] IS NULL OR e.rig_id = ANY($2))
        ORDER BY e.ts DESC LIMIT 200`, [h, ids]);
    return {
        windowHours: h,
        connections: conn.rows.map((r) => ({
            rigId: r.rig_id, name: r.name,
            total: Number(r.total), pass: Number(r.pass), fail: Number(r.fail),
            passRate: Number(r.total) ? Math.round((Number(r.pass) / Number(r.total)) * 100) : null,
            avgPeak: r.avg_peak != null ? Number(r.avg_peak) : null,
            maxPeak: r.max_peak != null ? Number(r.max_peak) : null,
        })),
        activity: activity.rows,
    };
}

// ----- Reporting (proposal §6.1) -----
// Snapshot report (current live state per rig) — unchanged default behaviour.
async function getFleetReport() {
    const rigs = await query(`
        SELECT r.rig_id, r.name, r.field, r.asset_unit, r.status, r.health_score, r.metric_count,
               r.last_data_at, r.active_activity, r.alarm_active, r.alarm_p1,
               d.gate, d.adoption_pct, d.commissioning
        FROM rigs r LEFT JOIN deployment_status d ON d.rig_id = r.rig_id
        ORDER BY r.rig_id`);
    return rigs.rows;
}

// Daily/weekly/monthly consolidated report (audit #29 / proposal §6.1 DWR).
// Aggregates per rig over the chosen window from the 1-minute continuous
// aggregate (telemetry health/ingest), the events stream (alarms), and the
// connections table (workover pass-rate). `period` is snapshot|daily|weekly|monthly.
const PERIODS = { daily: '1 day', weekly: '7 days', monthly: '30 days' };

// Unit / rig filter shared by the JSON report and the CSV export. A rig's unit
// is its asset unit, or its field when no unit is set (as on the fleet page).
function applyReportFilter(rows, { unit, rig } = {}) {
    const u = unit && unit !== 'all' ? String(unit) : null;
    const g = rig && rig !== 'all' ? String(rig) : null;
    return rows.filter((r) => (!u || (r.asset_unit || r.field || 'Unassigned') === u) && (!g || r.rig_id === g));
}

async function getFleetReportPeriod(period = 'snapshot', filter = {}) {
    const p = String(period || 'snapshot').toLowerCase();
    if (p === 'snapshot' || !PERIODS[p]) {
        return { period: 'snapshot', windowInterval: null, rows: applyReportFilter(await getFleetReport(), filter) };
    }
    const win = PERIODS[p];

    // Telemetry rollup over the window from the 1-minute CAGG.
    const tel = await query(`
        SELECT rig_id,
               count(*)                         AS sample_buckets,
               count(DISTINCT metric)           AS distinct_metrics
        FROM telemetry_1m
        WHERE bucket > now() - $1::interval
        GROUP BY rig_id`, [win]);
    const telBy = new Map(tel.rows.map((r) => [r.rig_id, r]));

    // Data availability over the window from the coverage ledger (minutes with
    // telemetry / minutes since the window start or the rig's first data).
    const covOk = (await query("SELECT to_regclass('public.rig_data_coverage') IS NOT NULL AS ok")).rows[0].ok;
    const cov = covOk ? await query(`
        WITH f AS (
            SELECT r.rig_id, (SELECT minute FROM rig_data_coverage x
                               WHERE x.rig_id = r.rig_id ORDER BY minute LIMIT 1) AS first_minute
            FROM rigs r
        )
        SELECT c.rig_id, count(*) AS covered,
               EXTRACT(EPOCH FROM (date_trunc('minute', now())
                   - GREATEST(now() - $1::interval, f.first_minute))) / 60 AS span
        FROM rig_data_coverage c JOIN f ON f.rig_id = c.rig_id
        WHERE c.minute > now() - $1::interval AND c.minute < date_trunc('minute', now())
        GROUP BY c.rig_id, f.first_minute`, [win]) : { rows: [] };
    const covBy = new Map(cov.rows.map((r) => [r.rig_id, r]));

    // Alarm + activity event counts over the window.
    const evt = await query(`
        SELECT rig_id,
               count(*) FILTER (WHERE type = 'alarm')      AS alarm_events,
               count(*) FILTER (WHERE type = 'activity')   AS activity_events,
               count(*) FILTER (WHERE type = 'connection') AS connection_events
        FROM events
        WHERE ts > now() - $1::interval
        GROUP BY rig_id`, [win]);
    const evtBy = new Map(evt.rows.map((r) => [r.rig_id, r]));

    // Connection pass-rate over the window.
    const conn = await query(`
        SELECT rig_id,
               count(*)                                   AS total,
               count(*) FILTER (WHERE result = 'PASS')    AS pass
        FROM connections
        WHERE ts > now() - $1::interval
        GROUP BY rig_id`, [win]);
    const connBy = new Map(conn.rows.map((r) => [r.rig_id, r]));

    const rigs = await query(`
        SELECT r.rig_id, r.name, r.field, r.asset_unit, r.status, r.health_score,
               d.gate, d.adoption_pct, d.commissioning
        FROM rigs r LEFT JOIN deployment_status d ON d.rig_id = r.rig_id
        ORDER BY r.rig_id`);

    const rows = applyReportFilter(rigs.rows, filter).map((r) => {
        const t = telBy.get(r.rig_id);
        const cv = covBy.get(r.rig_id);
        const span = cv ? Math.max(0, Math.round(Number(cv.span) || 0)) : 0;
        const covered = cv ? Number(cv.covered) : 0;
        const e = evtBy.get(r.rig_id);
        const c = connBy.get(r.rig_id);
        const total = c ? Number(c.total) : 0;
        const pass = c ? Number(c.pass) : 0;
        return {
            rig_id: r.rig_id, name: r.name, field: r.field, asset_unit: r.asset_unit, status: r.status,
            gate: r.gate, adoption_pct: r.adoption_pct, commissioning: r.commissioning,
            // Window aggregates:
            data_availability_pct: span ? Math.round((Math.min(covered, span) / span) * 1000) / 10 : null,
            outage_min: span ? Math.max(0, span - covered) : null,
            sample_buckets: t ? Number(t.sample_buckets) : 0,
            distinct_metrics: t ? Number(t.distinct_metrics) : 0,
            alarm_events: e ? Number(e.alarm_events) : 0,
            activity_events: e ? Number(e.activity_events) : 0,
            connection_total: total,
            connection_pass: pass,
            connection_pass_rate: total ? Math.round((pass / total) * 100) : null,
        };
    });
    return { period: p, windowInterval: win, rows };
}

module.exports = {
    GATES, GATE_LABEL, getGovernance, updateDeployment, addEscalation,
    updateEscalation, addDecision, getWorkover, getFleetReport, getFleetReportPeriod, getWorkoverKpis, getMaintenanceKpis };
