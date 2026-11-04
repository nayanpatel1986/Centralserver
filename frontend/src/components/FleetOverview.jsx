import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Paper, Typography, Stack, ToggleButton, ToggleButtonGroup, TextField,
    InputAdornment, Chip, Select, MenuItem, FormControl, InputLabel, Button,
    Dialog, DialogTitle, DialogContent, DialogActions, Snackbar, Alert, Divider,
} from '@mui/material';
import { ChatBubbleOutline, OpenInNew, Search } from '@mui/icons-material';
import { useFleet } from '../context/FleetContext';
import { useAuth } from '../context/AuthContext';
import { STATUS_COLOR } from '../theme';
import FleetMap from './FleetMap';
import { api, phaseColor } from '../api';
import { socket } from '../socket';

// "21.63°N 73.00°E" — compact coordinates for the tile's hover text.
const fmtCoord = (lat, lon) => {
    const la = Number(lat), lo = Number(lon);
    if (lat == null || lon == null || !Number.isFinite(la) || !Number.isFinite(lo)) return '';
    return `${Math.abs(la).toFixed(2)}°${la >= 0 ? 'N' : 'S'} ${Math.abs(lo).toFixed(2)}°${lo >= 0 ? 'E' : 'W'}`;
};
// Activity codes arrive as RIH / MAKE_UP / well.started; show them readably.
const fmtOperation = (a) => (a ? String(a).replace(/^well\./, 'well ').replace(/_/g, ' ') : '');

// Minimal rig tile, three lines: rig ID (+ alarm priority only when one is
// active), the current well, and the operation in progress with the rig's
// data-quality score. Status is shown once, by the coloured left edge; the rig
// name and location are in the hover text. Offline / pending rigs are dimmed.
function RigTile({ rig, onOpen }) {
    const [zoom, setZoom] = useState(false);
    const color = STATUS_COLOR[rig.status] || STATUS_COLOR.pending;
    const live = rig.status !== 'offline' && rig.status !== 'pending';
    const well = rig.currentWellName || rig.activeJob || '';
    const operation = fmtOperation(rig.activeActivity);
    const opColor = live && operation ? phaseColor(rig.activeActivity) : 'text.disabled';
    const place = [rig.field, rig.assetUnit, fmtCoord(rig.latitude, rig.longitude)].filter(Boolean).join(' · ');
    const dq = live ? Math.round(rig.healthScore || 0) : null;
    const dqColor = dq == null ? 'text.disabled' : dq >= 80 ? 'text.secondary' : dq >= 50 ? '#f59e0b' : '#ef4444';
    const tip = [`${rig.rigId} — ${rig.name} (${rig.status})`, `Well: ${well || '—'}`, `Operation: ${operation || '—'}`,
        `Location: ${place || '—'}`, `Data quality: ${dq == null ? '—' : `${dq}%`}`].join('\n');

    const open = () => { if (zoom) return; setZoom(true); setTimeout(() => onOpen(rig.rigId), 150); };
    const onKeyDown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } };

    return (
        <Paper
            role="button"
            tabIndex={0}
            aria-label={`Open rig ${rig.name} (${rig.rigId})`}
            onClick={open}
            onKeyDown={onKeyDown}
            title={tip}
            elevation={0}
            sx={{
                height: '100%', flex: '1 0 176px', maxWidth: 230,
                px: 1.25, py: 0.5, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 0.25,
                overflow: 'hidden', cursor: 'pointer', opacity: live ? 1 : 0.55,
                bgcolor: 'rgba(255,255,255,0.035)', border: '1px solid rgba(148,163,184,0.14)', borderLeft: `3px solid ${color}`, borderRadius: 1.5,
                transition: 'transform 150ms ease, border-color 150ms ease, background-color 150ms ease',
                transform: zoom ? 'scale(1.04)' : 'none',
                '&:hover': { bgcolor: 'rgba(255,255,255,0.06)', borderColor: 'rgba(148,163,184,0.32)', borderLeftColor: color },
                '&:focus-visible': { outline: `2px solid ${color}`, outlineOffset: 2 },
            }}
        >
            <Stack direction="row" alignItems="center" spacing={0.75} sx={{ minWidth: 0 }}>
                <Typography noWrap sx={{ fontSize: '0.8rem', fontWeight: 700, lineHeight: 1.3, color: 'text.secondary', flex: 1, minWidth: 0, fontFamily: 'monospace' }}>{rig.rigId}</Typography>
                {live && rig.alarm?.highest && <AlarmTag priority={rig.alarm.highest} />}
            </Stack>
            <Typography noWrap sx={{ fontSize: '1rem', fontWeight: 800, lineHeight: 1.25, color: well ? 'text.primary' : 'text.disabled' }}>
                {well || 'No active well'}
            </Typography>
            <Stack direction="row" alignItems="baseline" spacing={1} sx={{ minWidth: 0 }}>
                <Typography noWrap sx={{ fontSize: '0.72rem', fontWeight: 800, lineHeight: 1.3, letterSpacing: 0.6, textTransform: 'uppercase', color: opColor, flex: 1, minWidth: 0 }}>
                    {operation || (live ? 'Idle' : rig.status)}
                </Typography>
                <Typography title="Data quality" sx={{ fontSize: '0.72rem', fontWeight: 700, lineHeight: 1.3, color: dqColor, flex: '0 0 auto' }}>
                    {dq == null ? '—' : `${dq}%`}
                </Typography>
            </Stack>
        </Paper>
    );
}

