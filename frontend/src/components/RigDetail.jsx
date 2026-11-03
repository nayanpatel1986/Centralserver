import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Box, Grid, Paper, Typography, Stack, Button, Link as MLink, Alert,
    Tabs, Tab, IconButton, Tooltip, Divider, Menu, MenuItem, ListItemIcon,
    Dialog, DialogTitle, DialogContent, DialogActions, TextField, Chip,
} from '@mui/material';
import { ArrowBack, ExpandMore, ExpandLess, Refresh, Palette, Logout, VolumeOff, VolumeUp, GridView, ShowChart, Storage, Speed, Assignment, Timeline, NotificationsNone, Description, Healing, Settings, ChatBubbleOutline, Send } from '@mui/icons-material';
import { api, phaseColor } from '../api';
import { socket } from '../socket';
import { StatusChip, HealthBar, PriorityChip, fmtAgo, fmtNum } from './common';
import { RigDataProvider, useRigData } from '../context/RigDataContext';
import { RigProvider } from '../context/RigContext';
import { useFleet } from '../context/FleetContext';
import EdrView from './rig/EdrView';
import ErrorBoundary from './ErrorBoundary';
import EquipmentPanel from './rig/panels/EquipmentPanel';
import Ahwr150Equipment from './ahwr150/Ahwr150Equipment';
import AhwrWorkoverEquipment from './ahwr50/AhwrWorkoverEquipment';
import TrendsPanel from './rig/panels/TrendsPanel';
import EfficiencyPanel from './rig/panels/EfficiencyPanel';
import OperationsPanel, { FishingPage, WellControlPage } from './rig/panels/OperationsPanel';
import RigAlarmsPanel from './rig/panels/RigAlarmsPanel';
import RigReportPanel from './rig/panels/RigReportPanel';
import RigMaintenancePanel from './rig/panels/RigMaintenancePanel';
import CentralRigConsoleOverview from './rig/CentralRigConsoleOverview';
import Ahwr150Overview from './ahwr150/Ahwr150Overview';
import RigActivityPanel from './rig/panels/RigActivityPanel';
import RomRigOverview from './RomDashboard/Dashboard';

// Per-rig AHWR-50-TWIN style pages. These pages stay inside the central rig route;
// the fleet dashboard and other central modules keep their CRMF shell.
const HMI_TABS = [
    { key: 'overview', label: 'Overview', el: CentralRigConsoleOverview },
    { key: 'edr', label: 'EDR', el: TrendsPanel },
    { key: 'equipment', label: 'Equipment', el: EquipmentPanel },
    { key: 'efficiency', label: 'Efficiency', el: EfficiencyPanel },
    { key: 'activity', label: 'Activity', el: RigActivityPanel },
    { key: 'operations', label: 'Operations', el: OperationsPanel },
    { key: 'alarms', label: 'Alarms', el: RigAlarmsPanel },
    { key: 'reports', label: 'Reports & Logs', el: RigReportPanel },
    { key: 'maintenance', label: 'Maintenance', el: RigMaintenancePanel },
];
const AHWR150_TABS = HMI_TABS.map((item) => item.key === 'overview' ? { ...item, el: Ahwr150Overview } : item.key === 'equipment' ? { ...item, el: Ahwr150Equipment } : item);
const AHWR_WORKOVER_TABS = HMI_TABS.map((item) => item.key === 'equipment' ? { ...item, el: AhwrWorkoverEquipment } : item);
const HMI_MENU_META = {
    overview: { menuLabel: 'Rig Overview', icon: <GridView fontSize="small" /> },
    edr: { menuLabel: 'EDR', icon: <ShowChart fontSize="small" /> },
    equipment: { menuLabel: 'Equipment', icon: <Storage fontSize="small" /> },
    efficiency: { menuLabel: 'Efficiency', icon: <Speed fontSize="small" /> },
    activity: { menuLabel: 'Activity', icon: <Timeline fontSize="small" /> },
    operations: { menuLabel: 'Operations', icon: <Assignment fontSize="small" /> },
    alarms: { menuLabel: 'Alarms', icon: <NotificationsNone fontSize="small" /> },
    reports: { menuLabel: 'Reports', icon: <Description fontSize="small" /> },
    maintenance: { menuLabel: 'Maintenance', icon: <Healing fontSize="small" /> },
    settings: { menuLabel: 'Settings', icon: <Settings fontSize="small" /> },
};
const CONVENTIONAL_TABS = [
    { key: 'overview', label: 'Rig Overview', el: ConventionalRigOverview },
    { key: 'edr', label: 'EDR', el: TrendsPanel },
    { key: 'engine-power', label: 'Engine & Power', el: ConventionalEnginePower },
    { key: 'well-control', label: 'Well Control', el: WellControlPage },
    { key: 'allison', label: 'Allison Trans', el: AllisonTransPanel },
    { key: 'fishing', label: 'Fishing Ops', el: FishingPage },
];
const CONVENTIONAL_MENU_META = {
    overview: { menuLabel: 'Rig Overview', icon: <GridView fontSize="small" /> },
    edr: { menuLabel: 'EDR', icon: <ShowChart fontSize="small" /> },
    'engine-power': { menuLabel: 'Engine & Power', icon: <Speed fontSize="small" /> },
    'well-control': { menuLabel: 'Well Control', icon: <Healing fontSize="small" /> },
    allison: { menuLabel: 'Allison Trans', icon: <Settings fontSize="small" /> },
    fishing: { menuLabel: 'Fishing Ops', icon: <Assignment fontSize="small" /> },
};
const ROM_TABS = [
    { key: 'rom-overview', label: 'ROM Rig Overview', el: RomRigOverview },
    { key: 'edr', label: 'EDR', el: TrendsPanel },
    { key: 'engine-power', label: 'Engine & Power', el: ConventionalEnginePower },
    { key: 'well-control', label: 'Well Control', el: WellControlPage },
    { key: 'allison', label: 'Allison Trans', el: AllisonTransPanel },
    { key: 'fishing', label: 'Fishing Ops', el: FishingPage },
];
const ROM_MENU_META = {
    ...CONVENTIONAL_MENU_META,
    'rom-overview': { menuLabel: 'ROM Rig Overview', icon: <GridView fontSize="small" /> },
};
const MESSAGE_TYPES = ['General', 'Instruction', 'Warning', 'Safety', 'Maintenance', 'Sensor Check', 'ETP / Network'];
const THEME_OPTIONS = [
    { key: 'dark', label: 'Dark Blue', color: 'primary.main' },
    { key: 'contrast', label: 'High Contrast', color: 'warning.main' },
    { key: 'green', label: 'Green Night', color: 'success.main' },
    { key: 'purple', label: 'Purple Night', color: 'secondary.main' },
];

function MessageStatusChip({ status }) {
    const color = (status === 'acknowledged' || status === 'replied') ? 'success' : status === 'failed' ? 'error' : status === 'delivered' ? 'warning' : 'info';
    return <Chip size="small" label={status || 'sent'} color={color} sx={{ fontWeight: 900, textTransform: 'uppercase' }} />;
}

function RigMessageButton({ rig }) {
    const [open, setOpen] = useState(false);
    const [messageType, setMessageType] = useState(() => localStorage.getItem(`crmf-message-type-${rig?.rigId || 'rig'}`) || 'General');
    const [text, setText] = useState('');
    const [rows, setRows] = useState([]);
    const [error, setError] = useState('');
    const [sending, setSending] = useState(false);
    const load = useCallback(() => {
        if (!rig?.rigId) return;
        api.rigMessages(rig.rigId, 50).then(setRows).catch((e) => setError(e?.response?.data?.error || 'failed to load messages'));
    }, [rig?.rigId]);
    useEffect(() => {
        if (!open) return undefined;
        load();
        const onUpdate = (row) => {
            if (row?.targetRigId === rig?.rigId) setRows((prev) => [row, ...prev.filter((m) => m.messageId !== row.messageId)].slice(0, 50));
        };
        socket.on('rig_message_update', onUpdate);
        return () => socket.off('rig_message_update', onUpdate);
    }, [open, load, rig?.rigId]);
    const chooseType = (type) => {
        setMessageType(type);
        localStorage.setItem(`crmf-message-type-${rig?.rigId || 'rig'}`, type);
    };
    const sendMessage = async () => {
        setSending(true); setError('');
        try {
            const row = await api.sendRigMessage(rig.rigId, { messageType, messageText: text });
            setRows((prev) => [row, ...prev.filter((m) => m.messageId !== row.messageId)]);
            setText('');
        } catch (e) {
            setError(e?.response?.data?.error || 'send failed');
        } finally {
            setSending(false);
        }
    };
    const retry = async (messageId) => {
        try {
            const row = await api.retryRigMessage(rig.rigId, messageId);
            setRows((prev) => [row, ...prev.filter((m) => m.messageId !== row.messageId)]);
        } catch (e) {
            setError(e?.response?.data?.error || 'retry failed');
        }
    };
    return (
        <>
            <Button
                variant="outlined"
                startIcon={<ChatBubbleOutline fontSize="small" />}
                onClick={() => setOpen(true)}
                sx={{ minWidth: 190, borderColor: 'rgba(56,189,248,.42)', color: '#38bdf8', fontWeight: 900, bgcolor: 'rgba(15,23,42,.58)', '&:hover': { borderColor: '#38bdf8', bgcolor: 'rgba(56,189,248,.10)' } }}
            >
                Central Message Centre
            </Button>
            <Dialog open={open} onClose={() => setOpen(false)} maxWidth="md" fullWidth PaperProps={{ sx: { bgcolor: '#172235', color: 'white', border: '1px solid rgba(56,189,248,.25)' } }}>
                <DialogTitle sx={{ fontWeight: 900, color: 'primary.main' }}>Central Message Centre - {rig?.rigId}</DialogTitle>
                <DialogContent>
                    {error && <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert>}
                    <Stack spacing={1.5}>
                        <Box sx={{ p: 1.25, border: '1px solid rgba(56,189,248,.18)', borderRadius: 2, bgcolor: 'rgba(15,23,42,.42)' }}>
                            <Typography variant="subtitle2" fontWeight={900} sx={{ mb: 1, color: '#e5f2ff' }}>
                                Send New Message
                            </Typography>
                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
                                {MESSAGE_TYPES.map((type) => (
                                    <Chip key={type} label={type} onClick={() => chooseType(type)} color={type === messageType ? 'primary' : 'default'} variant={type === messageType ? 'filled' : 'outlined'} />
                                ))}
                            </Stack>
                            <TextField
                                fullWidth
                                multiline
                                minRows={3}
                                value={text}
                                onChange={(e) => setText(e.target.value.slice(0, 1000))}
                                placeholder="Type message for this rig only..."
                                helperText={`${text.length}/1000 characters`}
                            />
                        </Box>
                        <Stack direction="row" alignItems="center" justifyContent="space-between">
                            <Typography variant="subtitle2" fontWeight={900}>Message History</Typography>
                            <Button size="small" onClick={load}>Refresh</Button>
                        </Stack>
                        <Stack spacing={1} sx={{ maxHeight: 420, overflow: 'auto', pr: 0.5 }}>
                            {rows.length ? rows.map((m) => (
                                <Paper key={m.messageId} variant="outlined" sx={{ p: 1.25, bgcolor: 'rgba(15,23,42,.72)', borderColor: 'rgba(148,163,184,.22)' }}>
                                    <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
                                        <Box sx={{ minWidth: 0 }}>
                                            <Typography fontWeight={900} sx={{ color: '#e5f2ff' }}>{m.messageType}</Typography>
                                            <Typography sx={{ whiteSpace: 'pre-wrap' }}>{m.messageText}</Typography>
                                        </Box>
                                        <MessageStatusChip status={m.status} />
                                    </Stack>
                                    {m.replyText && (
                                        <Box sx={{ mt: 1, p: 1, borderLeft: '4px solid #22c55e', bgcolor: 'rgba(34,197,94,.12)', borderRadius: 1 }}>
                                            <Typography variant="caption" sx={{ color: '#bbf7d0', fontWeight: 900 }}>
                                                Reply from Edge {m.repliedBy ? `by ${m.repliedBy}` : ''}{m.repliedAt ? ` · ${new Date(m.repliedAt).toLocaleString()}` : ''}
                                            </Typography>
                                            <Typography sx={{ color: '#eafff2', whiteSpace: 'pre-wrap', fontWeight: 800 }}>{m.replyText}</Typography>
                                        </Box>
                                    )}
                                    <Divider sx={{ my: 0.9, borderColor: 'rgba(148,163,184,.18)' }} />
                                    <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
                                        <Typography variant="caption" color="text.secondary">
                                            Sent {m.sentAt ? new Date(m.sentAt).toLocaleString() : '--'} by {m.senderDisplay || m.senderUsername || '--'}
                                            {m.deliveredAt ? ` · Delivered ${new Date(m.deliveredAt).toLocaleString()}` : ''}
                                            {m.acknowledgedAt ? ` · Ack ${new Date(m.acknowledgedAt).toLocaleString()} by ${m.acknowledgedBy || 'edge'}` : ''}
                                        </Typography>
                                        <Box sx={{ flexGrow: 1 }} />
                                        {m.status === 'failed' && <Button size="small" onClick={() => retry(m.messageId)}>Retry</Button>}
                                    </Stack>
                                </Paper>
                            )) : <Typography color="text.secondary">No messages yet.</Typography>}
                        </Stack>
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button variant="contained" startIcon={<Send />} disabled={sending || !text.trim()} onClick={sendMessage}>Send Message</Button>
                    <Button onClick={() => setOpen(false)}>Close</Button>
                </DialogActions>
            </Dialog>
        </>
    );
}

function findMetric(rig, metric, fallbackLabel) {
    const keyMetrics = rig?.keyMetrics || [];
    return keyMetrics.find((k) => k.metric === metric) || keyMetrics.find((k) => k.label === fallbackLabel) || null;
}
const headerMaps = {
    opMode: { 1: 'DRILLING', 2: 'TRIP IN', 3: 'TRIP OUT', 4: 'CASING' },
    acs: { 0: 'UNKNOWN', 1: 'ON', 2: 'OFF', 3: 'DISABLE' },
};
function headerLabel(mapName, value, fallback = 'UNKNOWN') {
    if (value == null || value === '') return fallback;
    const n = Number(value);
    const map = headerMaps[mapName] || {};
    if (Number.isFinite(n) && Object.prototype.hasOwnProperty.call(map, n)) return map[n];
    return String(value);
}

const fmtDepth2 = (value) => (value == null || Number.isNaN(Number(value)) ? '--' : Number(value).toFixed(2));


