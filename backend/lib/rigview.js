'use strict';
// Per-rig "remote HMI" reconstruction (proposal Â§6.1: "Rig drill-down â€” remote view
// of any rig's KPIs, trends, alarms, equipment status and reports, MIRRORING the
// rig-edge dashboard"). Rebuilds the edge `rig_data` nested shape from the CRMF's
// flattened telemetry + rollup, so the ported edge operator panels render unchanged.
//
// MONITORING-ONLY / READ-ONLY: this only reshapes data already received from a rig.
const { query } = require('./db');

const TS_KEY = '__ts';   // reserved per-tag last-seen map inside rig_latest.values
const FRESH_SEC = Number(process.env.CENTRAL_LATENCY_TARGET || 30);

// Unflatten { "measurement.field": v, ... } -> { measurement: { field: v } }.
// Reserved/underscore keys are dropped. Returns { nested, perTagTs }.
function unflatten(values) {
    const nested = {};
    const perTagTs = (values && values[TS_KEY]) || {};
    for (const [k, v] of Object.entries(values || {})) {
        if (k.startsWith('_')) continue;
        const dot = k.indexOf('.');
        if (dot < 0) { nested[k] = v; continue; }
        const meas = k.slice(0, dot), field = k.slice(dot + 1);
        (nested[meas] = nested[meas] || {})[field] = v;
    }
    return { nested, perTagTs };
}

function newestTagMillis(perTagTs) {
    let newest = -Infinity;
    for (const ts of Object.values(perTagTs || {})) {
        const ms = Date.parse(String(ts || ''));
        if (Number.isFinite(ms) && ms > newest) newest = ms;
    }
    return newest;
}

function keepStaleLiveKey(key) {
    // These are configuration/threshold values used by the ACS drawing even when
    // the PLC is not streaming every tag on every ETP frame.
    return [
        'acs.crownsaver',
        'acs.floorsaver',
        'acs.bottomsaver',
        'acs.upper_tag',
        'acs.lower_tag',
    ].includes(key);
}

function pruneStaleLiveValues(nested, perTagTs) {
    const newest = newestTagMillis(perTagTs);
    if (!Number.isFinite(newest)) return;
    const cutoff = newest - 120000;
    for (const [key, ts] of Object.entries(perTagTs || {})) {
        if (keepStaleLiveKey(key)) continue;
        const ms = Date.parse(String(ts || ''));
        if (!Number.isFinite(ms) || ms >= cutoff) continue;
        const dot = key.indexOf('.');
        if (dot < 0) {
            delete nested[key];
            continue;
        }
        const group = key.slice(0, dot);
        const field = key.slice(dot + 1);
        if (nested[group] && Object.prototype.hasOwnProperty.call(nested[group], field)) {
            delete nested[group][field];
        }
    }
}

