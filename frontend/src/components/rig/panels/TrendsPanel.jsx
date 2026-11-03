import React from 'react';
import { Box } from '@mui/material';
import EdrView from '../EdrView';

// Trends / EDR tab - the full edge Electronic Drilling Recorder (hand-rolled SVG
// multi-pen strip charts, Time/Depth index, scrollback, configurable pens + readouts),
// ported into the CRMF and fed by the central per-rig data. READ-ONLY.
//
// Default driller tracks + top readouts mirror the edge EdrDashboard defaults
// (channelId = `category.field`, catalog units/min/max from edrMetrics.json).

const DEFAULT_STRIPS = [
    {
        title: 'Hookload / WOB',
        pens: [
            { channelId: 'drilling.wob', color: '#38bdf8', min: 0, max: 100, enabled: true },
            { channelId: 'drawworks.hook_load', color: '#fbbf24', min: 0, max: 500, enabled: true },
            { channelId: 'drawworks.block_position', color: '#4ade80', min: 0, max: 50, enabled: true },
        ],
    },
    {
        title: 'CAT ENG',
        pens: [
            { channelId: 'cat_engine.rpm', color: '#a78bfa', min: 0, max: 2000, enabled: true },
            { channelId: 'cat_engine.oil_pressure', color: '#f472b6', min: 0, max: 10, enabled: true },
            { channelId: 'cat_engine.load', color: '#22d3ee', min: 0, max: 100, enabled: true },
        ],
    },
    {
        title: 'HTD',
        pens: [
            { channelId: 'htd.rpm', color: '#fb7185', min: 0, max: 250, enabled: true },
            { channelId: 'htd.torque', color: '#38bdf8', min: 0, max: 2000, enabled: true },
            { channelId: 'htd.inclination', color: '#f97316', min: -90, max: 90, enabled: true },
        ],
    },
    {
        title: 'Mud Volumes',
        pens: [
            { channelId: 'fluid.total_tank_volume', color: '#4ade80', min: 0, max: 500, enabled: true },
            { channelId: 'fluid.tank_gain_loss', color: '#fbbf24', min: -50, max: 50, enabled: true },
            { channelId: 'fluid.trip_tank', color: '#a78bfa', min: 0, max: 50, enabled: true },
        ],
    },
];

const TOP_READOUTS = ['mudpump.pressure', 'mudpump.spm', 'drilling.rop', 'drawworks.hook_load'];

const ROM_STRIPS = [
    {
        title: 'Hookload / WOB',
        pens: [
            { channelId: 'drawworks.hook_load', color: '#38bdf8', min: 0, max: 100, enabled: true },
            { channelId: 'drilling.wob', color: '#fbbf24', min: 0, max: 100, enabled: true },
            { channelId: 'drawworks.block_position', color: '#4ade80', min: 0, max: 50, enabled: true },
        ],
    },
    {
        title: 'CAT Engine',
        pens: [
            { channelId: 'engine.rpm', color: '#38bdf8', min: 0, max: 3000, enabled: true },
            { channelId: 'engine.oil_pressure', color: '#fbbf24', min: 0, max: 10, enabled: true },
            { channelId: 'engine.coolant_temp', color: '#22c55e', min: 0, max: 120, enabled: true },
        ],
    },
    {
        title: 'Mud Pump',
        pens: [
            { channelId: 'mudpump.pressure', color: '#facc15', min: 0, max: 5000, enabled: true },
            { channelId: 'mudpump.spm', color: '#38bdf8', min: 0, max: 200, enabled: true },
            { channelId: 'mudpump.total_strokes', color: '#a78bfa', min: 0, max: 1000000, enabled: true },
        ],
    },
    {
        title: 'Mud Volume',
        pens: [
            { channelId: 'fluid.total_tank_volume', color: '#4ade80', min: 0, max: 500, enabled: true },
            { channelId: 'fluid.trip_tank', color: '#f59e0b', min: 0, max: 50, enabled: true },
            { channelId: 'fluid.tank_gain_loss', color: '#fbbf24', min: -50, max: 50, enabled: true },
        ],
    },
];

const ROM_CHANNELS = [
    'drawworks.hook_load',
    'drilling.wob',
    'drilling.rop',
    'drilling.bit_depth',
    'drilling.hole_depth',
    'drawworks.block_position',
    'mudpump.pressure',
    'mudpump.spm',
    'mudpump.total_spm',
    'mudpump.total_strokes',
    'mudpump.flow_in',
    'mudpump.flow_out',
    'fluid.total_tank_volume',
    'fluid.tank_gain_loss',
    'fluid.trip_tank',
    'fluid.trip_tank_gain_loss',
    'fluid.tank_1',
    'fluid.tank_2',
    'fluid.tank_3',
    'fluid.tank_4',
    'engine.rpm',
    'engine.oil_pressure',
    'engine.coolant_temp',
    'engine.pressure',
    'wellhead.tubing_pressure',
    'wellhead.casing_pressure',
    'wellhead.wellhead_pressure',
];

const ROM_TOP_READOUTS = ['mudpump.pressure', 'mudpump.spm', 'engine.rpm', 'drawworks.hook_load'];
const ROM_VALUE_TRANSFORMS = {
    'drawworks.hook_load': (value) => Number(value) / 100,
};
const ROM_PRECISION_OVERRIDES = {
    'drawworks.hook_load': 2,
};

function isConventionalRig(rig) {
    const raw = [
        rig?.rigType,
        rig?.rig_type,
        rig?.type,
        rig?.section,
        rig?.assetUnit,
        rig?.asset_unit,
        rig?.field,
        rig?.name,
        rig?.rigId,
        rig?.rig_id,
    ].filter(Boolean).join(' ').toUpperCase();
    return raw.includes('CONVENTIONAL') || raw.includes('ROM') || /\bRM[-\s_]/.test(raw) || /\bRM\d/.test(raw);
}

export default function TrendsPanel({ rigId, rig }) {
    const isRomEdr = isConventionalRig(rig);
    const defaultStrips = isRomEdr ? ROM_STRIPS : DEFAULT_STRIPS;
    const topReadouts = isRomEdr ? ROM_TOP_READOUTS : TOP_READOUTS;
    const allowedChannels = isRomEdr ? ROM_CHANNELS : null;
    const storagePrefix = isRomEdr ? 'crmf-rom-edr-v1' : 'crmf-edr-v2';
    const valueTransforms = isRomEdr ? ROM_VALUE_TRANSFORMS : undefined;
    const precisionOverrides = isRomEdr ? ROM_PRECISION_OVERRIDES : undefined;
    return (
        <Box sx={{ height: '100%', minHeight: 460, display: 'flex', flexDirection: 'column' }}>
            <EdrView
                rigId={rigId}
                mode="full"
                storageKey={`${storagePrefix}-${rigId}`}
                defaultStrips={defaultStrips}
                rightReadouts={topReadouts}
                channels={allowedChannels}
                valueTransforms={valueTransforms}
                precisionOverrides={precisionOverrides}
            />
        </Box>
    );
}