function OnlineRigSelector() {
    const navigate = useNavigate();
    const { fleet, refresh } = useFleet() || {};
    const [anchor, setAnchor] = useState(null);
    const loadOnline = useCallback(() => {
        refresh?.().catch(() => {});
    }, [refresh]);
    useEffect(() => {
        loadOnline();
        const id = setInterval(loadOnline, 5000);
        return () => clearInterval(id);
    }, [loadOnline]);
    const close = () => setAnchor(null);
    const openRig = (rigId) => {
        close();
        if (rigId) navigate(`/rigs/${rigId}`);
    };
    const onlineRigs = (Array.isArray(fleet) ? fleet : [])
        .filter((r) => String(r?.status || '').toLowerCase() === 'online')
        .sort((a, b) => String(a.rigId || '').localeCompare(String(b.rigId || ''), undefined, { numeric: true }));
    const count = onlineRigs.length;
    return (
        <Box sx={{ minWidth: 220, display: 'flex', alignItems: 'center' }}>
            <Button
                variant="outlined"
                onClick={(e) => { loadOnline(); setAnchor(e.currentTarget); }}
                endIcon={<ExpandMore />}
                sx={{
                    minWidth: 190,
                    justifyContent: 'space-between',
                    borderColor: 'rgba(34,197,94,.48)',
                    color: '#22c55e',
                    fontWeight: 900,
                    bgcolor: 'rgba(15,23,42,.55)',
                    '&:hover': { borderColor: '#22c55e', bgcolor: 'rgba(34,197,94,.10)' },
                }}
            >
                {count} ONLINE RIG{count === 1 ? '' : 'S'}
            </Button>
            <Menu
                anchorEl={anchor}
                open={!!anchor}
                onClose={close}
                PaperProps={{ sx: { mt: 0.75, minWidth: 260, bgcolor: '#334155', border: '1px solid rgba(34,197,94,.28)' } }}
            >
                {onlineRigs.length ? onlineRigs.map((r) => (
                    <MenuItem key={r.rigId} onClick={() => openRig(r.rigId)} sx={{ py: 1.05, fontWeight: 800 }}>
                        <Stack sx={{ width: '100%' }}>
                            <Typography fontWeight={900} color="success.main">{r.rigId}</Typography>
                            <Typography variant="caption" color="text.secondary">{r.activeJob || 'no job'} - lag {r.syncLagSec == null ? '--' : `${r.syncLagSec}s`}</Typography>
                        </Stack>
                    </MenuItem>
                )) : (
                    <MenuItem disabled sx={{ py: 1.2 }}>No online rigs</MenuItem>
                )}
            </Menu>
        </Box>
    );
}
function EdgeTwinTopBar({ rig, onBack, showKpiToggle, kpiOpen, onToggleKpis }) {
    const title = 'Asset Monitoring Centre';
    const subtitle = rig?.rigId || 'AHWR RIG';
    const [themeMode, setThemeMode] = useState(() => localStorage.getItem('crmf_theme_mode') || 'dark');
    const [themeAnchor, setThemeAnchor] = useState(null);
    const [muted, setMuted] = useState(() => localStorage.getItem('crmf_sound_muted') === '1');

    useEffect(() => {
        const safeMode = THEME_OPTIONS.some((item) => item.key === themeMode) ? themeMode : 'dark';
        if (safeMode !== themeMode) {
            setThemeMode(safeMode);
            localStorage.setItem('crmf_theme_mode', safeMode);
        }
        document.documentElement.dataset.crmfTheme = safeMode;
    }, [themeMode]);

    const chooseTheme = (next) => {
        setThemeMode(next);
        localStorage.setItem('crmf_theme_mode', next);
        document.documentElement.dataset.crmfTheme = next;
        setThemeAnchor(null);
    };

    const toggleMute = () => {
        const next = !muted;
        setMuted(next);
        localStorage.setItem('crmf_sound_muted', next ? '1' : '0');
        window.__CRMF_SOUND_MUTED = next;
        window.dispatchEvent(new CustomEvent('crmf-sound-muted-change', { detail: { muted: next } }));
    };

    return (
        <Paper sx={{ mb: 1, px: 2, py: 1.1, borderRadius: 1, bgcolor: '#172235', borderColor: 'rgba(62,166,255,0.18)' }}>
            <Stack direction="row" spacing={1.25} alignItems="stretch" flexWrap="wrap" useFlexGap>
                <Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 220, mr: 1 }}>
                    <Button startIcon={<ArrowBack />} onClick={onBack} variant="outlined" size="small" sx={{ minWidth: 92 }}>Fleet</Button>
                    <Box>
                        <Typography variant="h6" fontWeight={900} sx={{ color: 'primary.main', lineHeight: 1, letterSpacing: 0 }} noWrap>
                            {title}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" fontWeight={700}>{subtitle}</Typography>
                    </Box>
                </Stack>
                <RigMessageButton rig={rig} />
                <Box sx={{ flexGrow: 1 }} />
                <Stack direction="row" spacing={0.75} alignItems="center">
                    <OnlineRigSelector />
                    {showKpiToggle && (
                        <Tooltip title="Toggle KPI strip">
                            <IconButton size="small" onClick={onToggleKpis} sx={{ color: 'primary.main' }}>
                                {kpiOpen ? <ExpandLess /> : <ExpandMore />}
                            </IconButton>
                        </Tooltip>
                    )}
                    <Tooltip title="Refresh"><IconButton size="small" onClick={() => window.location.reload()}><Refresh fontSize="small" /></IconButton></Tooltip>
                    <Tooltip title="Theme options">
                        <IconButton size="small" onClick={(event) => setThemeAnchor(event.currentTarget)} sx={{ color: THEME_OPTIONS.find((item) => item.key === themeMode)?.color || 'primary.main', border: '1px solid', borderColor: 'rgba(62,166,255,.35)' }}>
                            <Palette fontSize="small" />
                        </IconButton>
                    </Tooltip>
                    <Menu anchorEl={themeAnchor} open={Boolean(themeAnchor)} onClose={() => setThemeAnchor(null)} PaperProps={{ sx: { minWidth: 190 } }}>
                        {THEME_OPTIONS.map((item) => (
                            <MenuItem key={item.key} selected={themeMode === item.key} onClick={() => chooseTheme(item.key)}>
                                <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: item.color, mr: 1.2 }} />
                                {item.label}
                            </MenuItem>
                        ))}
                    </Menu>
                    <Tooltip title={muted ? 'Sound muted - click to unmute' : 'Sound on - click to mute'}>
                        <IconButton size="small" onClick={toggleMute} sx={{ color: muted ? 'text.secondary' : 'success.main', border: '1px solid', borderColor: muted ? 'rgba(148,163,184,.35)' : 'rgba(34,197,94,.45)' }}>
                            {muted ? <VolumeOff fontSize="small" /> : <VolumeUp fontSize="small" />}
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Back to fleet"><IconButton size="small" onClick={onBack} sx={{ color: 'error.main' }}><Logout fontSize="small" /></IconButton></Tooltip>
                </Stack>
            </Stack>
        </Paper>
    );
}

function ConventionalRigOverview({ rigId, rig }) {
    return (
        <RigProvider>
            <RomRigOverview hideEditControls embedded />
        </RigProvider>
    );
}

function ConventionalRigOverviewCopy({ rigId, rig }) {
    const { data: live } = useRigData();
    const boardWrapRef = useRef(null);
    const [boardScale, setBoardScale] = useState(1);
    const d = live?.drilling || {};
    const dw = live?.drawworks || {};
    const mp = live?.mudpump || {};
    const eng = live?.engine || live?.cat_engine || {};
    const fluid = live?.fluid || {};
    const wc = live?.well_control || live?.wellcontrol || {};
    const wh = live?.wellhead || {};
    const allison = live?.allison || live?.transmission || {};
    const hookLoad = dw.hook_load ?? 0;
    const wob = d.wob ?? dw.wob ?? 0;
    const blockPosition = dw.block_position ?? d.bit_depth ?? 0;
    const pumpPressure = mp.pressure ?? mp.pump_pressure ?? 0;
    const spm = mp.spm ?? mp.spm1 ?? 0;
    const layout = {
        rig: { left: 0, top: 0, width: 215, height: 430 },
        hook: { left: 220, top: 0, width: 350, height: 429 },
        engine: { left: 580, top: 0, width: 347, height: 430 },
        mudpump: { left: 940, top: 0, width: 322, height: 432 },
        params: { left: 0, top: 440, width: 216, height: 377 },
        bop: { left: 220, top: 440, width: 392, height: 379 },
        mudvol: { left: 620, top: 440, width: 305, height: 380 },
        allison: { left: 940, top: 440, width: 318, height: 379 },
    };
    useEffect(() => {
        const updateScale = () => {
            const width = boardWrapRef.current?.clientWidth || 1262;
            setBoardScale(Math.max(1, Math.min(1.46, (width - 74) / 1262)));
        };
        updateScale();
        window.addEventListener('resize', updateScale);
        return () => window.removeEventListener('resize', updateScale);
    }, []);
    const card = (key) => ({
        position: 'absolute',
        left: layout[key].left,
        top: layout[key].top,
        width: layout[key].width,
        height: layout[key].height,
    });
    return (
        <Box sx={{ bgcolor: '#0f172a', minHeight: '100%', overflow: 'auto', position: 'relative' }}>
            <RomiiRigOverviewHeader rig={rig} live={live} />
            <Box ref={boardWrapRef} sx={{ pt: '36px', pl: '37px', pr: '37px', pb: '24px', minWidth: 1262, height: 820 * boardScale + 60 }}>
            <Box sx={{ position: 'relative', width: 1262, height: 820, transform: `scale(${boardScale})`, transformOrigin: 'top left' }}>
                <RmPanel title="RIG VISUALIZER" icon="▱" sx={card('rig')}>
                    <RmRigVisualizer
                        blockPosition={blockPosition}
                        crownSaver={dw.crownomatic ?? live?.acs?.crown_saver ?? live?.acs?.crownsaver ?? live?.acs?.crown_saver_on}
                        floorSaver={dw.flooromatic ?? live?.acs?.floor_saver ?? live?.acs?.floorsaver ?? live?.acs?.floor_saver_on}
                        travellingUp={dw.travelling_up ?? dw.block_up ?? dw.up}
                        travellingDown={dw.travelling_down ?? dw.block_down ?? dw.down}
                        blockSpeed={dw.block_speed ?? dw.speed ?? live?.drilling?.block_speed}
                    />
                </RmPanel>
                <RmPanel title="HOOK LOAD" icon="◜" sx={card('hook')}>
                    <RmGaugePanel
                        label="WOH"
                        value={Number(hookLoad) / (Number(hookLoad) > 150 ? 100 : 1)}
                        unit="ton"
                        decimals={2}
                        subLabel="WOB"
                        subValue={wob}
                        subUnit="ton"
                        subDecimals={1}
                        max={100}
                        majorStep={20}
                        minorStep={4}
                        color="#22c55e"
                        trendLabel="WOH TREND"
                    />
                </RmPanel>
                <RmPanel
                    title="CAT ENGINE"
                    right={(Number(eng.rpm ?? eng.engine_rpm ?? 0) > 0 ? 'RUNNING' : 'STOPPED')}
                    sx={card('engine')}
                >
                    <RmGaugePanel
                        label="RPM"
                        value={eng.rpm ?? eng.engine_rpm ?? 0}
                        unit="RPM"
                        decimals={0}
                        max={3000}
                        majorStep={500}
                        minorStep={100}
                        color="#38bdf8"
                        footer={[
                            ['OIL TEMP', eng.oil_temp ?? 0, 'c', '#ff4a60'],
                            ['OIL PRESSURE', Number(eng.oil_pressure ?? 0) * 100, 'kPa', '#fbbf24'],
                            ['COOLANT TEMP', eng.coolant_temp ?? 0, 'c', '#2f8cff'],
                            ['BATTERY VOL.', eng.battery_voltage ?? eng.battery_volt ?? 0, 'v', '#9a7cff'],
                        ]}
                    />
                </RmPanel>
                <RmPanel title="MUD PUMP" icon="◜" sx={card('mudpump')}>
                    <RmGaugePanel
                        label="SPP"
                        value={pumpPressure}
                        unit="psi"
                        decimals={0}
                        max={5000}
                        majorStep={1000}
                        minorStep={200}
                        color="#facc15"
                        footer={[
                            ['SPM', spm, 'SPM', '#fbbf24'],
                            ['STROKES', mp.total_strokes ?? 0, 'strokes', '#38bdf8'],
                        ]}
                    />
                </RmPanel>
                <RmPanel title="KEY PARAMETERS" icon="◜" sx={card('params')}>
                    <RmMetricStack compact rows={[
                        ['AIR PRESS.', live?.system?.rig_air_pressure ?? dw.rig_air_pressure ?? 0, 'psi', '#38bdf8'],
                        ['BLOCK POSITION', blockPosition, 'm', '#4ade80'],
                        ['HOLE DEPTH', d.hole_depth ?? 0, 'm', '#22c55e'],
                        ['BIT DEPTH', d.bit_depth ?? 0, 'm', '#38bdf8'],
                    ]} />
                </RmPanel>
                <RmPanel title="BOP STATUS" icon="◜" sx={card('bop')}>
                    <RmBopPanel wc={wc} wh={wh} />
                </RmPanel>
                <RmPanel title="MUD VOLUME" icon="◜" sx={card('mudvol')}>
                    <RmMetricStack rows={[
                        ['ACTIVE TANK', fluid.tank_volume ?? fluid.active_tank ?? 0, 'm3', '#4ade80'],
                        ['TRIP TANK', fluid.trip_tank ?? dw.trip_tank ?? 0, 'm3', '#a78bfa'],
                        ['GAIN / LOSS', fluid.tank_gain_loss ?? fluid.gain_loss ?? 0, 'm3', '#fbbf24'],
                        ['FLOW IN', mp.flow_in ?? 0, 'L/min', '#fb923c'],
                        ['FLOW OUT', mp.flow_out ?? 0, 'L/min', '#22c55e'],
                    ]} />
                </RmPanel>
                <RmPanel flush sx={card('allison')}>
                    <RmAllisonPanel allison={allison} />
                </RmPanel>
            </Box>
            </Box>
        </Box>
    );
}

function RomiiRigOverviewHeader({ rig, live }) {
    const d = live?.drilling || {};
    const activity = live?._activity?.label || rig?.activeActivity || 'IDLE';
    const rigId = rig?.rigId || rig?.rig_id || 'ROM-I';
    const wellName = live?.well?.name || live?.wellName || live?.well_name || live?._activity?.wellName || live?._activity?.job || rig?.activeJob || 'ABCD';
    return (
        <Paper square elevation={0} sx={{ height: 74, bgcolor: '#242c3e', borderBottom: '1px solid rgba(148,163,184,.22)', display: 'flex', alignItems: 'stretch', overflow: 'hidden' }}>
            <Box sx={{ width: 294, display: 'flex', alignItems: 'center', px: 3, gap: 1.3, bgcolor: '#2c384d', borderRight: '1px solid rgba(148,163,184,.18)' }}>
                <GridView sx={{ color: '#f8fafc', fontSize: 28 }} />
                <Typography sx={{ color: '#fff', fontSize: 25, fontWeight: 900 }}>Rig Overview</Typography>
                <ExpandMore sx={{ color: '#fff', ml: 'auto' }} />
            </Box>
            <Button sx={{ mx: 3, my: 2.05, minWidth: 180, bgcolor: '#f8fafc', color: '#020617', fontWeight: 900, fontSize: 17, '&:hover': { bgcolor: '#e2e8f0' } }}>ALARM ENABLED</Button>
            <HeaderCenterMetric label="ACTIVITY" value={activity} color="#38bdf8" width={220} />
            <HeaderCenterMetric label="HOLE DEPTH" value={fmtDepth2(d.hole_depth ?? 0)} unit="m" color="#38f58a" width={238} />
            <HeaderCenterMetric label="BIT POS" value={fmtDepth2(d.bit_depth ?? 0)} unit="m" color="#38bdf8" width={238} />
            <Box sx={{ ml: 'auto', minWidth: 360, display: 'flex', alignItems: 'center', bgcolor: 'rgba(15,23,42,.18)', px: 2.5 }}>
                <Box sx={{ minWidth: 100 }}>
                    <Typography sx={{ color: '#a7b7cc', fontSize: 20, lineHeight: 1 }}>Rig</Typography>
                    <Typography sx={{ color: '#2dc4ff', fontSize: 22, fontWeight: 900, lineHeight: 1.2 }}>{rigId}</Typography>
                </Box>
                <Divider orientation="vertical" flexItem sx={{ mx: 2.8, borderColor: 'rgba(148,163,184,.20)' }} />
                <Box sx={{ minWidth: 120 }}>
                    <Typography sx={{ color: '#a7b7cc', fontSize: 20, lineHeight: 1 }}>Well</Typography>
                    <Typography sx={{ color: '#2dc4ff', fontSize: 22, fontWeight: 900, lineHeight: 1.2 }}>{wellName}</Typography>
                </Box>
            </Box>
            <IconButton sx={{ mx: 1, alignSelf: 'center', color: '#38bdf8', bgcolor: 'rgba(56,189,248,.12)' }}><EditIconSmall /></IconButton>
            <IconButton sx={{ mx: 1.5, alignSelf: 'center', color: '#ff4d4d' }}><Logout /></IconButton>
        </Paper>
    );
}

