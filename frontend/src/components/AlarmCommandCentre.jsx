import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Paper, Typography, Table, TableBody, TableCell, TableHead, TableRow, TableContainer,
    ToggleButton, ToggleButtonGroup, Stack, Chip, Alert,
} from '@mui/material';
import { api } from '../api';
import { socket } from '../socket';
import { PriorityChip, fmtAgo, UnitFilter, unitOf } from './common';
import NotificationsPanel from './NotificationsPanel';

export default function AlarmCommandCentre() {
    const nav = useNavigate();
    const [priority, setPriority] = useState('all');
    const [unit, setUnit] = useState('all');
    const [rows, setRows] = useState([]);
    const [err, setErr] = useState('');
    const [loading, setLoading] = useState(true);

    const load = useCallback(() => {
        setErr('');
        api.alarms(priority === 'all' ? undefined : priority)
            .then((d) => setRows(Array.isArray(d) ? d : []))
            .catch((e) => { if (e?.response?.status !== 401) setErr(e?.response?.data?.error || 'Failed to load alarms'); })
            .finally(() => setLoading(false));
    }, [priority]);

    useEffect(() => { setLoading(true); load(); const t = setInterval(load, 4000); return () => clearInterval(t); }, [load]);
    useEffect(() => {
        // Every rig batch emits fleet_update, so reloading on each one fired several
        // /api/alarms requests per second; coalesce socket triggers to one per 2 s.
        let timer = null;
        const h = () => { if (!timer) timer = setTimeout(() => { timer = null; load(); }, 2000); };
        socket.on('alarm_update', h); socket.on('fleet_update', h);
        return () => { clearTimeout(timer); socket.off('alarm_update', h); socket.off('fleet_update', h); };
    }, [load]);

    const shown = useMemo(() => (unit === 'all' ? rows : rows.filter((r) => unitOf(r) === unit)), [rows, unit]);
    const p1 = shown.reduce((s, r) => s + (r.p1 || 0), 0);

    return (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <Stack direction="row" alignItems="center" spacing={2} mb={2} flexWrap="wrap" useFlexGap>
                <Typography variant="h5" fontWeight={800} sx={{ flexGrow: 1 }}>Alarm Command Centre</Typography>
                <UnitFilter value={unit} onChange={setUnit} />
                <ToggleButtonGroup size="small" exclusive value={priority} onChange={(_e, v) => v && setPriority(v)}>
                    <ToggleButton value="all">All</ToggleButton>
                    <ToggleButton value="p1">P1</ToggleButton>
                    <ToggleButton value="p2">P2</ToggleButton>
                    <ToggleButton value="p3">P3</ToggleButton>
                </ToggleButtonGroup>
            </Stack>

            {err && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErr('')}>{err}</Alert>}
            {p1 > 0
                ? <Alert severity="error" sx={{ mb: 2 }}>{p1} priority-1 condition(s) active — ESD / lockout / well-control. Read-only: the CRMF surfaces these for surveillance; it never actuates rig control.</Alert>
                : <Alert severity="success" sx={{ mb: 2 }}>No priority-1 conditions {unit === 'all' ? 'across the fleet' : `in ${unit}`}.</Alert>}

            <Paper sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                <TableContainer sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
                    <Table size="small" stickyHeader>
                        <TableHead>
                            <TableRow>
                                <TableCell>Rig</TableCell>
                                <TableCell>Highest</TableCell>
                                <TableCell align="right">Active</TableCell>
                                <TableCell align="right">Unack</TableCell>
                                <TableCell align="right">P1</TableCell>
                                <TableCell align="right">P2</TableCell>
                                <TableCell align="right">P3</TableCell>
                                <TableCell>Activity</TableCell>
                                <TableCell align="right">Last data</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {shown.map((r) => (
                                <TableRow key={r.rigId} hover sx={{ cursor: 'pointer' }} onClick={() => nav(`/rigs/${r.rigId}`)}>
                                    <TableCell>
                                        <Typography variant="body2" fontWeight={700}>{r.name}</Typography>
                                        <Typography variant="caption" color="text.secondary">{r.rigId}</Typography>
                                    </TableCell>
                                    <TableCell><PriorityChip priority={r.highest} /></TableCell>
                                    <TableCell align="right">{r.active}</TableCell>
                                    <TableCell align="right">{r.unack}</TableCell>
                                    <TableCell align="right">{r.p1 ? <Chip size="small" color="error" label={r.p1} /> : 0}</TableCell>
                                    <TableCell align="right">{r.p2 || 0}</TableCell>
                                    <TableCell align="right">{r.p3 || 0}</TableCell>
                                    <TableCell><Typography variant="caption">{r.activeActivity || '—'}</Typography></TableCell>
                                    <TableCell align="right"><Typography variant="caption" color="text.secondary">{fmtAgo(r.lastDataAt)}</Typography></TableCell>
                                </TableRow>
                            ))}
                            {!shown.length && <TableRow><TableCell colSpan={9} align="center" sx={{ py: 5, color: 'text.secondary' }}>{loading ? 'Loading alarms…' : 'No active alarms.'}</TableCell></TableRow>}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Paper>

            <Box sx={{ mt: 3 }}>
                <Typography variant="h6" sx={{ mb: 0.5 }}>Notifications</Typography>
                <NotificationsPanel />
            </Box>
        </Box>
    );
}
