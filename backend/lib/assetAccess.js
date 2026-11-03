'use strict';
const { query } = require('./db');
const fleet = require('./fleet');

const scoped = (user) => user?.role === 'viewer' && !!user.assetUnit;

function fleetSummary(rows) {
    const by = (status) => rows.filter((r) => r.status === status).length;
    const reporting = rows.filter((r) => ['online', 'degraded', 'stale'].includes(r.status));
    const alarmable = rows.filter((r) => !['offline', 'pending'].includes(r.status));
    return {
        total: rows.length, online: by('online'), degraded: by('degraded'), stale: by('stale'),
        offline: by('offline'), pending: by('pending'),
        alarmsActive: alarmable.reduce((n, r) => n + (r.alarm.active || 0), 0),
        alarmsP1: alarmable.reduce((n, r) => n + (r.alarm.p1 || 0), 0),
        avgHealth: reporting.length ? Math.round(reporting.reduce((n, r) => n + (r.healthScore || 0), 0) / reporting.length) : 0,
        rigsReporting: rows.filter((r) => r.lastDataAt).length,
    };
}

// Scoped viewers can use the monitoring views that have a safe asset filter.
// Other fleet-wide aggregate endpoints fail closed until they have an asset-aware query.
async function middleware(req, res, next) {
    if (!scoped(req.user) || req.method !== 'GET') return next();
    const path = req.path;
    const rigMatch = /^\/rigs\/([^/]+)(?:\/(?:history|live|history-multi|history-bounds|alarms|hpu-analytics|activity|cmms|messages))?$/.exec(path);
    const wellMatch = /^\/wells\/([^/]+)(?:\/(?:runs|runlog))?$/.exec(path);
    const allowed = ['/fleet', '/fleet/summary', '/alarms', '/data-quality', '/wells', '/messages', '/config/rigs', '/presence'].includes(path);
    if (!rigMatch && !wellMatch && !allowed) return res.status(403).json({ error: 'not available for asset-scoped viewers' });
    try {
        const unit = req.user.assetUnit;
        if (rigMatch) {
            const { rows } = await query('SELECT 1 FROM rigs WHERE rig_id = $1 AND asset_unit = $2', [decodeURIComponent(rigMatch[1]), unit]);
            if (!rows.length) return res.status(404).json({ error: 'rig not found' });
        }
        if (wellMatch) {
            const { rows } = await query('SELECT 1 FROM wells WHERE well_id = $1 AND asset_unit = $2', [decodeURIComponent(wellMatch[1]), unit]);
            if (!rows.length) return res.status(404).json({ error: 'well not found' });
        }
        const rigs = (await query('SELECT rig_id FROM rigs WHERE asset_unit = $1', [unit])).rows;
        const ids = new Set(rigs.map((r) => r.rig_id));
        if (wellMatch && path.endsWith('/runlog')) {
            const { rows } = await query('SELECT id, rig_id FROM well_runs WHERE well_id = $1 ORDER BY started_at DESC', [decodeURIComponent(wellMatch[1])]);
            const run = req.query.runId ? rows.find((r) => Number(r.id) === Number(req.query.runId)) : rows[0];
            if (run && !ids.has(run.rig_id)) return res.status(404).json({ error: 'run not found' });
        }
        const send = res.json.bind(res);
        res.json = (data) => {
            if (Array.isArray(data)) {
                if (path === '/fleet' || path === '/alarms' || path === '/data-quality') data = data.filter((r) => ids.has(r.rigId));
                else if (path === '/wells') data = data.filter((w) => w.assetUnit === unit).map((w) => ({
                    ...w, currentRigId: ids.has(w.currentRigId) ? w.currentRigId : null,
                    lastRigId: ids.has(w.lastRigId) ? w.lastRigId : null,
                    activeRun: ids.has(w.currentRigId) && w.activeRun,
                }));
                else if (path === '/messages') data = data.filter((m) => ids.has(m.targetRigId));
                else if (path === '/config/rigs') data = data.filter((r) => r.assetUnit === unit);
                else if (path === '/presence') data = data.filter((p) => p.username === req.user.username);
                else if (wellMatch && path.endsWith('/runs')) data = data.filter((r) => ids.has(r.rigId));
            } else if (wellMatch && path === `/wells/${wellMatch[1]}` && data?.runs) {
                data.runs = data.runs.filter((r) => ids.has(r.rigId));
                data.stats = { runCount: data.runs.length, totalRuntimeSec: data.runs.reduce((n, r) => n + (r.durationSec || 0), 0) };
                if (!ids.has(data.currentRigId)) data.currentRigId = null;
                if (!ids.has(data.lastRigId)) data.lastRigId = null;
            }
            return send(data);
        };
        if (path === '/fleet/summary') {
            const rows = (await fleet.getFleet()).filter((r) => ids.has(r.rigId));
            return res.json(fleetSummary(rows));
        }
        next();
    } catch (e) { next(e); }
}

module.exports = { middleware, scoped, fleetSummary };