// Compact alarm priority tag for a rig tile.
function AlarmTag({ priority }) {
    const c = { P1: '#ef4444', P2: '#f59e0b', P3: '#38bdf8' }[priority] || '#64748b';
    return (
        <Box component="span" sx={{ flex: '0 0 auto', px: 0.6, borderRadius: 0.75, fontSize: '0.68rem', fontWeight: 800, lineHeight: 1.6, color: c, bgcolor: `${c}22` }}>
            {priority}
        </Box>
    );
}

// One asset unit as a horizontal strip: the unit label on the left, then its rig
// tiles side by side (scrolling sideways if a unit has more than fit). Strips
// share the available height equally so the whole fleet fits on one screen.
function UnitRow({ unit, rigs, onOpen }) {
    const live = rigs.filter((r) => r.status === 'online' || r.status === 'degraded' || r.status === 'stale').length;
    const p1 = rigs.reduce((n, r) => n + (r.status !== 'offline' && r.status !== 'pending' ? (r.alarm?.p1 || 0) : 0), 0);
    return (
        <Box sx={{ flex: '1 1 0', minHeight: 66, maxHeight: 150, display: 'flex', gap: 1, alignItems: 'stretch' }}>
            <Box sx={{ width: 128, flex: '0 0 auto', py: 0.5, pr: 1, borderRight: '1px solid rgba(148,163,184,.2)',
                display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 0.5, minHeight: 0, overflow: 'hidden' }}>
                <Typography variant="body2" sx={{ fontWeight: 800, lineHeight: 1.15 }}>{unit}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.2 }}>
                    {rigs.length} rig{rigs.length !== 1 ? 's' : ''} · <Box component="span" sx={{ color: STATUS_COLOR.online }}>{live} live</Box>
                </Typography>
                {p1 > 0 && <Chip size="small" label={`${p1} P1`} color="error" sx={{ height: 18, fontWeight: 800, alignSelf: 'flex-start' }} />}
            </Box>
            <Box sx={{ flex: 1, minWidth: 0, display: 'flex', gap: 1, overflowX: 'auto', overflowY: 'hidden', py: 0.25 }}>
                {rigs.map((r) => <RigTile key={r.rigId} rig={r} onOpen={onOpen} />)}
            </Box>
        </Box>
    );
}

function MessageStatusChip({ status }) {
    const color = (status === 'acknowledged' || status === 'replied') ? 'success' : status === 'failed' ? 'error' : status === 'delivered' ? 'warning' : 'info';
    return <Chip size="small" label={status || 'sent'} color={color} sx={{ fontWeight: 900, textTransform: 'uppercase' }} />;
}

