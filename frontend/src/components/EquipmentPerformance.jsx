import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Paper, Typography, Stack, ToggleButton, ToggleButtonGroup, Table, TableHead, TableBody, TableRow, TableCell,
    TableContainer, Alert, Select, MenuItem, Tooltip, CircularProgress,
} from '@mui/material';
import { ErrorOutline, WarningAmber, CheckCircleOutline } from '@mui/icons-material';
import {
    ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, Tooltip as ChartTooltip, CartesianGrid, ReferenceLine,
    ScatterChart, Scatter, ZAxis, LineChart, Line,
} from 'recharts';
import ErrorBoundary from './ErrorBoundary';
import { api } from '../api';
import { fmtNum } from './common';

// Equipment Performance — one equipment class at a time, compared across every
// rig. Health index = 40% reliability + 35% condition + 25% maintenance
// (computed server-side in lib/equipment.js, with its components).

// Status colours are reserved for health grades and always shown with an icon + label.
const GRADE = {
    good: { color: '#22c55e', label: 'Good', icon: CheckCircleOutline },
    watch: { color: '#f59e0b', label: 'Watch', icon: WarningAmber },
    act: { color: '#ef4444', label: 'Act', icon: ErrorOutline },
};
// Diverging pair for "vs fleet": cool = better than peers, warm = worse; neutral = in line.
const BETTER = '#38bdf8';
const WORSE = '#f97316';
const NEUTRAL_MARK = '#64748b';
const grid = 'rgba(148,163,184,0.12)';
const axis = '#64748b';
const tooltipStyle = { background: '#0d1526', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 };
const headSx = { fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, color: 'text.secondary', whiteSpace: 'nowrap', py: 0.75 };

const shortRig = (id) => String(id || '').replace(/^MOCK-/, '');

// Background tint for a value relative to the fleet median, direction-aware.
function deviationTint(param, cell) {
    if (!cell || cell.devPct == null || param.better === 'none') return 'transparent';
    const dev = cell.devPct;
    if (Math.abs(dev) < 3) return 'transparent';
    const worse = param.better === 'mid' ? true : param.better === 'low' ? dev > 0 : dev < 0;
    const a = Math.min(0.32, 0.06 + Math.abs(dev) / 100);
    const hex = Math.round(a * 255).toString(16).padStart(2, '0');
    return `${worse ? WORSE : BETTER}${hex}`;
}

// --- Class scorecard -------------------------------------------------------
function ClassCard({ cls, selected, onSelect }) {
    const s = cls.summary;
    const total = Math.max(1, s.units);
    const segs = ['act', 'watch', 'good'].filter((k) => s.grades[k] > 0);
    return (
        <Paper
            role="button" tabIndex={0} onClick={onSelect}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}
            elevation={0}
            sx={{
                p: 1.5, cursor: 'pointer', borderRadius: 1.5, display: 'flex', flexDirection: 'column', gap: 0.75,
                bgcolor: selected ? 'rgba(56,189,248,0.08)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${selected ? 'rgba(56,189,248,0.6)' : 'rgba(148,163,184,0.14)'}`,
                '&:hover': { borderColor: 'rgba(56,189,248,0.4)' },
            }}
        >
            <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                <Typography sx={{ fontWeight: 800, fontSize: '0.9rem' }}>{cls.name}</Typography>
                <Typography variant="caption" color="text.secondary">{s.units} units</Typography>
            </Stack>
            <Stack direction="row" alignItems="baseline" spacing={0.5}>
                <Typography sx={{ fontSize: '1.9rem', fontWeight: 800, lineHeight: 1 }}>{s.avgHealth ?? '—'}</Typography>
                <Typography variant="caption" color="text.secondary">avg health</Typography>
            </Stack>
            {/* Grade split: 2px gaps between segments; counts are labelled below. */}
            <Box sx={{ display: 'flex', gap: '2px', height: 6, borderRadius: 3, overflow: 'hidden' }}>
                {segs.map((k) => <Box key={k} sx={{ flex: s.grades[k] / total, bgcolor: GRADE[k].color }} />)}
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.3 }}>
                {s.grades.act ? <Box component="span" sx={{ color: GRADE.act.color, fontWeight: 800 }}>{s.grades.act} act · </Box> : null}
                {s.grades.watch ? <Box component="span" sx={{ color: GRADE.watch.color, fontWeight: 800 }}>{s.grades.watch} watch · </Box> : null}
                {s.grades.good} good
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.3 }}>
                {fmtNum(s.downtimeH, 1)} h downtime{s.pmOverdue ? ` · ${s.pmOverdue} PM overdue` : ''}
            </Typography>
        </Paper>
    );
}

