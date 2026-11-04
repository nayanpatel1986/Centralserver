'use strict';
// Data Quality Monitor (proposal §6.1): per-rig freshness and completeness,
// plus data OUTAGE and BACKFILL from the per-minute coverage ledger that ingest
// keeps in rig_data_coverage (one row per rig-minute that holds telemetry,
// stamped with when central first received it).
//
//   outage    = minutes in the day (after the rig's first-ever data, up to now)
//               with no telemetry at all — after any backfill that has arrived.
//   backfill  = minutes whose data arrived more than BACKFILL_LAG after the
//               minute itself, i.e. the edge replayed its store-and-forward
//               buffer once the link came back.
//
// Day boundaries follow the operating timezone (default Asia/Kolkata), like the
// maintenance KPIs. Read-only; the coverage figures are cached briefly because
// the page polls every few seconds and they only move minute by minute.
const { query } = require('./db');
const fleet = require('./fleet');
const { EXPECTED_METRICS } = require('./tags');

const BACKFILL_LAG = '3 minutes';    // received this late => it was replayed, not live
const LIVE_GAP_MIN = 2;              // > this many minutes since the last data = outage in progress
const CACHE_MS = 20_000;

let cache = { key: '', at: 0, value: null };

const zoneOf = (tz) => (/^[A-Za-z0-9_/+:-]{1,64}$/.test(String(tz || '')) ? String(tz) : 'Asia/Kolkata');

async function coverage(zone) {
    const key = zone;
    if (cache.key === key && Date.now() - cache.at < CACHE_MS) return cache.value;

    const ok = (await query("SELECT to_regclass('public.rig_data_coverage') IS NOT NULL AS ok")).rows[0].ok;
    if (!ok) {
        cache = { key, at: Date.now(), value: null };
        return null;
    }
    // Day windows in the operating timezone, as absolute instants.
    const win = `
        WITH w AS (
            SELECT (date_trunc('day', now() AT TIME ZONE $1) AT TIME ZONE $1)                     AS today,
                   (date_trunc('day', now() AT TIME ZONE $1) AT TIME ZONE $1) - interval '1 day'  AS prev,
                   date_trunc('minute', now())                                                    AS cur
        )`;
    const [counts, gaps] = await Promise.all([
        query(`${win}
            SELECT r.rig_id,
                   f.first_minute,
                   l.last_minute,
                   (SELECT count(*) FROM rig_data_coverage c, w
                     WHERE c.rig_id = r.rig_id AND c.minute >= w.today AND c.minute < w.cur)            AS cov_today,
                   (SELECT count(*) FROM rig_data_coverage c, w
                     WHERE c.rig_id = r.rig_id AND c.minute >= w.prev AND c.minute < w.today)           AS cov_prev,
                   (SELECT count(*) FROM rig_data_coverage c, w
                     WHERE c.rig_id = r.rig_id AND c.minute >= w.today
                       AND c.received_at > c.minute + interval '${BACKFILL_LAG}')                      AS backfilled_today,
                   (SELECT count(*) FROM rig_data_coverage c, w
                     WHERE c.rig_id = r.rig_id AND c.minute >= w.prev AND c.minute < w.today
                       AND c.received_at > c.minute + interval '${BACKFILL_LAG}')                      AS backfilled_prev,
                   (SELECT max(c.received_at) FROM rig_data_coverage c
                     WHERE c.rig_id = r.rig_id AND c.received_at > now() - interval '7 days'
                       AND c.received_at > c.minute + interval '${BACKFILL_LAG}')                      AS last_backfill_at,
                   (SELECT count(*) FROM rig_data_coverage c
                     WHERE c.rig_id = r.rig_id AND c.received_at > now() - interval '2 minutes'
                       AND c.received_at > c.minute + interval '${BACKFILL_LAG}')                      AS backfilling_now,
                   -- GREATEST() skips NULLs, so guard rigs with no data at all.
                   CASE WHEN f.first_minute IS NULL THEN 0
                        ELSE EXTRACT(EPOCH FROM (w.cur - GREATEST(w.today, f.first_minute))) / 60 END   AS span_today,
                   CASE WHEN f.first_minute IS NULL THEN 0
                        ELSE EXTRACT(EPOCH FROM (w.today - GREATEST(w.prev, f.first_minute))) / 60 END  AS span_prev
            FROM rigs r CROSS JOIN w
            LEFT JOIN LATERAL (SELECT minute AS first_minute FROM rig_data_coverage c
                                WHERE c.rig_id = r.rig_id ORDER BY minute ASC LIMIT 1) f ON true
            LEFT JOIN LATERAL (SELECT minute AS last_minute FROM rig_data_coverage c
                                WHERE c.rig_id = r.rig_id ORDER BY minute DESC LIMIT 1) l ON true`, [zone]),
        // Interior gaps (consecutive covered minutes more than 1 min apart) that
        // touch the two-day window; a gap still open now is added in JS.
        query(`${win}
            SELECT rig_id, prev_minute + interval '1 minute' AS gap_from, minute AS gap_to
            FROM (
                SELECT c.rig_id, c.minute, lag(c.minute) OVER (PARTITION BY c.rig_id ORDER BY c.minute) AS prev_minute
                FROM rig_data_coverage c, w
                WHERE c.minute >= w.prev - interval '1 day'
            ) x, w
            WHERE prev_minute IS NOT NULL AND minute - prev_minute > interval '1 minute'
              AND minute > w.prev
            ORDER BY rig_id, gap_from`, [zone]),
    ]);

    const now = Date.now();
    const byRig = new Map();
    for (const r of counts.rows) {
        const spanToday = Math.max(0, Math.round(Number(r.span_today) || 0));
        const spanPrev = Math.max(0, Math.round(Number(r.span_prev) || 0));
        const covToday = Number(r.cov_today) || 0;
        const covPrev = Number(r.cov_prev) || 0;
        const last = r.last_minute ? new Date(r.last_minute).getTime() : null;
        const currentGapMin = last == null ? null : Math.max(0, Math.floor((now - last) / 60_000) - 1);
        byRig.set(r.rig_id, {
            hasData: !!r.first_minute,
            today: { outageMin: r.first_minute ? Math.max(0, spanToday - covToday) : null, coveredMin: covToday, spanMin: spanToday,
                coveragePct: spanToday ? Math.round((Math.min(covToday, spanToday) / spanToday) * 1000) / 10 : null,
                backfilledMin: Number(r.backfilled_today) || 0 },
            prev: { outageMin: r.first_minute && spanPrev ? Math.max(0, spanPrev - covPrev) : null, coveredMin: covPrev, spanMin: spanPrev,
                coveragePct: spanPrev ? Math.round((Math.min(covPrev, spanPrev) / spanPrev) * 1000) / 10 : null,
                backfilledMin: Number(r.backfilled_prev) || 0 },
            lastBackfillAt: r.last_backfill_at || null,
            backfillingNow: Number(r.backfilling_now) > 0,
            currentGapMin,
            lastDataMinute: r.last_minute || null,
            windows: [],
        });
    }
    for (const g of gaps.rows) {
        const e = byRig.get(g.rig_id);
        if (!e) continue;
        const from = new Date(g.gap_from).getTime(), to = new Date(g.gap_to).getTime();
        e.windows.push({ from: new Date(from).toISOString(), to: new Date(to).toISOString(), minutes: Math.round((to - from) / 60_000), open: false });
    }
    for (const e of byRig.values()) {
        if (e.currentGapMin != null && e.currentGapMin > LIVE_GAP_MIN) {
            const from = new Date(e.lastDataMinute).getTime() + 60_000;
            e.windows.push({ from: new Date(from).toISOString(), to: null, minutes: e.currentGapMin, open: true });
        }
        e.windows = e.windows.slice(-8).reverse(); // newest first
        // Backfill status, most urgent first.
        e.backfill = !e.hasData ? 'no-data'
            : e.backfillingNow ? 'backfilling'
            : e.currentGapMin > LIVE_GAP_MIN ? 'awaiting'
            : (e.today.outageMin || 0) > 0 ? 'gaps'
            : e.today.backfilledMin > 0 ? 'recovered'
            : 'live';
    }
    cache = { key, at: Date.now(), value: byRig };
    return byRig;
}