function FleetMessageCentre({ openSignal, onOpenRig }) {
    const [open, setOpen] = useState(false);
    const [rows, setRows] = useState([]);
    const [error, setError] = useState('');

    const load = useCallback(() => {
        api.allRigMessages(150)
            .then((data) => { setRows(data || []); setError(''); })
            .catch((e) => setError(e?.response?.data?.error || 'failed to load messages'));
    }, []);

    useEffect(() => {
        if (openSignal) setOpen(true);
    }, [openSignal]);

    useEffect(() => {
        if (open) load();
    }, [open, load]);

    useEffect(() => {
        const onUpdate = (row) => {
            if (!row?.messageId) return;
            setRows((prev) => [row, ...prev.filter((m) => m.messageId !== row.messageId)].slice(0, 150));
        };
        socket.on('rig_message_update', onUpdate);
        return () => socket.off('rig_message_update', onUpdate);
    }, []);

    return (
        <>
            <Button
                variant="outlined"
                size="small"
                title="Central Message Centre"
                startIcon={<ChatBubbleOutline fontSize="small" />}
                onClick={() => setOpen(true)}
                sx={{ borderColor: 'rgba(56,189,248,.45)', color: '#38bdf8', fontWeight: 900, bgcolor: 'rgba(15,23,42,.55)', whiteSpace: 'nowrap' }}
            >
                Messages
            </Button>
            <Dialog open={open} onClose={() => setOpen(false)} maxWidth="md" fullWidth PaperProps={{ sx: { bgcolor: '#172235', color: 'white', border: '1px solid rgba(56,189,248,.25)' } }}>
                <DialogTitle sx={{ fontWeight: 900, color: 'primary.main' }}>Central Message Centre - All Rigs</DialogTitle>
                <DialogContent>
                    {error && <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert>}
                    <Stack spacing={1} sx={{ maxHeight: 520, overflow: 'auto' }}>
                        {rows.length ? rows.map((m) => (
                            <Paper key={m.messageId} variant="outlined" sx={{ p: 1.25, bgcolor: 'rgba(15,23,42,.72)', borderColor: 'rgba(148,163,184,.22)' }}>
                                <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
                                    <Box sx={{ minWidth: 0 }}>
                                        <Typography fontWeight={900} sx={{ color: '#e5f2ff' }}>{m.targetRigName || m.targetRigId} · {m.messageType}</Typography>
                                        <Typography sx={{ whiteSpace: 'pre-wrap' }}>{m.messageText}</Typography>
                                    </Box>
                                    <MessageStatusChip status={m.status} />
                                </Stack>
                                {m.replyText && (
                                    <Box sx={{ mt: 1, p: 1, borderLeft: '4px solid #22c55e', bgcolor: 'rgba(34,197,94,.12)', borderRadius: 1 }}>
                                        <Typography variant="caption" sx={{ color: '#bbf7d0', fontWeight: 900 }}>
                                            Reply from {m.targetRigName || m.targetRigId} crew {m.repliedBy ? `by ${m.repliedBy}` : ''}{m.repliedAt ? ` · ${new Date(m.repliedAt).toLocaleString()}` : ''}
                                        </Typography>
                                        <Typography sx={{ color: '#eafff2', whiteSpace: 'pre-wrap', fontWeight: 800 }}>{m.replyText}</Typography>
                                    </Box>
                                )}
                                <Divider sx={{ my: 0.9, borderColor: 'rgba(148,163,184,.18)' }} />
                                <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
                                    <Typography variant="caption" color="text.secondary">
                                        Rig {m.targetRigId} · Sent {m.sentAt ? new Date(m.sentAt).toLocaleString() : '--'} by {m.senderDisplay || m.senderUsername || '--'}
                                        {m.deliveredAt ? ` · Delivered ${new Date(m.deliveredAt).toLocaleString()}` : ''}
                                        {m.acknowledgedAt ? ` · Ack ${new Date(m.acknowledgedAt).toLocaleString()} by ${m.acknowledgedBy || 'rig crew'}` : ''}
                                    </Typography>
                                    <Box sx={{ flexGrow: 1 }} />
                                    <Button size="small" startIcon={<OpenInNew fontSize="small" />} onClick={() => { setOpen(false); onOpenRig(m.targetRigId); }}>Open Rig</Button>
                                </Stack>
                            </Paper>
                        )) : <Typography color="text.secondary">No messages yet.</Typography>}
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={load}>Refresh</Button>
                    <Button onClick={() => setOpen(false)}>Close</Button>
                </DialogActions>
            </Dialog>
        </>
    );
}

function FleetMessagePopup({ onOpenCentre }) {
    const [message, setMessage] = useState(null);
    const seenRef = useRef(new Set());

    useEffect(() => {
        const onUpdate = (row) => {
            if (!row?.messageId) return;
            const key = `${row.messageId}:${row.status}:${row.updatedAt || row.acknowledgedAt || row.deliveredAt || row.sentAt || ''}`;
            if (seenRef.current.has(key)) return;
            seenRef.current.add(key);
            if (seenRef.current.size > 200) seenRef.current = new Set(Array.from(seenRef.current).slice(-100));
            setMessage(row);
        };
        socket.on('rig_message_update', onUpdate);
        return () => socket.off('rig_message_update', onUpdate);
    }, []);

    return (
        <Snackbar open={!!message} autoHideDuration={7000} onClose={() => setMessage(null)} anchorOrigin={{ vertical: 'top', horizontal: 'right' }}>
            <Alert severity={message?.status === 'acknowledged' ? 'success' : 'info'} onClose={() => setMessage(null)} sx={{ width: 420, maxWidth: '90vw' }}>
                <Typography fontWeight={900}>Rig Message Update - {message?.targetRigId}</Typography>
                <Typography variant="body2">{message?.messageType} · {message?.messageText}</Typography>
                <Typography variant="caption">Status: {message?.status}{message?.acknowledgedBy ? ` · by ${message.acknowledgedBy}` : ''}</Typography>
                <Box sx={{ mt: 0.75 }}>
                    <Button size="small" onClick={onOpenCentre}>Open Message Centre</Button>
                </Box>
            </Alert>
        </Snackbar>
    );
}

