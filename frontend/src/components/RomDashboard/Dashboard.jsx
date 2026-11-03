import React, { useState, useEffect, useRef } from 'react';
import { Paper, Box, Grid, IconButton, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button, MenuItem, Select, InputLabel, FormControl, Tooltip, Typography } from '@mui/material';
import AnalogGauge from '../RomCommon/AnalogGauge';
import ParameterSettingsDialog from '../RomCommon/ParameterSettingsDialog';
import DashboardPanelHeader from '../RomCommon/DashboardPanelHeader';
import RigVisualizer from './RigVisualizer';
import VerticalStatsPanel from './VerticalStatsPanel';
import StatsPanel from './StatsPanel';
import BOPStatusPanel from './BOPStatusPanel';
import EngineStatusPanel from './EngineStatusPanel';
import MudPumpPanel from './MudPumpPanel';
import MudVolumePanel from './MudVolumePanel';
import AllisonStatusPanel from '../Allison/AllisonStatusPanel';
import ResizablePanel from '../RomCommon/ResizablePanel';
import { Settings, Edit2, Plus, Trash2, Check, X, GripVertical, Monitor, Gauge, Activity } from 'lucide-react';
import { useRig } from '../../context/RigContext';
import { useAuth } from '../../context/AuthContext';

const SNAP = 10;
const DASHBOARD_LAYOUT_STORAGE_KEY = 'romii_dashboard_layout_v5';
const OVERVIEW_GAUGE_MAX_SIZE = 420;
const TOP_PANEL_IDS = new Set(['rig_vis', 'd1', 'v_engine', 'v_mudpump']);
const LOWER_ROW_IDS = new Set(['v_allison', 'v_bop', 'v_mudvol', 'v_params']);
const TOP_PANEL_HEIGHT = 520;
const MAIN_PANEL_WIDTH = 420;
const LOWER_ROW_Y = 530;
const LOWER_PANEL_HEIGHT = 340;
const DASHBOARD_DESIGN_WIDTH = 1500;
const DASHBOARD_DESIGN_HEIGHT = 870;

function getOverviewGaugeSize(g) {
    const headerHeight = 36;
    const trendHeight = g.dataKey === 'hook_load' ? 75 : 0;
    const horizontalRoom = Math.max(180, (g.w || 300) - 28);
    const verticalRoom = Math.max(180, (g.h || 360) - headerHeight - trendHeight - 18);
    return Math.min(OVERVIEW_GAUGE_MAX_SIZE, horizontalRoom, verticalRoom);
}
const DEFAULT_DASHBOARD_GAUGES = [
    { id: 'rig_vis',  type: 'rig_visualizer', label: 'RIG VISUALIZER', x: 0, y: 0, w: 210, h: 520 },
    { id: 'd1', label: 'HOOK LOAD', dataKey: 'hook_load', min: 0, max: 100, unit: 'ton', color: '#38bdf8', size: 220, majorTicks: 10, minorTicks: 4, x: 220, y: 0, w: 420, h: 520 },
    { id: 'v_engine', type: 'stats_panel', panelId: 'engine', defaultTitle: 'CAT ENGINE', x: 650, y: 0, w: 420, h: 520 },
    { id: 'v_mudpump', type: 'mud_pump_panel', label: 'MUD PUMP', x: 1080, y: 0, w: 420, h: 520 },
    { id: 'v_allison', type: 'allison_panel', label: 'ALLISON TRANS', x: 220, y: 530, w: 420, h: 340 },
    { id: 'v_bop', type: 'stats_panel', panelId: 'bop', defaultTitle: 'BOP STATUS', x: 650, y: 530, w: 420, h: 340 },
    { id: 'v_mudvol', type: 'mud_volume_panel', label: 'MUD VOLUME', x: 1080, y: 530, w: 420, h: 340 },
    { id: 'v_params', type: 'stats_panel', panelId: 'key_params', defaultTitle: 'KEY PARAMETERS', x: 0, y: 530, w: 212, h: 340 },
];

