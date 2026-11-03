'use strict';

// Per-rig display calibration only. These values never reach a PLC or edge
// command path, and missing values remain unavailable in the dashboard.
const { query } = require('./db');
const HEALTH_KEYS = new Set(['pressure', 'pumps', 'oil', 'cooling', 'safety']);
const FIELD_KEY = /^[a-z][a-z0-9_]{0,80}$/;

function bad(message) { return Object.assign(new Error(message), { status: 400 }); }

function validate(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw bad('HPU analytics settings must be an object');
    const output = { staleMs: 30000 };
    if (input.staleMs !== undefined) {
        if (!Number.isInteger(input.staleMs) || input.staleMs < 1000 || input.staleMs > 120000) throw bad('staleMs must be 1000-120000');
        output.staleMs = input.staleMs;
    }
    for (const section of ['pressureSetpoints', 'ratedFlows', 'healthWeights']) {
        if (input[section] === undefined) continue;
        const source = input[section];
        if (!source || typeof source !== 'object' || Array.isArray(source) || Object.keys(source).length > 50) throw bad(`invalid ${section}`);
        output[section] = {};
        for (const [key, value] of Object.entries(source)) {
            if (!FIELD_KEY.test(key) || (section === 'healthWeights' && !HEALTH_KEYS.has(key))) throw bad(`invalid ${section} key`);
            if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100000)) throw bad(`invalid ${section} value`);
            output[section][key] = value;
        }
    }
    return output;
}

async function assertRig(rigId) {
    const { rows } = await query('SELECT rig_type FROM rigs WHERE rig_id = $1', [rigId]);
    if (!rows.length) throw Object.assign(new Error('rig not found'), { status: 404 });
    if (rows[0].rig_type !== 'AHWR_150_WORKOVER') throw Object.assign(new Error('HPU analytics settings apply only to AHWR-150 rigs'), { status: 404 });
}

async function get(rigId) {
    await assertRig(rigId);
    const { rows } = await query('SELECT value FROM app_settings WHERE key = $1', [`ahwr150_hpu:${rigId}`]);
    return rows.length ? validate(rows[0].value) : { staleMs: 30000 };
}

async function set(rigId, input, actor) {
    await assertRig(rigId);
    const value = validate(input);
    await query(
        `INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES ($1, $2, now(), $3)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
        [`ahwr150_hpu:${rigId}`, JSON.stringify(value), actor]);
    await query('INSERT INTO audit_log (actor, action, target, detail) VALUES ($1,$2,$3,$4)',
        [actor, 'settings.ahwr150_hpu', rigId, { sections: Object.keys(value) }]).catch(() => {});
    return value;
}

module.exports = { get, set, validate };