// --- Benchmark table pieces -------------------------------------------------
function HealthCell({ h }) {
    const g = GRADE[h.grade];
    const parts = [['R', 'Reliability', h.reliability], ['C', 'Condition', h.condition], ['M', 'Maintenance', h.maintenance]];
    return (
        <Tooltip arrow title={
            <Box sx={{ fontSize: 12 }}>
                <div><b>Health {h.index}</b> — {g.label}</div>
                {parts.map(([, n, v]) => <div key={n}>{n}: {v}</div>)}
                <div style={{ opacity: 0.7, marginTop: 4 }}>40% reliability · 35% condition · 25% maintenance</div>
            </Box>
        }>
            <Stack direction="row" alignItems="center" spacing={0.75}>
                <g.icon sx={{ fontSize: 16, color: g.color }} titleAccess={g.label} />
                <Typography sx={{ fontWeight: 800, fontSize: '0.95rem', width: 24, textAlign: 'right' }}>{h.index}</Typography>
                <Stack spacing="2px" sx={{ width: 36 }}>
                    {parts.map(([k, , v]) => (
                        <Box key={k} sx={{ height: 3, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.08)' }}>
                            <Box sx={{ height: '100%', width: `${v}%`, borderRadius: 2, bgcolor: v >= 85 ? GRADE.good.color : v >= 60 ? GRADE.watch.color : GRADE.act.color }} />
                        </Box>
                    ))}
                </Stack>
            </Stack>
        </Tooltip>
    );
}

function Spark({ data }) {
    if (!data || data.length < 2) return <Typography variant="caption" color="text.disabled">—</Typography>;
    return (
        <Box sx={{ width: 68, height: 24 }}>
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
                    <YAxis hide domain={['dataMin', 'dataMax']} />
                    <ChartTooltip contentStyle={tooltipStyle} labelFormatter={(t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        formatter={(v) => [fmtNum(v, 1), '']} cursor={{ stroke: axis, strokeWidth: 1 }} />
                    <Line type="monotone" dataKey="v" stroke="#94a3b8" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                    <XAxis dataKey="t" hide />
                </LineChart>
            </ResponsiveContainer>
        </Box>
    );
}

function ValueCell({ param, cell, flag }) {
    if (!cell || cell.avg == null) return <TableCell align="right" sx={{ color: 'text.disabled' }}>—</TableCell>;
    const tip = `${param.label}: ${fmtNum(cell.avg, 2)} ${param.unit}` +
        (cell.devPct != null ? ` · ${cell.devPct > 0 ? '+' : ''}${fmtNum(cell.devPct, 1)}% vs fleet median` : '') +
        (cell.p95 != null ? ` · p95 ${fmtNum(cell.p95, 1)}` : '') +
        (flag === 'limit' ? ' · OUTSIDE LIMIT' : flag === 'outlier' ? ' · unlike the fleet' : '');
    return (
        <TableCell align="right" title={tip} sx={{ bgcolor: deviationTint(param, cell), fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
            {flag && <Box component="span" sx={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', mr: 0.75, verticalAlign: 'middle',
                bgcolor: flag === 'limit' ? GRADE.act.color : GRADE.watch.color }} />}
            <Box component="span" sx={{ fontWeight: flag ? 800 : 500 }}>{fmtNum(cell.avg, cell.avg >= 100 ? 0 : 1)}</Box>
        </TableCell>
    );
}

function PmCell({ pm }) {
    if (!pm || pm.nextDueInHours == null) return <TableCell align="right" sx={{ color: 'text.disabled' }}>—</TableCell>;
    const c = pm.status === 'overdue' ? GRADE.act.color : pm.status === 'due-soon' ? GRADE.watch.color : 'text.secondary';
    return (
        <TableCell align="right" sx={{ color: c, fontWeight: pm.status === 'ok' ? 500 : 800, whiteSpace: 'nowrap' }}
            title={pm.status === 'overdue' ? 'PM overdue (run-hours past due)' : 'Run-hours until next PM'}>
            {pm.status === 'overdue' ? `${Math.abs(Math.round(pm.nextDueInHours))} h late` : `${Math.round(pm.nextDueInHours)} h`}
        </TableCell>
    );
}

// --- Charts -----------------------------------------------------------------
function SpreadChart({ cls, param, onOpenRig }) {
    const rows = cls.units
        .filter((u) => u.values[param.key]?.avg != null)
        .map((u) => ({ rig: shortRig(u.rigId), rigId: u.rigId, v: u.values[param.key].avg, flag: u.flags?.[param.key] || null }))
        .sort((a, b) => a.v - b.v);
    const med = cls.stats[param.key]?.median;
    if (!rows.length) return <Typography variant="caption" color="text.secondary" sx={{ display: 'block', py: 6, textAlign: 'center' }}>No data for this parameter in the window.</Typography>;
    return (
        <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 16, right: 12, bottom: 4, left: -6 }} barCategoryGap={2}>
                <CartesianGrid stroke={grid} vertical={false} />
                <XAxis dataKey="rig" stroke={axis} fontSize={10} interval={0} angle={-45} textAnchor="end" height={52} tickLine={false} />
                <YAxis stroke={axis} fontSize={11} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
                <ChartTooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                    formatter={(v, _n, p) => [`${fmtNum(v, 2)} ${param.unit}${p.payload.flag ? (p.payload.flag === 'limit' ? ' · outside limit' : ' · unlike fleet') : ''}`, param.label]} />
                {med != null && <ReferenceLine y={med} stroke="#cbd5e1" strokeDasharray="4 3" label={{ value: `fleet median ${fmtNum(med, 1)}`, position: 'insideTopLeft', fill: '#cbd5e1', fontSize: 11 }} />}
                {param.hi != null && <ReferenceLine y={param.hi} stroke={GRADE.act.color} strokeDasharray="2 3" label={{ value: `limit ${param.hi}`, position: 'insideTopRight', fill: GRADE.act.color, fontSize: 11 }} />}
                {param.lo != null && <ReferenceLine y={param.lo} stroke={GRADE.act.color} strokeDasharray="2 3" label={{ value: `limit ${param.lo}`, position: 'insideBottomRight', fill: GRADE.act.color, fontSize: 11 }} />}
                <Bar dataKey="v" radius={[4, 4, 0, 0]} isAnimationActive={false} onClick={(d) => onOpenRig(d.rigId)} cursor="pointer">
                    {rows.map((r) => <Cell key={r.rigId} fill={r.flag === 'limit' ? GRADE.act.color : r.flag === 'outlier' ? WORSE : NEUTRAL_MARK} />)}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );
}

function CorrelationChart({ cls, xKey, yKey, onOpenRig }) {
    const px = cls.params.find((p) => p.key === xKey);
    const py = cls.params.find((p) => p.key === yKey);
    const pts = cls.units
        .filter((u) => u.values[xKey]?.avg != null && u.values[yKey]?.avg != null)
        .map((u) => ({ x: u.values[xKey].avg, y: u.values[yKey].avg, rigId: u.rigId, grade: u.health.grade }));
    if (!px || !py || !pts.length) return <Typography variant="caption" color="text.secondary" sx={{ display: 'block', py: 6, textAlign: 'center' }}>Pick two parameters with data.</Typography>;
    const byGrade = (g) => pts.filter((p) => p.grade === g);
    return (
        <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 12, right: 16, bottom: 18, left: -4 }}>
                <CartesianGrid stroke={grid} />
                <XAxis type="number" dataKey="x" name={px.label} stroke={axis} fontSize={11} domain={['auto', 'auto']} tickLine={false}
                    label={{ value: `${px.label} (${px.unit})`, position: 'insideBottom', offset: -10, fill: axis, fontSize: 11 }} />
                <YAxis type="number" dataKey="y" name={py.label} stroke={axis} fontSize={11} domain={['auto', 'auto']} tickLine={false} axisLine={false}
                    label={{ value: `${py.label} (${py.unit})`, angle: -90, position: 'insideLeft', offset: 18, fill: axis, fontSize: 11 }} />
                <ZAxis range={[90, 90]} />
                <ChartTooltip contentStyle={tooltipStyle} cursor={{ strokeDasharray: '3 3', stroke: axis }}
                    content={({ payload }) => {
                        const p = payload && payload[0] && payload[0].payload;
                        if (!p) return null;
                        return (
                            <Box sx={{ ...tooltipStyle, p: 1 }}>
                                <b>{p.rigId}</b> · {GRADE[p.grade].label}<br />
                                {px.label}: {fmtNum(p.x, 2)} {px.unit}<br />{py.label}: {fmtNum(p.y, 2)} {py.unit}
                            </Box>
                        );
                    }} />
                {['good', 'watch', 'act'].map((g) => (
                    <Scatter key={g} name={GRADE[g].label} data={byGrade(g)} fill={GRADE[g].color} stroke="#0f172a" strokeWidth={2}
                        isAnimationActive={false} cursor="pointer" onClick={(d) => onOpenRig(d.rigId)} />
                ))}
            </ScatterChart>
        </ResponsiveContainer>
    );
}