function upgradeGauge(g, index) {
    const def = DEFAULT_DASHBOARD_GAUGES.find(d => d.id === g.id) || DEFAULT_DASHBOARD_GAUGES.find(d => d.type === g.type);
    const upgraded = { ...g };
    if (upgraded.x == null) upgraded.x = def ? def.x : 0;
    if (upgraded.y == null) upgraded.y = def ? def.y : index * 320;
    if (upgraded.w == null) upgraded.w = def ? def.w : (g.gridWidth ? Math.round(g.gridWidth / 12 * 1200) : 300);
    if (upgraded.h == null) upgraded.h = def ? def.h : 300;
    if (TOP_PANEL_IDS.has(upgraded.id)) {
        upgraded.y = 0;
        upgraded.h = TOP_PANEL_HEIGHT;
    }
    if (['d1', 'v_engine', 'v_mudpump'].includes(upgraded.id)) {
        upgraded.w = MAIN_PANEL_WIDTH;
    }
    if (upgraded.id === 'd1') upgraded.x = 220;
    if (upgraded.id === 'v_engine') upgraded.x = 650;
    if (upgraded.id === 'v_mudpump') upgraded.x = 1080;
    if (LOWER_ROW_IDS.has(upgraded.id)) {
        upgraded.y = Math.max(Number(upgraded.y) || 0, LOWER_ROW_Y);
        upgraded.h = LOWER_PANEL_HEIGHT;
    }
    
    // Preserve specialized identities
    if (!upgraded.panelId && def?.panelId) upgraded.panelId = def.panelId;
    if (!upgraded.defaultTitle && def?.defaultTitle) upgraded.defaultTitle = def.defaultTitle;
    
    return upgraded;
}

function loadCachedDashboardGauges() {
    try {
        const raw = localStorage.getItem(DASHBOARD_LAYOUT_STORAGE_KEY);
        if (!raw) return DEFAULT_DASHBOARD_GAUGES;
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed) || !parsed.length) return DEFAULT_DASHBOARD_GAUGES;
        return parsed.map((g, i) => upgradeGauge(g, i));
    } catch (error) {
        console.warn('Failed to restore cached dashboard layout:', error);
        return DEFAULT_DASHBOARD_GAUGES;
    }
}

function persistDashboardGauges(gauges) {
    try {
        localStorage.setItem(DASHBOARD_LAYOUT_STORAGE_KEY, JSON.stringify(gauges));
    } catch (error) {
        console.warn('Failed to persist dashboard layout:', error);
    }
}

function normalizeHookLoadValue(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return n / 100;
}

