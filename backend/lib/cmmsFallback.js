'use strict';

const { query } = require('./db');

const TS_KEY = '__ts';

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
const value = (values, path) => {
    if (values && Object.prototype.hasOwnProperty.call(values, path)) return n(values[path]);
    const parts = String(path).split('.');
    let cur = values;
    for (const part of parts) {
        if (!cur || typeof cur !== 'object') return null;
        cur = cur[part];
    }
    return n(cur);
};
const textStatus = (status) => status === 'overdue' ? 'overdue' : status === 'due-soon' ? 'due-soon' : 'ok';

const assetDefs = [
    {
        id: 'cat-engine', name: 'CAT Engine', category: 'Power generation', hourKey: 'cat_engine.run_hours',
        intervalH: 250, health: [['RPM', 'cat_engine.rpm'], ['Load %', 'cat_engine.load'], ['Oil press', 'cat_engine.oil_pressure'], ['Coolant', 'cat_engine.coolant_temp']],
    },
    {
        id: 'hpu', name: 'HPU', category: 'Hydraulic power unit', hourKey: 'hpu.run_hours',
        intervalH: 500, health: [['Oil temp', 'hpu.oil_temp'], ['Oil level', 'hpu.oil_level'], ['Discharge', 'hpu.discharge_pressure'], ['Aux press', 'hpu.aux_pressure']],
    },
    {
        id: 'htd', name: 'HTD', category: 'Top drive', hourKey: 'htd.working_hours',
        intervalH: 250, health: [['RPM', 'htd.rpm'], ['Torque', 'htd.torque'], ['Inclination', 'htd.inclination'], ['Vertical speed', 'htd.vertical_speed']],
    },
    {
        id: 'pct', name: 'PCT', category: 'Power casing tong', hourKey: null,
        intervalH: 250, health: [['Make-up torque', 'pct.makeup_torque'], ['Last torque', 'pct.last_makeup_torque'], ['Clamp up P', 'pct.clamp_up_pressure'], ['Low clamp P', 'pct.clamp_low_pressure']],
    },
    {
        id: 'catwalk', name: 'Catwalk', category: 'Pipe handling', hourKey: null,
        intervalH: 250, health: [['Carrier status', 'cwk.carrier_status'], ['Clamp status', 'cwk.clamp_status'], ['Clamp pressure', 'cwk.clamp_pressure'], ['Clamp force', 'cwk.clamp_force']],
    },
    {
        id: 'drawworks', name: 'Drawworks', category: 'Hoisting', hourKey: null,
        intervalH: 500, health: [['Hook load', 'drawworks.hook_load'], ['Block position', 'drawworks.block_position'], ['Rope wear', 'drawworks.rope_wear']],
    },
    {
        id: 'mud-pump', name: 'Mud Pump', category: 'Circulation', hourKey: null,
        intervalH: 250, health: [['Pressure', 'mudpump.pressure'], ['SPM', 'mudpump.spm'], ['Flow in', 'mudpump.flow_in'], ['Flow out', 'mudpump.flow_out']],
    },
    {
        id: 'acs', name: 'ACS', category: 'Anti-collision system', hourKey: null,
        intervalH: 500, health: [['Crown saver', 'acs.crownsaver'], ['Floor saver', 'acs.floorsaver'], ['Bottom saver', 'acs.bottomsaver'], ['Block pos', 'acs.block_position']],
    },
];

function pmStatus(dueInHours) {
    if (!Number.isFinite(dueInHours)) return 'ok';
    if (dueInHours <= 0) return 'overdue';
    if (dueInHours <= 50) return 'due-soon';
    return 'ok';
}

function assetFromValues(values, def, index) {
    const measuredHours = def.hourKey ? value(values, def.hourKey) : null;
    const derivedHours = measuredHours == null ? 0 : measuredHours;
    const dueIn = def.intervalH - (derivedHours % def.intervalH);
    const status = pmStatus(dueIn);
    const health = def.health
        .map(([label, key]) => ({ label, value: value(values, key) }))
        .filter((h) => h.value != null);
    return {
        id: def.id,
        name: def.name,
        category: def.category,
        hours: derivedHours,
        source: measuredHours == null ? 'derived' : 'measured',
        pmStatus: status,
        nextDueInHours: dueIn,
        health,
        openDowntime: 0,
        sort: index,
    };
}

function buildLiveCmmsSnapshot(rigId, row) {
    const values = row && row.values && typeof row.values === 'object' ? row.values : {};
    const tsMap = values[TS_KEY] && typeof values[TS_KEY] === 'object' ? values[TS_KEY] : {};
    const assets = assetDefs.map((def, index) => assetFromValues(values, def, index));
    const pm = assets.map((asset) => ({
        id: `live-${asset.id}-pm`,
        assetId: asset.id,
        assetName: asset.name,
        task: `${asset.name} preventive maintenance`,
        intervalH: assetDefs.find((d) => d.id === asset.id)?.intervalH || 250,
        dueInHours: asset.nextDueInHours,
        status: textStatus(asset.pmStatus),
    }));
    const counts = pm.reduce((acc, item) => {
        if (item.status === 'overdue') acc.overdue += 1;
        else if (item.status === 'due-soon') acc.dueSoon += 1;
        else acc.ok += 1;
        return acc;
    }, { overdue: 0, dueSoon: 0, ok: 0, openDowntime: 0 });
    const instrumentKeys = [
        ['PCT-MU-TQ', 'PCT make-up torque', 'Torque', 'pct.makeup_torque'],
        ['CAT-OIL-P', 'CAT oil pressure', 'Pressure', 'cat_engine.oil_pressure'],
        ['HPU-OIL-T', 'HPU oil temperature', 'Temperature', 'hpu.oil_temp'],
        ['HPU-DIS-P', 'HPU discharge pressure', 'Pressure', 'hpu.discharge_pressure'],
        ['DW-HOOK', 'Drawworks hook load', 'Load', 'drawworks.hook_load'],
        ['ACS-BLOCK', 'ACS block position', 'Position', 'acs.block_position'],
    ];
    const instruments = instrumentKeys
        .filter(([, , , key]) => value(values, key) != null)
        .map(([tag, name, type, key]) => ({
            id: tag,
            tag,
            name,
            type,
            calStatus: 'live',
            lastCalDate: tsMap[key] || row.ts,
            nextCalDate: null,
        }));
    return {
        available: true,
        generated: true,
        source: 'edge-live-telemetry',
        rigId,
        generatedAt: row.ts,
        receivedAt: row.ts,
        assets,
        pm,
        workOrders: [],
        downtime: [],
        logbook: [],
        instruments,
        counts,
        cmmsSummary: { workOrders: { open: 0, breakdownOpen: 0, p1Open: 0 } },
        instrumentSummary: { total: instruments.length, overdue: 0 },
    };
}

async function liveCmmsForRig(rigId) {
    const { rows } = await query('SELECT ts, values FROM rig_latest WHERE rig_id = $1', [rigId]);
    if (!rows.length || !rows[0].values || !Object.keys(rows[0].values).length) return { available: false, rigId };
    return buildLiveCmmsSnapshot(rigId, rows[0]);
}

module.exports = { liveCmmsForRig };
