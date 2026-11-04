import React, { useEffect, useMemo, useState, useCallback } from 'react';
import axios from 'axios';
import {
    Box, Paper, Typography, Grid, Table, TableBody, TableCell, TableHead, TableRow, TableContainer,
    Button, Stack, Chip, ToggleButton, ToggleButtonGroup, Alert, FormControl, InputLabel, Select, MenuItem,
} from '@mui/material';
import { Download } from '@mui/icons-material';
import { api } from '../api';
import { KpiCard, StatusChip, fmtAgo } from './common';

// Reporting periods (audit #29): snapshot is the live current-state view; the others
// aggregate over the trailing window on the backend.
const PERIODS = [
    { value: 'snapshot', label: 'Snapshot' },
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' },
];

export default function Reports() {
    const [period, setPeriod] = useState('snapshot');
    const [rows, setRows] = useState([]);
    const [windowInterval, setWindowInterval] = useState('');
    const [err, setErr] = useState('');
    const [loading, setLoading] = useState(true);
    const [unit, setUnit] = useState('all');
    const [rig, setRig] = useState('all');
    const [registry, setRegistry] = useState([]);   // all rigs, for the filter menus

    useEffect(() => { api.rigsConfig().then((d) => setRegistry(Array.isArray(d) ? d : [])).catch(() => {}); }, []);
    const unitOf = (r) => r.assetUnit || r.asset_unit || r.field || 'Unassigned';
    const units = useMemo(() => [...new Set(registry.map(unitOf))].sort((a, b) => a.localeCompare(b)), [registry]);
    const rigOptions = useMemo(() => registry
        .filter((r) => unit === 'all' || unitOf(r) === unit)
        .sort((a, b) => a.rig_id.localeCompare(b.rig_id, undefined, { numeric: true })), [registry, unit]);
    const filter = useMemo(() => ({ ...(unit !== 'all' ? { unit } : {}), ...(rig !== 'all' ? { rig } : {}) }), [unit, rig]);

    const load = useCallback(() => {
        setErr('');
        api.report(period === 'snapshot' ? undefined : period, filter)
            // Backend now returns { period, windowInterval, rows } for ALL periods (audit #29).
            .then((d) => {
                setRows(Array.isArray(d) ? d : (d?.rows || []));
                setWindowInterval(Array.isArray(d) ? '' : (d?.windowInterval || ''));
            })
            .catch((e) => { if (e?.response?.status !== 401) setErr(e?.response?.data?.error || 'Failed to load report'); })
            .finally(() => setLoading(false));
    }, [period, filter]);
    useEffect(() => { setLoading(true); load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);

    const download = async () => {
        try {
            // CSV export is period-aware: pass the selected period (omit for snapshot).
            const res = await axios.get('/api/reports/fleet.csv', {
                responseType: 'blob',
                params: { ...(period === 'snapshot' ? {} : { period }), ...filter },
            });
            const url = URL.createObjectURL(res.data);
            const a = document.createElement('a');
            const scope = rig !== 'all' ? `-${rig}` : unit !== 'all' ? `-${unit.replace(/[^A-Za-z0-9]+/g, '_')}` : '';
            a.href = url; a.download = `crmf-fleet-report-${period}${scope}.csv`; a.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            if (e?.response?.status !== 401) setErr('CSV export failed');
        }
    };

    // Defensive across snapshot vs period rows (finding #3): period rows carry
    // sample_buckets / alarm_events instead of last_data_at / alarm_active.
    const isSnap = period === 'snapshot';
    const reporting = rows.filter((r) => r.last_data_at || r.sample_buckets > 0).length;
    const alarms = rows.reduce((s, r) => s + ((isSnap ? r.alarm_active : r.alarm_events) || 0), 0);
    const live = rows.filter((r) => r.gate === 'live').length;
    const avail = rows.filter((r) => r.data_availability_pct != null);
    const availAvg = avail.length ? Math.round((avail.reduce((s, r) => s + r.data_availability_pct, 0) / avail.length) * 10) / 10 : null;

    return (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <Stack direction="row" alignItems="center" mb={2} spacing={2} flexWrap="wrap" useFlexGap>
                <Typography variant="h5" fontWeight={800} sx={{ flexGrow: 1 }}>Reports</Typography>
                <FormControl size="small" sx={{ minWidth: 170 }}>
                    <InputLabel id="rep-unit">Asset unit</InputLabel>
                    <Select labelId="rep-unit" label="Asset unit" value={unit} onChange={(e) => { setUnit(e.target.value); setRig('all'); }}>
                        <MenuItem value="all">All units</MenuItem>
                        {units.map((u) => <MenuItem key={u} value={u}>{u}</MenuItem>)}
                    </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: 170 }}>
                    <InputLabel id="rep-rig">Rig</InputLabel>
                    <Select labelId="rep-rig" label="Rig" value={rig} onChange={(e) => setRig(e.target.value)}>
                        <MenuItem value="all">All rigs{unit !== 'all' ? ' in unit' : ''}</MenuItem>
                        {rigOptions.map((r) => <MenuItem key={r.rig_id} value={r.rig_id}>{r.rig_id}</MenuItem>)}
                    </Select>
                </FormControl>
                <ToggleButtonGroup size="small" exclusive value={period} onChange={(_e, v) => v && setPeriod(v)}>
                    {PERIODS.map((p) => <ToggleButton key={p.value} value={p.value}>{p.label}</ToggleButton>)}
                </ToggleButtonGroup>
                <Button variant="contained" startIcon={<Download />} onClick={download}>Fleet report (CSV)</Button>
            </Stack>

            {err && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErr('')}>{err}</Alert>}

            <Grid container spacing={2} mb={2}>
                <Grid item xs={6} md={3}><KpiCard label="Rigs in report" value={rows.length} sub={`${live} live (Phase 2)`} /></Grid>
                <Grid item xs={6} md={3}><KpiCard label={isSnap ? 'Reporting now' : 'Reported in window'} value={reporting} /></Grid>
                <Grid item xs={6} md={3}>{isSnap
                    ? <KpiCard label="Active alarms" value={alarms} color={alarms ? 'warning.main' : 'success.main'} />
                    : <KpiCard label="Alarm events" value={alarms} sub="state changes in window" color={alarms ? 'warning.main' : 'success.main'} />}</Grid>
                <Grid item xs={6} md={3}><KpiCard label="Data availability" value={isSnap ? '—' : (availAvg == null ? '—' : `${availAvg}%`)}
                    sub={isSnap ? 'pick a period' : 'avg minutes with telemetry'} color={availAvg != null && availAvg < 98 ? 'warning.main' : 'success.main'} /></Grid>
            </Grid>

            <Paper sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                <Typography variant="h6" sx={{ p: 2, pb: 1 }}>
                    Consolidated fleet operations report
                    {period !== 'snapshot' && <Chip size="small" variant="outlined" label={period} sx={{ ml: 1, textTransform: 'capitalize' }} />}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ px: 2 }}>
                    {period === 'snapshot'
                        ? 'Auto-generated snapshot — DWR consolidation, adoption and data-quality (proposal §6.1 reporting).'
                        : `Consolidated ${period} report aggregated over the trailing window (proposal §6.1 reporting).`}
                    {windowInterval && (
                        <Chip size="small" variant="outlined" label={`window: ${windowInterval}`} sx={{ ml: 1 }} />
                    )}
                </Typography>
                <TableContainer sx={{ mt: 1, flex: 1, minHeight: 0, overflow: 'auto' }}>
                    <Table size="small" stickyHeader>
                        <TableHead><TableRow>
                            <TableCell>Rig</TableCell><TableCell>Unit</TableCell><TableCell>Status</TableCell>
                            {isSnap ? (<>
                                <TableCell>Activity</TableCell><TableCell align="right">Health</TableCell><TableCell align="right">Tags</TableCell>
                                <TableCell align="right">Alarms (P1)</TableCell>
                            </>) : (<>
                                <TableCell align="right">Data availability</TableCell><TableCell align="right">Outage</TableCell>
                                <TableCell align="right">Tags seen</TableCell><TableCell align="right">Alarm events</TableCell>
                                <TableCell align="right">Activity changes</TableCell><TableCell align="right">Connections (pass)</TableCell>
                            </>)}
                            <TableCell>Stage-gate</TableCell><TableCell align="right">Adoption</TableCell>
                            {isSnap && <TableCell align="right">Last data</TableCell>}
                        </TableRow></TableHead>
                        <TableBody>
                            {rows.map((r) => (
                                <TableRow key={r.rig_id} hover>
                                    <TableCell>
                                        <Typography variant="body2" fontWeight={700} sx={{ fontFamily: 'monospace' }}>{r.rig_id}</Typography>
                                        {r.name !== r.rig_id && <Typography variant="caption" color="text.secondary">{r.name}</Typography>}
                                    </TableCell>
                                    <TableCell><Typography variant="body2">{unitOf(r)}</Typography></TableCell>
                                    <TableCell><StatusChip status={r.status} /></TableCell>
                                    {isSnap ? (<>
                                        <TableCell><Typography variant="caption">{r.active_activity || '—'}</Typography></TableCell>
                                        <TableCell align="right">{r.health_score ?? 0}</TableCell>
                                        <TableCell align="right">{r.metric_count ?? 0}</TableCell>
                                        <TableCell align="right">{r.alarm_active ?? 0}{r.alarm_p1 ? <Chip size="small" color="error" label={`P1·${r.alarm_p1}`} sx={{ ml: 0.5 }} /> : ''}</TableCell>
                                    </>) : (<>
                                        <TableCell align="right" sx={{ color: r.data_availability_pct != null && r.data_availability_pct < 98 ? 'warning.main' : 'text.primary', fontWeight: 700 }}>
                                            {r.data_availability_pct == null ? '—' : `${r.data_availability_pct}%`}
                                        </TableCell>
                                        <TableCell align="right">{r.outage_min == null ? '—' : r.outage_min < 60 ? `${r.outage_min} min` : `${Math.floor(r.outage_min / 60)} h ${String(r.outage_min % 60).padStart(2, '0')} m`}</TableCell>
                                        <TableCell align="right">{r.distinct_metrics || '—'}</TableCell>
                                        <TableCell align="right">{r.alarm_events ?? 0}</TableCell>
                                        <TableCell align="right">{r.activity_events ?? 0}</TableCell>
                                        <TableCell align="right">{r.connection_total ? `${r.connection_total} (${r.connection_pass_rate}%)` : '—'}</TableCell>
                                    </>)}
                                    <TableCell><Typography variant="caption">{r.gate || '—'}</Typography></TableCell>
                                    <TableCell align="right">{r.adoption_pct ?? 0}%</TableCell>
                                    {isSnap && <TableCell align="right"><Typography variant="caption" color="text.secondary">{fmtAgo(r.last_data_at)}</Typography></TableCell>}
                                </TableRow>
                            ))}
                            {!loading && !rows.length && (
                                <TableRow><TableCell colSpan={12} align="center" sx={{ py: 5, color: 'text.secondary' }}>No rigs match this unit / rig for the period.</TableCell></TableRow>
                            )}
                            {loading && !rows.length && (
                                <TableRow><TableCell colSpan={12} align="center" sx={{ py: 5, color: 'text.secondary' }}>Loading report…</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Paper>
        </Box>
    );
}