export default function Dashboard({ hideEditControls = false, embedded = false }) {
    const { socket, apiBaseUrl, globalRigData } = useRig();
    const { user } = useAuth();
    const userRole = String(user?.role || '').trim().toLowerCase();
    const isAdmin = userRole === 'admin';
    const canEdit = isAdmin && !hideEditControls && !embedded;
    const dashboardRef = useRef(null);
    const boardScaleRef = useRef(1);
    const [boardScale, setBoardScale] = useState(() => {
        if (!embedded || typeof window === 'undefined') return 1;
        return Math.max(0.72, Math.min(1.6, (window.innerWidth - 32) / DASHBOARD_DESIGN_WIDTH));
    });
    const [rigData, setRigData] = useState({ 
        hook_load: 0, pump_pressure: 0, engine_rpm: 0, oil_pressure: 0, oil_temp: 0, coolant_temp: 0, fuel_level: 0, 
        battery_voltage: 0, torque: 0, block_position: 0, flow_in: 0, flow_out: 0, spm1: 0, spm2: 0, wob: 0, 
        bit_depth: 0, hole_depth: 0, trip_tank: 0, rig_air_pressure: 0, 
        annular_open: false, annular_close: false, pipe_ram_open: false, pipe_ram_close: false, blind_ram_open: false, blind_ram_close: false, 
        annular_pressure: 0, manifold_pressure: 0, accumulator_pressure: 0, 
        crownomatic: false, flooromatic: false, travelling_up: false, travelling_down: false 
    });

    const sanitizeData = (obj) => {
        if (!obj || typeof obj !== 'object') return;
        Object.keys(obj).forEach(key => {
            const val = obj[key];
            if (typeof val === 'number') {
                if (key !== 'gain_loss' && val < 0) {
                    obj[key] = 0;
                }
            } else if (typeof val === 'object' && val !== null) {
                sanitizeData(val);
            }
        });
    };

    // Sync state with globalRigData when it loads
    useEffect(() => {
        if (globalRigData) {
            // Clone to avoid mutating context state directly
            const data = JSON.parse(JSON.stringify(globalRigData));
            sanitizeData(data);

            const d = data.drawworks || {};
            const e = data.engine || {};
            const m = data.mudpump || {};
            const dr = data.drilling || {};
            const w = data.well_control || {};
            const f = data.fluid || {};
            const s = data.system || {};


            setRigData(prev => ({
                ...prev,
                hook_load: d.hook_load ?? prev.hook_load,
                block_position: d.block_position ?? prev.block_position,
                engine_rpm: e.rpm ?? prev.engine_rpm,
                oil_pressure: e.oil_pressure ?? prev.oil_pressure,
                oil_temp: e.oil_temp ?? prev.oil_temp,
                coolant_temp: e.coolant_temp ?? prev.coolant_temp,
                fuel_level: e.fuel_level ?? prev.fuel_level,
                battery_voltage: e.battery_voltage ?? prev.battery_voltage,
                pump_pressure: m.pressure ?? prev.pump_pressure,
                torque: e.torque ?? prev.torque,
                flow_in: m.flow_in ?? prev.flow_in,
                flow_out: m.flow_out ?? prev.flow_out,
                wob: dr.wob ?? prev.wob,
                bit_depth: dr.bit_depth ?? prev.bit_depth,
                hole_depth: dr.hole_depth ?? prev.hole_depth,
                annular_pressure: w.annular_pressure ?? prev.annular_pressure,
                manifold_pressure: w.manifold_pressure ?? prev.manifold_pressure,
                accumulator_pressure: w.accumulator_pressure ?? prev.accumulator_pressure,
                annular_open: w.annular_open ?? prev.annular_open,
                annular_close: w.annular_close ?? prev.annular_close,
                pipe_ram_open: w.pipe_ram_open ?? prev.pipe_ram_open,
                pipe_ram_close: w.pipe_ram_close ?? prev.pipe_ram_close,
                blind_ram_open: w.blind_ram_open ?? prev.blind_ram_open,
                blind_ram_close: w.blind_ram_close ?? prev.blind_ram_close,
                trip_tank: f.trip_tank ?? d.trip_tank ?? prev.trip_tank,
                rig_air_pressure: s.rig_air_pressure ?? d.rig_air_pressure ?? prev.rig_air_pressure,
                spm1: m.spm ?? prev.spm1,
                spm2: m.spm_2 ?? prev.spm2,
                total_spm: m.total_spm ?? prev.total_spm,
                total_strokes: m.total_strokes ?? prev.total_strokes,
                crownomatic: d.crownomatic !== undefined ? !d.crownomatic : prev.crownomatic,
                flooromatic: d.flooromatic !== undefined ? !d.flooromatic : prev.flooromatic,
                travelling_up: d.travelling_up === 0,
                travelling_down: d.travelling_down === 0
            }));
        }
    }, [globalRigData]);
    const [gauges, setGauges] = useState(() => loadCachedDashboardGauges());
    const [editMode, setEditMode] = useState(false);
    const [editingGauge, setEditingGauge] = useState(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [draggingId, setDraggingId] = useState(null);
    const draggingRef = useRef(false);
    const dragOffset = useRef({ x: 0, y: 0 });
    const [dashboardUnits] = useState({ wob: 'tonnes', depth: 'ft' });
    
    // Alarms and SCADA Scale Customization
    const [configVersion, setConfigVersion] = useState(0);
    const [paramDialogOpen, setParamDialogOpen] = useState(false);
    const [activeParamKey, setActiveParamKey] = useState('');
    const [activeParamLabel, setActiveParamLabel] = useState('');
    const [activeParamUnit, setActiveParamUnit] = useState('');
    const [activeParamMin, setActiveParamMin] = useState(0);
    const [activeParamMax, setActiveParamMax] = useState(100);

    useEffect(() => {
        if (!canEdit) {
            setEditMode(false);
            setIsDialogOpen(false);
            setParamDialogOpen(false);
        }
    }, [canEdit]);

    const handleParameterClick = (key, label, unit, defaultMin = 0, defaultMax = 100) => {
        if (!canEdit) return;
        setActiveParamKey(key);
        setActiveParamLabel(label);
        setActiveParamUnit(unit || 'TON');
        setActiveParamMin(defaultMin);
        setActiveParamMax(defaultMax);
        setParamDialogOpen(true);
    };

    useEffect(() => {
        let cancelled = false;
        fetch(`${apiBaseUrl}/api/dashboard/layout?page=dashboard&t=${Date.now()}`)
            .then(res => res.json())
            .then(config => {
                if (cancelled) return;
                if (config.gauges) {
                    let loaded = config.gauges.map((g, i) => upgradeGauge(g, i));
                    if (!loaded.find(g => g.type === 'rig_visualizer')) loaded.unshift(upgradeGauge({ id: 'rig_vis', type: 'rig_visualizer', label: 'RIG VISUALIZER' }, 0));
                    setGauges(loaded);
                    persistDashboardGauges(loaded);
                } else {
                    setGauges(DEFAULT_DASHBOARD_GAUGES);
                    persistDashboardGauges(DEFAULT_DASHBOARD_GAUGES);
                }
            })
            .catch(err => {
                console.error("Layout load error:", err);
                if (!cancelled) {
                    setGauges(prev => prev?.length ? prev : DEFAULT_DASHBOARD_GAUGES);
                }
            });
        return () => { cancelled = true; };
    }, [apiBaseUrl]);

    useEffect(() => {
        if (!socket) return;
        const handleRigData = (data) => { if (data) setRigData(prev => ({ ...prev, ...data })); };
        socket.on('rig_data', handleRigData);
        return () => socket.off('rig_data', handleRigData);
    }, [socket]);

    const saveGauges = (gs) => {
        persistDashboardGauges(gs);
        fetch(`${apiBaseUrl}/api/dashboard/layout?page=dashboard`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ page: 'dashboard', gauges: gs }) }).catch(err => console.error("Save error:", err));
    };

    const handleMouseMove = (e) => {
        if (!draggingId || !draggingRef.current) return;
        let nx = Math.max(0, Math.round((e.clientX - dragOffset.current.x) / SNAP) * SNAP);
        let ny = Math.max(0, Math.round((e.clientY - dragOffset.current.y) / SNAP) * SNAP);
        setGauges(prev => prev.map(g => g.id === draggingId ? { ...g, x: nx, y: ny } : g));
    };

    const handleMouseUp = () => { if (draggingId) { setDraggingId(null); draggingRef.current = false; saveGauges(gauges); } };
    
    const handleOpenSettings = (g) => {
        setEditingGauge({ ...g });
        setIsDialogOpen(true);
    };

    const handleSaveSettings = () => {
        setGauges(prev => prev.map(g => g.id === editingGauge.id ? editingGauge : g));
        saveGauges(gauges.map(g => g.id === editingGauge.id ? editingGauge : g));
        setIsDialogOpen(false);
    };

    const pulseAnimation = {
        '@keyframes pulse': {
            '0%': { opacity: 0.7, transform: 'translateX(-50%) scale(0.98)' },
            '100%': { opacity: 1, transform: 'translateX(-50%) scale(1.02)' }
        }
    };

    useEffect(() => {
        if (!embedded || !dashboardRef.current) {
            boardScaleRef.current = 1;
            setBoardScale(1);
            return undefined;
        }
        const updateScale = () => {
            const availableWidth = Math.max(320, (dashboardRef.current?.getBoundingClientRect().width || DASHBOARD_DESIGN_WIDTH) - 32);
            const nextScale = Math.max(0.72, Math.min(1.6, availableWidth / DASHBOARD_DESIGN_WIDTH));
            if (Math.abs(nextScale - boardScaleRef.current) < 0.015) return;
            boardScaleRef.current = nextScale;
            setBoardScale(nextScale);
        };
        updateScale();
        window.addEventListener('resize', updateScale);
        return () => {
            window.removeEventListener('resize', updateScale);
        };
    }, [embedded]);

    return (
        <Box ref={dashboardRef} sx={{ p: 2, height: embedded ? 'auto' : '100vh', minHeight: embedded ? (DASHBOARD_DESIGN_HEIGHT * boardScale) + 32 : undefined, bgcolor: '#0f172a', overflow: 'auto', contain: embedded ? 'layout paint' : undefined, ...pulseAnimation }} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}>
            <Box sx={{ position: 'relative', width: embedded ? DASHBOARD_DESIGN_WIDTH * boardScale : '100%', height: embedded ? DASHBOARD_DESIGN_HEIGHT * boardScale : '100%' }}>
            <Box sx={{ position: 'relative', width: embedded ? DASHBOARD_DESIGN_WIDTH : '100%', height: embedded ? DASHBOARD_DESIGN_HEIGHT : '100%', transform: embedded ? `scale(${boardScale})` : 'none', transformOrigin: 'top left' }}>
                {gauges.map((g) => (
                    <Box key={g.id} sx={{ position: 'absolute', left: g.x, top: g.y, width: g.w, height: g.h, zIndex: draggingId === g.id ? 999 : 1 }}>
                        <ResizablePanel w={g.w} h={g.h} editMode={canEdit && editMode} onResize={(nw, nh) => setGauges(prev => prev.map(p => p.id === g.id ? { ...p, w: nw, h: nh } : p))} onResizeEnd={() => saveGauges(gauges)}>
                            <Box sx={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', bgcolor: '#1e293b', borderRadius: 2, border: editMode ? '1px solid #38bdf8' : '1px solid #334155' }}>
                                {canEdit && editMode && (
                                    <Box onMouseDown={(e) => { setDraggingId(g.id); draggingRef.current = true; dragOffset.current={x:e.clientX-g.x, y:e.clientY-g.y}; }} sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 26, bgcolor: 'rgba(56,189,248,0.1)', cursor: 'grab', zIndex: 10, display: 'flex', alignItems: 'center', px: 1 }}>
                                        <GripVertical size={13} color="#38bdf8" />
                                        <Box sx={{ flexGrow: 1 }} />
                                        <IconButton size="small" onClick={() => handleOpenSettings(g)} sx={{ color: '#38bdf8', mr: 0.5 }}><Settings size={11} /></IconButton>
                                        <IconButton size="small" onClick={() => { setGauges(gs => gs.filter(gx => gx.id !== g.id)); }} sx={{ color: '#ef4444' }}><Trash2 size={11} /></IconButton>
                                    </Box>
                                )}
                                <Box sx={{ position: 'absolute', top: canEdit && editMode ? 26 : 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column' }}>
                                    {!(g.panelId === 'engine' || g.id === 'v_engine' || (g.defaultTitle && g.defaultTitle.includes('ENGINE'))) && (
                                        <DashboardPanelHeader 
                                            title={g.label || g.defaultTitle || (g.dataKey === 'hook_load' ? 'HOOK LOAD' : g.type?.replace(/_panel/g, '').replace(/_/g, ' ').toUpperCase())} 
                                            icon={g.type === 'rig_visualizer' ? Monitor : Gauge} 
                                            isSmall={g.h < 350} 
                                        />
                                    )}
                                    <Box sx={{ flexGrow: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                                        {g.type === 'rig_visualizer' ? (
                                            <RigVisualizer 
                                                travellingUp={rigData.travelling_up} 
                                                travellingDown={rigData.travelling_down} 
                                                crownomatic={rigData.crownomatic} 
                                                flooromatic={rigData.flooromatic} 
                                                height={g.h-40} 
                                                width={g.w} 
                                            />
                                        ) :
                                         g.type === 'mud_pump_panel' ? <MudPumpPanel rigData={rigData} w={g.w} h={g.h} onParameterClick={canEdit ? handleParameterClick : undefined} /> :
                                         g.type === 'mud_volume_panel' ? <MudVolumePanel rigData={rigData} w={g.w} h={g.h} onParameterClick={canEdit ? handleParameterClick : undefined} /> :
                                         g.type === 'allison_panel' ? <AllisonStatusPanel rigData={globalRigData} w={g.w} h={g.h} onParameterClick={canEdit ? handleParameterClick : undefined} /> :
                                         (g.type === 'stats_panel' || g.panelId || g.defaultTitle) ? (
                                            (g.panelId === 'engine' || g.id === 'v_engine' || (g.defaultTitle && g.defaultTitle.includes('ENGINE'))) ? (
                                                <EngineStatusPanel rigData={rigData} w={g.w} h={g.h} onParameterClick={canEdit ? handleParameterClick : undefined} />
                                            ) : (g.panelId === 'bop' || g.id === 'v_bop' || (g.defaultTitle && (g.defaultTitle.includes('BOP') || g.defaultTitle === 'BOP'))) ? (
                                                <BOPStatusPanel rigData={rigData} w={g.w} h={g.h} onParameterClick={canEdit ? handleParameterClick : undefined} />
                                            ) : (g.panelId === 'key_params' || g.id === 'v_params') ? (
                                                <StatsPanel rigData={rigData} w={g.w} h={g.h} onParameterClick={canEdit ? handleParameterClick : undefined} canEdit={canEdit} />
                                            ) : (
                                                <VerticalStatsPanel panelId={g.panelId} defaultTitle={g.defaultTitle} w={g.w} h={g.h} rigData={rigData} onParameterClick={canEdit ? handleParameterClick : undefined} canEdit={canEdit} />
                                            )
                                         ) :
                                         <AnalogGauge 
                                            key={`${g.id}_${configVersion}`}
                                            value={g.dataKey === 'hook_load' ? normalizeHookLoadValue(rigData[g.dataKey]) : (rigData[g.dataKey] || 0)} 
                                            max={g.max} 
                                            min={g.min} 
                                            label={g.dataKey === 'hook_load' ? 'WOH' : g.label} 
                                            unit={g.unit} 
                                            size={getOverviewGaugeSize(g)} 
                                            color={g.color} 
                                            subValue={g.dataKey === 'hook_load' ? Number(rigData.wob).toFixed(1) : undefined} 
                                            subLabel={g.dataKey === 'hook_load' ? `WOB (${g.unit || 'ton'})` : undefined} 
                                            precision={g.dataKey === 'hook_load' ? 2 : 0}
                                            dataKey={g.dataKey}
                                            showTrend={g.dataKey === 'hook_load'}
                                            onClick={canEdit ? (() => handleParameterClick(g.dataKey, g.dataKey === 'hook_load' ? 'HOOK LOAD' : g.label, g.unit, g.min, g.max)) : undefined}
                                         />}
                                    </Box>
                                </Box>
                            </Box>
                        </ResizablePanel>
                    </Box>
                ))}
            </Box>
            </Box>
            {canEdit && (
                <Button
                    variant="contained"
                    startIcon={editMode ? <Check size={18} /> : <Edit2 size={18} />}
                    onClick={() => setEditMode(!editMode)}
                    sx={{
                        position: 'fixed',
                        top: 72,
                        right: 24,
                        zIndex: 1200,
                        bgcolor: editMode ? '#fbbf24' : '#38bdf8',
                        color: editMode ? '#0f172a' : '#ffffff',
                        fontWeight: 'bold',
                        letterSpacing: 0.5,
                        boxShadow: '0 10px 24px rgba(0, 0, 0, 0.35)',
                        '&:hover': { bgcolor: editMode ? '#f59e0b' : '#0284c7' }
                    }}
                >
                    {editMode ? 'DONE' : 'EDIT PANEL'}
                </Button>
            )}

            {/* Gauge Settings Dialog */}
            <Dialog open={isDialogOpen} onClose={() => setIsDialogOpen(false)} PaperProps={{ sx: { bgcolor: '#1e293b', color: 'white', border: '1px solid #334155', minWidth: 400 } }}>
                <DialogTitle sx={{ borderBottom: '1px solid #334155' }}>Panel Settings: {editingGauge?.label || editingGauge?.id}</DialogTitle>
                <DialogContent sx={{ pt: 3 }}>
                    <Grid container spacing={2}>
                        <Grid item xs={12}>
                            <TextField fullWidth label="Title / Label" value={editingGauge?.label || ''} onChange={(e) => setEditingGauge({...editingGauge, label: e.target.value})} variant="filled" sx={{ bgcolor: 'rgba(0,0,0,0.2)' }} InputProps={{ style: { color: 'white' } }} InputLabelProps={{ style: { color: '#94a3b8' } }} />
                        </Grid>
                        <Grid item xs={12}>
                            <TextField fullWidth label="Data Source (dataKey)" value={editingGauge?.dataKey || ''} onChange={(e) => setEditingGauge({...editingGauge, dataKey: e.target.value})} variant="filled" sx={{ bgcolor: 'rgba(0,0,0,0.2)' }} InputProps={{ style: { color: 'white' } }} InputLabelProps={{ style: { color: '#94a3b8' } }} />
                        </Grid>
                        <Grid item xs={6}>
                            <TextField fullWidth type="number" label="Min Value" value={editingGauge?.min || 0} onChange={(e) => setEditingGauge({...editingGauge, min: Number(e.target.value)})} variant="filled" sx={{ bgcolor: 'rgba(0,0,0,0.2)' }} InputProps={{ style: { color: 'white' } }} InputLabelProps={{ style: { color: '#94a3b8' } }} />
                        </Grid>
                        <Grid item xs={6}>
                            <TextField fullWidth type="number" label="Max Value" value={editingGauge?.max || 100} onChange={(e) => setEditingGauge({...editingGauge, max: Number(e.target.value)})} variant="filled" sx={{ bgcolor: 'rgba(0,0,0,0.2)' }} InputProps={{ style: { color: 'white' } }} InputLabelProps={{ style: { color: '#94a3b8' } }} />
                        </Grid>
                        <Grid item xs={6}>
                            <TextField fullWidth label="Unit" value={editingGauge?.unit || ''} onChange={(e) => setEditingGauge({...editingGauge, unit: e.target.value})} variant="filled" sx={{ bgcolor: 'rgba(0,0,0,0.2)' }} InputProps={{ style: { color: 'white' } }} InputLabelProps={{ style: { color: '#94a3b8' } }} />
                        </Grid>
                        <Grid item xs={6}>
                            <TextField fullWidth label="Dial Color (hex)" value={editingGauge?.color || '#38bdf8'} onChange={(e) => setEditingGauge({...editingGauge, color: e.target.value})} variant="filled" sx={{ bgcolor: 'rgba(0,0,0,0.2)' }} InputProps={{ style: { color: 'white' } }} InputLabelProps={{ style: { color: '#94a3b8' } }} />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions sx={{ p: 2, borderTop: '1px solid #334155' }}>
                    <Button onClick={() => setIsDialogOpen(false)} sx={{ color: '#94a3b8' }}>Cancel</Button>
                    <Button onClick={handleSaveSettings} variant="contained" sx={{ bgcolor: '#38bdf8', '&:hover': { bgcolor: '#0284c7' } }}>Save Configuration</Button>
                </DialogActions>
            </Dialog>

            {/* Custom Parameter Alarms and Scales Settings Popup */}
            {canEdit && (
                <ParameterSettingsDialog 
                    open={paramDialogOpen}
                    onClose={() => setParamDialogOpen(false)}
                    metricKey={activeParamKey}
                    metricLabel={activeParamLabel}
                    unit={activeParamUnit}
                    defaultMin={activeParamMin}
                    defaultMax={activeParamMax}
                    onSave={() => setConfigVersion(v => v + 1)}
                />
            )}
        </Box>
    );
}



