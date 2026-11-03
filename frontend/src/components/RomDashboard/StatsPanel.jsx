import React, { useState, useEffect } from 'react';
import { Box, Paper, Typography, IconButton, Grid, Dialog, DialogTitle, DialogContent, FormControl, InputLabel, Select, MenuItem, Button, DialogActions } from '@mui/material';
import { Settings, Edit2, Activity } from 'lucide-react';

const AVAILABLE_METRICS = [
    { key: 'hook_load', label: 'Hook Load', unit: 'tons' },
    { key: 'wob', label: 'Weight on Bit', unit: 'kips' },
    { key: 'rop', label: 'Rate of Penetration', unit: 'ft/hr' },
    { key: 'bit_depth', label: 'Bit Depth', unit: 'ft' },
    { key: 'hole_depth', label: 'Hole Depth', unit: 'ft' },
    { key: 'block_position', label: 'Block Position', unit: 'ft' },
    { key: 'pump_pressure', label: 'Pump Pressure', unit: 'psi' },
    { key: 'engine_rpm', label: 'Engine RPM', unit: 'RPM' },
    { key: 'torque', label: 'Torque', unit: 'ft-lbs' },
    { key: 'flow_in', label: 'Flow In', unit: 'GPM' },
    { key: 'flow_out', label: 'Flow Out', unit: 'GPM' },
    { key: 'oil_pressure', label: 'Oil Pressure', unit: 'kPa' },
    { key: 'spm1', label: 'SPM 1', unit: 'spm' },
    { key: 'spm2', label: 'SPM 2', unit: 'spm' },
    { key: 'trip_tank', label: 'Trip Tank', unit: 'm³' },
    { key: 'rig_air_pressure', label: 'Rig Air Pressure', unit: 'psi' },
    { key: 'total_spm', label: 'Total SPM', unit: 'spm' },
    { key: 'annular_pressure', label: 'Annular Pressure', unit: 'psi' },
    { key: 'manifold_pressure', label: 'Manifold Pressure', unit: 'psi' },
    { key: 'accumulator_pressure', label: 'Accumulator Pressure', unit: 'psi' },
    { key: 'tong_torque', label: 'Tong Torque', unit: 'KNM' },
];

const DEFAULT_CONFIG = [
    { key: 'rig_air_pressure', label: 'Air Press.', unit: 'PSI' },
    { key: 'torque', label: 'Rotary Torque', unit: 'ft-lbs' }
];

