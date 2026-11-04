'use strict';
// Equipment performance: the same equipment class compared across every rig.
//
// For each class (engine, HPU, top drive, mud pump, tong, catwalk) and each rig
// this combines three central sources the edge already ships:
//   - telemetry      -> operating condition over a trailing window (avg / p95)
//   - rig_downtime   -> reliability of THAT equipment (downtime, MTTR, MTBF)
//   - rig_cmms       -> PM status, run hours and utilisation from the snapshot
// and scores it against the rest of the fleet:
//   - robust z-score (median / MAD) per parameter flags rigs that run unlike
//     their peers, in the direction that matters for that parameter;
//   - absolute operating limits flag readings outside the envelope;
//   - a 0-100 health index = 40% reliability + 35% condition + 25% maintenance,
//     returned with its components so the portal can explain every score.
// Read-only: SELECTs only.
const { query } = require('./db');
const fleet = require('./fleet');

// better: 'low' | 'high' | 'mid' — which way a deviation from the fleet is bad;
// 'none' = set by the job in hand (load, RPM, strokes), shown for context only.
// lo / hi: absolute operating limits (outside = condition alarm).
const CLASSES = [
    {
        id: 'engine', name: 'CAT Engine', assetIds: ['cat-engine', 'engine'], key: 'cat_engine.coolant_temp',
        params: [
            { metric: 'cat_engine.load', label: 'Load', unit: '%', better: 'none' },
            { metric: 'cat_engine.coolant_temp', label: 'Coolant', unit: '°C', better: 'low', hi: 95 },
            { metric: 'cat_engine.oil_pressure', label: 'Oil press.', unit: 'bar', better: 'high', lo: 38 },
            { metric: 'cat_engine.battery_voltage', label: 'Battery', unit: 'V', better: 'high', lo: 24 },
            { derived: 'fuel_per_load', label: 'Fuel / load', unit: 'l/h per %', better: 'low' },
        ],
    },
    {
        id: 'hpu', name: 'HPU', assetIds: ['hpu'], key: 'hpu.oil_temp',
        params: [
            { metric: 'hpu.oil_temp', label: 'Oil temp', unit: '°C', better: 'low', hi: 65 },
            { metric: 'hpu.oil_level', label: 'Oil level', unit: '%', better: 'high', lo: 65 },
            { metric: 'hpu.discharge_pressure', label: 'Discharge', unit: 'bar', better: 'high', lo: 140 },
            { metric: 'hpu.pilot_pressure', label: 'Pilot', unit: 'bar', better: 'mid' },
        ],
    },
    {
        id: 'htd', name: 'Top Drive', assetIds: ['htd', 'top-drive'], key: 'htd.torque',
        params: [
            { metric: 'htd.torque', label: 'Torque', unit: 'Nm', better: 'none' },
            { metric: 'htd.rpm', label: 'RPM', unit: 'rpm', better: 'none' },
            { metric: 'htd.inclination', label: 'Inclination', unit: '°', better: 'mid' },
        ],
    },
    {
        id: 'mudpump', name: 'Mud Pump', assetIds: ['mud-pump', 'mudpump'], key: 'mudpump.delta_pressure',
        params: [
            { metric: 'mudpump.pressure', label: 'Standpipe', unit: 'bar', better: 'none' },
            { metric: 'mudpump.delta_pressure', label: 'ΔP', unit: 'bar', better: 'low' },
            { metric: 'mudpump.spm', label: 'SPM', unit: 'spm', better: 'none' },
            { metric: 'mudpump.flow_in', label: 'Flow in', unit: 'lpm', better: 'none' },
        ],
    },
    {
        id: 'pct', name: 'Power Tong', assetIds: ['pct', 'tong'], key: 'pct.clamp_up_pressure',
        params: [
            { metric: 'pct.makeup_torque', label: 'Make-up torque', unit: 'Nm', better: 'none' },
            { metric: 'pct.clamp_up_pressure', label: 'Upper clamp', unit: 'bar', better: 'high', lo: 160 },
            { metric: 'pct.clamp_low_pressure', label: 'Lower clamp', unit: 'bar', better: 'high', lo: 160 },
        ],
    },
    {
        id: 'catwalk', name: 'Catwalk', assetIds: ['catwalk', 'cwk'], key: 'cwk.clamp_pressure',
        params: [
            { metric: 'cwk.clamp_pressure', label: 'Clamp press.', unit: 'bar', better: 'high', lo: 160 },
            { metric: 'cwk.clamp_force', label: 'Clamp force', unit: 'kN', better: 'high', lo: 130 },
        ],
    },
];

