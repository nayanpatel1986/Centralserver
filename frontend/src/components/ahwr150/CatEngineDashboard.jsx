import React, { useEffect, useMemo, useState } from 'react';
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';
import { BarChart3, BatteryCharging, Bell, Clock3, Droplets, Fuel, Gauge, Hourglass, Leaf, Lightbulb, RotateCcw, Settings2, Thermometer, TrendingUp } from 'lucide-react';
import { api } from '../../api';
import { useRigData } from '../../context/RigDataContext';
import './CatEngineDashboard.css';

// These names come from the existing DB119 catalog. The component never derives PLC addresses.
const ENGINES = {
    engine1: { source: 'cat_engine', tag: 'CAT ENG-1', label: 'ENGINE 1' },
    engine2: { source: 'cat_engine_2', tag: 'CAT ENG-2', label: 'ENGINE 2' }
};
const RANGES = ['1m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '12h', '24h', 'custom'];
const RANGE_MINUTES = { '1m': 1, '5m': 5, '15m': 15, '30m': 30, '1h': 60, '2h': 120, '4h': 240, '6h': 360, '12h': 720, '24h': 1440 };
const HISTORY_FIELDS = ['rpm', 'load', 'fuel_rate', 'run_hours', 'total_fuel', 'def_level', 'def_temp', 'dpf_intake_temp', 'dpf_outlet_temp', 'scr_intake_temp', 'scr_outlet_temp', 'coolant_temp', 'j1939comok', 'dpf_lamp', 'hest_lamp'];
const numeric = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
const fmt = (v, digits = 0) => numeric(v) ? Number(v).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '--';
const yes = (v) => numeric(v) && Number(v) > 0;
const signal = (v) => !numeric(v) ? 'NO DATA' : yes(v) ? 'ON' : 'OFF';
const historyNumber = (row, source, field) => numeric(row?.[`${source}.${field}`]) ? Number(row[`${source}.${field}`]) : null;
const periodChange = (rows, source, field) => {
    const values = rows.map((r) => historyNumber(r, source, field)).filter((v) => v !== null);
    if (values.length < 2 || values.some((v, i) => i > 0 && v < values[i - 1])) return null;
    return values.at(-1) - values[0];
};
const average = (values) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const periodSummary = (rows, source, field) => {
    const values = rows.map((r) => historyNumber(r, source, field)).filter((v) => v !== null);
    return values.length ? { min: Math.min(...values), max: Math.max(...values), avg: average(values) } : null;
};

function Mini({ icon: Icon, label, value, unit, sub, tone = '', digits = 0 }) {
    return <div className={`cat-mini ${tone}`}>
        <div className="cat-mini-icon"><Icon size={22} /></div>
        <div><span>{label}</span><strong>{typeof value === 'string' ? value : fmt(value, digits)}{unit && <small>{unit}</small>}</strong>{sub && <em>{sub}</em>}</div>
    </div>;
}
function Kpi({ icon: Icon, label, value, unit, sub, tone = '' }) {
    return <div className={`cat-kpi ${tone}`}>
        <div className="cat-kpi-icon"><Icon size={25} /></div>
        <div className="cat-kpi-copy"><span>{label}</span><strong>{value}{unit && <small>{unit}</small>}</strong><em>{sub}</em></div>
    </div>;
}
function Panel({ title, icon: Icon, tag, className = '', children }) {
    return <section className={`cat-panel ${className}`}>
        <div className="cat-panel-head"><div><Icon size={19} /><h2>{title}</h2></div>{tag && <span className="cat-panel-tag">{tag}</span>}</div>
        {children}
    </section>;
}
function Ring({ label, value, tone, sub }) {
    const bounded = numeric(value) ? Math.min(100, Math.max(0, Number(value))) : null;
    return <div className="cat-ring" style={{ '--tone': tone, '--fill': `${bounded ?? 0}%` }}>
        <span>{label}</span><div className="cat-ring-track"><div><strong>{bounded === null ? '--' : `${Math.round(bounded)}%`}</strong></div></div><em>{sub || (bounded === null ? 'NO DATA' : 'Measured')}</em>
    </div>;
}
function AlarmState({ label, value, okWhenOn = false }) {
    const known = numeric(value);
    const good = known && (okWhenOn ? yes(value) : !yes(value));
    return <div className={`cat-state ${known ? good ? 'good' : 'bad' : ''}`}><i /><span>{label}</span><strong>{known ? okWhenOn ? good ? 'OK' : 'LOST' : yes(value) ? 'ON' : 'OFF' : 'NO DATA'}</strong></div>;
}

function AftertreatmentFlow({ data, running }) {
    const temp = (field) => `${fmt(data[field], 0)} °C`;
    const callouts = [
        { x: 112, value: temp('dpf_intake_temp'), label: 'DPF Intake Temp', hot: true },
        { x: 282, value: temp('dpf_outlet_temp'), label: 'DPF Outlet Temp', hot: true },
        { x: 501, value: temp('scr_intake_temp'), label: 'SCR Intake Temp', hot: true },
        { x: 721, value: temp('scr_outlet_temp'), label: 'SCR Outlet Temp', hot: false }
    ];
    return <div className={`cat-flow ${running ? 'running' : ''}`}>
        <svg className="cat-flow-art" viewBox="0 0 830 240" role="img" aria-label="Illustrative DOC DPF SCR exhaust path with live inlet and outlet temperatures">
            <defs>
                <linearGradient id="catHotPipe" x2="0" y2="1"><stop stopColor="#51200c"/><stop offset=".26" stopColor="#ff8a13"/><stop offset=".50" stopColor="#fff084"/><stop offset=".72" stopColor="#ff7112"/><stop offset="1" stopColor="#4e170c"/></linearGradient>
                <linearGradient id="catCoolPipe" x2="0" y2="1"><stop stopColor="#043053"/><stop offset=".27" stopColor="#0a8cda"/><stop offset=".5" stopColor="#a4f5ff"/><stop offset=".72" stopColor="#00a3f3"/><stop offset="1" stopColor="#043453"/></linearGradient>
                <linearGradient id="catMetal" x2="0" y2="1"><stop stopColor="#d5e0e2"/><stop offset=".07" stopColor="#5b7483"/><stop offset=".18" stopColor="#142836"/><stop offset=".34" stopColor="#476273"/><stop offset=".52" stopColor="#284354"/><stop offset=".73" stopColor="#111f2c"/><stop offset=".88" stopColor="#556e7d"/><stop offset="1" stopColor="#a8bbc1"/></linearGradient>
                <linearGradient id="catChrome" x2="1" y2="0"><stop stopColor="#0b1825"/><stop offset=".2" stopColor="#a8bbc6"/><stop offset=".4" stopColor="#263f4f"/><stop offset=".62" stopColor="#9aabb1"/><stop offset="1" stopColor="#0a1926"/></linearGradient>
                <radialGradient id="catHotCore"><stop stopColor="#ff9c2e"/><stop offset=".58" stopColor="#7e2c09"/><stop offset="1" stopColor="#231c20"/></radialGradient>
                <radialGradient id="catCoolCore"><stop stopColor="#18aeee"/><stop offset=".62" stopColor="#074c7c"/><stop offset="1" stopColor="#06243d"/></radialGradient>
                <pattern id="catHoney" width="15" height="13" patternUnits="userSpaceOnUse"><path d="M4 1h7l3 5-3 5H4L1 6z" fill="#391600" fillOpacity=".42" stroke="#f68020" strokeWidth="1.6"/></pattern>
                <pattern id="catBlueHoney" width="15" height="13" patternUnits="userSpaceOnUse"><path d="M4 1h7l3 5-3 5H4L1 6z" fill="#002a4c" fillOpacity=".42" stroke="#20aef3" strokeWidth="1.6"/></pattern>
                <filter id="catGlow" x="-30%" y="-150%" width="160%" height="400%"><feGaussianBlur stdDeviation="6"/></filter>
            </defs>
            <text x="8" y="67" className="cat-flow-end">Engine</text><text x="8" y="81" className="cat-flow-end">Exhaust In</text>
            <text x="761" y="67" className="cat-flow-end">Clean</text><text x="761" y="81" className="cat-flow-end">Exhaust Out</text>
            <path d="M0 98H469" stroke="#ff7b0b" strokeWidth="23" opacity=".8" filter="url(#catGlow)"/><path d="M469 98H830" stroke="#00aaff" strokeWidth="23" opacity=".8" filter="url(#catGlow)"/>
            <path d="M0 90H469V107H0z" fill="url(#catHotPipe)"/><path d="M469 90H830V107H469z" fill="url(#catCoolPipe)"/>
            <g className="cat-flow-arrows" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3">
                {[38, 86, 278].map((x) => <path key={x} d={`M${x} 98h14m-6-6 6 6-6 6`} stroke="#fff3a1"/>)}
                {[481, 711, 793].map((x) => <path key={x} d={`M${x} 98h14m-6-6 6 6-6 6`} stroke="#baf5ff"/>)}
            </g>
            <g className="cat-device">
                <path d="M108 90L122 67V129L108 107Z M264 67L278 90V107L264 129Z" fill="url(#catMetal)" stroke="#738d9a" strokeWidth="1.5"/>
                <rect x="122" y="58" width="142" height="80" rx="23" fill="url(#catMetal)" stroke="#8aa3b2" strokeWidth="2"/>
                <rect x="131" y="62" width="10" height="72" rx="3" fill="url(#catChrome)"/><rect x="244" y="62" width="10" height="72" rx="3" fill="url(#catChrome)"/>
                <rect x="143" y="65" width="99" height="66" rx="8" fill="url(#catMetal)" stroke="#6b8797"/><path d="M147 73h91" stroke="#d0dce0" opacity=".38"/><text x="192" y="106" className="cat-flow-unit-name">DOC</text>
                <text x="193" y="158" className="cat-flow-unit-caption">Diesel Oxidation</text><text x="193" y="171" className="cat-flow-unit-caption">Catalyst</text>
            </g>
            <g className="cat-device">
                <path d="M292 90L305 58V138L292 107Z M469 58L482 90V107L469 138Z" fill="url(#catMetal)" stroke="#738d9a" strokeWidth="1.5"/>
                <rect x="305" y="45" width="164" height="106" rx="23" fill="url(#catMetal)" stroke="#91a7ae" strokeWidth="2"/>
                <rect x="312" y="49" width="13" height="98" rx="3" fill="url(#catChrome)"/><rect x="449" y="49" width="13" height="98" rx="3" fill="url(#catChrome)"/>
                <rect x="329" y="53" width="116" height="90" rx="5" fill="url(#catHotCore)" stroke="#f07b24" strokeWidth="1.5"/><rect x="329" y="53" width="116" height="90" rx="5" fill="url(#catHoney)"/>
                <path d="M332 57h110" stroke="#ffb860" opacity=".65"/><rect x="350" y="80" width="74" height="34" rx="7" fill="#3b1909" stroke="#e46b16"/><text x="387" y="103" className="cat-flow-unit-name hot">DPF</text>
                <text x="387" y="166" className="cat-flow-unit-caption">Diesel Particulate</text><text x="387" y="179" className="cat-flow-unit-caption">Filter</text>
            </g>
            <g className="cat-device">
                <path d="M512 90L525 58V138L512 107Z M691 58L707 90V107L691 138Z" fill="url(#catMetal)" stroke="#738d9a" strokeWidth="1.5"/>
                <rect x="525" y="45" width="166" height="106" rx="23" fill="url(#catMetal)" stroke="#91a7ae" strokeWidth="2"/>
                <rect x="532" y="49" width="13" height="98" rx="3" fill="url(#catChrome)"/><rect x="671" y="49" width="13" height="98" rx="3" fill="url(#catChrome)"/>
                <rect x="549" y="53" width="118" height="90" rx="5" fill="url(#catCoolCore)" stroke="#1bb4f5" strokeWidth="1.5"/><rect x="549" y="53" width="118" height="90" rx="5" fill="url(#catBlueHoney)"/>
                <path d="M552 57h112" stroke="#8deaff" opacity=".65"/><rect x="570" y="80" width="76" height="34" rx="7" fill="#033150" stroke="#079bdf"/><text x="608" y="103" className="cat-flow-unit-name cool">SCR</text>
                <text x="608" y="166" className="cat-flow-unit-caption">Selective Catalytic</text><text x="608" y="179" className="cat-flow-unit-caption">Reduction</text>
            </g>
            {callouts.map((c) => <g key={c.label} className={`cat-temp-callout ${c.hot ? 'hot' : 'cool'}`}><path d={`M${c.x} 111 V193`}/><circle cx={c.x} cy="111" r="3"/><rect x={c.x - 60} y="193" width="120" height="42" rx="7"/><text x={c.x} y="211" className="cat-temp-value">{c.value}</text><text x={c.x} y="225" className="cat-temp-label">{c.label}</text></g>)}
        </svg>
    </div>;
}

export default function CatEngineDashboard({ engineId = 'engine1', rigId, showEngineTabs = true }) {
    const [selectedEngine, setSelectedEngine] = useState(engineId === 'engine2' ? 'engine2' : 'engine1');
    useEffect(() => setSelectedEngine(engineId === 'engine2' ? 'engine2' : 'engine1'), [engineId]);
    const selected = selectedEngine;
    const engine = ENGINES[selected];
    const { data: payload } = useRigData();
    const [now, setNow] = useState(Date.now());
    useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
    const livePayload = payload?._meta?.rigId === rigId && payload?._meta?.connected === true && payload?._meta?.stale !== true;
    const data = useMemo(() => {
        if (!livePayload) return {};
        const times = payload?._meta?.perTagTs || {};
        const source = payload?.[engine.source] || {};
        const fallbackTs = Date.parse(String(payload?._meta?.ts || ''));
        return Object.fromEntries(Object.entries(source).filter(([field]) => {
            const tagTs = Date.parse(String(times[`${engine.source}.${field}`] || ''));
            const at = Number.isFinite(tagTs) ? tagTs : fallbackTs;
            return Number.isFinite(at) && now - at <= 30000 && now - at >= -1000;
        }));
    }, [livePayload, payload, engine.source, now]);
    const [range, setRange] = useState('5m');
    const [mode, setMode] = useState('Time');
    const [trendGroup, setTrendGroup] = useState('Performance');
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');
    const [history, setHistory] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);

    useEffect(() => {
        let active = true;
        const load = async () => {
            if (range === 'custom' && (!customStart || !customEnd || new Date(customEnd) <= new Date(customStart))) {
                if (active) { setHistory([]); setHistoryLoading(false); }
                return;
            }
            setHistoryLoading(true);
            try {
                const metrics = HISTORY_FIELDS.map((field) => `${engine.source}.${field}`);
                const response = range === 'custom'
                    ? await api.rigHistoryRange(rigId, metrics, new Date(customStart).getTime(), new Date(customEnd).getTime(), 500)
                    : await api.rigHistoryMulti(rigId, metrics, RANGE_MINUTES[range], 500);
                if (active) setHistory((response?.rows || []).map((row) => ({
                    ...row, timestamp: row.t,
                    name: new Date(row.t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
                })));
            } catch { if (active) setHistory([]); }
            finally { if (active) setHistoryLoading(false); }
        };
        setHistory([]); load(); const timer = setInterval(load, 15000);
        return () => { active = false; clearInterval(timer); };
    }, [engine.source, rigId, range, customStart, customEnd]);

    const live = livePayload && Object.keys(data).length > 0;
    const d = live ? data : {};
    const rows = useMemo(() => history.filter((r) => Number.isFinite(Number(r?.timestamp))).sort((a, b) => Number(a.timestamp) - Number(b.timestamp)), [history]);
    const chart = useMemo(() => rows.map((r) => ({ ...r, rpm: historyNumber(r, engine.source, 'rpm'), load: historyNumber(r, engine.source, 'load'), fuel: historyNumber(r, engine.source, 'fuel_rate'), defLevel: historyNumber(r, engine.source, 'def_level'), defTemp: historyNumber(r, engine.source, 'def_temp'), dpfIn: historyNumber(r, engine.source, 'dpf_intake_temp'), dpfOut: historyNumber(r, engine.source, 'dpf_outlet_temp'), scrIn: historyNumber(r, engine.source, 'scr_intake_temp'), scrOut: historyNumber(r, engine.source, 'scr_outlet_temp') })), [rows, engine.source]);
    const series = trendGroup === 'Performance' ? [['rpm', 'RPM', '#1db9ff', 'left'], ['load', 'Torque %', '#ff9133', 'right'], ['fuel', 'Fuel L/h', '#38ec9b', 'fuel']] : trendGroup === 'DEF' ? [['defLevel', 'DEF level %', '#1db9ff', 'left'], ['defTemp', 'DEF °C', '#ffad3e', 'right']] : [['dpfIn', 'DPF inlet °C', '#ff9133', 'left'], ['dpfOut', 'DPF outlet °C', '#ffd063', 'left'], ['scrIn', 'SCR inlet °C', '#28c2ff', 'left'], ['scrOut', 'SCR outlet °C', '#43e2af', 'left']];
    const hasChartData = chart.some((row) => series.some(([field]) => row[field] !== null));
    const avgFuel = average(rows.map((r) => historyNumber(r, engine.source, 'fuel_rate')).filter((v) => v !== null));
    const runtime = periodChange(rows, engine.source, 'run_hours');
    const fuelUsed = periodChange(rows, engine.source, 'total_fuel');
    const periodFields = ['def_level', 'def_temp', 'dpf_intake_temp', 'dpf_outlet_temp', 'scr_intake_temp', 'scr_outlet_temp'];
    const periodStats = Object.fromEntries(periodFields.map((field) => [field, periodSummary(rows, engine.source, field)]));
    const alerts = ['protect_lamp', 'amber_warning_lamp', 'red_stop_lamp', 'dpf_lamp', 'hest_lamp'].filter((f) => yes(d[f])).length;
    const status = !live ? '--' : numeric(d.rpm) && Number(d.rpm) > 0 ? 'Running' : numeric(d.status) ? `Code ${fmt(d.status)}` : '--';
    const j1939 = signal(d.j1939comok);
    const regen = numeric(d.next_regeneration) ? fmt(d.next_regeneration, 1) : '--';
    const dpfDelta = numeric(d.dpf_intake_temp) && numeric(d.dpf_outlet_temp) ? Number(d.dpf_outlet_temp) - Number(d.dpf_intake_temp) : null;
    const scrDelta = numeric(d.scr_intake_temp) && numeric(d.scr_outlet_temp) ? Number(d.scr_outlet_temp) - Number(d.scr_intake_temp) : null;
    const viewFields = [
        [RotateCcw, 'Next Regeneration', regen, '', 'PLC value · unit unspecified', 'tone-amber'],
        [Thermometer, 'DEF Tank Temperature', d.def_temp, '°C', '', 'tone-cyan'],
        [Droplets, 'DEF Tank Level', d.def_level, '%', '', 'tone-cyan'],
        [Thermometer, 'DPF Intake Temperature', d.dpf_intake_temp, '°C', '', 'tone-orange'],
        [Thermometer, 'DPF Outlet Temperature', d.dpf_outlet_temp, '°C', '', 'tone-orange'],
        [Thermometer, 'SCR Intake Temperature', d.scr_intake_temp, '°C', '', 'tone-orange'],
        [Thermometer, 'SCR Outlet Temperature', d.scr_outlet_temp, '°C', '', 'tone-cyan'],
        [Lightbulb, 'DPF Lamp', signal(d.dpf_lamp), '', '', 'tone-amber'],
        [Lightbulb, 'HEST Lamp', signal(d.hest_lamp), '', '', 'tone-amber'],
        [RotateCcw, 'Regen Status', '--', '', 'No direct status tag', 'tone-green']
    ];
    return <div className="cat-shell"><div className="cat-dashboard">
        {showEngineTabs && <div className="cat-hero-navigation cat-engine-selector" role="group" aria-label="Select engine">
            <button type="button" aria-pressed={selected === 'engine1'} className={selected === 'engine1' ? 'active' : ''} onClick={() => setSelectedEngine('engine1')}>ENGINE 1</button>
            <button type="button" aria-pressed={selected === 'engine2'} className={selected === 'engine2' ? 'active' : ''} onClick={() => setSelectedEngine('engine2')}>ENGINE 2</button>
        </div>}
        <div className="cat-kpis">
            <Kpi icon={Settings2} label="Engine Status" value={status} sub={live ? 'Live engine state' : 'No live data'} tone={live && numeric(d.rpm) && Number(d.rpm) > 0 ? 'tone-green' : ''}/>
            <Kpi icon={Hourglass} label="Run Hours" value={fmt(d.run_hours, 1)} unit="hrs" sub="RunGroup counter"/>
            <Kpi icon={Clock3} label="Total Engine Hours" value={fmt(d.total_hours, 1)} unit="hrs" sub="Lifetime"/>
            <Kpi icon={Gauge} label="Engine RPM" value={fmt(d.rpm)} unit="rpm" sub="Live speed" tone="tone-cyan"/>
            <Kpi icon={Settings2} label="Engine Load / Torque" value={fmt(d.load)} unit="%" sub="Load factor"/>
            <Kpi icon={Fuel} label="Fuel Rate" value={fmt(d.fuel_rate, 1)} unit="L/h" sub={`Total fuel: ${fmt(d.total_fuel)} PLC units`}/>
            <Kpi icon={BatteryCharging} label="Battery Voltage" value={fmt(d.battery_voltage, 1)} unit="V" sub="Electrical potential" tone="tone-green"/>
            <Kpi icon={Bell} label="Active Alerts" value={live ? alerts : '--'} sub={live ? `${alerts} active lamps` : 'No live data'} tone={alerts ? 'tone-amber' : ''}/>
        </div>
        <div className="cat-main-grid">
            <Panel title="Aftertreatment System" icon={Leaf} tag="DEF / DPF / SCR · live mapped tags" className="cat-aftertreatment">
                <div className="cat-mini-grid">{viewFields.map(([icon, label, value, unit, sub, tone]) => <Mini key={label} icon={icon} label={label} value={value} unit={unit} sub={sub} tone={tone}/>)}</div>
                <div className="cat-process">
                    <div className="cat-def-tank">
                        <span className="cat-tank-label">DEF TANK</span>
                        <div className="cat-tank-visual">
                            <div className="cat-tank-shell">
                                <div className="cat-tank-neck" />
                                <div className="cat-tank-body">{numeric(d.def_level) ? <div className="cat-tank-liquid" style={{ height: `${Math.min(100, Math.max(0, Number(d.def_level)))}%` }}/> : <span className="cat-tank-empty">NO DATA</span>}</div>
                                <div className="cat-tank-foot" />
                            </div>
                            <div className="cat-tank-scale"><span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0%</span></div>
                        </div>
                        <strong>{numeric(d.def_level) ? `${fmt(d.def_level)}%` : '--'}</strong><small>Level</small>
                        <div className="cat-def-temp"><Thermometer size={15}/><span><b>{fmt(d.def_temp, 1)} °C</b><small>Tank Temp</small></span></div>
                    </div>
                    <AftertreatmentFlow data={d} running={live && numeric(d.rpm) && Number(d.rpm) > 0}/>
                </div>
                <div className="cat-period-stats"><span>Calculated DPF ΔT: <b>{fmt(dpfDelta, 1)} °C</b></span><span>Calculated SCR ΔT: <b>{fmt(scrDelta, 1)} °C</b></span><span>DEF history: <b>{rows.length ? 'Available' : 'No samples'}</b></span></div>
            </Panel>
            <Panel title="Engine Trends" icon={TrendingUp} tag={historyLoading ? 'Loading history…' : `${rows.length ? 'Recorded data' : 'No samples'} · 15 sec refresh`} className="cat-trends">
                <div className="cat-trend-controls"><div className="cat-chart-modes"><button className={mode === 'Time' ? 'active' : ''} onClick={() => setMode('Time')}>Time</button><button className={mode === 'Depth' ? 'active' : ''} onClick={() => setMode('Depth')}>Depth</button><select aria-label="Trend signals" value={trendGroup} onChange={(event) => setTrendGroup(event.target.value)}><option>Performance</option><option>DPF / SCR</option><option>DEF</option></select></div><div className="cat-ranges">{RANGES.map((r) => <button key={r} className={range === r ? 'active' : ''} onClick={() => setRange(r)}>{r.toUpperCase()}</button>)}</div></div>
                {range === 'custom' && <div className="cat-custom-range"><label>From<input type="datetime-local" value={customStart} onChange={(event) => setCustomStart(event.target.value)}/></label><label>To<input type="datetime-local" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)}/></label></div>}
                {mode === 'Depth' ? <div className="cat-chart-empty">Depth trend requires recorded depth for these engine samples</div> : hasChartData ? <div className="cat-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={chart}><CartesianGrid stroke="#183f5c" strokeDasharray="2 2"/><XAxis dataKey="name" tick={{ fill: '#9dc9e6', fontSize: 10 }} minTickGap={24}/><YAxis yAxisId="left" stroke="#24bfff" tick={{ fontSize: 10 }} width={38}/><YAxis yAxisId="right" orientation="right" stroke="#ff9b32" tick={{ fontSize: 10 }} width={32}/><YAxis yAxisId="fuel" orientation="right" hide/><Tooltip contentStyle={{ background: '#031d32', border: '1px solid #177eae', color: '#eef8ff' }} />{series.map(([field, label, color, axis]) => <Line key={field} yAxisId={axis} type="linear" dataKey={field} name={label} stroke={color} dot={false} connectNulls={false} isAnimationActive={false}/>)}</LineChart></ResponsiveContainer></div> : <div className="cat-chart-empty">NO RECORDED SAMPLES IN THIS PERIOD</div>}
                <div className="cat-trend-foot"><span>{series.map(([, label]) => label).join(' · ')}</span><span>Hover for values · selected {range.toUpperCase()}</span></div>
                <div className="cat-subheading">Critical Engine Parameters</div><div className="cat-critical-grid"><Mini icon={Thermometer} label="Coolant Temp" value={d.coolant_temp} unit="°C" tone="tone-orange"/><Mini icon={Thermometer} label="Fuel Temp" value={d.fuel_temp} unit="°C" tone="tone-cyan"/><Mini icon={Gauge} label="Fuel Delivery Pressure" value={d.fuel_pressure} unit="bar" tone="tone-amber"/><Mini icon={Gauge} label="Oil Pressure" value={d.oil_pressure} unit="bar" tone="tone-amber"/><Mini icon={Droplets} label="Coolant Level" value={d.coolant_level} unit="%" tone="tone-cyan"/></div>
            </Panel>
        </div>
        <div className="cat-bottom-grid">
            <Panel title="Runtime & Efficiency Analytics" icon={BarChart3} className="cat-analytics"><div className="cat-analytics-content"><div className="cat-rings"><Ring label="Engine Health" value={null} tone="#4bea95" sub="Not configured"/><Ring label="Utilization" value={d.load} tone="#22b6ff" sub={numeric(d.load) ? 'Measured load' : 'NO DATA'}/><Ring label="Fuel Efficiency" value={null} tone="#ffbb40" sub="Not configured"/><Ring label="Aftertreatment Health" value={null} tone="#4bea95" sub="Not configured"/></div><div className="cat-stat-list"><div><span>Runtime · selected period</span><b>{runtime === null ? '--' : `${fmt(runtime, 1)} h`}</b></div><div><span>Average fuel rate</span><b>{avgFuel === null ? '--' : `${fmt(avgFuel, 1)} L/h`}</b></div><div><span>Fuel used · counter change</span><b>{fuelUsed === null ? '--' : fmt(fuelUsed, 1)}</b></div><div><span>Total fuel counter · PLC unit</span><b>{fmt(d.total_fuel)}</b></div><div><span>DEF level</span><b>{numeric(d.def_level) ? `${fmt(d.def_level, 1)}%` : '--'}</b></div><div><span>J1939 link</span><b>{j1939 === 'ON' ? 'OK' : j1939 === 'OFF' ? 'LOST' : '--'}</b></div></div></div></Panel>
            <Panel title="Operational Insights & Recommendations" icon={Lightbulb} className="cat-insights" tag="Live signals only"><div className="cat-insight-grid"><div className={`cat-insight ${live && yes(d.j1939comok) ? 'tone-good' : 'tone-critical'}`}><strong>{live && yes(d.j1939comok) ? 'Communication Normal' : 'Engine Telemetry'}</strong><p>{live ? yes(d.j1939comok) ? 'J1939 communication signal is OK.' : 'J1939 communication is lost or unavailable.' : 'Live engine readings are unavailable or stale.'}</p></div><div className="cat-insight tone-info"><strong>DEF Tank</strong><p>Measured level {fmt(d.def_level)}% · temperature {fmt(d.def_temp, 1)} °C.</p></div><div className="cat-insight tone-warning"><strong>DPF Temperatures</strong><p>Inlet {fmt(d.dpf_intake_temp)} °C · outlet {fmt(d.dpf_outlet_temp)} °C. Calculated ΔT {fmt(dpfDelta)} °C.</p></div><div className="cat-insight tone-info"><strong>Next Regeneration</strong><p>PLC value {regen}. Unit and countdown meaning are not configured.</p></div></div><div className="cat-subheading">Alarm &amp; Status Summary</div><div className="cat-state-grid"><AlarmState label="J1939 communication" value={d.j1939comok} okWhenOn/><AlarmState label="Protection lamp" value={d.protect_lamp}/><AlarmState label="Amber warning" value={d.amber_warning_lamp}/><AlarmState label="Red stop" value={d.red_stop_lamp}/><AlarmState label="DPF lamp" value={d.dpf_lamp}/><AlarmState label="HEST lamp" value={d.hest_lamp}/></div></Panel>
        </div>
        <details className="cat-extra"><summary>Engine diagnostics and historical temperature statistics</summary><div className="cat-diagnostics">
            <div><span>Status codes</span><b>{selected === 'engine1' ? `Status 1: ${fmt(d.status)} · Status 2: ${fmt(d.engine1_status)} · Status 3: ${fmt(d.statuscode3)} · Status 4: ${fmt(d.statuscode4)}` : `Status 1: ${fmt(d.status)} · Status 2: ${fmt(d.engine1_status)}`}</b></div>
            <div><span>BP pilots</span><b>{fmt(d.bppilots, 1)} bar · OK: {signal(d.bppilotsok)}</b></div>
            {selected === 'engine1' && <div><span>Engine feedback pressure</span><b>{fmt(d.enginefb_actpress, 1)} bar · OK: {signal(d.enginefb_actpressok)} · Status: {fmt(d.enginefb_statuscode)}</b></div>}
            <div><span>Measured extras</span><b>Pedal: {fmt(d.pedal_position, 1)}% · Source command: {fmt(d.source_cmd)}</b></div>
            {periodFields.map((field) => <div key={field}><span>{field.replaceAll('_', ' ')} · selected period</span><b>{periodStats[field] ? `min ${fmt(periodStats[field].min, 1)} · avg ${fmt(periodStats[field].avg, 1)} · max ${fmt(periodStats[field].max, 1)}` : '--'}</b></div>)}
        </div></details>
    </div></div>;
}