// Build the full edge-shape live payload for one rig.
async function reconstruct(rigId) {
    const r = await query(`
        SELECT r.rig_id, r.name, r.rig_type, r.field, r.section, r.status, r.last_data_at, r.sync_lag_sec,
               r.health_score, r.metric_count, r.active_activity, r.active_job,
               r.alarm_active, r.alarm_unack, r.alarm_p1, r.alarm_p2, r.alarm_p3, r.alarm_highest,
               l.ts AS latest_ts, l.values AS values
        FROM rigs r LEFT JOIN rig_latest l ON l.rig_id = r.rig_id
        WHERE r.rig_id = $1`, [rigId]);
    if (!r.rows.length) return null;
    const row = r.rows[0];
    const lastMs = row.last_data_at ? Date.parse(row.last_data_at) : null;
    const liveLagSec = lastMs ? Math.max(0, Math.round((Date.now() - lastMs) / 1000)) : null;
    const ageMs = liveLagSec != null ? liveLagSec * 1000 : (row.sync_lag_sec != null ? row.sync_lag_sec * 1000 : null);
    const offline = row.status === 'offline' || row.status === 'pending';
    const disconnected = offline || liveLagSec == null || liveLagSec > FRESH_SEC;
    const { nested, perTagTs } = unflatten(disconnected ? {} : (row.values || {}));

    // well_control: the edge nests BOP under well_control + an `available` flag.
    if (nested.wellcontrol && !nested.well_control) { nested.well_control = { available: true, ...nested.wellcontrol }; delete nested.wellcontrol; }
    else if (!nested.well_control) nested.well_control = { available: false };

    // AHWR PLC/edge HPU aliases: some rigs send pump/status fields with compact
    // names (pdw_pump_*, htd_pump1_*, htd_pump2_*). The Twin-style panels use
    // normalized names, so mirror the values without deleting the original tags.
    if (nested.hpu) {
        const h = nested.hpu;
        const alias = (target, source) => {
            if (h[target] == null && h[source] != null) h[target] = h[source];
        };
        alias('operating_mode', 'op_mode');
        alias('temp_status', 'oil_temp_status');
        alias('level_status', 'oil_level_status');
        alias('pdw_flow', 'pdw_pump_flow');
        alias('pdw_flow_sp', 'pdw_pump_flow_sp');
        alias('pdw_press', 'pdw_pump_press');
        alias('pdw_press_sp', 'pdw_pump_press_sp');
        alias('htd_pump_2_flow', 'htd_pump1_flow');
        alias('htd_pump_2_flow_sp', 'htd_pump1_flow_sp');
        alias('htd_pump_2_press', 'htd_pump1_press');
        alias('htd_pump_2_press_sp', 'htd_pump1_press_sp');
        alias('htd_pump_2_status', 'htd_pump1_status');
        alias('htd_pump_4_flow', 'htd_pump2_flow');
        alias('htd_pump_4_flow_sp', 'htd_pump2_flow_sp');
        alias('htd_pump_4_press', 'htd_pump2_press');
        alias('htd_pump_4_press_sp', 'htd_pump2_press_sp');
        alias('htd_pump_4_status', 'htd_pump2_status');
    }
    if (nested.AHWR) {
        const ahwr = nested.AHWR;
        if (nested.hpu && (nested.hpu.discharge_pressure == null || Number(nested.hpu.discharge_pressure) === 0) && ahwr['PDW ACT PRESSURE'] != null) {
            nested.hpu.discharge_pressure = ahwr['PDW ACT PRESSURE'];
        }
    }

    // Recent connection for the torque-turn header.
    const conn = await query(
        'SELECT ts, peak_torque, result, joint FROM connections WHERE rig_id = $1 ORDER BY ts DESC LIMIT 1', [rigId]);

    return {
        ...nested,
        _meta: {
            rigId: row.rig_id, name: row.name, rigType: row.rig_type || 'AHWR_WORKOVER', field: row.field, section: row.section,
            ts: row.last_data_at || row.latest_ts,
            source: 'central', stale: disconnected || row.status === 'stale',
            age_ms: ageMs, connected: !disconnected, status: disconnected && !offline ? 'stale' : row.status,
            health_score: row.health_score, metric_count: row.metric_count,
            perTagTs,
        },
        _activity: {
            code: disconnected ? null : ((row.active_activity || '').slice(0, 2).toUpperCase() || null),
            label: disconnected ? null : (row.active_activity || null),
            job: disconnected ? null : (row.active_job || null),
        },
        _alarms: {
            raised: row.alarm_active || 0, acknowledged: 0,
            critical: row.alarm_p1 || 0, high: row.alarm_p2 || 0, medium: row.alarm_p3 || 0, low: 0,
            highest: disconnected ? null : (row.alarm_highest || null),
        },
        _torqueturn: conn.rows[0]
            ? { lastPeak: conn.rows[0].peak_torque, lastResult: conn.rows[0].result, lastJoint: conn.rows[0].joint, at: conn.rows[0].ts, unit: 'Nm' }
            : { lastPeak: null, lastResult: null },
    };
}

// Multi-metric history pivoted into chart rows [{ t: epochms, <metric>: value }]
// (powers the central EDR / Trends strips). Bucketed to keep the payload bounded.
//
// Two modes (audit / offline EDR replay support):
//   - minutes mode  (default): a trailing window ending at now().
//   - RANGE mode    (opts.fromMs/opts.toMs, epoch ms): an explicit [from,to]
//     window for OFFLINE past-run replay. Raw telemetry is used for short spans
//     (<= RANGE_RAW_MAX_HOURS); the 1-minute continuous aggregate for longer
//     spans, with a raw fallback for offline installs where the aggregate has
//     not refreshed yet.
// Rows shape is unchanged in both modes: [{ t: epochMs, "<metric>": value }].
const RANGE_RAW_MAX_HOURS = 3;