const paramKey = (p) => p.metric || p.derived;
const METRICS = [...new Set(CLASSES.flatMap((c) => c.params.filter((p) => p.metric).map((p) => p.metric))
    .concat(['cat_engine.fuel_rate', 'cat_engine.load']))];
const KEY_METRICS = CLASSES.map((c) => c.key);
const Z_FLAG = 3.5;          // Iglewicz-Hoaglin modified z-score outlier threshold
const MIN_REL_DEV = 0.08;    // ignore statistically "odd" but practically tiny gaps (<8%)

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const round = (v, d = 1) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);

function median(xs) {
    const a = xs.filter(Number.isFinite).sort((x, y) => x - y);
    if (!a.length) return null;
    const m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

// Is this deviation in the harmful direction for the parameter?
const harmful = (better, dev) => (better === 'none' ? false : better === 'mid' ? dev !== 0 : better === 'low' ? dev > 0 : dev < 0);

async function getEquipmentPerformance({ hours = 24, days = 30 } = {}) {
    const h = clamp(Number(hours) || 24, 1, 24 * 14);
    const d = clamp(Number(days) || 30, 1, 365);
    const winH = `${h} hours`;
    const winD = `${d} days`;
    const bucket = `${Math.max(5, Math.round((h * 60) / 24))} minutes`;

    const [rigs, telQ, trendQ, dtQ, cmmsQ] = await Promise.all([
        fleet.getFleet(),
        query(
            `SELECT rig_id, metric, avg(value) AS avg,
                    percentile_cont(0.95) WITHIN GROUP (ORDER BY value) AS p95, count(*) AS n
             FROM telemetry
             WHERE ts > now() - ($1)::interval AND metric = ANY($2)
             GROUP BY rig_id, metric`, [winH, METRICS]),
        query(
            `SELECT rig_id, metric, time_bucket(($1)::interval, ts) AS b, avg(value) AS v
             FROM telemetry
             WHERE ts > now() - ($2)::interval AND metric = ANY($3)
             GROUP BY 1, 2, 3 ORDER BY 3`, [bucket, winH, KEY_METRICS]),
        query(
            `SELECT rig_id, lower(COALESCE(asset_id, '')) AS asset_id, lower(COALESCE(asset, '')) AS asset,
                    reason_code, start_ts, end_ts, duration_min,
                    GREATEST(0, EXTRACT(EPOCH FROM (
                        LEAST(CASE WHEN end_ts IS NULL THEN now()
                                   ELSE COALESCE(start_ts + duration_min * interval '1 minute', end_ts) END, now())
                        - GREATEST(start_ts, now() - ($1)::interval)))) / 3600.0 AS hours
             FROM rig_downtime
             WHERE start_ts IS NOT NULL AND COALESCE(end_ts, now()) > now() - ($1)::interval`, [winD]),
        query('SELECT rig_id, snapshot FROM rig_cmms'),
    ]);

    // rig -> metric -> { avg, p95, n }
    const tel = new Map();
    for (const r of telQ.rows) {
        if (!tel.has(r.rig_id)) tel.set(r.rig_id, {});
        tel.get(r.rig_id)[r.metric] = { avg: Number(r.avg), p95: Number(r.p95), n: Number(r.n) };
    }
    const trend = new Map(); // `${rig}|${metric}` -> [{t, v}]
    for (const r of trendQ.rows) {
        const k = `${r.rig_id}|${r.metric}`;
        if (!trend.has(k)) trend.set(k, []);
        trend.get(k).push({ t: new Date(r.b).getTime(), v: round(Number(r.v), 2) });
    }
    const snaps = new Map(cmmsQ.rows.map((r) => [r.rig_id, r.snapshot || {}]));

    const out = [];
    for (const cls of CLASSES) {
        const ids = new Set(cls.assetIds);
        const nameLc = cls.name.toLowerCase();
        const isMine = (row) => ids.has(row.asset_id) || row.asset === nameLc;
        const dtRows = dtQ.rows.filter(isMine);

        const units = [];
        for (const rig of rigs) {
            const t = tel.get(rig.rigId) || {};
            const values = {};
            for (const p of cls.params) {
                if (p.derived === 'fuel_per_load') {
                    const f = t['cat_engine.fuel_rate'], l = t['cat_engine.load'];
                    values[paramKey(p)] = f && l && l.avg > 1 ? { avg: f.avg / l.avg, p95: null } : null;
                } else {
                    values[paramKey(p)] = t[p.metric] ? { avg: t[p.metric].avg, p95: t[p.metric].p95 } : null;
                }
            }
            const snap = snaps.get(rig.rigId) || {};
            const asset = (Array.isArray(snap.assets) ? snap.assets : []).find((a) => ids.has(String(a.id || '').toLowerCase()));
            const mine = dtRows.filter((r) => r.rig_id === rig.rigId);
            const hasTel = Object.values(values).some(Boolean);
            if (!hasTel && !asset && !mine.length) continue; // this rig reports nothing for this class

            const closed = mine.filter((r) => r.end_ts);
            const downtimeH = mine.reduce((a, r) => a + Number(r.hours || 0), 0);
            const mttrH = closed.length ? closed.reduce((a, r) => a + Number(r.duration_min || 0), 0) / 60 / closed.length : null;
            const runDays = (Array.isArray(snap.runHours) ? snap.runHours : [])
                .map((x) => Number(x?.assets?.[asset?.id])).filter(Number.isFinite);
            units.push({
                rigId: rig.rigId, name: rig.name, assetUnit: rig.assetUnit || rig.field || null, status: rig.status,
                values,
                trend: trend.get(`${rig.rigId}|${cls.key}`) || [],
                reliability: {
                    downtimeH: round(downtimeH, 1),
                    breakdowns: closed.length,
                    open: mine.length - closed.length,
                    mttrH: round(mttrH, 1),
                    mtbfH: closed.length ? round((d * 24 - downtimeH) / closed.length, 0) : null,
                    availabilityPct: round(clamp((1 - downtimeH / (d * 24)) * 100, 0, 100), 2),
                },
                pm: asset ? {
                    status: asset.pmStatus || null,
                    nextDueInHours: Number.isFinite(Number(asset.nextDueInHours)) ? Number(asset.nextDueInHours) : null,
                    hours: Number.isFinite(Number(asset.hours)) ? Number(asset.hours) : null,
                } : null,
                utilizationPct: runDays.length ? round((runDays.reduce((a, b) => a + b, 0) / runDays.length / 24) * 100, 0) : null,
            });
        }

        // Fleet reference per parameter: median + MAD over rigs with data.
        const stats = {};
        for (const p of cls.params) {
            const k = paramKey(p);
            const xs = units.map((u) => u.values[k]?.avg).filter(Number.isFinite);
            const med = median(xs);
            const mad = med == null ? null : median(xs.map((x) => Math.abs(x - med)));
            stats[k] = { median: round(med, 3), mad: round(mad, 4), n: xs.length };
        }

        // Score every unit and collect findings.
        const insights = [];
        for (const u of units) {
            let penalty = 0;
            u.flags = {};
            for (const p of cls.params) {
                const k = paramKey(p);
                const v = u.values[k]?.avg;
                if (!Number.isFinite(v)) continue;
                const { median: med, mad } = stats[k];
                const dev = med ? (v - med) / Math.abs(med) : 0;
                const z = mad ? (0.6745 * (v - med)) / mad : 0;
                const outlier = Math.abs(z) >= Z_FLAG && Math.abs(dev) >= MIN_REL_DEV && harmful(p.better, v - med);
                const limit = (p.hi != null && v > p.hi) ? 'high' : (p.lo != null && v < p.lo) ? 'low' : null;
                u.values[k] = { ...u.values[k], avg: round(v, 2), p95: round(u.values[k].p95, 2), devPct: round(dev * 100, 1), z: round(z, 1) };
                if (limit) {
                    penalty += 30;
                    u.flags[k] = 'limit';
                    insights.push({ severity: 'act', rigId: u.rigId, param: k,
                        text: `${p.label} ${round(v, 1)} ${p.unit} is ${limit === 'high' ? 'above' : 'below'} the ${limit === 'high' ? p.hi : p.lo} ${p.unit} limit` });
                } else if (outlier) {
                    penalty += 15;
                    u.flags[k] = 'outlier';
                    insights.push({ severity: 'watch', rigId: u.rigId, param: k,
                        text: `${p.label} ${round(v, 1)} ${p.unit} — ${Math.abs(round(dev * 100, 0))}% ${v > med ? 'above' : 'below'} the fleet median (${round(med, 1)})` });
                }
            }
            const avail = (u.reliability.availabilityPct ?? 100) / 100;
            let rel = clamp((avail - 0.95) / 0.05, 0, 1) * 100;
            if (u.reliability.open) rel = Math.min(rel, 20);
            const cond = clamp(100 - penalty, 0, 100);
            const pmS = u.pm?.status;
            const maint = pmS === 'ok' ? 100 : pmS === 'due-soon' ? 75
                : pmS === 'overdue' ? ((u.pm.nextDueInHours ?? 0) < -100 ? 10 : 35) : 60;
            const hi = Math.round(0.4 * rel + 0.35 * cond + 0.25 * maint);
            u.health = { index: hi, grade: hi >= 85 ? 'good' : hi >= 70 ? 'watch' : 'act',
                reliability: Math.round(rel), condition: Math.round(cond), maintenance: Math.round(maint) };

            if (u.reliability.open) {
                insights.push({ severity: 'act', rigId: u.rigId, param: 'reliability', text: `Breakdown open now — ${round(u.reliability.downtimeH, 1)} h down in the last ${d} d` });
            } else if (u.reliability.downtimeH >= 12) {
                insights.push({ severity: 'watch', rigId: u.rigId, param: 'reliability', text: `${round(u.reliability.downtimeH, 1)} h downtime from ${u.reliability.breakdowns} breakdowns in ${d} d` });
            }
            if (pmS === 'overdue') {
                insights.push({ severity: (u.pm.nextDueInHours ?? 0) < -100 ? 'act' : 'watch', rigId: u.rigId, param: 'pm',
                    text: `PM overdue by ${Math.abs(Math.round(u.pm.nextDueInHours ?? 0))} run-hours` });
            }
        }
        units.sort((a, b) => a.health.index - b.health.index || a.rigId.localeCompare(b.rigId, undefined, { numeric: true }));

        // Best/worst engine fuel efficiency: a positive finding as well as a warning.
        if (cls.id === 'engine') {
            const withF = units.filter((u) => Number.isFinite(u.values.fuel_per_load?.avg));
            if (withF.length >= 3) {
                const best = withF.reduce((a, b) => (a.values.fuel_per_load.avg <= b.values.fuel_per_load.avg ? a : b));
                const med = stats.fuel_per_load.median;
                const saving = med ? (1 - best.values.fuel_per_load.avg / med) * 100 : 0;
                if (saving >= 3) insights.push({ severity: 'good', rigId: best.rigId, param: 'fuel_per_load',
                    text: `Most fuel-efficient engine — ${round(saving, 0)}% less fuel per % load than the fleet median` });
            }
        }

        // Downtime causes for this class across the fleet.
        const causes = {};
        for (const r of dtRows) {
            const c = r.reason_code || 'Unspecified';
            causes[c] = causes[c] || { reason: c, hours: 0, events: 0 };
            causes[c].hours += Number(r.hours || 0);
            causes[c].events += 1;
        }

        const rank = { act: 0, watch: 1, good: 2 };
        const idx = units.map((u) => u.health.index);
        out.push({
            id: cls.id, name: cls.name, key: cls.key,
            params: cls.params.map((p) => ({ key: paramKey(p), label: p.label, unit: p.unit, better: p.better, lo: p.lo ?? null, hi: p.hi ?? null })),
            stats,
            summary: {
                units: units.length,
                avgHealth: idx.length ? Math.round(idx.reduce((a, b) => a + b, 0) / idx.length) : null,
                grades: { good: units.filter((u) => u.health.grade === 'good').length,
                    watch: units.filter((u) => u.health.grade === 'watch').length,
                    act: units.filter((u) => u.health.grade === 'act').length },
                downtimeH: round(units.reduce((a, u) => a + (u.reliability.downtimeH || 0), 0), 1),
                pmOverdue: units.filter((u) => u.pm?.status === 'overdue').length,
            },
            units,
            insights: insights.sort((a, b) => rank[a.severity] - rank[b.severity]).slice(0, 25),
            causes: Object.values(causes).map((c) => ({ ...c, hours: round(c.hours, 1) })).sort((a, b) => b.hours - a.hours).slice(0, 8),
        });
    }
    return { windowHours: h, windowDays: d, generatedAt: new Date().toISOString(), classes: out };
}

module.exports = { getEquipmentPerformance, CLASSES };
