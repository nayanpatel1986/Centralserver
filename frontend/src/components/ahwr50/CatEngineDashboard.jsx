import React, { useEffect, useMemo, useState } from 'react';
import { Box, Tooltip } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { Activity, BatteryCharging, Bell, CheckCircle2, Clock3, Cog, Droplets, Fuel, Gauge, Hourglass, Leaf, Lightbulb, RefreshCw, RotateCcw, Thermometer, TrendingUp, Zap } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from 'recharts';
import { api } from '../../api';
import { useRigData } from '../../context/RigDataContext';
import { appendLiveTrendSample, sampleLiveTrendPacket } from './catEngineTrendLive';
import registry from './catEngine1Tags.json';
import './CatEngineDashboard.css';

const FRESH_MS = 30000;
const PERIODS = ['1m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '12h', '24h'];
const durationMinutes = (period) => Number(period.slice(0, -1)) * (period.endsWith('h') ? 60 : 1);
const PEN_GROUPS = {
    Performance: [
        { key: 'rpm', label: 'RPM', color: '#12b9ff', axis: 'rpm' },
        { key: 'load', label: 'Torque %', color: '#ff8b34', axis: 'load' },
        { key: 'fuel_rate', label: 'Fuel rate', color: '#3af193', axis: 'fuel' }
    ],
    'DPF / SCR': [
        { key: 'dpf_intake_temp', label: 'DPF Intake Temp', color: '#ff7536', axis: 'temperature' },
        { key: 'dpf_outlet_temp', label: 'DPF Outlet Temp', color: '#ffbb35', axis: 'temperature' },
        { key: 'scr_intake_temp', label: 'SCR Intake Temp', color: '#29b9ff', axis: 'temperature' },
        { key: 'scr_outlet_temp', label: 'SCR Outlet Temp', color: '#79e7ff', axis: 'temperature' }
    ],
    DEF: [
        { key: 'def_level', label: 'DEF Tank Level', color: '#26c7ff', axis: 'level' },
        { key: 'def_temp', label: 'DEF Tank Temp', color: '#ff9c44', axis: 'temperature' }
    ]
};
const LIVE_TREND_KEYS = [...new Set(Object.values(PEN_GROUPS).flat().map((pen) => pen.key))];
const ALERTS = ['protect_lamp', 'amber_warning_lamp', 'red_stop_lamp', 'dpf_lamp', 'hest_lamp'];
const numeric = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
const text = (r, digits = 1) => numeric(r.value) ? Number(r.value).toLocaleString(undefined, { maximumFractionDigits: digits }) : 'N/A';
const liveText = (r, digits = 1) => r.quality === 'live' ? text(r, digits) : 'N/A';
const unit = (key) => registry.tags[key]?.unitVerified ? registry.tags[key]?.unit || '' : '';
const on = (r) => r.quality === 'live' && (r.value === true || r.value === 1);
const bool = (r) => r.quality === 'live' && [true, false, 0, 1].includes(r.value);

function EngineIcon({ size = 24 }) {
    return <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden="true"><path d="M4 9h4l2-3h8l2 3h3v11h-3l-2 3h-8l-2-3H4V9Z" fill="currentColor"/><path d="M11 3h7M14.5 3v3M1 11v7M23 12h3v5h-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>;
}
function FilterIcon({ size = 20 }) {
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="7" y="3" width="10" height="18" rx="2" stroke="currentColor" strokeWidth="1.7"/><path d="M10 5v14m4-14v14M3 8h3M3 12h3M3 16h3M18 8h3M18 12h3M18 16h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>;
}

function useEngine(rigId) {
    const { data: payload } = useRigData();
    const connected = payload?._meta?.rigId === rigId && payload?._meta?.connected === true && payload?._meta?.stale !== true;
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, []);
    const readings = useMemo(() => Object.fromEntries(Object.entries(registry.tags).map(([key, tag]) => {
        const value = payload?.cat_engine?.[key];
        const time = Date.parse(payload?._meta?.perTagTs?.['cat_engine.' + key] || '');
        const present = typeof value === 'boolean' || numeric(value);
        const age = now - time;
        const fresh = connected && Number.isFinite(time) && age >= -1000 && age <= FRESH_MS;
        return [key, { value: present ? value : null, time: Number.isFinite(time) ? time : null, quality: !present ? 'missing' : fresh ? 'live' : 'stale', tag }];
    })), [payload, connected, now]);
    return { read: (key) => readings[key], anyLive: Object.values(readings).some((r) => r.quality === 'live'), connected, payload };
}