function HeaderCenterMetric({ label, value, unit, color, width }) {
    return (
        <Box sx={{ width, display: 'grid', placeItems: 'center', borderLeft: '1px solid rgba(148,163,184,.22)' }}>
            <Box sx={{ textAlign: 'center' }}>
                <Typography sx={{ color: '#a7b7cc', fontSize: 19, lineHeight: 1, fontWeight: 500 }}>{label}</Typography>
                <Typography sx={{ color, fontSize: 23, lineHeight: 1.2, fontWeight: 900 }}>
                    {value} {unit && <Typography component="span" sx={{ color: '#a7b7cc', fontSize: 12 }}>{unit}</Typography>}
                </Typography>
            </Box>
        </Box>
    );
}

function EditIconSmall() {
    return (
        <Box component="span" sx={{ display: 'block', width: 18, height: 18, border: '2px solid currentColor', borderTop: 0, borderRight: 0, transform: 'rotate(-45deg)' }} />
    );
}

function RmPanel({ title, area, children, flush = false, icon, right, sx }) {
    const compactHeader = Number(sx?.width || 999) <= 220;
    return (
        <Paper variant="outlined" sx={{ gridArea: area, bgcolor: '#1e293b', borderColor: '#334155', borderRadius: 1.25, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0, ...sx }}>
            {title && (
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: compactHeader ? 1.2 : 2, minHeight: 54, bgcolor: '#26364a', borderBottom: '1px solid rgba(51,65,85,.72)' }}>
                    <Stack direction="row" alignItems="center" spacing={compactHeader ? 0.75 : 1.2} sx={{ minWidth: 0 }}>
                        {icon && <Typography sx={{ color: '#38bdf8', fontSize: compactHeader ? 14 : 18, fontWeight: 900, lineHeight: 1 }}>{icon}</Typography>}
                        <Typography sx={{ color: '#f4f8ff', fontSize: compactHeader ? 11 : 14, fontWeight: 900, letterSpacing: compactHeader ? 2 : 3, lineHeight: 1 }} noWrap>{title}</Typography>
                    </Stack>
                    {right && <Typography sx={{ color: '#64748b', fontSize: 10, fontWeight: 900, letterSpacing: 2.5 }} noWrap>{right}</Typography>}
                </Stack>
            )}
            <Box sx={{ flex: 1, minHeight: 0, p: flush ? 0 : 0, display: 'flex', flexDirection: 'column' }}>{children}</Box>
        </Paper>
    );
}

function RmGaugePanel({ label, value, unit, decimals, subLabel, subValue, subUnit, subDecimals, min = 0, max = 100, majorStep = 20, minorStep = 4, color = '#38bdf8', trendLabel, footer }) {
    const footerRows = Array.isArray(footer) ? footer : null;
    return (
        <Box sx={{ height: '100%', minHeight: 0, display: 'grid', gridTemplateRows: footerRows || trendLabel ? '1fr 142px' : '1fr' }}>
            <Box sx={{ minHeight: 0, px: 2, py: 1.25, display: 'flex', alignItems: 'stretch' }}>
                <TwinGauge
                    label={label}
                    value={value}
                    unit={unit}
                    decimals={decimals}
                    subLabel={subLabel}
                    subValue={subValue}
                    subUnit={subUnit}
                    subDecimals={subDecimals}
                    min={min}
                    max={max}
                    majorStep={majorStep}
                    minorStep={minorStep}
                    color={color}
                />
            </Box>
            {trendLabel && (
                <Box sx={{ borderTop: '1px solid rgba(51,65,85,.72)', bgcolor: '#172235', position: 'relative', overflow: 'hidden', px: 1.5, py: 1.1 }}>
                    <Typography sx={{ color: '#94a3b8', fontSize: 14, fontWeight: 900 }}>{trendLabel}</Typography>
                    <Box sx={{
                        position: 'absolute',
                        inset: '42px 14px 12px 14px',
                        opacity: 0.55,
                        backgroundImage: 'repeating-linear-gradient(0deg, transparent 0 25px, rgba(148,163,184,.16) 26px), repeating-linear-gradient(90deg, transparent 0 31px, rgba(148,163,184,.12) 32px)',
                    }} />
                </Box>
            )}
            {footerRows && (
                <Box sx={{ borderTop: '1px solid rgba(51,65,85,.72)', bgcolor: '#172235', display: 'grid', gridTemplateColumns: footerRows.length === 4 ? 'repeat(2, minmax(0, 1fr))' : `repeat(${footerRows.length}, minmax(0, 1fr))`, gridAutoRows: '1fr' }}>
                    {footerRows.map(([statLabel, statValue, statUnit, statColor], idx) => (
                        <RmBandStat key={statLabel} label={statLabel} value={statValue} unit={statUnit} color={statColor} borderLeft={idx % 2 === 1 || footerRows.length === 2} />
                    ))}
                </Box>
            )}
        </Box>
    );
}

function RmBandStat({ label, value, unit, color, borderLeft }) {
    const numeric = Number(value);
    const display = Number.isFinite(numeric) ? fmtNum(numeric, Math.abs(numeric) < 100 && !Number.isInteger(numeric) ? 1 : 0) : (value ?? '--');
    return (
        <Box sx={{ minWidth: 0, p: 1.15, display: 'grid', alignContent: 'center', justifyItems: 'center', borderLeft: borderLeft ? '1px solid rgba(51,65,85,.72)' : 'none' }}>
            <Typography sx={{ color, fontSize: 15, fontWeight: 900, letterSpacing: 1.3, lineHeight: 1, textAlign: 'center' }}>{label}</Typography>
            <Typography sx={{ color, fontSize: { xs: 29, lg: 34 }, fontWeight: 900, lineHeight: 1.05, textAlign: 'center' }} noWrap>
                {display}
                <Typography component="span" sx={{ color: '#93a4bd', fontSize: 15, fontWeight: 800, ml: 0.7 }}>{unit}</Typography>
            </Typography>
        </Box>
    );
}

function RmReadout({ label, value, unit, color = '#fff', subLabel, subValue }) {
    const numeric = Number(value);
    const display = Number.isFinite(numeric) ? fmtNum(numeric, Math.abs(numeric) < 100 && !Number.isInteger(numeric) ? 1 : 0) : (value ?? '--');
    return (
        <Box sx={{ p: 1.25, bgcolor: 'rgba(30,41,59,.42)', border: '1px solid rgba(51,65,85,.6)', borderRadius: 1.5, minHeight: 82, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <Stack direction="row" justifyContent="space-between" spacing={1}>
                <Typography sx={{ color: '#94a3b8', fontSize: 11, fontWeight: 900, letterSpacing: 0.5 }}>{label}</Typography>
                {subValue != null && <Typography sx={{ color: '#94a3b8', fontSize: 10, fontWeight: 800 }}>{subLabel}: {subValue}</Typography>}
            </Stack>
            <Typography sx={{ color, fontSize: 25, fontWeight: 900, fontFamily: 'monospace', lineHeight: 1.1, mt: 0.6 }}>
                {display}<Typography component="span" sx={{ color: '#64748b', fontSize: 12, fontWeight: 900, ml: 0.7 }}>{unit}</Typography>
            </Typography>
        </Box>
    );
}

function RmMetricStack({ rows, compact = false }) {
    return (
        <Box sx={{ p: 1.5, display: 'grid', gridTemplateColumns: compact ? 'repeat(2, minmax(0, 1fr))' : '1fr', gap: 1.0, flex: 1 }}>
            {rows.map(([label, value, unit, color]) => <RmReadout key={label} label={label} value={value} unit={unit} color={color} />)}
        </Box>
    );
}

function RmEnginePanel({ eng }) {
    const load = Math.max(0, Math.min(100, Number(eng.load ?? eng.engine_load ?? 0) || 0));
    return (
        <Box sx={{ p: 1.5, height: '100%', display: 'grid', gridTemplateRows: 'auto 1fr auto', gap: 1.1 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Box>
                    <Typography sx={{ color: '#fff', fontWeight: 900, fontSize: 18 }}>CAT ENGINE</Typography>
                    <Typography sx={{ color: '#64748b', fontSize: 10, fontWeight: 800, letterSpacing: 1 }}>POWER UNIT MONITORING</Typography>
                </Box>
                <Chip size="small" label={(eng.status || 'LIVE').toString().toUpperCase()} sx={{ bgcolor: 'rgba(16,185,129,.13)', color: '#10b981', fontWeight: 900 }} />
            </Stack>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                <RmReadout label="ENGINE RPM" value={eng.rpm ?? 0} unit="RPM" color="#fbbf24" subLabel="LOAD" subValue={`${fmtNum(load, 0)}%`} />
                <RmReadout label="OIL PRESSURE" value={eng.oil_pressure ?? 0} unit="bar" color="#f472b6" />
                <RmReadout label="OIL TEMP" value={eng.oil_temp ?? 0} unit="degC" color="#ef4444" />
                <RmReadout label="COOLANT TEMP" value={eng.coolant_temp ?? 0} unit="degC" color="#38bdf8" />
            </Box>
            <Box sx={{ height: 8, bgcolor: '#0f172a', borderRadius: 99, overflow: 'hidden', border: '1px solid #334155' }}>
                <Box sx={{ width: `${load}%`, height: '100%', bgcolor: load > 85 ? '#ef4444' : '#10b981', boxShadow: `0 0 12px ${load > 85 ? '#ef4444' : '#10b981'}` }} />
            </Box>
        </Box>
    );
}

function RmAllisonPanel({ allison }) {
    const mode = Number(allison.mode) === 1;
    const lockup = allison.lockup === true || Number(allison.lockup) === 1;
    return (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2, minHeight: 54, bgcolor: '#26364a', borderBottom: '1px solid rgba(51,65,85,.72)' }}>
                <Stack direction="row" alignItems="center" spacing={1.2}>
                    <Typography sx={{ color: '#38bdf8', fontSize: 24, fontWeight: 900, lineHeight: 1 }}>◜</Typography>
                    <Typography sx={{ color: '#f4f8ff', fontSize: 20, fontWeight: 900, letterSpacing: 4 }}>ALLISON TRANS</Typography>
                </Stack>
            </Stack>
            <Box sx={{ p: 1.5, flex: 1, display: 'flex', flexDirection: 'column', gap: 1.1 }}>
                <Chip size="small" label={mode ? 'HOIST' : 'ROAD'} sx={{ alignSelf: 'flex-start', bgcolor: mode ? 'rgba(56,189,248,.16)' : 'rgba(16,185,129,.14)', color: mode ? '#38bdf8' : '#10b981', fontWeight: 900 }} />
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                    <RmReadout label="OUTPUT SPEED" value={allison.output_rpm ?? 0} unit="RPM" color="#38bdf8" />
                    <RmReadout label="INPUT SPEED" value={allison.input_rpm ?? 0} unit="RPM" color="#22d3ee" />
                    <RmReadout label="OIL TEMP" value={allison.oil_temp ?? 0} unit="degC" color="#ef4444" />
                    <RmReadout label="LOCKUP" value={lockup ? 'ENGAGED' : 'OFF'} color={lockup ? '#4ade80' : '#64748b'} />
                </Box>
            </Box>
        </Box>
    );
}

function RmGear({ label, value, color, solid = false }) {
    return (
        <Box sx={{ textAlign: 'center' }}>
            <Typography sx={{ color: '#64748b', fontSize: 10, fontWeight: 900, mb: 0.5 }}>{label}</Typography>
            <Box sx={{ width: 62, height: 62, display: 'grid', placeItems: 'center', borderRadius: 1.5, bgcolor: solid ? color : 'transparent', border: solid ? 'none' : `2px dashed ${color}`, boxShadow: solid ? `0 0 20px ${color}55` : 'none' }}>
                <Typography sx={{ color: solid ? '#0f172a' : color, fontSize: 30, fontWeight: 900 }}>{value}</Typography>
            </Box>
        </Box>
    );
}

function RmBopPanel({ wc, wh }) {
    const has = wc.available === true || wc.available === 1;
    return (
        <Box sx={{ p: 1.5, display: 'grid', gridTemplateRows: 'auto 1fr', gap: 1, flex: 1 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 1, py: 0.75, borderRadius: 1, bgcolor: has ? 'rgba(16,185,129,.08)' : 'rgba(239,68,68,.10)', border: `1px solid ${has ? '#10b98144' : '#ef444444'}` }}>
                <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: has ? '#10b981' : '#ef4444', boxShadow: `0 0 10px ${has ? '#10b981' : '#ef4444'}` }} />
                <Typography sx={{ color: has ? '#10b981' : '#ef4444', fontSize: 12, fontWeight: 900 }}>{has ? 'BOP TELEMETRY LIVE' : 'NO BOP DATA SOURCE'}</Typography>
            </Stack>
            <RmMetricStack rows={[
                ['PIPE', wc.pipe_pressure ?? wc.pipe_ram_pressure ?? 0, 'psi', '#94a3b8'],
                ['BLIND', wc.blind_pressure ?? wc.blind_ram_pressure ?? 0, 'psi', '#94a3b8'],
                ['ANNLR', wc.annular_pressure ?? 0, 'psi', '#94a3b8'],
                ['TUBING PRESSURE', wh.tubing_pressure ?? 0, 'bar', '#4ade80'],
                ['CASING PRESSURE', wh.casing_pressure ?? 0, 'bar', '#f472b6'],
            ]} />
        </Box>
    );
}