function CausesChart({ causes }) {
    if (!causes.length) return <Typography variant="caption" color="text.secondary" sx={{ display: 'block', py: 3, textAlign: 'center' }}>No downtime in the window.</Typography>;
    return (
        <ResponsiveContainer width="100%" height={Math.max(90, causes.length * 26 + 20)}>
            <BarChart data={causes} layout="vertical" margin={{ top: 0, right: 30, bottom: 0, left: 8 }} barCategoryGap={4}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="reason" stroke={axis} fontSize={11} width={96} tickLine={false} axisLine={false} />
                <ChartTooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                    formatter={(v, _n, p) => [`${fmtNum(v, 1)} h · ${p.payload.events} events`, 'Downtime']} />
                <Bar dataKey="hours" fill={WORSE} radius={[0, 4, 4, 0]} isAnimationActive={false}
                    label={{ position: 'right', fill: '#cbd5e1', fontSize: 11, formatter: (v) => `${fmtNum(v, 1)} h` }} />
            </BarChart>
        </ResponsiveContainer>
    );
}

// --- Page ---------------------------------------------------------------------
export default function EquipmentPerformance() {
    const nav = useNavigate();
    const [hours, setHours] = useState(6);
    const [days, setDays] = useState(30);
    const [data, setData] = useState(null);
    const [err, setErr] = useState('');
    const [clsId, setClsId] = useState('engine');
    const [paramKey, setParamKey] = useState(null);
    const [xKey, setXKey] = useState(null);
    const [yKey, setYKey] = useState(null);

    const load = useCallback(() => {
        api.equipmentPerformance(hours, days)
            .then((d) => { setData(d); setErr(''); })
            .catch((e) => { if (e?.response?.status !== 401) setErr(e?.response?.data?.error || 'Failed to load equipment performance'); });
    }, [hours, days]);
    useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

    const cls = useMemo(() => data?.classes.find((c) => c.id === clsId) || data?.classes[0], [data, clsId]);
    // Default the charts to the class's first judged parameter / a judged pair.
    useEffect(() => {
        if (!cls) return;
        const judged = cls.params.filter((p) => p.better !== 'none');
        if (!cls.params.some((p) => p.key === paramKey)) setParamKey((judged[0] || cls.params[0]).key);
        if (!cls.params.some((p) => p.key === xKey)) setXKey(cls.params[0].key);
        if (!cls.params.some((p) => p.key === yKey)) setYKey((judged.find((p) => p.key !== cls.params[0].key) || cls.params[1] || cls.params[0]).key);
    }, [cls]); // eslint-disable-line react-hooks/exhaustive-deps

    const openRig = (id) => nav(`/rigs/${encodeURIComponent(id)}`);
    const param = cls?.params.find((p) => p.key === paramKey);

    if (!data) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                {err ? <Alert severity="error">{err}</Alert> : <CircularProgress />}
            </Box>
        );
    }

    return (
        <Box sx={{ height: '100%', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 2, pb: 2 }}>
            {/* Header + windows */}
            <Stack direction="row" alignItems="center" spacing={2} flexWrap="wrap" useFlexGap>
                <Box sx={{ flexGrow: 1 }}>
                    <Typography variant="h5" fontWeight={800}>Equipment Performance</Typography>
                    <Typography variant="body2" color="text.secondary">
                        The same equipment on every rig, side by side — operating condition, reliability and maintenance.
                    </Typography>
                </Box>
                <Stack direction="row" alignItems="center" spacing={1}>
                    <Typography variant="caption" color="text.secondary">Condition</Typography>
                    <ToggleButtonGroup size="small" exclusive value={hours} onChange={(_e, v) => v && setHours(v)}>
                        <ToggleButton value={1}>1h</ToggleButton>
                        <ToggleButton value={6}>6h</ToggleButton>
                        <ToggleButton value={24}>24h</ToggleButton>
                        <ToggleButton value={168}>7d</ToggleButton>
                    </ToggleButtonGroup>
                </Stack>
                <Stack direction="row" alignItems="center" spacing={1}>
                    <Typography variant="caption" color="text.secondary">Reliability</Typography>
                    <ToggleButtonGroup size="small" exclusive value={days} onChange={(_e, v) => v && setDays(v)}>
                        <ToggleButton value={7}>7d</ToggleButton>
                        <ToggleButton value={30}>30d</ToggleButton>
                        <ToggleButton value={90}>90d</ToggleButton>
                    </ToggleButtonGroup>
                </Stack>
            </Stack>
            {err && <Alert severity="warning" onClose={() => setErr('')}>{err}</Alert>}

            {/* Equipment classes */}
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 1.5 }}>
                {data.classes.map((c) => <ClassCard key={c.id} cls={c} selected={c.id === cls.id} onSelect={() => setClsId(c.id)} />)}
            </Box>

            {/* Benchmark + findings */}
            <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', lg: 'row' }, alignItems: 'stretch' }}>
                <Paper sx={{ flex: '3 1 0', minWidth: 0, p: 1.5 }}>
                    <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mb: 1 }} flexWrap="wrap" useFlexGap>
                        <Typography variant="h6">{cls.name} — fleet benchmark</Typography>
                        <Typography variant="caption" color="text.secondary">
                            worst first · tint: <Box component="span" sx={{ color: BETTER, fontWeight: 700 }}>better</Box> / <Box component="span" sx={{ color: WORSE, fontWeight: 700 }}>worse</Box> than fleet median · click a column to chart it, a row to open the rig
                        </Typography>
                    </Stack>
                    <TableContainer sx={{ maxHeight: 520 }}>
                        <Table size="small" stickyHeader sx={{ '& th, & td': { px: 1 } }}>
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={headSx}>Rig</TableCell>
                                    <TableCell sx={headSx}>Health</TableCell>
                                    <TableCell sx={headSx} title={`Trend of ${cls.params.find((p) => p.key === cls.key)?.label || cls.key}`}>
                                        Trend
                                    </TableCell>
                                    {cls.params.map((p) => (
                                        <TableCell key={p.key} align="right" onClick={() => setParamKey(p.key)}
                                            sx={{ ...headSx, cursor: 'pointer', color: p.key === paramKey ? '#38bdf8' : headSx.color,
                                                borderBottom: p.key === paramKey ? '2px solid #38bdf8' : undefined }}
                                            title={`${p.label} (${p.unit})${p.better === 'none' ? ' — set by the job; shown for context' : ''}${p.hi != null ? ` · limit ≤ ${p.hi}` : ''}${p.lo != null ? ` · limit ≥ ${p.lo}` : ''}`}>
                                            <div>{p.label}</div>
                                            <Box sx={{ fontSize: 10, fontWeight: 500, textTransform: 'none', color: 'text.disabled' }}>
                                                {p.unit} · med {fmtNum(cls.stats[p.key]?.median, 1)}
                                            </Box>
                                        </TableCell>
                                    ))}
                                    <TableCell align="right" sx={headSx} title={`Downtime of this equipment in the last ${data.windowDays} days`}>Downtime</TableCell>
                                    <TableCell align="right" sx={headSx} title="Mean time to repair">MTTR</TableCell>
                                    <TableCell align="right" sx={headSx} title="Run-hours until next PM">Next PM</TableCell>
                                    <TableCell align="right" sx={headSx} title="Average run-hours per day as % of 24 h (last 7 days)">Util.</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {cls.units.map((u) => (
                                    <TableRow key={u.rigId} hover onClick={() => openRig(u.rigId)} sx={{ cursor: 'pointer' }}>
                                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                                            <Typography sx={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.82rem' }}>{u.rigId}</Typography>
                                            <Typography variant="caption" color="text.secondary">{u.assetUnit || '—'}</Typography>
                                        </TableCell>
                                        <TableCell><HealthCell h={u.health} /></TableCell>
                                        <TableCell><Spark data={u.trend} /></TableCell>
                                        {cls.params.map((p) => <ValueCell key={p.key} param={p} cell={u.values[p.key]} flag={u.flags?.[p.key]} />)}
                                        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                                            {u.reliability.open ? <Box component="span" sx={{ color: GRADE.act.color, fontWeight: 800, mr: 0.5 }}>OPEN</Box> : null}
                                            {fmtNum(u.reliability.downtimeH, 1)} h
                                        </TableCell>
                                        <TableCell align="right">{u.reliability.mttrH != null ? `${fmtNum(u.reliability.mttrH, 1)} h` : '—'}</TableCell>
                                        <PmCell pm={u.pm} />
                                        <TableCell align="right">{u.utilizationPct != null ? `${u.utilizationPct}%` : '—'}</TableCell>
                                    </TableRow>
                                ))}
                                {!cls.units.length && (
                                    <TableRow><TableCell colSpan={8 + cls.params.length}><Typography variant="body2" color="text.secondary">No rig reports this equipment yet.</Typography></TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Paper>

                <Stack spacing={2} sx={{ flex: '1 1 0', minWidth: 260, maxWidth: { lg: 340 } }}>
                    <Paper sx={{ p: 1.5, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                        <Typography variant="h6" sx={{ mb: 1 }}>Findings</Typography>
                        <Box sx={{ overflow: 'auto', maxHeight: 330, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                            {cls.insights.map((i, k) => {
                                const g = GRADE[i.severity === 'good' ? 'good' : i.severity];
                                const Icon = g.icon;
                                return (
                                    <Stack key={k} direction="row" spacing={1} alignItems="flex-start" onClick={() => openRig(i.rigId)}
                                        sx={{ p: 0.75, borderRadius: 1, cursor: 'pointer', '&:hover': { bgcolor: 'rgba(255,255,255,0.04)' } }}>
                                        <Icon sx={{ fontSize: 18, color: g.color, mt: '1px' }} titleAccess={g.label} />
                                        <Box sx={{ minWidth: 0 }}>
                                            <Typography sx={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.78rem' }}>
                                                {i.rigId} <Box component="span" sx={{ color: g.color, fontFamily: 'inherit', fontWeight: 800 }}>{g.label}</Box>
                                            </Typography>
                                            <Typography variant="body2" sx={{ lineHeight: 1.3 }}>{i.text}</Typography>
                                        </Box>
                                    </Stack>
                                );
                            })}
                            {!cls.insights.length && <Typography variant="body2" color="text.secondary">No issues found — every {cls.name.toLowerCase()} is in line with the fleet.</Typography>}
                        </Box>
                    </Paper>
                    <Paper sx={{ p: 1.5 }}>
                        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Downtime causes — last {data.windowDays} d</Typography>
                        <ErrorBoundary><CausesChart causes={cls.causes} /></ErrorBoundary>
                    </Paper>
                </Stack>
            </Box>

            {/* Spread + correlation */}
            <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', lg: 'row' } }}>
                <Paper sx={{ flex: '1.4 1 0', minWidth: 0, p: 1.5 }}>
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                        <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
                            Fleet spread — {param?.label} ({param?.unit}), avg over {data.windowHours >= 48 ? `${data.windowHours / 24} d` : `${data.windowHours} h`}
                        </Typography>
                        <Stack direction="row" spacing={1.5} sx={{ fontSize: 11, color: 'text.secondary' }}>
                            <span><Box component="span" sx={{ display: 'inline-block', width: 8, height: 8, bgcolor: NEUTRAL_MARK, borderRadius: '2px', mr: 0.5 }} />in line</span>
                            <span><Box component="span" sx={{ display: 'inline-block', width: 8, height: 8, bgcolor: WORSE, borderRadius: '2px', mr: 0.5 }} />unlike fleet</span>
                            <span><Box component="span" sx={{ display: 'inline-block', width: 8, height: 8, bgcolor: GRADE.act.color, borderRadius: '2px', mr: 0.5 }} />outside limit</span>
                        </Stack>
                    </Stack>
                    <Box sx={{ height: 260 }}>
                        <ErrorBoundary>{param && <SpreadChart cls={cls} param={param} onOpenRig={openRig} />}</ErrorBoundary>
                    </Box>
                </Paper>
                <Paper sx={{ flex: '1 1 0', minWidth: 0, p: 1.5 }}>
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }} flexWrap="wrap" useFlexGap>
                        <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>Correlation explorer</Typography>
                        <Select size="small" value={xKey || ''} onChange={(e) => setXKey(e.target.value)} sx={{ fontSize: 12, height: 28 }}>
                            {cls.params.map((p) => <MenuItem key={p.key} value={p.key}>X: {p.label}</MenuItem>)}
                        </Select>
                        <Select size="small" value={yKey || ''} onChange={(e) => setYKey(e.target.value)} sx={{ fontSize: 12, height: 28 }}>
                            {cls.params.map((p) => <MenuItem key={p.key} value={p.key}>Y: {p.label}</MenuItem>)}
                        </Select>
                    </Stack>
                    <Stack direction="row" spacing={1.5} sx={{ fontSize: 11, color: 'text.secondary', mb: 0.5 }}>
                        {['good', 'watch', 'act'].map((g) => (
                            <span key={g}><Box component="span" sx={{ display: 'inline-block', width: 8, height: 8, bgcolor: GRADE[g].color, borderRadius: '50%', mr: 0.5 }} />{GRADE[g].label}</span>
                        ))}
                        <span>· one dot per rig</span>
                    </Stack>
                    <Box sx={{ height: 236 }}>
                        <ErrorBoundary>{xKey && yKey && <CorrelationChart cls={cls} xKey={xKey} yKey={yKey} onOpenRig={openRig} />}</ErrorBoundary>
                    </Box>
                </Paper>
            </Box>

            <Typography variant="caption" color="text.secondary">
                Health index = 40% reliability (this equipment's availability over {data.windowDays} d; an open breakdown caps it) + 35% condition
                (−30 per parameter outside its limit, −15 per parameter clearly unlike the fleet: robust z ≥ {3.5} and ≥ 8% from the median, in the harmful direction)
                + 25% maintenance (PM ok 100 · due soon 75 · overdue 35, or 10 when over 100 h late). Load, RPM and strokes follow the job and are shown for context only.
            </Typography>
        </Box>
    );
}