const TrendCard = ({ item, getValue, isSmall, onParameterClick, editMode, handleEditClick, index }) => {
    const [history, setHistory] = useState([]);
    const valStr = getValue(item.key);
    const nVal = Number(valStr);

    useEffect(() => {
        setHistory(prev => {
            const next = [...prev, isNaN(nVal) ? 0 : nVal];
            if (next.length > 50) next.shift();
            return next;
        });
    }, [nVal]);

    // Use dynamic colors based on index (Blue, Green, Orange, Red, Purple)
    const cardColors = ['#38bdf8', '#22c55e', '#f59e0b', '#ef4444', '#a855f7'];
    const activeColor = item.color || cardColors[index % cardColors.length];

    const minVal = Math.min(...history) || 0;
    const maxVal = Math.max(...history) || 100;
    const range = (maxVal - minVal) || 1;

    // Calculate Y position with padding so the line never hits the absolute top/bottom
    const getY = (v) => {
        if (maxVal === minVal) return 50; // Draw flat line in the middle if values are constant
        const normalized = (v - minVal) / range;
        return 90 - (normalized * 80); // Draw between Y=10 and Y=90
    };

    return (
        <Paper
            onClick={() => {
                if (editMode) {
                    handleEditClick(index);
                } else if (onParameterClick) {
                    onParameterClick(item.key, item.label, item.unit);
                }
            }}
            sx={{
                width: '100%',
                bgcolor: 'rgba(15, 23, 42, 0.6)',
                color: 'white',
                border: editMode ? '1px dashed #fbbf24' : '1px solid rgba(51, 65, 85, 0.5)',
                cursor: 'pointer',
                position: 'relative',
                borderRadius: 2,
                height: '100%',
                minHeight: isSmall ? '80px' : '120px',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                transition: 'all 0.2s',
                '&:hover': {
                    bgcolor: 'rgba(30, 41, 59, 0.8)',
                    transform: 'translateY(-2px)',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
                }
            }}
        >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: isSmall ? 1 : 1.5, pb: 0, zIndex: 1 }}>
                <Typography variant="caption" sx={{ color: activeColor, letterSpacing: 1, fontWeight: 'bold', fontSize: isSmall ? '0.6rem' : '0.75rem', textAlign: 'left' }}>
                    {item.label.toUpperCase()}
                </Typography>
                {editMode && (
                    <Box sx={{ color: '#fbbf24' }}>
                        <Edit2 size={12} />
                    </Box>
                )}
            </Box>
            
            <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'flex-start', gap: 1, flexGrow: 1, zIndex: 1, mb: 3, pl: isSmall ? 1 : 2 }}>
                <Typography variant={isSmall ? 'h4' : 'h3'} sx={{ fontWeight: 'bold', color: activeColor, textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
                    {valStr}
                </Typography>
                <Typography variant="body2" sx={{ color: '#e2e8f0', fontWeight: 'bold' }}>
                    {item.unit}
                </Typography>
            </Box>

            <Box sx={{ width: '100%', height: '40%', position: 'absolute', bottom: 0, left: 0, opacity: 0.9 }}>
                <svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 49 100" style={{ overflow: 'visible' }}>
                    <polyline 
                        points={history.map((v, i) => `${i},${getY(v)}`).join(' ')}
                        fill="none"
                        stroke={activeColor}
                        strokeWidth="2"
                    />
                    <polygon 
                        points={`0,100 ${history.map((v, i) => `${i},${getY(v)}`).join(' ')} ${history.length > 0 ? history.length - 1 : 0},100`}
                        fill={`url(#gradient-trend-${index})`}
                        opacity="0.3"
                    />
                    <defs>
                        <linearGradient id={`gradient-trend-${index}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={activeColor} stopOpacity="1" />
                            <stop offset="100%" stopColor={activeColor} stopOpacity="0" />
                        </linearGradient>
                    </defs>
                </svg>
            </Box>
        </Paper>
    );
};

const StatsPanel = ({ rigData, w, h, onParameterClick, canEdit = false }) => {
    const [config, setConfig] = useState(DEFAULT_CONFIG);
    const [editMode, setEditMode] = useState(false);
    const [editingSlot, setEditingSlot] = useState(null); 
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    const isSmall = !h || h < 7;
    const itemCols = 12; // Force to 12 to make them stack vertically like the engine panel
    const [tempConfig, setTempConfig] = useState({ key: '', label: '', unit: '' });

    useEffect(() => {
        if (!canEdit) {
            setEditMode(false);
            setIsDialogOpen(false);
        }
    }, [canEdit]);

    useEffect(() => {
        const saved = localStorage.getItem('romii_key_performance_config_v1');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    setConfig(parsed);
                }
            } catch (e) {
                console.warn("Failed to parse saved config", e);
            }
        }
    }, []);

    const saveConfig = (newConfig) => {
        setConfig(newConfig);
        localStorage.setItem('romii_key_performance_config_v1', JSON.stringify(newConfig));
    };

    const handleEditClick = (index) => {
        if (!canEdit || !editMode) return;
        setEditingSlot(index);
        const current = config[index];
        setTempConfig(current);
        setIsDialogOpen(true);
    };

    const handleSaveSlot = () => {
        const newConfig = [...config];
        const metric = AVAILABLE_METRICS.find(m => m.key === tempConfig.key);

        newConfig[editingSlot] = {
            key: tempConfig.key,
            label: metric ? metric.label.toUpperCase() : 'UNKNOWN',
            unit: metric ? metric.unit : ''
        };

        saveConfig(newConfig);
        setIsDialogOpen(false);
    };

    const getValue = (key) => {
        let val = rigData[key];
        if (val === undefined || val === null) return '0';
        if (typeof val === 'number') {
            if (key === 'hook_load') return val.toFixed(2);
            if (key.includes('depth')) return val.toFixed(1);
            if (key === 'wob') return val.toFixed(1);
            return val.toFixed(0);
        }
        return val;
    };



    return (
        <Box sx={{ p: isSmall ? 1.5 : 2, flexGrow: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', width: '100%', height: '100%', position: 'relative' }}>
            {canEdit && (<Box sx={{ position: 'absolute', right: 8, top: 8, zIndex: 10 }}>
                <IconButton
                    size="small"
                    onClick={() => setEditMode(!editMode)}
                    sx={{ 
                        color: editMode ? '#fbbf24' : '#64748b', 
                        bgcolor: editMode ? 'rgba(251, 191, 36, 0.1)' : 'rgba(15, 23, 42, 0.2)',
                        '&:hover': { bgcolor: 'rgba(30, 41, 59, 0.6)' }
                    }}
                >
                    <Settings size={isSmall ? 12 : 14} />
                </IconButton>
            </Box>)}
            <Grid 
                container 
                direction="column"
                spacing={isSmall ? 1 : 2} 
                sx={{ 
                    flexGrow: 1, 
                    overflow: 'hidden',
                    flexWrap: 'nowrap'
                }}
            >
                {config.map((item, index) => (
                    <Grid item key={index} sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
                        <TrendCard 
                            item={item} 
                            getValue={getValue} 
                            isSmall={isSmall} 
                            onParameterClick={onParameterClick} 
                            editMode={editMode} 
                            handleEditClick={handleEditClick} 
                            index={index} 
                        />
                    </Grid>
                ))}
            </Grid>

            {/* Config Dialog */}
            <Dialog
                open={isDialogOpen}
                onClose={() => setIsDialogOpen(false)}
                PaperProps={{ sx: { bgcolor: '#1e293b', color: 'white', minWidth: 300 } }}
            >
                <DialogTitle>Configure Slot {editingSlot + 1}</DialogTitle>
                <DialogContent>
                    <FormControl fullWidth sx={{ mt: 2 }}>
                        <InputLabel sx={{ color: '#94a3b8' }}>Parameter</InputLabel>
                        <Select
                            value={tempConfig.key}
                            label="Parameter"
                            onChange={(e) => setTempConfig({ ...tempConfig, key: e.target.value })}
                            sx={{ color: 'white', '.MuiOutlinedInput-notchedOutline': { borderColor: '#475569' }, '& .MuiSvgIcon-root': { color: '#94a3b8' } }}
                        >
                            {AVAILABLE_METRICS.map((m) => (
                                <MenuItem key={m.key} value={m.key}>
                                    {m.label} ({m.unit})
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setIsDialogOpen(false)} sx={{ color: '#94a3b8' }}>Cancel</Button>
                    <Button onClick={handleSaveSlot} variant="contained" sx={{ bgcolor: '#38bdf8' }}>Save</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default StatsPanel;