function Panel({ title, icon: Icon, extra, children, className = '' }) {
    return <section className={'cat50-panel ' + className}><header className="cat50-panel-head"><span><Icon size={16}/>{title}</span>{extra}</header>{children}</section>;
}
function Readout({ label, reading, field, icon: Icon, digits = 1, tone = 'blue', emptyText = 'N/A', showMissingQuality = true, missingQualityLabel = 'NO DATA' }) {
    const u = unit(field);
    const hint = reading.tag.address + ' · ' + (reading.time ? new Date(reading.time).toLocaleString() : 'No source timestamp') + (u ? '' : ' · engineering unit unverified');
    return <Tooltip title={hint}><div className={'cat50-readout ' + tone}><span className="cat50-readout-icon"><Icon size={20}/></span><div><small>{label}</small><strong>{numeric(reading.value) ? text(reading, digits) : emptyText}{reading.value !== null && u && <em> {u}</em>}</strong>{(reading.quality !== 'missing' || showMissingQuality) && <span className={'cat50-quality ' + reading.quality}>{reading.quality === 'live' ? 'LIVE' : reading.quality === 'stale' ? 'STALE' : missingQualityLabel}</span>}</div></div></Tooltip>;
}
function Kpi({ label, value, note, icon: Icon, quality = 'live', tone = '' }) {
    return <div className={'cat50-kpi ' + tone}><span className="cat50-kpi-icon"><Icon size={24}/></span><div><small>{label}</small><strong>{value}</strong><span>{note}</span>{quality !== 'live' && <b className={'cat50-quality ' + quality}>{quality.toUpperCase()}</b>}</div></div>;
}
function Lamp({ label, reading, danger = false, icon: Icon = FilterIcon }) {
    const isOn = on(reading);
    return <Tooltip title={reading.tag.address + ' · ' + (reading.time ? new Date(reading.time).toLocaleString() : 'No source timestamp')}><div className={'cat50-lamp ' + (isOn ? danger ? 'red' : 'amber' : '')}><span className="cat50-lamp-icon"><Icon size={19}/></span><span className="cat50-lamp-copy"><span>{label}</span><strong>{bool(reading) ? isOn ? 'ON' : 'OFF' : 'NO DATA'}</strong></span></div></Tooltip>;
}
function AftertreatmentFlowDiagram({ read, running, rigId }) {
    const level = read('def_level');
    const tankTemp = read('def_temp');
    const fill = level.quality === 'live' && unit('def_level') === '%' && numeric(level.value) ? Math.max(0, Math.min(100, Number(level.value))) : null;
    const [defSamples, setDefSamples] = useState(null);
    useEffect(() => {
        let active = true;
        const load = async () => {
            try {
                const response = await api.rigHistoryMulti(rigId, ['cat_engine.def_level', 'cat_engine.def_temp'], 5, 500);
                if (active) setDefSamples((response?.rows || []).filter((row) => numeric(row['cat_engine.def_level']) || numeric(row['cat_engine.def_temp'])).length);
            } catch { if (active) setDefSamples(null); }
        };
        load();
        const timer = setInterval(load, 15000);
        return () => { active = false; clearInterval(timer); };
    }, [rigId]);
    const verifiedDelta = (intakeKey, outletKey) => {
        const intake = read(intakeKey);
        const outlet = read(outletKey);
        return unit(intakeKey) === '°C' && unit(outletKey) === '°C' && intake.quality === 'live' && outlet.quality === 'live' && numeric(intake.value) && numeric(outlet.value) ? (Number(outlet.value) - Number(intake.value)).toFixed(1) + ' °C' : 'N/A';
    };
    const dpfDelta = verifiedDelta('dpf_intake_temp', 'dpf_outlet_temp');
    const scrDelta = verifiedDelta('scr_intake_temp', 'scr_outlet_temp');
    const sensors = [
        ['dpf_intake_temp', 167, 110, 'DPF Intake Temp', 'hot'],
        ['dpf_outlet_temp', 326, 270, 'DPF Outlet Temp', 'hot'],
        ['scr_intake_temp', 532, 476, 'SCR Intake Temp', 'hot'],
        ['scr_outlet_temp', 738, 682, 'SCR Outlet Temp', 'cold']
    ];
    return <div className={'cat50-flow ' + (running ? 'flowing' : '')}>
        <div className="cat50-flow-layout">
        <svg className="cat50-tank-svg" viewBox="0 0 146 240" role="img" aria-label="DEF tank level and temperature">
            <defs>
                <linearGradient id="cat50-tank-shell" x1="0" x2="1"><stop stopColor="#283e4d"/><stop offset=".17" stopColor="#b7cbd3"/><stop offset=".38" stopColor="#516d7f"/><stop offset=".75" stopColor="#254254"/><stop offset="1" stopColor="#adc5d1"/></linearGradient>
                <linearGradient id="cat50-tank-water" x1="0" x2="1"><stop stopColor="#0473ba"/><stop offset=".45" stopColor="#38d2ff"/><stop offset="1" stopColor="#045c9c"/></linearGradient>
                <clipPath id="cat50-def-glass"><rect x="20" y="41" width="60" height="103" rx="11"/></clipPath>
            </defs>
            <rect x="1" y="1" width="144" height="238" rx="10" fill="#061c31" stroke="#17608b"/>
            <text x="73" y="21" textAnchor="middle" className="cat50-flow-heading">DEF TANK</text>
            <rect x="41" y="29" width="19" height="8" rx="2" fill="url(#cat50-tank-shell)" stroke="#8db0c0"/>
            <rect x="17" y="38" width="66" height="108" rx="13" fill="url(#cat50-tank-shell)" stroke="#9bc1d3" strokeWidth="2"/>
            <rect x="20" y="41" width="60" height="103" rx="11" fill="#15384f"/>
            {fill !== null && <rect x="20" y={144 - fill * 1.03} width="60" height={fill * 1.03} fill="url(#cat50-tank-water)" clipPath="url(#cat50-def-glass)"/>}
            {fill === null && <text x="51" y="77" transform="rotate(90 51 77)" className="cat50-tank-no-data">NO DATA</text>}
            <path d="M23 44v97m54-97v97" stroke="#a5d5e8" strokeWidth="2" opacity=".55"/>
            {[0,25,50,75,100].map((mark) => <g key={mark}><path d={'M91 ' + (145 - mark * 1.02) + 'h8'} stroke="#75ade3" strokeWidth="1"/><text x="103" y={148 - mark * 1.02} className="cat50-flow-tick">{mark}%</text></g>)}
            <text x="73" y="179" textAnchor="middle" className="cat50-flow-number sensor">{liveText(level, 1)}{fill !== null ? '%' : ''}</text><text x="73" y="194" textAnchor="middle" className="cat50-flow-small">Level</text>
            <rect x="9" y="202" width="128" height="35" rx="5" fill="#061a2e" stroke="#17608b"/>
            <path d="M46 211v12a4 4 0 1 0 4 0v-12a2 2 0 0 0-4 0Z" fill="none" stroke="#28cbf9" strokeWidth="1.8"/>
            <text x="76" y="218" textAnchor="middle" className="cat50-flow-number sensor">{liveText(tankTemp, 1)}</text><text x="76" y="231" textAnchor="middle" className="cat50-flow-small">Tank Temp</text>
        </svg>
        <svg className="cat50-flow-main" viewBox="0 0 915 240" role="img" aria-label="Exhaust flow through DOC, DPF and SCR, with four live sensor readings">
            <defs>
                <linearGradient id="cat50-case" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#a9b9c2"/><stop offset=".12" stopColor="#536979"/><stop offset=".33" stopColor="#10253a"/><stop offset=".52" stopColor="#6d8290"/><stop offset=".72" stopColor="#1c3345"/><stop offset="1" stopColor="#061524"/></linearGradient>
                <linearGradient id="cat50-flange" x1="0" x2="1"><stop stopColor="#20394a"/><stop offset=".28" stopColor="#bac6ca"/><stop offset=".55" stopColor="#344758"/><stop offset=".83" stopColor="#a3b5bf"/><stop offset="1" stopColor="#142638"/></linearGradient>
                <linearGradient id="cat50-hot" gradientUnits="userSpaceOnUse" x1="0" y1="86" x2="0" y2="106"><stop stopColor="#ffdf60"/><stop offset=".28" stopColor="#ff9a25"/><stop offset=".67" stopColor="#f25e12"/><stop offset="1" stopColor="#5c1b0a"/></linearGradient>
                <linearGradient id="cat50-cold" gradientUnits="userSpaceOnUse" x1="0" y1="86" x2="0" y2="106"><stop stopColor="#a6f0ff"/><stop offset=".25" stopColor="#35b8ff"/><stop offset=".65" stopColor="#0051b4"/><stop offset="1" stopColor="#061c50"/></linearGradient>
                <pattern id="cat50-honey" width="10" height="9" patternUnits="userSpaceOnUse"><path d="M2 1h5l2 3.5L7 8H2L0 4.5Z" fill="#24130b" stroke="#ff9941" strokeWidth="1.4"/></pattern>
                <pattern id="cat50-blue-honey" width="9" height="8" patternUnits="userSpaceOnUse"><path d="M2 1h4l2 3-2 3H2L0 4Z" fill="#061e39" stroke="#38c8ff" strokeWidth="1.25"/></pattern>
                <filter id="cat50-orange-glow"><feGaussianBlur stdDeviation="5"/></filter>
                <filter id="cat50-blue-glow"><feGaussianBlur stdDeviation="4"/></filter>
            </defs>
            <rect x="1" y="1" width="913" height="238" rx="7" fill="#041629" stroke="#15527d"/>
            <text x="69" y="65" className="cat50-flow-label">Engine</text><text x="69" y="78" className="cat50-flow-label">Exhaust In</text>
            <text x="775" y="65" className="cat50-flow-label">Clean</text><text x="775" y="78" className="cat50-flow-label">Exhaust Out</text>
            <path d="M62 95H515" stroke="#ff761a" strokeWidth="23" opacity=".7" filter="url(#cat50-orange-glow)"/><path d="M512 95H840" stroke="#068cf4" strokeWidth="23" opacity=".7" filter="url(#cat50-blue-glow)"/>
            <path d="M62 95H515" stroke="url(#cat50-hot)" strokeWidth="15"/><path d="M512 95H840" stroke="url(#cat50-cold)" strokeWidth="15"/>
            <path d="M62 87h102m158 0h22m167 0h33m184 0h112" stroke="#d8e8e8" strokeWidth="1.2" opacity=".75"/>
            <g className="cat50-arrows" fill="none" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m104 90 6 5-6 5m40-10 6 5-6 5m170-10 6 5-6 5" stroke="#ffe277"/><path d="m529 90 6 5-6 5m202-10 6 5-6 5m76-10 6 5-6 5" stroke="#8fe9ff"/></g>
            <g className="cat50-exhaust-unit">
                <rect x="164" y="56" width="159" height="76" rx="23" fill="url(#cat50-case)" stroke="#718d9b" strokeWidth="2"/>
                <rect x="182" y="62" width="123" height="64" rx="13" fill="url(#cat50-case)" stroke="#c3ccd0" strokeWidth=".8"/>
                <path d="M175 57v74m136-74v74" stroke="url(#cat50-flange)" strokeWidth="9"/><path d="M184 61v66m120-66v66" stroke="#a2aeb5" strokeWidth="1.5"/>
                <text x="244" y="101" textAnchor="middle" className="cat50-flow-unit-name">DOC</text>
            </g>
            <g className="cat50-exhaust-unit">
                <rect x="344" y="44" width="167" height="101" rx="23" fill="url(#cat50-case)" stroke="#708a98" strokeWidth="2"/>
                <rect x="370" y="51" width="110" height="87" rx="5" fill="#331a0d" stroke="#ff9a45" strokeWidth="2"/>
                <rect x="372" y="53" width="106" height="83" fill="url(#cat50-honey)"/>
                <path d="M356 45v99m142-99v99" stroke="url(#cat50-flange)" strokeWidth="11"/><path d="M366 45v99m123-99v99" stroke="#1a2e3d" strokeWidth="3"/>
                <rect x="391" y="82" width="66" height="27" rx="3" fill="#2d160c" opacity=".88"/><text x="424" y="102" textAnchor="middle" className="cat50-flow-unit-name amber">DPF</text>
            </g>
            <g className="cat50-exhaust-unit">
                <rect x="544" y="44" width="184" height="101" rx="25" fill="url(#cat50-case)" stroke="#8196a1" strokeWidth="2"/>
                <rect x="577" y="52" width="111" height="85" rx="4" fill="#082d57" stroke="#32baff" strokeWidth="2"/>
                <rect x="579" y="54" width="107" height="81" fill="url(#cat50-blue-honey)"/>
                <path d="M556 45v99m160-99v99" stroke="url(#cat50-flange)" strokeWidth="11"/><path d="M567 45v99m138-99v99" stroke="#132a3c" strokeWidth="3"/>
                <rect x="604" y="82" width="60" height="27" rx="3" fill="#061f39" opacity=".88"/><text x="634" y="102" textAnchor="middle" className="cat50-flow-unit-name blue">SCR</text>
            </g>
            <text x="244" y="151" textAnchor="middle" className="cat50-flow-label">Diesel Oxidation</text><text x="244" y="164" textAnchor="middle" className="cat50-flow-label">Catalyst</text>
            <text x="424" y="158" textAnchor="middle" className="cat50-flow-label">Diesel Particulate</text><text x="424" y="171" textAnchor="middle" className="cat50-flow-label">Filter</text>
            <text x="634" y="158" textAnchor="middle" className="cat50-flow-label">Selective Catalytic</text><text x="634" y="171" textAnchor="middle" className="cat50-flow-label">Reduction</text>
            {sensors.map(([key, x, boxX, label, tone]) => <g key={key}>
                <circle cx={x} cy="105" r="3" fill={tone === 'hot' ? '#ff9a46' : '#55d3ff'}/>
                <path d={'M' + x + ' 108v74'} stroke={tone === 'hot' ? '#ff8237' : '#35beff'} strokeWidth="2.5"/>
                <rect x={boxX} y="182" width="114" height="40" rx="5" fill="#061a2e" stroke="#15517b"/>
                <text x={boxX + 57} y="199" textAnchor="middle" className="cat50-flow-number sensor">{liveText(read(key), 1)}</text>
                <text x={boxX + 57} y="213" textAnchor="middle" className="cat50-flow-small">{label}</text>
            </g>)}
        </svg>
        </div>
        <div className="cat50-flow-footer"><span>Calculated DPF ΔT: <strong>{dpfDelta}</strong></span><span>Calculated SCR ΔT: <strong>{scrDelta}</strong></span><span>DEF history: <strong>{defSamples === null ? 'Unavailable' : defSamples === 0 ? 'No samples' : defSamples + ' samples'}</strong></span></div>
    </div>;
}
function AftertreatmentOverview({ read, running, rigId }) {
    const metrics = [['Next Regeneration', 'next_regeneration', RotateCcw, 'amber'], ['DEF Tank Temperature', 'def_temp', Thermometer, 'blue'], ['DEF Tank Level', 'def_level', Droplets, 'cyan'], ['DPF Intake Temperature', 'dpf_intake_temp', Thermometer, 'orange'], ['DPF Outlet Temperature', 'dpf_outlet_temp', Thermometer, 'orange'], ['SCR Intake Temperature', 'scr_intake_temp', Thermometer, 'orange'], ['SCR Outlet Temperature', 'scr_outlet_temp', Thermometer, 'blue']];
    return <Panel title="Aftertreatment System" icon={Leaf} extra={<small>DEF / DPF / SCR · live mapped tags</small>} className="cat50-after"><div className="cat50-after-grid">{metrics.map(([label, key, Icon, tone]) => <Readout key={key} label={label} reading={read(key)} field={key} icon={Icon} tone={tone} emptyText="--" showMissingQuality={key === 'next_regeneration'} missingQualityLabel="PLC value · unit unspecified"/>)}<Lamp label="DPF Lamp" reading={read('dpf_lamp')} icon={Lightbulb}/><Lamp label="HEST Lamp" reading={read('hest_lamp')} icon={Lightbulb}/><div className="cat50-readout green"><span className="cat50-readout-icon"><RefreshCw size={20}/></span><div><small>Regen Status</small><strong>--</strong><span className="cat50-quality missing">No direct status tag</span></div></div></div><AftertreatmentFlowDiagram read={read} running={running} rigId={rigId}/></Panel>;
}
function EngineTrends({ latest, rigId }) {
    const [period, setPeriod] = useState('5m');
    const [view, setView] = useState('time');
    const [group, setGroup] = useState('Performance');
    const [custom, setCustom] = useState({ start: '', stop: '' });
    const [rows, setRows] = useState([]);
    const [liveRows, setLiveRows] = useState([]);
    const [busy, setBusy] = useState(false);
    const [visible, setVisible] = useState({});
    const pens = PEN_GROUPS[group];
    const axes = [...new Set(pens.map((pen) => pen.axis))];
    useEffect(() => {
        if (period === 'custom' || latest?._meta?.rigId !== rigId || latest?._meta?.connected !== true || latest?._meta?.stale === true) return;
        const sample = sampleLiveTrendPacket(latest, LIVE_TREND_KEYS, FRESH_MS);
        if (sample) setLiveRows((previous) => appendLiveTrendSample(previous, sample));
    }, [latest, period]);
    useEffect(() => {
        let mounted = true;
        let timer;
        const load = async (initial = false) => {
            if (period === 'custom' && (!custom.start || !custom.stop || new Date(custom.stop) <= new Date(custom.start))) { if (mounted) { setRows([]); setBusy(false); } return; }
            const metrics = pens.map((pen) => 'cat_engine.' + pen.key);
            if (view === 'depth') metrics.push('drilling.bit_depth');
            if (initial) setBusy(true);
            try {
                const response = period === 'custom'
                    ? await api.rigHistoryRange(rigId, metrics, Date.parse(custom.start), Date.parse(custom.stop), 500)
                    : await api.rigHistoryMulti(rigId, metrics, durationMinutes(period), 500);
                if (mounted) setRows((response?.rows || []).map((row) => ({ ...row, timestamp: row.t })));
            } catch { /* Keep the last plotted points during a transient request failure. */ } finally {
                if (mounted) { if (initial) setBusy(false); timer = setTimeout(() => load(), 15000); }
            }
        };
        load(true);
        return () => { mounted = false; clearTimeout(timer); };
    }, [rigId, period, custom.start, custom.stop, group, view]);
    const chartRows = useMemo(() => {
        const selected = new Map(rows.map((row) => [Number(row.timestamp), row]));
        const duration = Number(period.slice(0, -1)) * (period.endsWith('h') ? 3600000 : 60000);
        const start = period === 'custom' ? Date.parse(custom.start) : Date.now() - duration;
        const stop = period === 'custom' ? Date.parse(custom.stop) : Infinity;
        for (const row of liveRows) if (row.timestamp >= start && row.timestamp <= stop) selected.set(row.timestamp, { ...selected.get(row.timestamp), ...row });
        return [...selected.values()].filter((row) => numeric(row.timestamp) && row.timestamp >= start && row.timestamp <= stop && pens.some((pen) => numeric(row['cat_engine.' + pen.key])) && (view === 'time' || numeric(row['drilling.bit_depth']))).map((row) => ({ ...row, depth: Number(row['drilling.bit_depth']), label: new Date(Number(row.timestamp)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) })).sort((a, b) => view === 'depth' ? a.depth - b.depth : a.timestamp - b.timestamp);
    }, [rows, liveRows, group, view, period, custom.start, custom.stop]);
    return <Panel title="Engine Trends" icon={TrendingUp} extra={<small>{busy && !chartRows.length ? 'Loading' : chartRows.length ? 'Recorded samples' : 'No samples'} · 1 sec live refresh</small>} className="cat50-trends">
        <div className="cat50-trend-controls"><div className="cat50-trend-modes"><button className={view === 'time' ? 'selected' : ''} onClick={() => setView('time')}>Time</button><button className={view === 'depth' ? 'selected' : ''} onClick={() => setView('depth')}>Depth</button><select aria-label="Trend category" value={group} onChange={(e) => setGroup(e.target.value)}>{Object.keys(PEN_GROUPS).map((name) => <option key={name}>{name}</option>)}</select></div><div className="cat50-periods">{PERIODS.map((p) => <button key={p} className={period === p ? 'selected' : ''} onClick={() => setPeriod(p)}>{p.toUpperCase()}</button>)}<button className={period === 'custom' ? 'selected' : ''} onClick={() => setPeriod('custom')}>CUSTOM</button></div></div>
        {period === 'custom' && <div className="cat50-custom"><input aria-label="Start time" type="datetime-local" value={custom.start} onChange={(e) => setCustom((old) => ({ ...old, start: e.target.value }))}/><input aria-label="End time" type="datetime-local" value={custom.stop} onChange={(e) => setCustom((old) => ({ ...old, stop: e.target.value }))}/></div>}
        <div className="cat50-chart">{chartRows.length ? <ResponsiveContainer width="100%" height="100%"><LineChart data={chartRows} margin={{ top: 10, right: 18, left: -12, bottom: 2 }}><CartesianGrid stroke="#173554" strokeDasharray="3 3"/><XAxis dataKey={view === 'depth' ? 'depth' : 'label'} type={view === 'depth' ? 'number' : 'category'} domain={view === 'depth' ? ['dataMin', 'dataMax'] : undefined} tick={{ fill: '#85a6c3', fontSize: 10 }} minTickGap={20}/>{axes.map((axis, index) => <YAxis key={axis} yAxisId={axis} orientation={index === 1 ? 'right' : 'left'} hide={index > 1} tick={{ fill: pens.find((pen) => pen.axis === axis)?.color, fontSize: 10 }} width={index === 1 ? 36 : 50}/>)}<ChartTooltip labelFormatter={(_, items) => view === 'depth' ? 'Depth ' + (items?.[0]?.payload?.depth ?? '') + ' m' : items?.[0]?.payload?.timestamp ? new Date(items[0].payload.timestamp).toLocaleString() : ''} contentStyle={{ background: '#071d33', border: '1px solid #2a5479', color: '#dbeafe' }}/>{pens.filter((pen) => visible[pen.key] !== false).map((pen) => <Line key={pen.key} yAxisId={pen.axis} dataKey={'cat_engine.' + pen.key} name={pen.label + (unit(pen.key) ? ' (' + unit(pen.key) + ')' : ' (unit pending)')} stroke={pen.color} dot={false} strokeWidth={2} isAnimationActive={false} connectNulls={false}/>)}</LineChart></ResponsiveContainer> : <div className="cat50-no-data">{busy ? 'LOADING RECORDED SAMPLES…' : 'NO RECORDED SAMPLES IN THIS PERIOD'}</div>}</div>
        <div className="cat50-trend-foot"><div className="cat50-legend">{pens.map((pen) => <button key={pen.key} className={visible[pen.key] === false ? 'muted' : ''} onClick={() => setVisible((old) => ({ ...old, [pen.key]: old[pen.key] === false }))}><i style={{ background: pen.color }}/>{pen.label}{unit(pen.key) ? ' ' + unit(pen.key) : ''}</button>)}</div><span>Hover for values · selected {period.toUpperCase()}</span></div>
    </Panel>;
}
const MemoEngineTrends = React.memo(EngineTrends);
function CriticalEngineParameters({ read }) {
    const items = [['Coolant Temp', 'coolant_temp', Thermometer, 'red'], ['Fuel Temp', 'fuel_temp', Thermometer, 'blue'], ['Fuel Delivery Pressure', 'fuel_pressure', Gauge, 'amber'], ['Oil Pressure', 'oil_pressure', Gauge, 'amber'], ['Coolant Level', 'coolant_level', Droplets, 'cyan']];
    return <Panel title="Critical Engine Parameters" icon={Gauge} className="cat50-critical"><div className="cat50-critical-grid">{items.map(([label, key, Icon, tone]) => <Readout key={key} label={label} field={key} reading={read(key)} icon={Icon} tone={tone} emptyText="--" showMissingQuality={false}/>)}</div></Panel>;
}
function RuntimeEfficiencyAnalytics({ read }) {
    const gauges = [['Engine Health', 'Requires confirmed limits and formula', 'green', null], ['Utilization', 'Requires operating time and rated capacity', 'cyan', null], ['Fuel Efficiency', 'Requires verified fuel units and output basis', 'amber', null], ['Aftertreatment Health', 'Requires confirmed limits and formula', 'green', null]];
    const summaries = [['Today’s Runtime', 'N/A', 'Requires complete day records and confirmed run-hours unit'], ['Last 24h Avg Fuel Rate', 'N/A', 'Fuel-rate engineering unit unverified'], ['Total Fuel Used', liveText(read('total_fuel'), 0), 'Raw PLC counter; unit unverified'], ['DEF Consumption Today', 'N/A', 'No validated consumption signal'], ['Regeneration Count (24h)', 'N/A', 'No native regeneration event signal']];
    return <Panel title="Runtime & Efficiency Analytics" icon={Gauge} className="cat50-analytics"><div className="cat50-analytics-body"><div className="cat50-gauges">{gauges.map(([label, reason, tone, value]) => {
        const percent = numeric(value) && Number(value) >= 0 && Number(value) <= 100 ? Number(value) : null;
        return <Tooltip key={label} title={reason}><div className={'cat50-gauge ' + tone + (percent === null ? ' unverified' : ' verified')}><small>{label}</small><div style={{ '--fill': (percent ?? 0) + '%' }}><strong>{percent === null ? 'N/A' : Math.round(percent) + '%'}</strong></div><span>{percent === null ? 'UNVERIFIED' : 'VALIDATED'}</span></div></Tooltip>;
    })}</div><div className="cat50-summary">{summaries.map(([label, value, reason]) => <Tooltip key={label} title={reason}><div><span>{label}</span><strong>{value}</strong></div></Tooltip>)}</div></div></Panel>;
}
function OperationalInsights({ read }) {
    const navigate = useNavigate();
    const warnings = ALERTS.filter((key) => on(read(key)));
    const allKnown = ALERTS.every((key) => bool(read(key)));
    const status = warnings.length ? 'Active: ' + warnings.map((key) => key.replaceAll('_', ' ')).join(', ') : allKnown ? 'No active engine or aftertreatment lamps.' : 'Lamp status unavailable or stale.';
    const cards = [
        ['System Status', status, warnings.length ? 'alert' : allKnown ? 'ok' : 'blue', CheckCircle2],
        ['DEF Refill Planning', 'N/A · tank level alone cannot predict refill time.', 'blue', Droplets],
        ['Monitor DPF', on(read('dpf_lamp')) ? 'DPF lamp active. Follow the engine procedure.' : 'Temperature limits are not configured.', 'alert', Thermometer],
        ['Next Regeneration', read('next_regeneration').quality === 'live' ? 'PLC value: ' + text(read('next_regeneration')) + '. Unit and meaning unverified.' : 'N/A · no current verified countdown.', 'blue', RefreshCw]
    ];
    return <Panel title="Operational Insights & Recommendations" icon={Zap} extra={<button className="cat50-view-all" onClick={() => navigate('/alarms')}>View All ›</button>} className="cat50-insights"><div className="cat50-insight-grid">{cards.map(([title, detail, tone, Icon]) => <div key={title} className={'cat50-insight ' + tone}><div className="cat50-insight-title"><Icon size={19}/><strong>{title}</strong></div><p>{detail}</p></div>)}</div></Panel>;
}
function EngineAlarmStatusStrip({ read }) {
    return <div className="cat50-alarm-strip"><strong>Alarm & Status Summary</strong><div><div className="cat50-alarm-unknown">J1939 Communication <b>UNKNOWN</b></div><Lamp label="Amber Warning" reading={read('amber_warning_lamp')}/><Lamp label="Red Stop" reading={read('red_stop_lamp')} danger/><Lamp label="DPF Lamp" reading={read('dpf_lamp')}/><Lamp label="HEST Lamp" reading={read('hest_lamp')}/></div></div>;
}
export default function CatEngineDashboard({ rigId }) {
    const { read, anyLive, connected, payload } = useEngine(rigId);
    const rpm = read('rpm');
    const running = rpm.quality === 'live' && numeric(rpm.value) && Number(rpm.value) > 0;
    const status = rpm.quality !== 'live' ? 'Unknown' : running ? 'Running' : 'Stopped';
    const alerts = ALERTS.map(read);
    const count = alerts.filter(on).length;
    const known = alerts.every(bool);
    return <Box className="cat50-dashboard"><div className="cat50-top-bar">
        <Kpi label="Engine Status" value={status} note="Derived from live RPM" icon={EngineIcon} quality={rpm.quality} tone={running ? 'green' : 'green-icon'}/>
        <Kpi label="Run Hours" value={text(read('run_hours'))} note="PLC counter · unit pending" icon={Hourglass} quality={read('run_hours').quality}/>
        <Kpi label="Total Engine Hours" value={text(read('total_hours')) + (read('total_hours').value === null ? '' : ' h')} note="Lifetime operation" icon={Clock3} quality={read('total_hours').quality}/>
        <Kpi label="Engine RPM" value={text(rpm, 0) + (rpm.value === null ? '' : ' rpm')} note="Actual speed" icon={Gauge} quality={rpm.quality}/>
        <Kpi label="Engine Load / Torque" value={text(read('load')) + (read('load').value === null ? '' : ' %')} note="Torque percentage" icon={Cog} quality={read('load').quality}/>
        <Kpi label="Fuel Rate" value={text(read('fuel_rate'))} note="Unit pending confirmation" icon={Fuel} quality={read('fuel_rate').quality}/>
        <Kpi label="Battery Voltage" value={text(read('battery_voltage'))} note="Electrical potential · unit pending" icon={BatteryCharging} quality={read('battery_voltage').quality} tone="green-icon"/>
        <Kpi label="Active Alerts" value={known ? String(count) : count ? String(count) + '+' : 'N/A'} note={count ? 'Active lamp indications' : known ? 'No active lamps' : 'Lamp data incomplete'} icon={Bell} quality={known ? 'live' : 'missing'} tone={count ? 'red' : 'amber-icon'}/>
    </div><div className="cat50-connection"><i className={anyLive ? 'live' : ''}/>{anyLive ? 'Live PLC values · source timestamps checked' : connected ? 'PLC data missing or stale' : 'Dashboard connection offline'}</div>
        <div className="cat50-main-grid"><AftertreatmentOverview read={read} running={running} rigId={rigId}/><div className="cat50-right-top"><MemoEngineTrends latest={payload} rigId={rigId}/><CriticalEngineParameters read={read}/></div><RuntimeEfficiencyAnalytics read={read}/><div className="cat50-right-bottom"><OperationalInsights read={read}/><EngineAlarmStatusStrip read={read}/></div></div>
    </Box>;
}
