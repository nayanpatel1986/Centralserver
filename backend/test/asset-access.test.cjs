'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');

const dbPath = require.resolve('../lib/db');
const fleetPath = require.resolve('../lib/fleet');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
    query: async (sql, params) => {
        if (sql.startsWith('SELECT rig_id FROM rigs')) return { rows: [{ rig_id: 'R1' }] };
        if (sql.startsWith('SELECT 1 FROM rigs')) return { rows: params[0] === 'R1' ? [{}] : [] };
        if (sql.startsWith('SELECT 1 FROM wells')) return { rows: params[0] === 'W#1' ? [{}] : [] };
        return { rows: [] };
    },
} };
require.cache[fleetPath] = { id: fleetPath, filename: fleetPath, loaded: true, exports: {
    getFleet: async () => [
        { rigId: 'R1', status: 'online', healthScore: 80, alarm: { active: 1, p1: 1 }, lastDataAt: 'now' },
        { rigId: 'R2', status: 'offline', healthScore: 0, alarm: { active: 0, p1: 0 }, lastDataAt: null },
    ],
} };
const { middleware } = require('../lib/assetAccess');

function response() {
    return {
        statusCode: 200, body: undefined,
        status(code) { this.statusCode = code; return this; },
        json(data) { this.body = data; return this; },
    };
}
const viewer = { role: 'viewer', username: 'asset-viewer', assetUnit: 'Assam' };

test('asset viewer receives only its rigs and a scoped summary', async () => {
    const res = response();
    let next = false;
    await middleware({ user: viewer, method: 'GET', path: '/fleet' }, res, () => { next = true; });
    assert.equal(next, true);
    res.json([{ rigId: 'R1' }, { rigId: 'R2' }]);
    assert.deepEqual(res.body, [{ rigId: 'R1' }]);

    const summary = response();
    await middleware({ user: viewer, method: 'GET', path: '/fleet/summary' }, summary, () => {});
    assert.equal(summary.body.total, 1);
    assert.equal(summary.body.online, 1);
    assert.equal(summary.body.offline, 0);
});

test('asset viewer cannot read another rig or a fleet-wide aggregate', async () => {
    const rig = response();
    await middleware({ user: viewer, method: 'GET', path: '/rigs/R2/live' }, rig, () => {});
    assert.equal(rig.statusCode, 404);

    const report = response();
    await middleware({ user: viewer, method: 'GET', path: '/reports/fleet' }, report, () => {});
    assert.equal(report.statusCode, 403);
});

test('encoded well IDs are checked against the assigned asset', async () => {
    const allowed = response();
    let next = false;
    await middleware({ user: viewer, method: 'GET', path: '/wells/W%231' }, allowed, () => { next = true; });
    assert.equal(next, true);
    const denied = response();
    await middleware({ user: viewer, method: 'GET', path: '/wells/other' }, denied, () => {});
    assert.equal(denied.statusCode, 404);
});
