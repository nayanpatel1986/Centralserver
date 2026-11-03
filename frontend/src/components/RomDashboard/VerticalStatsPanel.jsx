import React, { useState, useEffect } from 'react';
import { Box, Paper, Typography, IconButton, Grid, Dialog, DialogTitle, DialogContent, FormControl, InputLabel, Select, MenuItem, Button, DialogActions, TextField } from '@mui/material';
import { Settings, Edit2 } from 'lucide-react';

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
    { key: 'total_spm', label: 'Total SPM', unit: 'spm' },
    { key: 'rig_air_pressure', label: 'Rig Air Pressure', unit: 'psi' },
    { key: 'oil_temp', label: 'Oil Temp', unit: '°C' },
    { key: 'coolant_temp', label: 'Coolant Temp', unit: '°C' },
    { key: 'exhaust_temp', label: 'Exhaust Temp', unit: '°C' },
    { key: 'fuel_level', label: 'Fuel Level', unit: '%' },
    { key: 'battery_voltage', label: 'Battery Voltage', unit: 'V' },
    { key: 'tubing_pressure', label: 'Tubing Pressure', unit: 'psi' },
    { key: 'casing_pressure', label: 'Casing Pressure', unit: 'psi' },
    { key: 'bop_pressure', label: 'BOP Pressure', unit: 'psi' },
    { key: 'accumulator_pressure', label: 'Accumulator Pressure', unit: 'psi' },
    { key: 'manifold_pressure', label: 'Manifold Pressure', unit: 'psi' },
    { key: 'annular_pressure', label: 'Annular Pressure', unit: 'psi' },
    { key: 'trip_tank', label: 'Trip Tank', unit: 'm³' },
    { key: 'pump_1_run', label: 'Pump 1 Run', unit: '' },
    { key: 'pump_2_run', label: 'Pump 2 Run', unit: '' },
    { key: 'engine_run', label: 'Engine Run', unit: '' },
    { key: 'scr_assignment', label: 'SCR Assignment', unit: '' },
    { key: 'annular_open', label: 'Annular Open', unit: '' },
    { key: 'pipe_ram_open', label: 'Pipe Ram Open', unit: '' },
    { key: 'blind_ram_open', label: 'Blind Ram Open', unit: '' },
    { key: 'shear_ram_open', label: 'Shear Ram Open', unit: '' },
    { key: 'crownomatic', label: 'Crown-o-matic', unit: '' },
    { key: 'flooromatic', label: 'Floor-o-matic', unit: '' },
    { key: 'travelling_up', label: 'Travelling Up', unit: '' },
    { key: 'travelling_down', label: 'Travelling Down', unit: '' },
    { key: 'pipe_ram_close', label: 'Pipe Ram Close', unit: '' },
    { key: 'blind_ram_close', label: 'Blind Ram Close', unit: '' },
    { key: 'annularram_open', label: 'Annular Ram Open', unit: '' },
    { key: 'annularram_close', label: 'Annular Ram Close', unit: '' },
];