function RmRigVisualizer({ blockPosition, crownSaver, floorSaver, travellingUp, travellingDown, blockSpeed }) {
    const block = Math.max(0, Number(blockPosition) || 0);
    const blockY = 92 + (1 - Math.min(1, block / 15000)) * 245;
    const flagOn = (value) => {
        if (value === true) return true;
        if (value === false || value == null || value === '') return false;
        if (typeof value === 'string') {
            const v = value.trim().toUpperCase();
            return ['1', 'TRUE', 'ON', 'OK', 'ACTIVE', 'ENABLE', 'ENABLED', 'YES'].includes(v);
        }
        return Number(value) > 0;
    };
    const speed = Number(blockSpeed);
    const movingUp = flagOn(travellingUp) || (Number.isFinite(speed) && speed > 0);
    const movingDown = flagOn(travellingDown) || (Number.isFinite(speed) && speed < 0);
    const movementLabel = movingUp ? 'MOVING UP' : movingDown ? 'MOVING DOWN' : 'STATIC';
    const movementColor = movingUp ? '#38bdf8' : movingDown ? '#fbbf24' : '#94a3b8';
    const floorSaverOn = flagOn(floorSaver);
    const crownSaverOn = flagOn(crownSaver);
    return (
        <Box sx={{ flex: 1, minHeight: 0, position: 'relative', display: 'grid', placeItems: 'center', bgcolor: '#172235', overflow: 'hidden' }}>
            {floorSaverOn && (
                <Box sx={{
                    position: 'absolute',
                    top: 58,
                    left: 0,
                    right: 0,
                    height: 142,
                    display: 'grid',
                    placeItems: 'center',
                    bgcolor: '#df9408',
                    boxShadow: '0 0 24px rgba(251,191,36,.55)',
                    zIndex: 2,
                }}>
                    <Typography sx={{ color: '#fff', fontSize: 39, fontWeight: 900, letterSpacing: 7, lineHeight: 1.22, textAlign: 'center', textShadow: '0 4px 8px rgba(0,0,0,.55)' }}>
                        FLOOR<br />SAVER ON
                    </Typography>
                </Box>
            )}
            {crownSaverOn && (
                <Box sx={{
                    position: 'absolute',
                    top: 318,
                    left: 0,
                    right: 0,
                    height: 142,
                    display: 'grid',
                    placeItems: 'center',
                    bgcolor: '#d63b40',
                    boxShadow: '0 0 24px rgba(239,68,68,.55)',
                    zIndex: 2,
                }}>
                    <Typography sx={{ color: '#fff', fontSize: 39, fontWeight: 900, letterSpacing: 7, lineHeight: 1.22, textAlign: 'center', textShadow: '0 4px 8px rgba(0,0,0,.55)' }}>
                        CROWN<br />SAVER ON
                    </Typography>
                </Box>
            )}
            <svg viewBox="0 0 210 500" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true" style={{ position: 'relative', zIndex: 1 }}>
                <defs>
                    <linearGradient id="rmLeg" x1="0" x2="1"><stop offset="0" stopColor="#334155" /><stop offset="1" stopColor="#64748b" /></linearGradient>
                </defs>
                <polygon points="105,54 42,420 168,420" fill="rgba(15,23,42,.18)" stroke="#cbd5e1" strokeWidth="1.4" opacity=".75" />
                <line x1="62" y1="420" x2="91" y2="206" stroke="#d1d5db" strokeWidth="1.2" />
                <line x1="148" y1="420" x2="119" y2="206" stroke="#d1d5db" strokeWidth="1.2" />
                <line x1="51" y1="392" x2="159" y2="392" stroke="#d1d5db" strokeWidth="1.1" />
                <line x1="57" y1="340" x2="153" y2="340" stroke="#d1d5db" strokeWidth="1.1" />
                <line x1="64" y1="285" x2="146" y2="285" stroke="#d1d5db" strokeWidth="1.1" />
                <line x1="70" y1="235" x2="140" y2="235" stroke="#d1d5db" strokeWidth="1.1" />
                <line x1="62" y1="420" x2="148" y2="340" stroke="#94a3b8" strokeWidth=".9" opacity=".55" />
                <line x1="148" y1="420" x2="57" y2="340" stroke="#94a3b8" strokeWidth=".9" opacity=".55" />
                <line x1="57" y1="340" x2="146" y2="285" stroke="#94a3b8" strokeWidth=".9" opacity=".55" />
                <line x1="153" y1="340" x2="64" y2="285" stroke="#94a3b8" strokeWidth=".9" opacity=".55" />
                <rect x="77" y="40" width="56" height="17" rx="4" fill="#64748b" opacity=".78" />
                <circle cx="94" cy="48.5" r="4" fill="#38bdf8" />
                <circle cx="116" cy="48.5" r="4" fill="#38bdf8" />
                <line x1="94" y1="57" x2="94" y2={blockY} stroke="#1f2937" strokeWidth="2" />
                <line x1="116" y1="57" x2="116" y2={blockY} stroke="#1f2937" strokeWidth="2" />
                <rect x="86" y={blockY} width="38" height="18" rx="2" fill="#ff4d4d" stroke="#fbbf24" strokeWidth="3" />
                <rect x="92" y={blockY + 18} width="26" height="17" rx="2" fill="#ff4d4d" stroke="#111827" strokeWidth="1" />
                {movingUp && <path d={`M105 ${blockY - 18} l-9 13 h18 z`} fill="#38bdf8" />}
                {movingDown && <path d={`M105 ${blockY + 55} l-9 -13 h18 z`} fill="#fbbf24" />}
                <line x1="24" y1="432" x2="186" y2="432" stroke="#334155" strokeWidth="5" />
            </svg>
            <Box sx={{ position: 'absolute', bottom: 45, left: 49, right: 49, zIndex: 3, border: '1px solid #38bdf8', borderRadius: 99, bgcolor: '#0f172a', px: 1.2, py: 0.7, textAlign: 'center', boxShadow: '0 0 14px rgba(56,189,248,.35)' }}>
                <Typography sx={{ color: '#fff', fontSize: 19, fontWeight: 900, lineHeight: 1 }}>
                    BLK POS: <Typography component="span" sx={{ color: '#38bdf8', fontSize: 24, fontWeight: 900 }}>{fmtNum(block, 2)}</Typography><Typography component="span" sx={{ color: '#b8c6dc', fontSize: 17, fontWeight: 800, ml: 0.5 }}>m</Typography>
                </Typography>
            </Box>
            <Stack direction="row" spacing={0.8} sx={{ position: 'absolute', bottom: 9, left: 8, right: 8, zIndex: 3 }} flexWrap="wrap" justifyContent="center" useFlexGap>
                <Chip size="small" label={floorSaverOn ? 'FLOOR SAVER ON' : 'FLOOR SAVER OFF'} sx={{ bgcolor: floorSaverOn ? 'rgba(251,191,36,.18)' : 'rgba(148,163,184,.12)', color: floorSaverOn ? '#fbbf24' : '#94a3b8', fontWeight: 900 }} />
                <Chip size="small" label={crownSaverOn ? 'CROWN SAVER ON' : 'CROWN SAVER OFF'} sx={{ bgcolor: crownSaverOn ? 'rgba(239,68,68,.18)' : 'rgba(148,163,184,.12)', color: crownSaverOn ? '#f87171' : '#94a3b8', fontWeight: 900 }} />
                <Chip size="small" label={movementLabel} sx={{ bgcolor: `${movementColor}22`, color: movementColor, fontWeight: 900 }} />
            </Stack>
        </Box>
    );
}

function ConventionalEnginePower({ rigId }) {
    return <EquipmentPanel rigId={rigId} initialTab="cat" hideInternalNav />;
}