async function multiHistory(rigId, metrics, minutesOrOpts = 30) {
    const list = (Array.isArray(metrics) ? metrics : String(metrics || '').split(','))
        .map((m) => m.trim()).filter(Boolean).slice(0, 80);
    if (!list.length) return { metrics: [], rows: [] };

    // Range mode: an explicit { fromMs, toMs } window (offline replay).
    const opts = (minutesOrOpts && typeof minutesOrOpts === 'object') ? minutesOrOpts : null;
    const maxPoints = Math.min(Math.max(Number(opts?.maxPoints) || 260, 80), 500);
    const fromMs = opts ? Number(opts.fromMs) : NaN;
    const toMs = opts ? Number(opts.toMs) : NaN;
    if (Number.isFinite(fromMs) && Number.isFinite(toMs) && toMs > fromMs) {
        const fromIso = new Date(fromMs).toISOString();
        const toIso = new Date(toMs).toISOString();
        const spanSec = (toMs - fromMs) / 1000;
        const bucketSec = Math.max(1, Math.ceil(spanSec / maxPoints));
        let rows;
        const loadRaw = async () => query(
            `SELECT time_bucket(($4 || ' seconds')::interval, ts) AS b, metric, avg(value) AS v
             FROM telemetry
             WHERE rig_id = $1 AND metric = ANY($2) AND ts >= $3 AND ts <= $5
             GROUP BY b, metric ORDER BY b ASC`,
            [rigId, list, fromIso, bucketSec, toIso]);
        if (spanSec <= RANGE_RAW_MAX_HOURS * 3600) {
            ({ rows } = await loadRaw());
        } else {
            // Longer spans: roll up the 1-minute continuous aggregate.
            ({ rows } = await query(
                `SELECT time_bucket(($4 || ' seconds')::interval, bucket) AS b, metric, avg(avg) AS v
                 FROM telemetry_1m
                 WHERE rig_id = $1 AND metric = ANY($2) AND bucket >= $3 AND bucket <= $5
                 GROUP BY b, metric ORDER BY b ASC`,
                [rigId, list, fromIso, bucketSec, toIso]));
            if (!rows.length && spanSec <= 24 * 3600) {
                ({ rows } = await loadRaw());
            }
        }
        const byBucket = new Map();
        for (const r of rows) {
            const t = new Date(r.b).getTime();
            if (!byBucket.has(t)) byBucket.set(t, { t });
            byBucket.get(t)[r.metric] = Number(r.v);
        }
        return { metrics: list, rows: Array.from(byBucket.values()) };
    }

    // Minutes mode (default): a trailing window ending at now().
    const minuteValue = opts ? opts.minutes : minutesOrOpts;
    const mins = Math.min(Math.max(Number(minuteValue) || 30, 1), 60 * 24 * 7);
    const bucketSec = Math.max(1, Math.ceil((mins * 60) / maxPoints));
    let { rows } = await query(
        `SELECT time_bucket(($3 || ' seconds')::interval, ts) AS b, metric, avg(value) AS v
         FROM telemetry
         WHERE rig_id = $1 AND metric = ANY($2) AND ts > now() - ($4 || ' minutes')::interval
         GROUP BY b, metric ORDER BY b ASC`,
        [rigId, list, bucketSec, mins]);
    const byBucket = new Map();
    for (const r of rows) {
        const t = new Date(r.b).getTime();
        if (!byBucket.has(t)) byBucket.set(t, { t });
        byBucket.get(t)[r.metric] = Number(r.v);
    }
    return { metrics: list, rows: Array.from(byBucket.values()) };
}

async function historyBounds(rigId) {
    const { rows } = await query(
        `SELECT min(ts) AS first_ts, max(ts) AS last_ts, count(*)::bigint AS row_count
         FROM telemetry
         WHERE rig_id = $1`,
        [rigId]);
    const row = rows[0] || {};
    const firstMs = row.first_ts ? new Date(row.first_ts).getTime() : null;
    const lastMs = row.last_ts ? new Date(row.last_ts).getTime() : null;
    return {
        rigId,
        available: Number.isFinite(firstMs) && Number.isFinite(lastMs) && Number(row.row_count) > 0,
        firstTs: row.first_ts || null,
        lastTs: row.last_ts || null,
        firstMs,
        lastMs,
        rowCount: Number(row.row_count) || 0,
    };
}

// Per-rig alarm event history (from the events stream) for the rig Alarms tab.
async function rigAlarms(rigId, limit = 100) {
    const { rows } = await query(
        `SELECT ts, payload FROM events WHERE rig_id = $1 AND type = 'alarm' ORDER BY ts DESC LIMIT $2`,
        [rigId, Math.min(Number(limit) || 100, 500)]);
    return rows.map((r) => ({ ts: r.ts, ...(r.payload || {}) }));
}

module.exports = { reconstruct, multiHistory, historyBounds, rigAlarms, unflatten };