export default function FleetOverview() {
    const { fleet } = useFleet();
    const { user } = useAuth();
    const viewerAsset = user?.role === 'viewer' ? user.assetUnit : null;
    const nav = useNavigate();
    const [filter, setFilter] = useState('all');
    const [unit, setUnit] = useState('all');
    const [q, setQ] = useState('');
    const [centreOpenSignal, setCentreOpenSignal] = useState(0);

    const units = useMemo(() => {
        const set = new Set(fleet.map((r) => r.assetUnit || r.field).filter(Boolean));
        return Array.from(set).sort((a, b) => a.localeCompare(b));
    }, [fleet]);

    const rows = useMemo(() => fleet.filter((r) => {
        if (filter !== 'all' && r.status !== filter) return false;
        if (unit !== 'all' && (r.assetUnit || r.field) !== unit) return false;
        if (q && !(`${r.name} ${r.rigId} ${r.assetUnit || ''} ${r.field || ''} ${r.activeJob || ''} ${r.currentWellName || ''} ${r.activeActivity || ''}`.toLowerCase().includes(q.toLowerCase()))) return false;
        return true;
    }), [fleet, filter, unit, q]);

    // Group by asset unit (field when no unit is set); units and rigs sorted by name.
    const groups = useMemo(() => {
        const by = new Map();
        for (const r of rows) {
            const u = r.assetUnit || r.field || 'Unassigned';
            if (!by.has(u)) by.set(u, []);
            by.get(u).push(r);
        }
        const cmp = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });
        return [...by.entries()]
            .sort(([a], [b]) => (a === 'Unassigned') - (b === 'Unassigned') || cmp(a, b))
            .map(([u, list]) => [u, list.slice().sort((a, b) => cmp(a.name, b.name))]);
    }, [rows]);

    return (
        // Full-height two-pane: interactive map (left) + rig tiles (right). The status
        // bubbles in the top app bar already carry the fleet KPIs, so no redundant cards.
        <Box sx={{ height: '100%', display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2, minHeight: 0 }}>
            <FleetMessagePopup onOpenCentre={() => setCentreOpenSignal((v) => v + 1)} />
            {/* LEFT — smaller interactive pan/zoom map; click a marker to open the rig. */}
            <Box sx={{ flex: { md: '0.6 1 0' }, minHeight: { xs: 300, md: 0 }, display: 'flex' }}>
                <FleetMap rigs={fleet} />
            </Box>

            {/* RIGHT — one horizontal strip of rig tiles per asset unit. */}
            <Box sx={{ flex: { md: '1.9 1 0' }, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                <Paper sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                    <Box sx={{ p: 1.25, flex: '0 0 auto' }}>
                        <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
                            <Typography variant="h6" sx={{ mr: 0.5 }}>Fleet — {rows.length} rig{rows.length !== 1 ? 's' : ''}</Typography>
                            <TextField size="small" placeholder="Search rig / unit / well" value={q} onChange={(e) => setQ(e.target.value)} sx={{ flex: 1, minWidth: 140 }}
                                InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }} />
                            <FormControl size="small" sx={{ minWidth: 150 }}>
                                <InputLabel id="asset-unit-label">Asset unit</InputLabel>
                                <Select labelId="asset-unit-label" label="Asset unit" value={viewerAsset || unit} disabled={!!viewerAsset} onChange={(e) => setUnit(e.target.value)}>
                                    {!viewerAsset && <MenuItem value="all">All units</MenuItem>}
                                    {units.map((u) => <MenuItem key={u} value={u}>{u}</MenuItem>)}
                                </Select>
                            </FormControl>
                            <ToggleButtonGroup size="small" exclusive value={filter} onChange={(_e, v) => v && setFilter(v)} sx={{ flexWrap: 'wrap' }}>
                                <ToggleButton value="all">All</ToggleButton>
                                <ToggleButton value="online">Online</ToggleButton>
                                <ToggleButton value="degraded">Degraded</ToggleButton>
                                <ToggleButton value="offline">Offline</ToggleButton>
                                <ToggleButton value="pending">Pending</ToggleButton>
                            </ToggleButtonGroup>
                            <FleetMessageCentre openSignal={centreOpenSignal} onOpenRig={(id) => nav(`/rigs/${id}`)} />
                        </Stack>
                    </Box>

                    <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: 1.25, pb: 1.25, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                        {groups.map(([u, list]) => <UnitRow key={u} unit={u} rigs={list} onOpen={(id) => nav(`/rigs/${id}`)} />)}
                        {!rows.length && (
                            <Box sx={{ py: 6, textAlign: 'center', color: 'text.secondary' }}>
                                <Typography variant="body2">No rigs match the filter.</Typography>
                            </Box>
                        )}
                    </Box>
                </Paper>
            </Box>
        </Box>
    );
}