function AllisonTransPanel() {
    const { data } = useRigData();
    const allison = data?.allison || {};
    const mode = Number(allison.mode);
    const lockup = allison.lockup === true || Number(allison.lockup) === 1;
    const fault = Number(allison.fault_spn || 0) > 0;
    return (
        <Box sx={{ p: 1.25, bgcolor: '#0b1220', minHeight: '100%' }}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems="stretch">
                <Paper variant="outlined" sx={{ p: 2, flex: '1 1 320px', bgcolor: 'rgba(15,23,42,.72)', borderColor: 'rgba(148,163,184,.24)', borderRadius: 1 }}>
                    <Typography sx={{ color: '#38bdf8', fontSize: 21, fontWeight: 900 }}>Allison Transmission</Typography>
                    <Typography sx={{ color: '#94a3b8', fontWeight: 800, fontSize: 12, letterSpacing: 1 }}>CEC2 SERIES MONITORING</Typography>
                    <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
                        <GearBox label="Actual" value={allison.actual_gear || 'N'} color="#38bdf8" />
                        <GearBox label="Target" value={allison.target_gear || 'N'} color="#64748b" />
                    </Stack>
                    <Stack direction="row" spacing={1} sx={{ mt: 2 }} flexWrap="wrap" useFlexGap>
                        <Chip label={mode === 1 ? 'HOIST MODE' : 'ROAD MODE'} sx={{ bgcolor: mode === 1 ? 'rgba(56,189,248,.18)' : 'rgba(34,197,94,.18)', color: mode === 1 ? '#38bdf8' : '#22c55e', fontWeight: 900 }} />
                        <Chip label={`LOCKUP ${lockup ? 'ENGAGED' : 'DISENGAGED'}`} sx={{ bgcolor: lockup ? 'rgba(34,197,94,.18)' : 'rgba(245,158,11,.18)', color: lockup ? '#22c55e' : '#f59e0b', fontWeight: 900 }} />
                    </Stack>
                </Paper>
                <Grid container spacing={1.5} sx={{ flex: '2 1 620px' }}>
                    {[
                        ['Output Shaft Speed', allison.output_rpm, 'rpm', '#38bdf8'],
                        ['Input Speed', allison.input_rpm, 'rpm', '#22d3ee'],
                        ['Sump Oil Temp', allison.oil_temp, 'degC', '#ef4444'],
                        ['Main Line Pressure', allison.oil_pressure, 'psi', '#f59e0b'],
                        ['Transmission Load', allison.load, '%', '#22c55e'],
                        ['Oil Life', allison.oil_life ?? allison.oil_hours_remaining, 'hrs', '#a78bfa'],
                    ].map(([label, value, unit, color]) => (
                        <Grid item xs={12} sm={6} md={4} key={label}>
                            <Paper variant="outlined" sx={{ p: 1.5, minHeight: 116, bgcolor: 'rgba(15,23,42,.72)', borderColor: 'rgba(148,163,184,.24)', borderRadius: 1 }}>
                                <Typography sx={{ color: '#aab7ca', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>{label}</Typography>
                                <Typography sx={{ color, fontSize: 30, fontWeight: 900, mt: 1 }}>{value ?? '--'} <Typography component="span" sx={{ color: '#dbeafe', fontSize: 13, fontWeight: 900 }}>{unit}</Typography></Typography>
                            </Paper>
                        </Grid>
                    ))}
                </Grid>
            </Stack>
            <Paper variant="outlined" sx={{ p: 1.5, mt: 1.5, bgcolor: fault ? 'rgba(127,29,29,.35)' : 'rgba(20,83,45,.22)', borderColor: fault ? 'rgba(239,68,68,.4)' : 'rgba(34,197,94,.32)', borderRadius: 1 }}>
                <Typography sx={{ color: fault ? '#fca5a5' : '#86efac', fontWeight: 900 }}>
                    {fault ? `ACTIVE FAULT: SPN ${allison.fault_spn}` : 'SYSTEM NORMAL: NO ACTIVE FAULTS'}
                </Typography>
                <Typography sx={{ color: '#cbd5e1', mt: 0.5 }}>{fault ? (allison.spn_desc || allison.fmi_desc || 'Transmission fault active') : 'All available transmission signals are within normal status.'}</Typography>
            </Paper>
        </Box>
    );
}

function GearBox({ label, value, color }) {
    return (
        <Box sx={{ textAlign: 'center' }}>
            <Typography sx={{ color: '#94a3b8', fontSize: 11, fontWeight: 900, textTransform: 'uppercase', mb: 0.75 }}>{label}</Typography>
            <Box sx={{ width: 70, height: 70, borderRadius: 1, bgcolor: `${color}22`, border: `2px solid ${color}`, display: 'grid', placeItems: 'center' }}>
                <Typography sx={{ color, fontSize: 34, fontWeight: 900 }}>{value}</Typography>
            </Box>
        </Box>
    );
}

function isRomRigId(value) {
    return /^ROM-100-(I|II)$/i.test(String(value || '').trim());
}

function rigTypeFor(rig) {
    const explicitType = String(rig?.rigType || rig?.rig_type || rig?.type || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
    if (explicitType === 'AHWR_150_WORKOVER') return 'AHWR_150_WORKOVER';
    if (explicitType === 'CONVENTIONAL_WORKOVER') return 'CONVENTIONAL_WORKOVER';
    if (explicitType === 'AHWR_WORKOVER') return 'AHWR_WORKOVER';

    const raw = [
        rig?.section,
        rig?.assetUnit,
        rig?.asset_unit,
        rig?.field,
        rig?.name,
        rig?.rigId,
        rig?.rig_id,
    ].filter(Boolean).join(' ').toUpperCase();
    if (isRomRigId(rig?.rigId) || isRomRigId(rig?.rig_id) || isRomRigId(rig?.name)) return 'ROM_WORKOVER';
    if (raw.includes('CONVENTIONAL') || raw.includes('ROM') || /\bRM[-\s_]/.test(raw) || /\bRM\d/.test(raw)) return 'CONVENTIONAL_WORKOVER';
    return 'AHWR_WORKOVER';
}

function isRemovedConventionalPage(item) {
    return /^well[\s-]*management$/i.test(`${item?.key || ''} ${item?.label || ''}`);
}

function tabsForRig(rig) {
    const rigType = rigTypeFor(rig);
    const tabs = rigType === 'ROM_WORKOVER' ? ROM_TABS : rigType === 'CONVENTIONAL_WORKOVER' ? CONVENTIONAL_TABS : rigType === 'AHWR_150_WORKOVER' ? AHWR150_TABS : AHWR_WORKOVER_TABS;
    if (rigType !== 'CONVENTIONAL_WORKOVER') return tabs;
    return tabs.filter((item) => !isRemovedConventionalPage(item));
}

function menuMetaForRig(rig) {
    const rigType = rigTypeFor(rig);
    if (rigType === 'ROM_WORKOVER') return ROM_MENU_META;
    if (rigType !== 'CONVENTIONAL_WORKOVER') return HMI_MENU_META;
    return Object.fromEntries(Object.entries(CONVENTIONAL_MENU_META).filter(([key, item]) => !isRemovedConventionalPage({ key, label: item?.menuLabel })));
}

function RigPageMenu({ tab, onTabChange, tabs = HMI_TABS, menuMeta = HMI_MENU_META }) {
    const [anchor, setAnchor] = useState(null);
    const active = tabs[tab] || tabs[0];
    const meta = menuMeta[active.key] || { menuLabel: active.label, icon: <GridView fontSize="small" /> };
    const close = () => setAnchor(null);
    const choose = (index) => {
        onTabChange(index);
        close();
    };
    return (
        <Box>
            <Button
                variant="contained"
                onClick={(e) => setAnchor(e.currentTarget)}
                startIcon={meta.icon}
                endIcon={<ExpandLess sx={{ transform: anchor ? 'none' : 'rotate(180deg)' }} />}
                sx={{ minHeight: 48, minWidth: 220, justifyContent: 'flex-start', bgcolor: '#24364d', color: '#fff', fontWeight: 900, '&:hover': { bgcolor: '#2d415a' } }}
            >
                {meta.menuLabel}
            </Button>
            <Menu
                anchorEl={anchor}
                open={!!anchor}
                onClose={close}
                PaperProps={{ sx: { mt: 0.75, minWidth: 270, bgcolor: '#334155', border: '1px solid rgba(62,166,255,0.22)' } }}
            >
                {tabs.map((item, index) => {
                    const itemMeta = menuMeta[item.key] || { menuLabel: item.label, icon: <GridView fontSize="small" /> };
                    return (
                        <MenuItem key={item.key} selected={index === tab} onClick={() => choose(index)} sx={{ py: 1.15, gap: 1.25, fontWeight: 800, '&.Mui-selected': { bgcolor: 'rgba(56,189,248,0.18)', color: 'primary.main' } }}>
                            <ListItemIcon sx={{ minWidth: 32, color: index === tab ? 'primary.main' : 'text.secondary' }}>{itemMeta.icon}</ListItemIcon>
                            {itemMeta.menuLabel}
                        </MenuItem>
                    );
                })}
            </Menu>
        </Box>
    );
}

function RigStatusRow({ rig, tab, onTabChange, tabs = HMI_TABS, menuMeta = HMI_MENU_META }) {
    const { data: live } = useRigData();
    const opMode = findMetric(rig, 'drilling.operation_mode', 'OP.MODE');
    const acs = findMetric(rig, 'acs.status', 'ACS');
    const holeDepth = findMetric(rig, 'drilling.hole_depth', 'HOLE DEPTH');
    const bitDepth = findMetric(rig, 'drilling.bit_depth', 'BIT DEPTH');
    const liveHoleDepth = live?.drilling?.hole_depth;
    const liveBitDepth = live?.drilling?.bit_depth;
    const wellName = live?.well?.name || live?.wellName || live?.well_name || live?._activity?.wellName || live?._activity?.job || rig?.activeJob || 'no job';
    return (
        <Paper sx={{ px: 1.5, py: 0.75, mb: 1, borderRadius: 1, bgcolor: '#172235', borderColor: 'rgba(62,166,255,0.18)' }} variant="outlined">
            <Stack direction="row" spacing={1} alignItems="stretch" flexWrap={{ xs: 'wrap', lg: 'nowrap' }} useFlexGap>
                <RigPageMenu tab={tab} onTabChange={onTabChange} tabs={tabs} menuMeta={menuMeta} />
                <TwinKpi label="OP.MODE" value={opMode ? headerLabel('opMode', opMode.value) : 'IDLE'} />
                <TwinKpi label="ACS" value={acs ? headerLabel('acs', acs.value) : 'UNKNOWN'} />
                <TwinKpi label="HOLE DEPTH" value={holeDepth?.value != null ? fmtDepth2(holeDepth.value) : (liveHoleDepth != null ? fmtDepth2(liveHoleDepth) : '--')} unit={holeDepth?.unit || 'm'} accent="success.main" sx={{ minWidth: 170 }} />
                <TwinKpi label="BIT DEPTH" value={bitDepth?.value != null ? fmtDepth2(bitDepth.value) : (liveBitDepth != null ? fmtDepth2(liveBitDepth) : '--')} unit={bitDepth?.unit || 'm'} accent="primary.main" sx={{ minWidth: 170 }} />
                <Paper variant="outlined" sx={{ px: 2.25, py: 0.55, minWidth: 430, flex: '1 1 430px', borderRadius: 1, bgcolor: 'rgba(15,23,42,0.72)', display: 'grid', alignContent: 'center' }}>
                    <Stack direction="row" alignItems="center" spacing={3}>
                        <Box sx={{ minWidth: 165 }}>
                            <Typography variant="caption" color="text.secondary" fontWeight={900}>RIG</Typography>
                            <Typography variant="subtitle1" fontWeight={900} color="primary.main" lineHeight={1.15}>{rig?.rigId}</Typography>
                        </Box>
                        <Divider orientation="vertical" flexItem />
                        <Box sx={{ minWidth: 190 }}>
                            <Typography variant="caption" color="text.secondary" fontWeight={900}>WELL</Typography>
                            <Typography variant="subtitle1" fontWeight={900} color="success.main" lineHeight={1.15}>{wellName}</Typography>
                        </Box>
                    </Stack>
                </Paper>
                <Box sx={{ flexGrow: 1 }} />
                <Stack direction="row" spacing={0.75} alignItems="center" sx={{ px: 1 }}>
                    <StatusChip status={rig?.status} size="small" />
                </Stack>
            </Stack>
        </Paper>
    );
}

function TwinKpi({ label, value, unit, accent = 'primary.main', sx }) {
    return (
        <Paper variant="outlined" sx={{ px: 1.75, py: 0.75, minWidth: 145, borderRadius: 1, textAlign: 'center', bgcolor: 'rgba(15,23,42,0.72)', display: 'grid', alignContent: 'center', ...sx }}>
            <Typography variant="caption" color="text.secondary" fontWeight={900} lineHeight={1} sx={{ display: 'block' }}>{label}</Typography>
            <Typography variant="subtitle1" fontWeight={900} lineHeight={1.15} sx={{ color: accent }} noWrap>
                {value} {unit && <Typography component="span" variant="caption" color="text.secondary">{unit}</Typography>}
            </Typography>
        </Paper>
    );
}

export default function RigDetail() {
    const { id } = useParams();
    const nav = useNavigate();
    const [rig, setRig] = useState(null);
    const [err, setErr] = useState('');
    const [metric, setMetric] = useState('drawworks.hook_load');  // KPI-strip highlight selection
    const [tab, setTab] = useState(0);   // AHWR-50-TWIN style rig pages
    const [equipmentTab, setEquipmentTab] = useState('cat');
    const [equipmentEngine, setEquipmentEngine] = useState('engine1');
    const [kpiOpen, setKpiOpen] = useState(false);  // KPI strip on HMI tabs (default hidden)

    const load = useCallback(() => {
        api.rig(id).then(setRig).catch((e) => setErr(e?.response?.data?.error || 'failed to load rig'));
    }, [id]);

    useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, [load]);

    // Reflect live deltas for this rig immediately.
    useEffect(() => {
        const onUpdate = (row) => { if (row.rigId === id) setRig((r) => (r ? { ...r, ...row } : r)); };
        socket.on('fleet_update', onUpdate);
        return () => socket.off('fleet_update', onUpdate);
    }, [id]);

    const tabs = tabsForRig(rig);
    const menuMeta = menuMetaForRig(rig);
    const activeTab = tabs[tab] ? tab : 0;
    const ActivePage = tabs[activeTab]?.el || tabs[0].el;
    useEffect(() => {
        if (!tabs[tab]) setTab(0);
    }, [tab, tabs]);

    if (err) return <Alert severity="error">{err} - <MLink sx={{ cursor: 'pointer' }} onClick={() => nav('/')}>back to fleet</MLink></Alert>;
    if (!rig) return <Typography color="text.secondary">Loading {id}...</Typography>;

    // The Overview tab renders its own KPI row, so the shared collapsible strip is only
    // for the HMI tabs (toggled via the "KPIs" button); never auto-shown on Overview.
    const showKpis = activeTab > 0 && kpiOpen;
    return (
        <RigDataProvider rigId={id}>
            <RigProvider>
                <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                    <Box sx={{ flex: '0 0 auto' }}>
                        <EdgeTwinTopBar rig={rig} onBack={() => nav('/')} showKpiToggle={activeTab > 0} kpiOpen={kpiOpen} onToggleKpis={() => setKpiOpen((o) => !o)} />
                        <RigStatusRow rig={rig} tab={activeTab} onTabChange={setTab} tabs={tabs} menuMeta={menuMeta} />

                        {showKpis && (
                            <Grid container spacing={1} mb={0.5}>
                                {rig.keyMetrics?.map((k) => (
                                    <Grid item xs={4} sm={3} md={2} key={k.metric}>
                                        <Paper sx={{ p: 1, cursor: 'pointer', borderColor: metric === k.metric ? 'primary.main' : undefined }} onClick={() => setMetric(k.metric)}>
                                            <Typography variant="caption" color="text.secondary" noWrap>{k.label}</Typography>
                                            <Typography variant="subtitle1" fontWeight={800} lineHeight={1.2}>{fmtNum(k.value)} <Typography component="span" variant="caption" color="text.secondary">{k.unit}</Typography></Typography>
                                        </Paper>
                                    </Grid>
                                ))}
                            </Grid>
                        )}
                    </Box>

                    {/* Tab content fills the remaining viewport height; tall panels scroll
                        within, while the EDR (height:100%) fills exactly. A single
                        RigDataProvider feeds both the Overview (live equipment/efficiency)
                        and the HMI mirror panels. */}
                    <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
                        <ErrorBoundary key={tabs[activeTab].key} label="This panel">
                            {React.createElement(ActivePage, {
                                rigId: id,
                                rig,
                                initialTab: activeTab === tabs.findIndex((item) => item.key === 'equipment') ? equipmentTab : undefined,
                                initialEngine: equipmentEngine,
                                onTabChange: (key, requestedEquipmentTab, requestedEngine) => {
                                    if (key === 'equipment' && requestedEquipmentTab) setEquipmentTab(requestedEquipmentTab);
                                    if (key === 'equipment' && (requestedEngine === 'engine1' || requestedEngine === 'engine2')) setEquipmentEngine(requestedEngine);
                                    const nextTab = tabs.findIndex((item) => item.key === key);
                                    if (nextTab >= 0) setTab(nextTab);
                                },
                            })}
                        </ErrorBoundary>
                    </Box>
                </Box>
            </RigProvider>
        </RigDataProvider>
    );
}
// ---------------------------------------------------------------------------
// Overview Ã¢â‚¬â€ operator dashboard mirror of the edge app.
// ---------------------------------------------------------------------------

const fmtDur = (sec) => {
    const s = Math.max(0, Math.round(Number(sec) || 0));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m`;
    return `${s}s`;
};
const fmtMins = (sec) => `${Math.round((Number(sec) || 0) / 60)}m`;

const pctMaps = {
    sequence: { 0: 'OFF', 1: 'MAKE-UP', 2: 'BREAK-OUT', 3: 'RESET', 4: 'FAULT' },
    operationMode: { 0: 'UNKNOWN', 1: 'NORMAL', 2: 'MANUAL' },
    status: { 0: 'OFF', 1: 'ON in IDLE', 2: 'ON' },
    dollyWorkPark: { 0: 'NONE', 1: 'OUT PARK. POS', 2: 'MOVE WORK', 3: 'MOVE PARK', 4: 'IN PARK', 5: 'FAULT', 6: 'IN WORK' },
    clamp: { 0: 'NONE', 1: 'OPENING', 2: 'CLOSING', 3: 'IS OPEN', 4: 'IS CLOSE', 5: 'FAULT' },
    dollyUpDown: { 0: 'NO CMD ACTIVE', 1: 'MOVE UP', 2: 'MOVE DOWN' },
    spinnerRotation: { 0: 'NO CMD ACTIVE', 1: 'FULLY UP', 2: 'FULLY DOWN', 3: 'MAKE-UP', 4: 'BREAK-OUT', 10: 'SPINNER NOT MOUNTED' },
    spinnerGripper: { 0: 'NONE', 1: 'OPENING', 2: 'CLOSING', 3: 'OPEN', 4: 'CLOSE', 5: 'FAULT', 10: 'SPINNER NOT MOUNTED' },
    spinnerFloating: { 0: 'OFF', 1: 'ON', 10: 'SPINNER NOT MOUNTED' },
};
function pctLabel(mapName, value, fallback = 'UNKNOWN') {
    if (value == null || value === '') return fallback;
    const n = Number(value);
    const map = pctMaps[mapName] || {};
    if (Number.isFinite(n) && Object.prototype.hasOwnProperty.call(map, n)) return map[n];
    return String(value);
}
const catMaps = {
    status: { '-1': 'UNKNOWN', 0: 'READY', 1: 'IN PROGRESS', 2: 'STATUS DONE', 3: 'EMERGENCY NOT OK', 4: 'NOT READY', 5: 'FAULT', 6: 'RUNNING + FAULT', 7: 'STOP FORCED' },
    sourceCmd: { 0: 'NONE', 1: 'LOCAL', 2: 'REMOTE', 3: 'MANUAL', 4: 'AUTO', 5: 'DCC', 6: '---' },
};
function catLabel(mapName, value, fallback = 'UNKNOWN') {
    if (value == null || value === '') return fallback;
    const key = String(Number(value));
    const map = catMaps[mapName] || {};
    if (Object.prototype.hasOwnProperty.call(map, key)) return map[key];
    return String(value);
}

// Map an equipment status code to a coarse chip ({label, color}) for the
// compact status grid. Codes follow the edge enums (0=off/idle, 2=on/run, etc.).
const htdMaps = {
    status: { 0: 'OFF', 1: 'ON in IDLE', 2: 'ON' },
    workMode: { 0: 'UNKNOWN', 1: 'DRILL', 2: 'SPIN', 3: 'TORQUE' },
    opMode: { 0: 'UNKNOWN', 1: 'DOLLY', 2: 'LINK' },
    rotation: { 0: 'STAND STILL', 1: 'ROTATION FWD', 2: 'ROTATION BWD', 3: 'NEUTRAL' },
    lube: { 0: 'OFF', 1: 'CMD RUN', 2: 'RUNNING', 3: 'FAULT' },
    gearSelection: { '-1': 'FAULT', 0: 'UNKNOWN', 1: 'GEAR 1', 2: 'GEAR 2', 3: 'GEAR 3', 4: 'GEAR 4', 5: 'GEAR 1 REGENERATIVE', 6: 'GEAR 2 REGENERATIVE', 7: 'GEAR 3 REGENERATIVE', 8: 'GEAR 4 REGENERATIVE' },
    brake: { 0: 'UNKNOWN', 1: 'CLOSING', 2: 'CLOSED', 3: 'OPENING', 4: 'OPEN', 5: 'FAULT' },
    elevator: { 0: 'UNKNOWN', 1: 'OPENING', 2: 'CLOSING', 3: 'OPEN', 4: 'CLOSE', 5: 'FAULT' },
    ibop: { 0: 'UNKNOWN', 1: 'OPENING', 2: 'CLOSING', 3: 'OPEN', 4: 'CLOSE', 5: 'FAULT' },
    linkRotation: { 0: 'UNKNOWN', 1: 'UNLOCKING', 2: 'UNLOCKED', 3: 'ROT. FWD', 4: 'ROT. BWD', 5: 'LOCKING', 6: 'LOCKED', 7: 'FAULT' },
    linkTilt: { 0: 'NONE', 1: 'FLOAT ON', 2: 'VERTICAL', 3: 'FLOAT OFF', 4: 'EXTEND', 5: 'RETRACT', 6: 'FAULT' },
    suspension: { 0: 'NONE', 1: 'IN PUSH', 2: 'IN PULL' },
    tilt: { 1: 'TILTING IN', 2: 'TILT IN', 3: 'TILTING OUT', 4: 'TILT OUT', 5: 'HALF WAY', 6: 'STAND STILL' },
    inclinationStatus: { 1: 'INCLINATION IN IN PROGRESS', 2: 'INCLINATION IN', 3: 'INCLINATION OUT IN PROGRESS', 4: 'INCLINATED OUT', 5: 'HALF WAY', 6: 'STAND STILL', 7: 'TILTED IN', 8: 'TILTED OUT' },
};
function htdLabel(mapName, value, fallback = 'UNKNOWN') {
    if (value == null || value === '') return fallback;
    const n = Number(value);
    const map = htdMaps[mapName] || {};
    if (Number.isFinite(n)) {
        if (Object.prototype.hasOwnProperty.call(map, n)) return map[n];
        if (Object.prototype.hasOwnProperty.call(map, String(n))) return map[String(n)];
    }
    return String(value);
}
const hpuMaps = {
    status: { 0: 'OFF', 1: 'ON in IDLE', 2: 'ON' },
    opMode: { 0: 'UNKNOWN', 1: 'DRILLING', 2: 'RIGUP' },
    oilTemp: { 0: 'TEMP. OK', 1: 'TEMP. LOW', 2: 'TEMP. HIGH', 3: 'TEMP. HIGH-HIGH' },
    oilLevel: { 0: 'LEVEL OK', 1: 'LEVEL LOW', 2: 'LEVEL LOW-LOW', 3: 'LEVEL HIGH', 4: 'LEVEL HIGH-HIGH' },
    filter: { 0: 'CLOGGED', 1: 'OK' },
    pump: { 0: 'NOT READY', 1: 'READY', 2: 'ENABLE' },
};
function hpuLabel(mapName, value, fallback = 'UNKNOWN') {
    if (value == null || value === '') return fallback;
    const n = Number(value);
    const map = hpuMaps[mapName] || {};
    if (Number.isFinite(n) && Object.prototype.hasOwnProperty.call(map, n)) return map[n];
    return String(value);
}
function equipChip(value) {
    if (value == null) return { label: 'Ã¢â‚¬â€', color: 'default' };
    const n = Number(value);
    if (Number.isNaN(n)) return { label: String(value), color: 'default' };
    if (n <= 0) return { label: 'OFF', color: 'default' };
    if (n === 1) return { label: 'IDLE', color: 'info' };
    if (n === 2) return { label: 'RUN', color: 'success' };
    return { label: 'FAULT', color: 'error' };  // 3+ -> fault/error states across the edge enums
}

function EquipChip({ label, value }) {
    const c = equipChip(value);
    return (
        <Stack direction="row" spacing={0.75} alignItems="center"
            sx={{ px: 1, py: 0.5, borderRadius: 1, border: '1px solid', borderColor: 'divider', bgcolor: 'background.default' }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', flex: '0 0 auto',
                bgcolor: c.color === 'default' ? 'text.disabled' : `${c.color}.main` }} />
            <Typography variant="caption" fontWeight={700} noWrap>{label}</Typography>
                <Box sx={{ flexGrow: 1 }} />
            <Typography variant="caption" color="text.secondary" noWrap>{c.label}</Typography>
        </Stack>
    );
}

const EDR_STRIPS = [
    { title: 'Hoisting', pens: [
        { channelId: 'drawworks.hook_load', color: '#38bdf8', min: 0, max: 500, enabled: true },
        { channelId: 'drilling.rop', color: '#f472b6', min: 0, max: 80, enabled: true },
    ] },
    { title: 'Pump', pens: [
        { channelId: 'mudpump.spm', color: '#4ade80', min: 0, max: 200, enabled: true },
        { channelId: 'mudpump.pressure', color: '#fbbf24', min: 0, max: 500, enabled: true },
    ] },
];
const EDR_CHANNELS = ['drawworks.hook_load', 'drilling.rop', 'mudpump.spm', 'mudpump.pressure'];

function OverviewTab({ rigId, rig }) {
    const { data: live } = useRigData();
    const dw = live?.drawworks || {};
    const dr = live?.drilling || {};
    const mp = live?.mudpump || {};
    const hpu = live?.hpu || {};
    const htd = live?.htd || {};
    const pct = live?.pct || {};
    const eng = live?.cat_engine || live?.engine || {};
    const acs = live?.acs || {};
    const cwk = live?.cwk || {};
    const fluid = live?.fluid || {};
    const wc = live?.well_control || live?.wellcontrol || {};
    const wh = live?.wellhead || {};
    const system = live?.system || {};
    const transmission = live?.allison || live?.transmission || {};

        const [overviewTrends, setOverviewTrends] = useState({ woh: [], htd: [], catRpm: [], catLoad: [] });

    useEffect(() => {
        let alive = true;
        const load = async () => {
            try {
                                const [wohRows, htdRows, catRpmRows, catLoadRows] = await Promise.all([
                    api.history(rigId, 'drawworks.hook_load', 60),
                    api.history(rigId, 'htd.rpm', 60),
                    api.history(rigId, 'cat_engine.rpm', 60).catch(() => api.history(rigId, 'engine.rpm', 60)),
                    api.history(rigId, 'cat_engine.load', 60).catch(() => api.history(rigId, 'engine.load', 60)),
                ]);
                if (alive) setOverviewTrends({ woh: wohRows || [], htd: htdRows || [], catRpm: catRpmRows || [], catLoad: catLoadRows || [] });
            } catch (e) {
                if (alive) setOverviewTrends({ woh: [], htd: [], catRpm: [], catLoad: [] });
            }
        };
        load();
        const id = setInterval(load, 15000);
        return () => { alive = false; clearInterval(id); };
    }, [rigId]);
const hookLoad = dw.hook_load ?? 0;
    const wob = dr.wob ?? 0;
    const htdRpm = htd.rpm ?? dr.rpm ?? transmission.output_rpm ?? 0;
    const torque = htd.torque ?? dr.torque ?? 0;
    const pumpPressure = Number(mp.pressure ?? mp.pump_pressure ?? 0) || 0;
    const spp = pumpPressure > 500 ? pumpPressure : pumpPressure * 14.5038;
    const spm = mp.spm ?? 0;
    const blockPosition = dw.block_position ?? dr.bit_depth ?? 0;
    const activity = live?._activity || {};
    const engineLoad = eng.load ?? eng.engine_load ?? eng.torque_percent ?? 0;
    const engineRpm = eng.rpm ?? eng.engine_rpm ?? 0;
    const hpuPressure = hpu.discharge_pressure ?? hpu.dis_press ?? hpu.pressure ?? system.rig_air_pressure ?? 0;
    const tripTank = fluid.trip_tank ?? live?.trip_tank ?? 0;
    const gainLoss = fluid.tank_gain_loss ?? fluid.gain_loss ?? 0;

    return (
        <Box sx={{ bgcolor: '#0b1220', minHeight: '100%', p: 1.25, overflowX: 'hidden', overflowY: 'auto' }}>
            <Box sx={{
                width: '100%',
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', xl: '150px minmax(980px, 1.35fr) minmax(560px, .8fr)' },
                gap: 1.2,
                alignItems: 'stretch',
            }}>
                <TwinPanel sx={{ minHeight: 690, display: 'flex', flexDirection: 'column', p: 1.2, bgcolor: '#1b2940' }}>
                    <Typography sx={{ color: '#8797b0', fontSize: 11, fontWeight: 900, letterSpacing: 2, mb: 1.4 }}>STRING & ACTIVITY</Typography>
                    <Box sx={{ border: '1px solid #33445f', borderRadius: 1, p: 1.2, mb: 1 }}>
                        <Typography sx={{ color: '#8797b0', fontSize: 9, fontWeight: 900 }}>CURRENT ACTIVITY</Typography>
                        <Typography sx={{ color: '#fff', fontSize: 19, fontWeight: 900 }}>{activity.label || rig?.activeActivity || 'IDLE'}</Typography>
                        <Typography sx={{ color: '#8797b0', fontSize: 8, fontWeight: 800 }}>auto</Typography>
                    </Box>
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.8, mb: 1 }}>
                        <TwinTinyMetric label="STRING" value={dr.bit_depth ?? 0} unit="m" color="#ff9d2e" />
                        <TwinTinyMetric label="TOTAL" value={dr.hole_depth ?? 0} unit="m" color="#f4f8ff" />
                    </Box>
                    <TwinStringDepth bitDepth={dr.bit_depth ?? 0} holeDepth={dr.hole_depth ?? 0} sx={{ flex: 1, minHeight: 360 }} />
                    <Box sx={{ border: '1px solid #33445f', borderRadius: 1, p: 1.1, mt: 1 }}>
                        <Typography sx={{ color: '#8797b0', fontSize: 9, fontWeight: 900, mb: 0.7 }}>CONNECTIONS</Typography>
                        <Stack direction="row" justifyContent="space-between">
                            <Typography sx={{ color: '#8797b0', fontSize: 9, fontWeight: 900 }}>TORQUE TURN</Typography>
                            <Typography sx={{ color: '#ffc24b', fontSize: 9, fontWeight: 900 }}>LAST MAKE-UP</Typography>
                        </Stack>
                        <Stack direction="row" justifyContent="space-between" mt={0.3}>
                            <Typography sx={{ color: '#fff', fontSize: 12, fontWeight: 900 }}>IDLE</Typography>
                            <Typography sx={{ color: '#23dd86', fontSize: 12, fontWeight: 900 }}>{fmtNum(pct.last_makeup_torque ?? 0, 0)} daN-m</Typography>
                        </Stack>
                    </Box>
                </TwinPanel>

                <TwinPanel sx={{ minHeight: 690, p: 1.2, bgcolor: '#1b2940' }}>
                    <Typography sx={{ color: '#8797b0', fontSize: 12, fontWeight: 900, letterSpacing: 2, mb: 1.2 }}>WORKOVER RIG & EQUIPMENT</Typography>
                    <Box sx={{ display: 'grid', gridTemplateColumns: '160px minmax(520px, 1fr) 160px', gap: 1.2, alignItems: 'stretch', height: 'calc(100% - 28px)' }}>
                        <Stack spacing={1.1} justifyContent="space-between">
                            <TwinEquipCard title="CAT ENG" status={catLabel('status', eng.status)} statusColor="#23dd86" rows={[
                                ['LOAD', `${fmtNum(eng.load ?? 0, 0)} %`, '#46a6ff'],
                                ['RPM', `${fmtNum(eng.rpm ?? 0, 0)}`, '#46a6ff'],
                                ['COOLANT', `${fmtNum(eng.coolant_temp ?? 0, 0)} degC`, '#46a6ff'],
                                ['OIL PRESS', `${fmtNum(eng.oil_pressure ?? 0, 1)} bar`, '#ff9d2e'],
                            ]} />
                            <TwinEquipCard title="HPU" status={hpuLabel('status', hpu.status)} statusColor="#ffc24b" rows={[
                                ['DISCHARGE', `${fmtNum(hpu.discharge_pressure ?? hpu.dis_press ?? hpu.pressure ?? 0, 0)} bar`, '#23dd86'],
                                ['OIL TEMP', `${fmtNum(hpu.oil_temp ?? hpu.temperature ?? 0, 1)} degC`, '#23dd86'],
                                ['OIL LEVEL', `${fmtNum(hpu.oil_level ?? 0, 0)} %`, '#23dd86'],
                                ['FILTERS', hpu.filter_status != null ? hpuLabel('filter', hpu.filter_status) : '7/8', '#23dd86'],
                            ]} />
                            <TwinEquipCard title="HTD" status={htdLabel('status', htd.status)} statusColor="#27cfe6" rows={[
                                ['RPM', `${fmtNum(htdRpm, 0)}`, '#9a8bff'],
                                ['TORQUE', `${fmtNum(torque, 0)} daN-m`, '#9a8bff'],
                                ['GEAR', htdLabel('gearSelection', htd.gear_selection ?? htd.gear_status), '#9a8bff'],
                                ['ELEVATOR', htdLabel('elevator', htd.elevator_status), '#9a8bff'],
                            ]} />
                            <TwinEquipCard title="PCT" status={pctLabel('status', pct.status)} statusColor="#8797b0" rows={[
                                ['MAKE-UP', `${fmtNum(pct.makeup_torque ?? 0, 0)} daN-m`, '#27cfe6'],
                                ['LAST', `${fmtNum(pct.last_makeup_torque ?? 0, 0)} daN-m`, '#27cfe6'],
                                ['DOLLY', pctLabel('dollyWorkPark', pct.dolly_status, 'IN PARK'), '#27cfe6'],
                                ['UP CLAMP', `${fmtNum(pct.clamp_up_pressure ?? 0, 1)} bar`, '#27cfe6'],
                            ]} />
                        </Stack>
                        <TwinWorkoverMast blockPosition={blockPosition} pct={pct} htd={htd} cwk={cwk} live={!!live} />
                        <Stack spacing={1.1} justifyContent="space-between">
                            <TwinEquipCard title="ACS" status={headerLabel('acs', acs.status, '---')} statusColor="#8797b0" danger rows={[
                                ['CROWNSAVER', `${fmtNum(acs.crownsaver ?? 0, 0)}mm`, '#ff4a60'],
                                ['FLOORSAVER', `${fmtNum(acs.floorsaver ?? 0, 0)}mm`, '#ff4a60'],
                                ['BOTTOMSAVER', `${fmtNum(acs.bottomsaver ?? 0, 0)}mm`, '#ff4a60'],
                                ['BLOCK POS', `${fmtNum(blockPosition, 0)}mm`, '#ff4a60'],
                            ]} />
                            <TwinEquipCard title="CIRC PUMP" status={Number(spm) > 0 ? 'PUMPING' : 'STOPPED'} statusColor={Number(spm) > 0 ? '#23dd86' : '#64748b'} rows={[
                                ['PRESS', `${fmtNum(spp, 0)} psi`, '#a9ef34'],
                                ['RATE', `${fmtNum(spm, 0)} spm`, '#a9ef34'],
                                ['TRIP TANK', `${fmtNum(live?.fluid?.trip_tank ?? 0, 1)} m3`, '#a9ef34'],
                                ['GAIN/LOSS', `${fmtNum(live?.fluid?.tank_gain_loss ?? 0, 0)} m3`, '#a9ef34'],
                            ]} />
                            <TwinEquipCard title="CATWALK" status={Number(cwk.status) === 1 ? 'PARKED' : '---'} statusColor={Number(cwk.status) === 1 ? '#23dd86' : '#64748b'} rows={[
                                ['CARRIER', cwk.carrier_status != null ? String(cwk.carrier_status) : '---', '#ffc24b'],
                                ['CLAMP', cwk.clamp_status != null ? String(cwk.clamp_status) : '---', '#f4f8ff'],
                                ['CLAMP P', `${fmtNum(cwk.clamp_pressure ?? 0, 0)} bar`, '#ffc24b'],
                                ['CLAMP F', `${fmtNum(cwk.clamp_force ?? 0, 0)} daN`, '#ffc24b'],
                            ]} />
                            <TwinEquipCard title="WELL CONTROL" status={live?.well_control?.available ? 'OK' : 'NO BOP SOURCE'} statusColor={live?.well_control?.available ? '#23dd86' : '#ff4a60'} danger rows={[
                                ['TUBING P', `${fmtNum(live?.wellhead?.tubing_pressure ?? 0, 0)} bar`, '#f4f8ff'],
                                ['CASING P', `${fmtNum(live?.wellhead?.casing_pressure ?? 0, 0)} bar`, '#f4f8ff'],
                                ['ACCUM', `${fmtNum(live?.well_control?.accumulator_pressure ?? 0, 0)} psi`, '#f4f8ff'],
                                ['ANNULAR', `${fmtNum(live?.well_control?.annular_pressure ?? 0, 0)} psi`, '#f4f8ff'],
                            ]} />
                        </Stack>
                    </Box>
                </TwinPanel>

                <TwinPanel sx={{ minHeight: 690, p: 1.1, display: 'flex', flexDirection: 'column', bgcolor: '#1b2940' }}>
                    <Typography sx={{ color: '#8797b0', fontSize: 12, fontWeight: 900, letterSpacing: 2, mb: 1.2 }}>PRIMARY INSTRUMENTS</Typography>
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1.0, minHeight: 260 }}>
                        <Box sx={{ minHeight: 230, display: 'flex', flexDirection: 'column' }}>
                            <TwinGauge label="HOOK LOAD" value={hookLoad} unit="t" subLabel="WOB" subValue={wob} subUnit="t" max={100} majorStep={20} minorStep={4} color="#23dd86" />
                        </Box>
                        <Box sx={{ minHeight: 230, display: 'flex', flexDirection: 'column' }}>
                            <TwinGauge label="HTD" value={htdRpm} unit="rpm" subLabel="TORQUE" subValue={torque} subUnit="daN-m" subDecimals={0} max={180} majorStep={36} minorStep={6} color="#23dd86" />
                        </Box>
                        <Box sx={{ minHeight: 230, display: 'flex', flexDirection: 'column' }}>
                            <TwinGauge label="SPP" value={spp} unit="psi" decimals={0} subLabel="RATE" subValue={spm} subUnit="spm" max={3000} majorStep={600} minorStep={100} color="#23dd86" />
                        </Box>
                    </Box>
                    <Box sx={{ flex: 1, mt: 1.2, border: '1px solid rgba(62,166,255,.18)', borderRadius: 1, p: 1, bgcolor: '#07111e' }}>
                        <Typography sx={{ color: '#f4f8ff', fontSize: 12, fontWeight: 900, letterSpacing: 2, mb: 1 }}>LAST 12H TRENDS</Typography>
                        <TrendStrip color="#ff9d2e" points={overviewTrends.woh} max={100} label="HOOK LOAD" compact />
                        <TrendStrip color="#27cfe6" points={overviewTrends.htd} max={200} label="HTD RPM" compact />
                        <TrendStrip color="#ffc24b" points={overviewTrends.catLoad} max={100} label="GENSET LOAD" compact />
                    </Box>
                </TwinPanel>
            </Box>

            <Box sx={{
                mt: 1.0,
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', lg: '17% minmax(0, 36%) minmax(0, 47%)' },
                gap: 1.0,
                alignItems: 'stretch',
                minHeight: 345,
            }}>
                <TwinPanel sx={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', p: 1.25 }}>
                    <PanelTitle title="CAT ENGINE" status={catLabel('status', eng.status)} />
                    <EngineIcon />
                    <EngineStat value={eng.rpm ?? 0} unit="RPM" color="#16b8ff" max={2200} points={overviewTrends.catRpm} sx={{ minHeight: 98 }} />
                    <Box sx={{ flexGrow: 1 }} />
                    <EngineStat label="LOAD" value={eng.load ?? 0} unit="%" color="#38f58a" max={100} points={overviewTrends.catLoad} sx={{ minHeight: 98 }} />
                </TwinPanel>

                <Stack spacing={1.0} sx={{ height: '100%', minHeight: 0 }}>
                    <TwinPanel sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                        <PanelTitle title="PCT" status={pctLabel('status', pct.status)} color="#a855f7" />
                        <Box sx={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gridTemplateRows: 'repeat(2, minmax(0, 1fr))', gap: 0.65 }}>
                            <ParamBox label="SEQUENCE" value={pctLabel('sequence', pct.sequence, 'OFF')} fill />
                            <ParamBox label="MAKE-UP TORQUE" value={pct.makeup_torque ?? 0} unit="daN*m" fill />
                            <ParamBox label="SPINNER MU TORQUE" value={pct.spinner_torque ?? 0} unit="daN*m" fill />
                            <ParamBox label="DOLLY STATUS" value={pctLabel('dollyWorkPark', pct.dolly_status, 'NONE')} fill />
                            <ParamBox label="LOW CLAMP STATUS" value={pctLabel('clamp', pct.clamp_low_status, 'NONE')} fill />
                            <ParamBox label="UPPER CLAMP STATUS" value={pctLabel('clamp', pct.clamp_up_status ?? pct.clamp_upper_status, 'NONE')} fill />
                        </Box>
                    </TwinPanel>

                    <TwinPanel sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                        <PanelTitle title="HTD" status={htdLabel('status', htd.status)} color="#38f58a" />
                        <Box sx={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gridTemplateRows: 'repeat(2, minmax(0, 1fr))', gap: 0.65 }}>
                            <ParamBox label="WORK MODE" value={htdLabel('workMode', htd.work_mode)} fill />
                            <ParamBox label="GEAR SELECTION" value={htdLabel('gearSelection', htd.gear_selection ?? htd.gear_status)} fill />
                            <ParamBox label="BRAKE" value={htdLabel('brake', htd.brake ?? htd.brake_status)} fill />
                            <ParamBox label="IBOP / ELEVATOR" value={`${htdLabel('ibop', htd.ibop_status)} / ${htdLabel('elevator', htd.elevator_status)}`} small fill />
                            <ParamBox label="ROTATION" value={htdLabel('rotation', htd.rotation ?? htd.rotation_status)} fill />
                            <ParamBox label="V-SPEED" value={htd.v_speed ?? 0} unit="mm/sec" fill />
                        </Box>
                    </TwinPanel>
                </Stack>

                <TwinPanel sx={{ height: '100%', minHeight: 345, display: 'flex', flexDirection: 'column' }}>
                    <PanelTitle title="HPU (HYDRAULIC POWER UNIT)" status={hpuLabel('status', hpu.status)} />
                    <Box sx={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.42fr 1fr' }, gap: 1.0, alignItems: 'stretch' }}>
                        <Box sx={{ minHeight: 0, display: 'grid', gridTemplateRows: 'auto repeat(3, minmax(0, 1fr))', gap: 0.65 }}>
                            <SubHead sx={{ mb: 0 }}>HYDRAULIC PUMPS</SubHead>
                            <ParamGroup title="PUMP-3 PDW" status={hpuLabel('pump', hpu.pdw_pump_status ?? hpu.pump_3_status, 'NOT READY')} warn>
                                <InlineParam label="FLOW SP" value={hpu.flow_sp ?? hpu.pdw_flow_sp ?? 0} unit="%" />
                                <InlineParam label="PRESS SP" value={hpu.press_sp ?? hpu.pdw_press_sp ?? 0} unit="bar" />
                                <InlineParam label="FLOW" value={hpu.flow ?? hpu.pdw_flow ?? 0} unit="%" />
                                <InlineParam label="PRESS" value={hpu.pressure ?? hpu.pdw_press ?? 0} unit="bar" />
                            </ParamGroup>
                            <ParamGroup title="HTD PUMP-2" status={hpuLabel('pump', hpu.htd_pump_2_status ?? hpu.htd_pump1_status, 'NOT READY')} warn>
                                <InlineParam label="FLOW SP" value={hpu.htd_pump_2_flow_sp ?? 0} unit="%" />
                                <InlineParam label="PRESS SP" value={hpu.htd_pump_2_press_sp ?? 0} unit="bar" />
                                <InlineParam label="FLOW" value={hpu.htd_pump_2_flow ?? 0} unit="%" />
                                <InlineParam label="PRESS" value={hpu.htd_pump_2_press ?? 0} unit="bar" />
                            </ParamGroup>
                            <ParamGroup title="HTD PUMP-4" status={hpuLabel('pump', hpu.htd_pump_4_status ?? hpu.htd_pump2_status ?? hpu.htd_pump4_status, 'NOT READY')} warn>
                                <InlineParam label="FLOW SP" value={hpu.htd_pump_4_flow_sp ?? 0} unit="%" />
                                <InlineParam label="PRESS SP" value={hpu.htd_pump_4_press_sp ?? 0} unit="bar" />
                                <InlineParam label="FLOW" value={hpu.htd_pump_4_flow ?? 0} unit="%" />
                                <InlineParam label="PRESS" value={hpu.htd_pump_4_press ?? 0} unit="bar" />
                            </ParamGroup>
                        </Box>
                        <Box sx={{ minHeight: 0, display: 'grid', gridTemplateRows: 'auto repeat(4, minmax(0, 1fr))', gap: 0.65 }}>
                            <SubHead sx={{ mb: 0 }}>OTHER PARAMETERS</SubHead>
                            <WideParamBox label="DIS PRESS" value={hpu.discharge_pressure ?? hpu.dis_press ?? hpu.pressure ?? 0} unit="bar" />
                            <WideParamBox label="AUX PRESS" value={hpu.aux_pressure ?? hpu.aux_press ?? 0} unit="bar" />
                            <WideParamBox label="OIL TEMP" value={hpu.oil_temp ?? hpu.temperature ?? 0} unit="degC" />
                            <WideParamBox label="OIL LEVEL" value={hpu.oil_level ?? 0} unit="%" />
                        </Box>
                    </Box>
                </TwinPanel>
            </Box>
        </Box>
    );
}
function TwinTinyMetric({ label, value, unit, color }) {
    return (
        <Box sx={{ bgcolor: '#07111e', border: '1px solid rgba(62,166,255,.18)', borderRadius: 0.75, px: 0.75, py: 0.65, minHeight: 48, display: 'grid', alignContent: 'center' }}>
            <Typography sx={{ color: '#8797b0', fontSize: 8, fontWeight: 900, lineHeight: 1 }}>{label}</Typography>
            <Typography sx={{ color, fontSize: 16, fontWeight: 900, lineHeight: 1.15 }}>{fmtNum(value, 0)}<Typography component="span" sx={{ color: '#b8c6dc', fontSize: 10, ml: 0.4 }}>{unit}</Typography></Typography>
        </Box>
    );
}

function TwinStringDepth({ bitDepth, holeDepth, sx }) {
    const bit = Math.max(0, Number(bitDepth) || 0);
    const total = Math.max(bit, Number(holeDepth) || 0, 1);
    const pct = Math.max(8, Math.min(92, (bit / total) * 88));
    return (
        <Box sx={{ height: 345, border: '1px solid #33445f', borderRadius: 1, position: 'relative', overflow: 'hidden', bgcolor: '#172236', ...sx }}>
            <Box sx={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(0deg, transparent 0 86px, rgba(148,163,184,.08) 87px)' }} />
            <Box sx={{ position: 'absolute', top: 18, bottom: 22, left: '44%', width: 2, bgcolor: '#46a6ff', opacity: 0.75 }} />
            <Box sx={{ position: 'absolute', top: 18, bottom: 22, left: '57%', width: 2, bgcolor: '#46a6ff', opacity: 0.75 }} />
            <Box sx={{ position: 'absolute', left: 11, right: 11, top: `${pct}%`, height: 3, bgcolor: '#ff9d2e' }} />
            <Box sx={{ position: 'absolute', top: `calc(${pct}% - 4px)`, right: 8, width: 10, height: 10, borderRadius: '50%', bgcolor: '#ff9d2e', boxShadow: '0 0 8px #ff9d2e' }} />
            <Typography sx={{ position: 'absolute', top: 13, left: 11, color: '#8797b0', fontSize: 8, fontWeight: 900 }}>SURFACE 0m</Typography>
            {[0.25, 0.5, 0.75].map((line) => (
                <Typography key={line} sx={{ position: 'absolute', top: `calc(${line * 100}% - 7px)`, right: 5, color: '#8797b0', fontSize: 8, fontWeight: 700 }}>{fmtNum(total * line, 0)}m</Typography>
            ))}
            <Typography sx={{ position: 'absolute', top: `calc(${pct}% - 13px)`, left: 11, color: '#ff9d2e', fontSize: 9, fontWeight: 900 }}>PIPE {fmtNum(bit, 0)}m</Typography>
        </Box>
    );
}

function TwinEquipCard({ title, status, statusColor = '#8797b0', rows = [], danger }) {
    return (
        <Box sx={{
            border: '1px solid rgba(62,166,255,.24)',
            borderLeft: `4px solid ${danger ? '#ff4a60' : statusColor}`,
            borderRadius: 1,
            bgcolor: '#07111e',
            p: 1,
            minHeight: 118,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
        }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" mb={0.5}>
                <Typography sx={{ color: '#f4f8ff', fontSize: 14, fontWeight: 900, lineHeight: 1 }}>{title}</Typography>
                <Stack direction="row" alignItems="center" spacing={0.45}>
                    <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: statusColor }} />
                    <Typography sx={{ color: statusColor, fontSize: 9, fontWeight: 900 }}>{status}</Typography>
                </Stack>
            </Stack>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.55 }}>
                {rows.map(([label, value, color]) => (
                    <Box key={label} sx={{ minWidth: 0 }}>
                        <Typography sx={{ color: '#b8c6dc', fontSize: 8, fontWeight: 900, lineHeight: 1.2 }}>{label}</Typography>
                        <Typography sx={{ color: color || '#f4f8ff', fontSize: 12, fontWeight: 900, lineHeight: 1.2 }} noWrap>{value}</Typography>
                    </Box>
                ))}
            </Box>
        </Box>
    );
}

function TwinWorkoverMast({ blockPosition, pct, htd, cwk, live }) {
    const numeric = Math.max(0, Number(blockPosition) || 0);
    const y = 320 - Math.min(1, numeric / 15000) * 230;
    const dolly = pctLabel('dollyWorkPark', pct?.dolly_status, 'NO DATA');
    const elevator = htdLabel('elevator', htd?.elevator_status, 'NO DATA');
    return (
        <Box sx={{ minHeight: 620, position: 'relative', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
            <svg viewBox="0 0 390 540" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
                <defs>
                    <filter id="twinMastGlow" x="-30%" y="-30%" width="160%" height="160%">
                        <feGaussianBlur stdDeviation="4" result="blur" />
                        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                    </filter>
                </defs>
                <polygon points="195,54 116,453 274,453" fill="#0f172a" opacity="0.18" stroke="#46a6ff" strokeWidth="1.2" strokeDasharray="9 9" />
                <text x="160" y="74" textAnchor="end" fill="#8797b0" fontSize="11" fontWeight="900">CROWN</text>
                <rect x="170" y="42" width="50" height="20" rx="4" fill="#33445f" stroke="#8797b0" strokeWidth="2" />
                <circle cx="184" cy="52" r="5" fill="#8797b0" />
                <circle cx="207" cy="52" r="5" fill="#8797b0" />
                <line x1="185" y1="62" x2="130" y2="430" stroke="#33445f" strokeWidth="5" />
                <line x1="205" y1="62" x2="260" y2="430" stroke="#33445f" strokeWidth="5" />
                <line x1="195" y1="62" x2="195" y2="430" stroke="#1f2937" strokeWidth="6" />
                <line x1="184" y1="56" x2="184" y2={y - 45} stroke="#22ff66" strokeWidth="2" />
                <line x1="207" y1="56" x2="207" y2={y - 45} stroke="#22ff66" strokeWidth="2" />
                <line x1="150" y1="120" x2="60" y2="470" stroke="#33445f" strokeDasharray="8 8" opacity="0.55" />
                <line x1="240" y1="120" x2="330" y2="470" stroke="#33445f" strokeDasharray="8 8" opacity="0.55" />
                <text x="260" y="256" fill="#8797b0" fontSize="13" fontWeight="900">TELESCOPING</text>
                <rect x="170" y={y} width="50" height="18" rx="3" fill="#475569" stroke="#b8c6dc" strokeWidth="2" />
                <rect x="164" y={y - 45} width="62" height="32" rx="4" fill="#0b2738" stroke="#27cfe6" strokeWidth="3" filter="url(#twinMastGlow)" />
                <text x="195" y={y - 24} textAnchor="middle" fill="#27cfe6" fontSize="12" fontWeight="900">HTD</text>
                <rect x="158" y={y - 5} width="74" height="22" rx="5" fill="#111827" stroke="#ffc24b" strokeWidth="3" />
                <text x="195" y={y + 10} textAnchor="middle" fill="#ffc24b" fontSize="10" fontWeight="900">ELEVATOR</text>
                <text x="142" y={y + 5} textAnchor="end" fill="#ff9d2e" fontSize="11" fontWeight="900">{fmtNum(numeric, 0)} mm</text>
                <rect x="125" y="360" width="140" height="20" rx="4" fill="#33445f" stroke="#8797b0" strokeWidth="2" />
                <rect x="120" y="430" width="150" height="18" rx="3" fill="#33445f" />
                <line x1="95" y1="448" x2="310" y2="448" stroke="#33445f" strokeWidth="4" />
                <path d="M65 440 L120 417 L145 417 L145 440 Z" fill="none" stroke="#8797b0" strokeWidth="4" />
                <rect x="92" y="421" width="48" height="9" rx="2" fill="#263956" stroke="#8797b0" strokeWidth="2" />
                <text x="112" y="414" fill="#8797b0" fontSize="9" fontWeight="900">CARRIER</text>
                <text x="116" y="445" fill="#8797b0" fontSize="8" fontWeight="900">SLIDE</text>
                <rect x="255" y="360" width="62" height="24" rx="4" fill="#111827" stroke="#ffc24b" strokeWidth="4" filter="url(#twinMastGlow)" />
                <text x="286" y="376" textAnchor="middle" fill="#ffc24b" fontSize="11" fontWeight="900">PCT</text>
                <rect x="150" y="395" width="82" height="24" rx="3" fill="#111827" stroke="#ffc24b" />
                <text x="191" y="411" textAnchor="middle" fill="#ffc24b" fontSize="11" fontWeight="900">{dolly}</text>
                <rect x="158" y="377" width="74" height="28" rx="4" fill="#263956" stroke="#8797b0" strokeWidth="3" />
                <text x="195" y="390" textAnchor="middle" fill="#8797b0" fontSize="8" fontWeight="900">ELEVATOR</text>
                <text x="195" y="401" textAnchor="middle" fill="#8797b0" fontSize="8" fontWeight="900">{elevator}</text>
                <line x1="195" y1={y + 17} x2="195" y2="430" stroke="#27cfe6" strokeWidth="5" opacity={live ? 0.75 : 0.25} strokeDasharray="8 7" />
                <text x="195" y="416" textAnchor="middle" fill="#27cfe6" opacity="0.35" fontSize="13" fontWeight="900">NO DATA</text>
                <text x="195" y="505" textAnchor="middle" fill="#8797b0" fontSize="10" fontWeight="900" letterSpacing="2">WORKOVER MAST - ACS ENVELOPE</text>
                <text x="70" y="456" fill="#8797b0" fontSize="9" fontWeight="900">CATWALK {cwk?.status != null ? cwk.status : '--'}</text>
            </svg>
        </Box>
    );
}

function TwinPanel({ children, sx }) {
    return <Paper sx={{ p: 1.0, borderRadius: 1.5, bgcolor: '#111827', borderColor: 'rgba(62,166,255,0.24)', overflow: 'hidden', ...sx }}>{children}</Paper>;
}

function TwinGauge({ label, value = 0, unit, decimals, subLabel, subValue, subUnit, subDecimals, min = 0, max = 100, majorStep = 20, minorStep = 4, color = '#38BDF8', compactSub = false }) {
    const cx = 150;
    const cy = 150;
    const r = 135;
    const startAngle = 225;
    const totalSweep = 270;
    const clamped = Math.min(max, Math.max(min, Number(value) || 0));
    const valToAngle = (v) => startAngle - (((v - min) / ((max - min) || 1)) * totalSweep);
    const toXY = (deg, radius) => {
        const rad = (deg * Math.PI) / 180;
        return { x: cx + Math.cos(rad) * radius, y: cy - Math.sin(rad) * radius };
    };

    const majors = [];
    const minors = [];
    for (let t = min; t <= max; t += minorStep) {
        const angle = valToAngle(t);
        const isMajor = (t - min) % majorStep === 0;
        const p1 = toXY(angle, r);
        const p2 = toXY(angle, isMajor ? r - 12 : r - 6);
        if (isMajor) majors.push({ value: t, angle, p1, p2 });
        else minors.push({ angle, p1, p2 });
        if (majors.length + minors.length > 220) break;
    }

    const needleAngle = valToAngle(clamped);
    const tip = toXY(needleAngle, r - 35);
    const b1 = toXY(needleAngle + 90, 4);
    const b2 = toXY(needleAngle - 90, 4);
    const valueText = fmtNum(clamped, decimals ?? (Number.isInteger(clamped) ? 0 : 1));
    const subNumeric = Number(subValue);
    const subText = Number.isFinite(subNumeric) ? fmtNum(subNumeric, subDecimals ?? (Number.isInteger(subNumeric) ? 0 : 2)) : (subValue ?? '--');

    return (
        <Box sx={{ height: { xs: 320, lg: 'auto' }, flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', pt: 0.5, pb: 0 }}>
            <svg viewBox="0 0 300 340" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style={{ maxHeight: '100%', transform: 'translateY(12px) scale(0.99)', transformOrigin: 'center center' }}>
                <circle cx={cx} cy={cy} r={r + 5} fill="#0b131e" stroke="#1e293b" strokeWidth="2" opacity="0.6" />
                {minors.map((t, i) => (
                    <line key={`min-${i}`} x1={t.p1.x} y1={t.p1.y} x2={t.p2.x} y2={t.p2.y} stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round" />
                ))}
                {majors.map((t, i) => (
                    <g key={`maj-${i}`}>
                        <line x1={t.p1.x} y1={t.p1.y} x2={t.p2.x} y2={t.p2.y} stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" />
                        <text x={toXY(t.angle, r - 26).x} y={toXY(t.angle, r - 26).y} textAnchor="middle" dominantBaseline="central" fill="#9ca3af" fontSize="16" fontWeight="bold" fontFamily="monospace">
                            {t.value === min ? '' : t.value}
                        </text>
                    </g>
                ))}
                <path d="M252 57 A135 135 0 0 1 252 243" fill="none" stroke="#fbbf24" strokeWidth="4" />
                <path d="M252 243 A135 135 0 0 1 217 277" fill="none" stroke="#ef4444" strokeWidth="4" />
                <text x={cx} y={cy - 48} textAnchor="middle" fill={color} fontSize="22" fontWeight="bold" letterSpacing="1">{label}</text>
                <text x={cx} y={cy + 36} textAnchor="middle" dominantBaseline="middle" fill="#ffffff" fontSize="54" fontWeight="bold" fontFamily="Arial, sans-serif">{valueText}</text>
                <text x={cx} y={cy + 68} textAnchor="middle" fill="#9ca3af" fontSize="18" fontWeight="500">{unit}</text>
                <line x1={cx - 54} y1={cy + 86} x2={cx + 54} y2={cy + 86} stroke="#334155" strokeWidth="1.5" />
                <text x={cx} y={cy + 108} textAnchor="middle" fill="#bef264" fontSize="34" fontWeight="bold" fontFamily="Arial, sans-serif">{subText}</text>
                <text x={cx} y={cy + 130} textAnchor="middle" fill="#9ca3af" fontSize="14" fontWeight="700">
                    {subLabel} {subUnit ? `(${subUnit})` : ''}
                </text>
                <polygon points={`${tip.x},${tip.y} ${b1.x},${b1.y} ${b2.x},${b2.y}`} fill={color} />
                <circle cx={cx} cy={cy} r="6" fill="#111319" stroke="#ffffff" strokeWidth="1.5" />
            </svg>
        </Box>
    );
}

function AcsDerrick({ blockHeight, crownSaver, floorSaver }) {
    const numericHeight = Math.max(0, Number(blockHeight) || 0);
    const travel = Math.max(0, Math.min(1, numericHeight / 13000));
    const counterY = 350 - travel * 265;
    const crownLimit = Number(crownSaver);
    const floorLimit = Number(floorSaver);
    const crownOn = Number.isFinite(crownLimit) && crownLimit > 0 && numericHeight >= crownLimit;
    const floorOn = Number.isFinite(floorLimit) && numericHeight <= floorLimit;
    return (
        <Box sx={{ flex: 1, minHeight: 0, display: 'grid', placeItems: 'center', overflow: 'visible', mt: -1.0, mx: -0.2 }}>
            <svg viewBox="28 0 180 430" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style={{ maxWidth: 460, transform: 'scaleX(1.48) scaleY(1.08)', transformOrigin: 'center center' }}>
                <defs>
                    <filter id="acsGlow" x="-30%" y="-30%" width="160%" height="160%">
                        <feGaussianBlur stdDeviation="6" result="blur" />
                        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                    </filter>
                    <filter id="counterGlow" x="-30%" y="-30%" width="160%" height="160%">
                        <feGaussianBlur stdDeviation="4" result="blur" />
                        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                    </filter>
                </defs>

                <polygon points="55,376 180,376 160,56 75,56" fill="#111827" stroke="#334155" strokeWidth="4" />
                <polygon points="75,56 160,56 164,124 71,124" fill="#ef4444" opacity="0.92" />
                <polygon points="71,124 164,124 168,168 67,168" fill="#f59e0b" opacity="0.96" />
                <line x1="69" y1="244" x2="166" y2="244" stroke="#334155" strokeWidth="2" />
                <line x1="64" y1="330" x2="171" y2="330" stroke="#334155" strokeWidth="2" />
                <polygon points="59,350 176,350 181,376 54,376" fill="#f59e0b" />

                <rect x="73" y="41" width="90" height="14" rx="4" fill="#475569" stroke="#64748b" strokeWidth="2" />
                <circle cx="94" cy="50" r="4" fill="#cbd5e1" />
                <circle cx="145" cy="50" r="4" fill="#cbd5e1" />
                <line x1="94" y1="49" x2="94" y2="376" stroke="#0b1220" strokeWidth="4" />
                <line x1="145" y1="49" x2="145" y2="376" stroke="#0b1220" strokeWidth="4" />

                {crownOn && (
                    <g filter="url(#acsGlow)">
                        <rect x="44" y="76" width="148" height="42" rx="7" fill="#ef4444" />
                        <text x="118" y="103" textAnchor="middle" fill="#ffffff" fontSize="16" fontWeight="900">CROWN SAVER ON</text>
                    </g>
                )}
                {floorOn && (
                    <g filter="url(#acsGlow)">
                        <rect x="44" y="292" width="148" height="42" rx="7" fill="#ef4444" />
                        <text x="118" y="319" textAnchor="middle" fill="#ffffff" fontSize="16" fontWeight="900">FLOOR SAVER ON</text>
                    </g>
                )}

                <g filter="url(#counterGlow)" transform={`translate(0 ${counterY - 345})`}>
                    <rect x="68" y="340" width="100" height="60" rx="8" fill="#062033" stroke="#f59e0b" strokeWidth="5" />
                    <rect x="76" y="348" width="84" height="44" rx="5" fill="none" stroke="#22b8ff" strokeWidth="2.5" />
                    <text x="118" y="382" textAnchor="middle" fill="#e0f2fe" fontSize="34" fontWeight="900">{String(Math.round(numericHeight))}</text>
                </g>
            </svg>
        </Box>
    );
}
function TrendStrip({ color, compact, points = [], max, label }) {
    const height = compact ? 58 : 76;
    const width = 320;
    const values = (points || []).map((p) => Number(p.value)).filter(Number.isFinite);
    const high = Math.max(Number(max) || 0, ...values, 1);
    const low = Math.min(0, ...values);
    const span = high - low || 1;
    const line = values.map((v, i) => {
        const x = values.length <= 1 ? 0 : (i / (values.length - 1)) * width;
        const y = height - 14 - ((v - low) / span) * (height - 24);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    const area = line ? `0,${height - 6} ${line} ${width},${height - 6}` : '';
    return (
        <Box sx={{ position: 'relative', height, mt: 1, border: '1px solid rgba(62,166,255,.2)', borderRadius: 1, overflow: 'hidden', background: `linear-gradient(180deg, transparent 55%, ${color}16), repeating-linear-gradient(0deg, transparent 0 23px, rgba(148,163,184,.08) 24px), #07111e` }}>
            {label && <Typography variant="caption" sx={{ position: 'absolute', top: 4, left: 8, color: 'text.secondary', fontWeight: 900, zIndex: 1 }}>{label}</Typography>}
            <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" preserveAspectRatio="none" aria-hidden="true">
                {area && <polygon points={area} fill={color} opacity="0.16" />}
                {line && <polyline points={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />}
            </svg>
        </Box>
    );
}

function PanelTitle({ title, status, color = 'primary.main' }) {
    return <Stack direction="row" justifyContent="space-between" alignItems="center" mb={0.5}><Typography fontWeight={900} color={color}>{title}</Typography><Button size="small" variant="outlined" sx={{ py: 0, minWidth: 90, fontWeight: 900 }}>{status}</Button></Stack>;
}

function StatusBar({ label, value }) {
    return <Box sx={{ mt: 0.5, bgcolor: '#065f46', color: '#d1fae5', border: '1px solid #10b981', borderRadius: 1, px: 2, py: 1, display: 'flex', justifyContent: 'space-between', fontWeight: 900, letterSpacing: 3 }}>{label}<span>{value}</span></Box>;
}

function MiniReadout({ label, value, unit }) {
    return (
        <Box sx={{ bgcolor: '#06111f', border: '1px solid rgba(62,166,255,.18)', borderRadius: 0.75, px: 0.75, py: 0.55, textAlign: 'center', minHeight: 42, display: 'grid', alignContent: 'center' }}>
            <Typography variant="caption" color="#facc15" fontWeight={900} sx={{ fontSize: 11, lineHeight: 1.1, display: 'block', whiteSpace: 'nowrap' }}>{label}</Typography>
            <Typography fontSize={23} lineHeight={1.15} fontWeight={900}>{fmtNum(value, 0)} <Typography component="span" variant="caption" color="text.secondary" fontWeight={900}>{unit}</Typography></Typography>
        </Box>
    );
}
function EngineIcon() {
    return (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 0.75 }}>
            <svg width="74" height="44" viewBox="0 0 74 44" fill="none" aria-hidden="true">
                <path d="M22 17h30l7 8v12H15V25l7-8Z" stroke="#16b8ff" strokeWidth="3" />
                <path d="M29 17v-7h16v7" stroke="#16b8ff" strokeWidth="3" />
                <path d="M10 29H3M71 29h-7M31 37v6M48 37v6" stroke="#16b8ff" strokeWidth="3" />
            </svg>
        </Box>
    );
}

