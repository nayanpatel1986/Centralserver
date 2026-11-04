import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Paper, Typography, Table, TableBody, TableCell, TableHead, TableRow, TableContainer,
    Grid, Chip, Stack, Alert, FormControl, InputLabel, Select, MenuItem, Tooltip,
} from '@mui/material';
import { CheckCircleOutline, Sync, CloudOff, ErrorOutline, History, HourglassEmpty } from '@mui/icons-material';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { KpiCard, StatusChip, HealthBar, fmtAgo } from './common';

// Minutes as "45 min" / "2 h 05 m".
const fmtMin = (m) => {
    if (m == null) return '—';
    if (m < 60) return `${m} min`;
    return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} m`;
};
const fmtClock = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'now');

// Backfill states (from lib/dataQuality.js), each with an icon + label, never colour alone.
const BACKFILL = {
    live: { label: 'Live', color: '#22c55e', icon: CheckCircleOutline, tip: 'No outage today' },
    recovered: { label: 'Recovered', color: '#22c55e', icon: History, tip: 'Every gap today was filled by the edge replaying its buffer' },
    backfilling: { label: 'Backfilling', color: '#38bdf8', icon: Sync, tip: 'The edge is replaying buffered data now' },
    awaiting: { label: 'Awaiting backfill', color: '#f59e0b', icon: HourglassEmpty, tip: 'No data is arriving; the gap fills if the edge replays its buffer when the link returns' },
    gaps: { label: 'Gaps not recovered', color: '#ef4444', icon: ErrorOutline, tip: 'Minutes with no data today that no backfill has filled' },
    'no-data': { label: 'No data', color: '#64748b', icon: CloudOff, tip: 'This rig has not sent telemetry yet' },
};

function BackfillCell({ c }) {
    if (!c) return <TableCell sx={{ color: 'text.disabled' }}>—</TableCell>;
    const b = BACKFILL[c.backfill] || BACKFILL['no-data'];
    const Icon = b.icon;
    return (
        <TableCell title={b.tip} sx={{ whiteSpace: 'nowrap' }}>
            <Stack direction="row" alignItems="center" spacing={0.5} sx={{ color: b.color }}>
                <Icon sx={{ fontSize: 16 }} />
                <Typography variant="body2" sx={{ fontWeight: 700 }}>{b.label}</Typography>
            </Stack>
            <Typography variant="caption" color="text.secondary">
                {c.today.backfilledMin ? `${fmtMin(c.today.backfilledMin)} recovered today` : c.lastBackfillAt ? `last ${fmtAgo(c.lastBackfillAt)}` : 'no backfill needed'}
            </Typography>
        </TableCell>
    );
}

function OutageCell({ day, windows, today }) {
    if (!day || day.outageMin == null || !day.spanMin) {
        return <TableCell align="right" sx={{ color: 'text.disabled' }} title="Not tracked for this day yet">—</TableCell>;
    }
    const color = day.outageMin === 0 ? 'text.secondary' : day.outageMin < 15 ? '#f59e0b' : '#ef4444';
    const list = today && windows && windows.length ? (
        <Box sx={{ fontSize: 12 }}>
            <b>Outage windows (newest first)</b>
            {windows.map((w, i) => (
                <div key={i}>{fmtClock(w.from)} – {w.open ? 'ongoing' : fmtClock(w.to)} · {fmtMin(w.minutes)}</div>
            ))}
        </Box>
    ) : `Data coverage ${day.coveragePct ?? '—'}% of ${fmtMin(day.spanMin)}`;
    return (
        <Tooltip arrow title={list}>
            <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                <Typography variant="body2" sx={{ fontWeight: day.outageMin ? 800 : 500, color }}>{fmtMin(day.outageMin)}</Typography>
                <Typography variant="caption" color="text.secondary">{day.coveragePct ?? '—'}% covered</Typography>
            </TableCell>
        </Tooltip>
    );
}

export default function DataQuality() {
    const nav = useNavigate();
    const { user } = useAuth();
    const viewerAsset = user?.role === 'viewer' ? user.assetUnit : null;
    const [rows, setRows] = useState([]);
    const [err, setErr] = useState('');
    const [loading, setLoading] = useState(true);
    const [unit, setUnit] = useState('all');

    const load = useCallback(() => {
        setErr('');
        api.dataQuality()
            .then((d) => setRows(Array.isArray(d) ? d : []))
            .catch((e) => { if (e?.response?.status !== 401) setErr(e?.response?.data?.error || 'Failed to load data-quality view'); })
            .finally(() => setLoading(false));
    }, []);
    useEffect(() => { setLoading(true); load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, [load]);

    const unitOf = (r) => r.assetUnit || r.field || 'Unassigned';
    const units = useMemo(() => [...new Set(rows.map(unitOf))].sort((a, b) => a.localeCompare(b)), [rows]);
    const shown = useMemo(() => rows
        .filter((r) => unit === 'all' || unitOf(r) === unit)
        .sort((a, b) => unitOf(a).localeCompare(unitOf(b)) || a.rigId.localeCompare(b.rigId, undefined, { numeric: true })), [rows, unit]);

    const reporting = shown.filter((r) => r.lastDataAt);
    const avg = reporting.length ? Math.round(reporting.reduce((s, r) => s + (r.healthScore || 0), 0) / reporting.length) : 0;
    const stale = shown.filter((r) => r.staleFlag && !r.offline).length;
    const tracked = shown.some((r) => r.coverageTracking);
    const sum = (f) => shown.reduce((s, r) => s + (f(r) || 0), 0);
    const outToday = sum((r) => r.coverage?.today.outageMin);
    const outPrev = sum((r) => r.coverage?.prev.outageMin);
    const prevTracked = shown.some((r) => r.coverage?.prev.spanMin);
    const rigsOutToday = shown.filter((r) => r.coverage?.today.outageMin > 0).length;
    const recovered = sum((r) => r.coverage?.today.backfilledMin);
    const pending = shown.filter((r) => ['awaiting', 'backfilling'].includes(r.coverage?.backfill)).length;

    return (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <Stack direction="row" alignItems="center" spacing={2} mb={2} flexWrap="wrap" useFlexGap>
                <Typography variant="h5" fontWeight={800} sx={{ flexGrow: 1 }}>Data Quality Monitor</Typography>
                <FormControl size="small" sx={{ minWidth: 190 }}>
                    <InputLabel id="dq-unit">Asset unit</InputLabel>
                    <Select labelId="dq-unit" label="Asset unit" value={viewerAsset ? (units[0] || 'all') : unit} disabled={!!viewerAsset} onChange={(e) => setUnit(e.target.value)}>
                        <MenuItem value="all">All units</MenuItem>
                        {units.map((u) => <MenuItem key={u} value={u}>{u}</MenuItem>)}
                    </Select>
                </FormControl>
            </Stack>
            {err && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErr('')}>{err}</Alert>}
            {!loading && rows.length > 0 && !tracked && (
                <Alert severity="info" sx={{ mb: 2 }}>
                    Outage and backfill tracking is not enabled on this database. Apply the <code>rig_data_coverage</code> section of
                    <code> db/init.sql</code> once as the database owner, then restart the backend.
                </Alert>
            )}

            <Grid container spacing={2} mb={2}>
                <Grid item xs={6} md={2}><KpiCard label="Avg freshness score" value={avg} sub="target ≥ 98" color={avg >= 98 ? 'success.main' : 'warning.main'} /></Grid>
                <Grid item xs={6} md={2}><KpiCard label="Reporting rigs" value={reporting.length} sub={`of ${shown.length} · ${stale} stale (lag > 30 s)`} /></Grid>
                <Grid item xs={6} md={2}><KpiCard label="Outage today" value={tracked ? fmtMin(outToday) : '—'} sub={tracked ? `${rigsOutToday} rig${rigsOutToday !== 1 ? 's' : ''} affected` : 'not tracked'} color={outToday ? 'warning.main' : 'success.main'} /></Grid>
                <Grid item xs={6} md={2}><KpiCard label="Outage previous day" value={tracked && prevTracked ? fmtMin(outPrev) : '—'} sub={tracked && prevTracked ? 'all selected rigs' : 'tracking started today'} color={outPrev ? 'warning.main' : 'text.primary'} /></Grid>
                <Grid item xs={6} md={2}><KpiCard label="Recovered by backfill" value={tracked ? fmtMin(recovered) : '—'} sub="today" color="#38bdf8" /></Grid>
                <Grid item xs={6} md={2}><KpiCard label="Backfill pending" value={tracked ? pending : '—'} sub="awaiting or replaying now" color={pending ? 'warning.main' : 'success.main'} /></Grid>
            </Grid>

            <Paper sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                <TableContainer sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
                    <Table size="small" stickyHeader>
                        <TableHead>
                            <TableRow>
                                <TableCell>Rig</TableCell>
                                <TableCell>Unit</TableCell>
                                <TableCell>Status</TableCell>
                                <TableCell sx={{ minWidth: 140 }}>Health score</TableCell>
                                <TableCell align="right">Tags</TableCell>
                                <TableCell align="right">Sync lag</TableCell>
                                <TableCell align="right" title="Minutes with no telemetry today, after any backfill">Outage today</TableCell>
                                <TableCell align="right" title="Minutes with no telemetry on the previous day">Outage prev. day</TableCell>
                                <TableCell>Backfill</TableCell>
                                <TableCell align="right">Last data</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {shown.map((r) => (
                                <TableRow key={r.rigId} hover sx={{ cursor: 'pointer' }} onClick={() => nav(`/rigs/${r.rigId}`)}>
                                    <TableCell>
                                        <Typography variant="body2" fontWeight={700} sx={{ fontFamily: 'monospace' }}>{r.rigId}</Typography>
                                        <Typography variant="caption" color="text.secondary">{r.name}</Typography>
                                    </TableCell>
                                    <TableCell><Typography variant="body2">{unitOf(r)}</Typography></TableCell>
                                    <TableCell><StatusChip status={r.status} /></TableCell>
                                    <TableCell><HealthBar value={r.healthScore} /></TableCell>
                                    <TableCell align="right" title={r.missingTags ? `${r.missingTags} expected tag(s) never received` : 'All expected tags present'}>
                                        {r.status === 'pending' ? '—' : (
                                            <>
                                                <Typography variant="body2" color={r.missingTags ? 'warning.main' : 'text.primary'}>{r.expectedMetrics - r.missingTags}/{r.expectedMetrics}</Typography>
                                                {r.missingTags > 0 && <Typography variant="caption" color="warning.main">{r.missingTags} missing</Typography>}
                                            </>
                                        )}
                                    </TableCell>
                                    <TableCell align="right"><Typography variant="body2" color={r.staleFlag ? 'warning.main' : 'text.secondary'}>{r.syncLagSec == null ? '—' : `${r.syncLagSec}s`}</Typography></TableCell>
                                    <OutageCell day={r.coverage?.today} windows={r.coverage?.windows} today />
                                    <OutageCell day={r.coverage?.prev} />
                                    <BackfillCell c={r.coverage} />
                                    <TableCell align="right"><Typography variant="caption" color="text.secondary">{fmtAgo(r.lastDataAt)}</Typography></TableCell>
                                </TableRow>
                            ))}
                            {!loading && !shown.length && (
                                <TableRow><TableCell colSpan={10} align="center" sx={{ py: 5, color: 'text.secondary' }}>No rigs in this unit.</TableCell></TableRow>
                            )}
                            {loading && !rows.length && (
                                <TableRow><TableCell colSpan={10} align="center" sx={{ py: 5, color: 'text.secondary' }}>Loading data-quality view…</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
                <Typography variant="caption" color="text.secondary" sx={{ px: 2, py: 1 }}>
                    Outage = minutes with no telemetry, counted from the rig&apos;s first data and after any backfill; days follow {rows[0]?.timezone || 'Asia/Kolkata'}.
                    Backfill = data that reached central more than 3 minutes after it was recorded (the edge replaying its store-and-forward buffer). Hover an outage for its windows.
                </Typography>
            </Paper>
        </Box>
    );
}