const VerticalStatsPanel = ({ panelId, defaultConfig, rigData, w, h, onParameterClick, canEdit = false }) => {
    const [config, setConfig] = useState(defaultConfig || []);
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    const hMetric = h || 400;
    const isTiny = hMetric < 200;
    const isSmall = hMetric < 300;

    const [tempConfig, setTempConfig] = useState([]);

    useEffect(() => {
        if (!canEdit) setIsDialogOpen(false);
    }, [canEdit]);

    useEffect(() => {
        const savedData = localStorage.getItem(`romii_vstat_${panelId}`);
        if (savedData) {
            try {
                const parsed = JSON.parse(savedData);
                if (parsed.config && Array.isArray(parsed.config)) setConfig(parsed.config);
            } catch (e) {
                console.error("Failed to parse saved config for panel:", panelId, e);
            }
        }
    }, [panelId]);

    const saveConfig = (newConfig) => {
        setConfig(newConfig);
        localStorage.setItem(`romii_vstat_${panelId}`, JSON.stringify({ config: newConfig }));
        setIsDialogOpen(false);
    };

    const handleEditClick = () => {
        if (!canEdit) return;
        const currentConfig = [...config];
        while (currentConfig.length < 5) {
            currentConfig.push({ key: '', label: '', unit: '' });
        }
        setTempConfig(currentConfig.slice(0, 5));
        setIsDialogOpen(true);
    };

    const handleSave = () => {
        const newConfig = tempConfig.map(tempItem => {
            if (!tempItem.key) return { key: '', label: '-', unit: '' };
            const metric = AVAILABLE_METRICS.find(m => m.key === tempItem.key);
            return {
                key: tempItem.key,
                label: metric ? metric.label.toUpperCase() : 'UNKNOWN',
                unit: metric ? metric.unit : ''
            };
        });
        saveConfig(newConfig);
    };

    const handleSlotChange = (index, value) => {
        const newTempConfig = [...tempConfig];
        newTempConfig[index] = { ...newTempConfig[index], key: value };
        setTempConfig(newTempConfig);
    };

    const getValue = (key) => {
        if (!key) return '-';
        let val = rigData[key];
        if (val === undefined || val === null) return '0';

        if (typeof val === 'boolean' || (typeof val === 'number' && (key.includes('run') || key.includes('open') || key.includes('close') || key.includes('matic') || key.includes('travelling')))) {
            const isTrue = val === true || val === 1 || val === "1";
            return isTrue ? "ON" : "OFF";
        }

        if (typeof val === 'number') {
            if (key === 'hook_load') return val.toFixed(2);
            if (key.includes('depth') || key === 'wob') return val.toFixed(1);
            return val.toFixed(0);
        }
        return val;
    };

    return (
        <Box sx={{ p: isSmall ? 1 : 2, flexGrow: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', width: '100%', height: '100%', position: 'relative' }}>
            {canEdit && (<Box sx={{ position: 'absolute', right: 8, top: -28, zIndex: 10 }}>
                <IconButton
                    size="small"
                    onClick={handleEditClick}
                    sx={{ color: '#64748b', '&:hover': { color: '#fbbf24', bgcolor: 'rgba(251, 191, 36, 0.1)' } }}
                >
                    <Settings size={isSmall ? 14 : 16} />
                </IconButton>
            </Box>)}

            <Box 
                sx={{ 
                    flexGrow: 1, 
                    display: 'flex', 
                    flexDirection: 'column', 
                    justifyContent: 'center',
                    overflowY: 'auto',
                    '&::-webkit-scrollbar': { display: 'none' },
                }}
            >
                {config.map((item, index) => {
                    const hasValue = !!item.key;
                    const value = getValue(item.key);

                    return (
                        <Box
                            key={index}
                            onClick={() => {
                                if (hasValue && onParameterClick) {
                                    onParameterClick(item.key, item.label, item.unit);
                                }
                            }}
                            sx={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                py: isTiny ? 0.4 : isSmall ? 0.6 : 1.2,
                                borderBottom: index < config.length - 1 ? '1px solid rgba(51, 65, 85, 0.4)' : 'none',
                                opacity: hasValue ? 1 : 0.4,
                                cursor: (hasValue && onParameterClick) ? 'pointer' : 'default',
                                borderRadius: '4px',
                                px: 0.5,
                                transition: 'all 0.2s',
                                '&:hover': (hasValue && onParameterClick) ? {
                                    bgcolor: 'rgba(56, 189, 248, 0.05)'
                                } : {}
                            }}
                        >
                            <Typography variant="body2" sx={{ color: '#cbd5e1', fontWeight: 500, fontSize: isSmall ? '0.7rem' : '0.85rem' }}>
                                {item.label}
                            </Typography>

                            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                                <Typography
                                    variant={isSmall ? "body2" : "body1"}
                                    sx={{
                                        fontWeight: 'bold',
                                        color: hasValue ? '#38bdf8' : '#64748b',
                                        fontSize: isSmall ? '0.8rem' : '1rem'
                                    }}
                                >
                                    {value}
                                </Typography>
                                {!isTiny && (
                                    <Box sx={{ width: isSmall ? '35px' : '45px', textAlign: 'left' }}>
                                        <Typography variant="caption" sx={{ color: '#64748b', fontSize: isSmall ? '0.6rem' : '0.7rem' }}>
                                            {item.unit}
                                        </Typography>
                                    </Box>
                                )}
                            </Box>
                        </Box>
                    );
                })}
            </Box>

            {/* Config Dialog */}
            <Dialog
                open={isDialogOpen}
                onClose={() => setIsDialogOpen(false)}
                PaperProps={{ sx: { bgcolor: '#1e293b', color: 'white', minWidth: 350 } }}
            >
                <DialogTitle>Configure Panel Settings</DialogTitle>
                <DialogContent>
                    {tempConfig.map((slot, index) => (
                        <FormControl fullWidth size="small" sx={{ mb: 2, mt: index === 0 ? 1 : 0 }} key={index}>
                            <InputLabel sx={{ color: '#94a3b8' }}>Parameter {index + 1}</InputLabel>
                            <Select
                                value={slot.key || ''}
                                label={`Parameter ${index + 1}`}
                                onChange={(e) => handleSlotChange(index, e.target.value)}
                                sx={{ color: 'white', '.MuiOutlinedInput-notchedOutline': { borderColor: '#475569' }, '& .MuiSvgIcon-root': { color: '#94a3b8' } }}
                            >
                                <MenuItem value=""><em>None</em></MenuItem>
                                {AVAILABLE_METRICS.map((m) => (
                                    <MenuItem key={m.key} value={m.key}>
                                        {m.label} {m.unit ? `(${m.unit})` : ''}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    ))}
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => setIsDialogOpen(false)} sx={{ color: '#94a3b8' }}>Cancel</Button>
                    <Button onClick={handleSave} variant="contained" sx={{ bgcolor: '#38bdf8' }}>Save</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default VerticalStatsPanel;