function EngineStat({ label, value, unit, color, max = 100, points = [], sx }) {
    const numeric = Number(value) || 0;
    const historyValues = (points || []).map((p) => Number(p.value)).filter(Number.isFinite);
    const values = historyValues.length ? [...historyValues.slice(-120), numeric] : [numeric];
    const width = 260;
    const height = 74;
    const high = Math.max(Number(max) || 0, ...values, 1);
    const low = Math.min(0, ...values);
    const span = high - low || 1;
    const line = values.map((v, i) => {
        const x = values.length <= 1 ? 0 : (i / (values.length - 1)) * width;
        const y = height - 8 - ((v - low) / span) * (height - 16);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    const area = line ? `0,${height - 4} ${line} ${width},${height - 4}` : '';
    return (
        <Box sx={{
            position: 'relative', overflow: 'hidden', textAlign: 'center', bgcolor: '#07111e',
            border: '1px solid rgba(62,166,255,.24)', borderRadius: 1, minHeight: 110,
            display: 'grid', gridTemplateRows: '44% 56%', px: 1,
            backgroundImage: 'repeating-linear-gradient(0deg, transparent 0 23px, rgba(148,163,184,.07) 24px)',
            ...sx
        }}>
            {label && <Typography sx={{ position: 'absolute', top: 10, left: 14, zIndex: 2, color, fontWeight: 900, fontSize: 18, letterSpacing: 0.5 }}>{label}</Typography>}
            <Box sx={{ position: 'relative', zIndex: 1, display: 'grid', placeItems: 'end center', pb: 0.1 }}>
                <Typography sx={{ fontSize: label ? 34 : 36, lineHeight: 1, fontWeight: 900, color }}>
                    {fmtNum(numeric, 0)} <Typography component="span" fontSize={15} fontWeight={900} color="#eaf3ff">{unit}</Typography>
                </Typography>
            </Box>
            <Box sx={{ position: 'relative', mx: 0.75, mb: 0.7, borderTop: '1px solid rgba(148,163,184,.10)' }}>
                {line && (
                    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0 }} aria-hidden="true">
                        <polygon points={area} fill={color} opacity="0.16" />
                        <polyline points={line} fill="none" stroke={color} strokeWidth="2.8" strokeLinejoin="round" strokeLinecap="round" />
                    </svg>
                )}
            </Box>
        </Box>
    );
}
function BigNumber({ value, unit, color }) {
    return <Box sx={{ textAlign: 'center', bgcolor: '#07111e', border: '1px solid rgba(62,166,255,.18)', borderRadius: 1, py: 1.5 }}><Typography fontSize={40} fontWeight={900} color={color}>{fmtNum(value, 0)} <Typography component="span" fontSize={15} fontWeight={900}>{unit}</Typography></Typography></Box>;
}