// Array (one row per rig) so asset-scoped viewers keep their per-rig filter.
async function getDataQuality({ tz } = {}) {
    const zone = zoneOf(tz);
    const [rigs, latest, cov] = await Promise.all([
        fleet.getFleet(),
        query('SELECT rig_id, values FROM rig_latest'),
        coverage(zone).catch((e) => { console.warn('[data-quality] coverage failed:', e.message); return null; }),
    ]);
    const present = new Map(latest.rows.map((r) => [r.rig_id, new Set(Object.keys(r.values || {}))]));
    return rigs.map((r) => {
        const keys = present.get(r.rigId);
        const missingTags = keys ? EXPECTED_METRICS.filter((m) => !keys.has(m)).length : EXPECTED_METRICS.length;
        return {
            rigId: r.rigId, name: r.name, status: r.status,
            assetUnit: r.assetUnit || null, field: r.field || null,
            healthScore: r.healthScore, syncLagSec: r.syncLagSec,
            metricCount: r.metricCount, expectedMetrics: EXPECTED_METRICS.length, missingTags,
            lastDataAt: r.lastDataAt,
            staleFlag: r.syncLagSec != null && r.syncLagSec > fleet.FRESH_SEC,
            offline: r.status === 'offline',
            coverage: cov ? (cov.get(r.rigId) || null) : undefined,
            coverageTracking: !!cov,
            timezone: zone,
        };
    });
}

// Keep the coverage ledger bounded (35 days covers "previous day" plus a month
// of history). Called from the backend's periodic sweep.
async function pruneCoverage() {
    const ok = (await query("SELECT to_regclass('public.rig_data_coverage') IS NOT NULL AS ok")).rows[0].ok;
    if (ok) await query("DELETE FROM rig_data_coverage WHERE minute < now() - interval '35 days'");
}

module.exports = { getDataQuality, pruneCoverage };