function SubHead({ children, sx }) {
    return <Typography sx={{ border: '1px solid rgba(148,163,184,.2)', borderRadius: 0.75, px: 1.0, py: 0.55, color: '#94a3b8', fontWeight: 900, mb: 1, fontSize: 16, letterSpacing: 0.6, ...sx }}>{children}</Typography>;
}

function ParamBox({ label, value, unit, warn, small, fill }) {
    const isNum = typeof value === 'number';
    return <Box sx={{ bgcolor: '#07111e', border: '1px solid rgba(62,166,255,.18)', borderRadius: 0.75, p: 0.75, mb: fill ? 0 : 0.5, minHeight: fill ? 0 : 56, height: fill ? '100%' : 'auto', display: 'grid', alignContent: 'center' }}><Typography variant="caption" fontWeight={900} sx={{ lineHeight: 1.1 }}>{label}</Typography><Typography fontWeight={900} sx={{ color: warn ? '#facc15' : '#38f58a', fontSize: small ? 12 : 15, lineHeight: 1.2 }} noWrap>{isNum ? fmtNum(value, 2) : value} <Typography component="span" variant="caption" color="text.secondary">{unit}</Typography></Typography></Box>;
}

function WideParamBox({ label, value, unit, sx }) {
    return (
        <Box sx={{ bgcolor: '#07111e', border: '1px solid rgba(62,166,255,.18)', borderRadius: 0.75, px: 1.0, py: 0.7, mb: 0, minHeight: 0, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.25, ...sx }}>
            <Typography fontWeight={900}>{label}</Typography>
            <Typography fontWeight={900} sx={{ color: '#38f58a', fontSize: 18, whiteSpace: 'nowrap' }}>{fmtNum(value, 2)} {unit}</Typography>
        </Box>
    );
}
function ParamGroup({ title, status, warn, children, sx }) {
    return (
        <Box sx={{ bgcolor: '#07111e', border: '1px solid rgba(62,166,255,.18)', borderRadius: 0.75, p: 0.75, mb: 0, minHeight: 0, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', ...sx }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={0.5}>
                <Typography fontWeight={900} color="text.secondary" sx={{ fontSize: 16 }}>{title}</Typography>
                <Typography fontWeight={900} sx={{ color: warn ? '#facc15' : '#38f58a', fontSize: 14 }}>{status}</Typography>
            </Stack>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.75 }}>
                {children}
            </Box>
        </Box>
    );
}

function InlineParam({ label, value, unit }) {
    return (
        <Typography fontWeight={900} sx={{ fontSize: 14, lineHeight: 1.35 }}>
            {label}: <Typography component="span" fontWeight={900} color="#38f58a">{fmtNum(value, 2)} {unit}</Typography>
        </Typography>
    );
}
const KPI_COLORS = ['#38bdf8', '#4ade80', '#fbbf24', '#a78bfa', '#f472b6', '#22d3ee'];

function EffRow({ label, value, color }) {
    return (
        <Stack direction="row" justifyContent="space-between" alignItems="baseline">
            <Typography variant="body2" color="text.secondary">{label}</Typography>
            <Typography variant="body2" fontWeight={800} sx={color ? { color } : undefined}>{value}</Typography>
        </Stack>
    );
}












































































