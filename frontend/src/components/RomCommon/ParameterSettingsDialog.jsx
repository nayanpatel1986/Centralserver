import React, { useState, useEffect } from 'react';
import { 
    Dialog, 
    Box, 
    Grid, 
    Typography, 
    IconButton, 
    TextField, 
    Button, 
    Checkbox, 
    FormControlLabel 
} from '@mui/material';
import { Bell, X, Save } from 'lucide-react';

export default function ParameterSettingsDialog({ 
    open, 
    onClose, 
    metricKey, 
    metricLabel, 
    unit = 'TON',
    defaultMin = 0,
    defaultMax = 100,
    onSave 
}) {
    // Local configuration states
    const [scaleMin, setScaleMin] = useState('');
    const [scaleMax, setScaleMax] = useState('');
    const [scaleColorNoAlarm, setScaleColorNoAlarm] = useState(false);
    const [displayColorNoAlarm, setDisplayColorNoAlarm] = useState(false);
    const [interpolateColors, setInterpolateColors] = useState(false);
    const [hornEnabled, setHornEnabled] = useState(false);

    const [highHighAlarm, setHighHighAlarm] = useState('');
    const [highAlarm, setHighAlarm] = useState('');
    const [lowAlarm, setLowAlarm] = useState('');
    const [lowLowAlarm, setLowLowAlarm] = useState('');

    // Load initial settings from localStorage or fallbacks
    useEffect(() => {
        if (!metricKey || !open) return;

        const saved = localStorage.getItem(`romii_metric_cfg_${metricKey}`);
        if (saved) {
            try {
                const cfg = JSON.parse(saved);
                setScaleMin(cfg.scaleMin !== undefined ? cfg.scaleMin : defaultMin);
                setScaleMax(cfg.scaleMax !== undefined ? cfg.scaleMax : defaultMax);
                setScaleColorNoAlarm(!!cfg.scaleColorNoAlarm);
                setDisplayColorNoAlarm(!!cfg.displayColorNoAlarm);
                setInterpolateColors(!!cfg.interpolateColors);
                setHornEnabled(!!cfg.hornEnabled);
                setHighHighAlarm(cfg.highHighAlarm !== undefined ? cfg.highHighAlarm : Math.round(defaultMax * 0.9));
                setHighAlarm(cfg.highAlarm !== undefined ? cfg.highAlarm : Math.round(defaultMax * 0.8));
                setLowAlarm(cfg.lowAlarm !== undefined ? cfg.lowAlarm : Math.round(defaultMax * 0.1));
                setLowLowAlarm(cfg.lowLowAlarm !== undefined ? cfg.lowLowAlarm : Math.round(defaultMax * 0.05));
                return;
            } catch (e) {
                console.error("Error parsing saved metric settings", e);
            }
        }

        // Default calculations if no configuration exists
        setScaleMin(defaultMin);
        setScaleMax(defaultMax);
        setScaleColorNoAlarm(false);
        setDisplayColorNoAlarm(false);
        setInterpolateColors(true);
        setHornEnabled(false);
        setHighHighAlarm(Math.round(defaultMax * 0.9));
        setHighAlarm(Math.round(defaultMax * 0.8));
        setLowAlarm(Math.round(defaultMax * 0.1));
        setLowLowAlarm(Math.round(defaultMax * 0.05));

    }, [metricKey, open, defaultMin, defaultMax]);

    const handleAcceptAndExit = () => {
        const config = {
            scaleMin: Number(scaleMin),
            scaleMax: Number(scaleMax),
            scaleColorNoAlarm,
            displayColorNoAlarm,
            interpolateColors,
            hornEnabled,
            highHighAlarm: Number(highHighAlarm),
            highAlarm: Number(highAlarm),
            lowAlarm: Number(lowAlarm),
            lowLowAlarm: Number(lowLowAlarm),
            unit: unit.toUpperCase()
        };

        localStorage.setItem(`romii_metric_cfg_${metricKey}`, JSON.stringify(config));
        
        // Broadcast custom save callback
        if (onSave) {
            onSave(metricKey, config);
        }
        onClose();
    };

    return (
        <Dialog 
            open={open} 
            onClose={onClose}
            maxWidth="md"
            fullWidth
            PaperProps={{
                sx: {
                    bgcolor: '#0f172a', // Premium dark backdrop
                    border: '1px solid #1e293b',
                    borderRadius: '24px',
                    color: 'white',
                    p: 4,
                    backgroundImage: 'none',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
                }
            }}
        >
            {/* Header */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 4 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Box sx={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        width: 44, 
                        height: 44, 
                        bgcolor: 'rgba(239, 68, 68, 0.1)', 
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: '12px',
                        color: '#ef4444'
                    }}>
                        <Bell size={20} />
                    </Box>
                    <Typography variant="h5" sx={{ fontWeight: 'bold', letterSpacing: 1, textTransform: 'uppercase' }}>
                        {metricLabel}
                    </Typography>
                </Box>
                <IconButton onClick={onClose} sx={{ color: '#64748b', '&:hover': { color: 'white', bgcolor: 'rgba(255,255,255,0.05)' } }}>
                    <X size={20} />
                </IconButton>
            </Box>

            {/* Contents Split Panel */}
            <Grid container spacing={4}>
                
                {/* Left Column (Scale Controls) */}
                <Grid item xs={12} md={6}>
                    <Box sx={{ 
                        bgcolor: '#070a13', 
                        borderRadius: '20px', 
                        border: '1px solid rgba(255,255,255,0.02)',
                        p: 3, 
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: 3
                    }}>
                        {/* Scale Range Min */}
                        <Box>
                            <Typography variant="caption" sx={{ color: '#475569', fontWeight: '800', letterSpacing: 1, display: 'block', mb: 1, textTransform: 'uppercase' }}>
                                Scale Range Min
                            </Typography>
                            <Box sx={{ position: 'relative' }}>
                                <TextField
                                    fullWidth
                                    type="number"
                                    value={scaleMin}
                                    onChange={(e) => setScaleMin(e.target.value)}
                                    variant="standard"
                                    InputProps={{
                                        disableUnderline: true,
                                        style: { color: 'white', fontWeight: 'bold', fontSize: '1.1rem' }
                                    }}
                                    sx={{ 
                                        bgcolor: '#111827', 
                                        borderRadius: '12px', 
                                        px: 2, 
                                        py: 1.5,
                                        border: '1px solid #1f2937'
                                    }}
                                />
                                <Typography variant="caption" sx={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', color: '#475569', fontWeight: 'bold', textTransform: 'uppercase' }}>
                                    {unit}
                                </Typography>
                            </Box>
                        </Box>

                        {/* Scale Range Max */}
                        <Box sx={{ mt: -1 }}>
                            <Typography variant="caption" sx={{ color: '#475569', fontWeight: '800', letterSpacing: 1, display: 'block', mb: 1, textTransform: 'uppercase' }}>
                                Scale Range Max
                            </Typography>
                            <Box sx={{ position: 'relative' }}>
                                <TextField
                                    fullWidth
                                    type="number"
                                    value={scaleMax}
                                    onChange={(e) => setScaleMax(e.target.value)}
                                    variant="standard"
                                    InputProps={{
                                        disableUnderline: true,
                                        style: { color: 'white', fontWeight: 'bold', fontSize: '1.1rem' }
                                    }}
                                    sx={{ 
                                        bgcolor: '#111827', 
                                        borderRadius: '12px', 
                                        px: 2, 
                                        py: 1.5,
                                        border: '1px solid #1f2937'
                                    }}
                                />
                                <Typography variant="caption" sx={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', color: '#475569', fontWeight: 'bold', textTransform: 'uppercase' }}>
                                    {unit}
                                </Typography>
                            </Box>
                        </Box>

                        {/* Options Checkboxes */}
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, my: 1 }}>
                            <FormControlLabel
                                control={
                                    <Checkbox 
                                        checked={scaleColorNoAlarm} 
                                        onChange={(e) => setScaleColorNoAlarm(e.target.checked)}
                                        sx={{ 
                                            color: '#1f2937', 
                                            '&.Mui-checked': { color: '#3b82f6' },
                                            borderRadius: '6px'
                                        }} 
                                    />
                                }
                                label={<Typography variant="body2" sx={{ color: '#cbd5e1', fontWeight: 500 }}>Scale Color (No Alarm)</Typography>}
                            />
                            <FormControlLabel
                                control={
                                    <Checkbox 
                                        checked={displayColorNoAlarm} 
                                        onChange={(e) => setDisplayColorNoAlarm(e.target.checked)}
                                        sx={{ 
                                            color: '#1f2937', 
                                            '&.Mui-checked': { color: '#3b82f6' },
                                            borderRadius: '6px'
                                        }} 
                                    />
                                }
                                label={<Typography variant="body2" sx={{ color: '#cbd5e1', fontWeight: 500 }}>Display Value Color (No Alarm)</Typography>}
                            />
                            <FormControlLabel
                                control={
                                    <Checkbox 
                                        checked={interpolateColors} 
                                        onChange={(e) => setInterpolateColors(e.target.checked)}
                                        sx={{ 
                                            color: '#1f2937', 
                                            '&.Mui-checked': { color: '#3b82f6' },
                                            borderRadius: '6px'
                                        }} 
                                    />
                                }
                                label={<Typography variant="body2" sx={{ color: '#cbd5e1', fontWeight: 500 }}>Interpolate Colors</Typography>}
                            />
                        </Box>

                        {/* Accept and Exit Button */}
                        <Button
                            fullWidth
                            onClick={handleAcceptAndExit}
                            variant="contained"
                            startIcon={<Save size={18} />}
                            sx={{
                                py: 1.8,
                                borderRadius: '14px',
                                bgcolor: '#2563eb',
                                fontSize: '0.9rem',
                                fontWeight: 'bold',
                                textTransform: 'uppercase',
                                letterSpacing: 1,
                                boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)',
                                '&:hover': {
                                    bgcolor: '#1d4ed8',
                                    boxShadow: '0 6px 20px rgba(37, 99, 235, 0.6)',
                                    transform: 'translateY(-1px)'
                                },
                                transition: 'all 0.2s'
                            }}
                        >
                            Accept & Exit
                        </Button>
                    </Box>
                </Grid>

                {/* Right Column (Alarms & Toggles) */}
                <Grid item xs={12} md={6}>
                    <Box sx={{ 
                        bgcolor: '#070a13', 
                        borderRadius: '20px', 
                        border: '1px solid rgba(255,255,255,0.02)',
                        p: 3,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2.5
                    }}>
                        {/* Horn Enable Toggle */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2.5, mb: 1 }}>
                            {/* Glowing Active Ring Circle Button */}
                            <Box 
                                onClick={() => setHornEnabled(!hornEnabled)}
                                sx={{ 
                                    cursor: 'pointer',
                                    position: 'relative',
                                    width: 54, 
                                    height: 54, 
                                    borderRadius: '50%', 
                                    bgcolor: hornEnabled ? 'rgba(239, 68, 68, 0.15)' : 'rgba(30, 41, 59, 0.4)',
                                    border: hornEnabled ? '2px solid #ef4444' : '2px solid #475569',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    boxShadow: hornEnabled ? '0 0 15px rgba(239,68,68,0.4)' : 'none',
                                    transition: 'all 0.3s'
                                }}
                            >
                                <Bell size={18} color={hornEnabled ? '#ef4444' : '#94a3b8'} />
                                <Typography variant="caption" sx={{ fontSize: '0.55rem', fontWeight: 'bold', color: hornEnabled ? '#ef4444' : '#94a3b8', lineHeight: 1, mt: -0.2 }}>
                                    {hornEnabled ? 'On' : 'Off'}
                                </Typography>
                            </Box>
                            <Box>
                                <Typography variant="body1" sx={{ fontWeight: 'bold', color: 'white' }}>
                                    Horn Enable / Disable
                                </Typography>
                            </Box>
                        </Box>

                        {/* High High Alarm */}
                        <Box>
                            <Typography variant="caption" sx={{ color: '#475569', fontWeight: '800', letterSpacing: 0.5, display: 'block', mb: 0.6, textTransform: 'uppercase' }}>
                                High High Alarm
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                                <Box sx={{ position: 'relative', flexGrow: 1 }}>
                                    <TextField
                                        fullWidth
                                        type="number"
                                        value={highHighAlarm}
                                        onChange={(e) => setHighHighAlarm(e.target.value)}
                                        variant="standard"
                                        InputProps={{
                                            disableUnderline: true,
                                            style: { color: 'white', fontWeight: 'bold', fontSize: '1rem' }
                                        }}
                                        sx={{ bgcolor: '#111827', borderRadius: '10px', px: 2, py: 1.2, border: '1px solid #1f2937' }}
                                    />
                                    <Typography variant="caption" sx={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', color: '#475569', fontWeight: 'bold', textTransform: 'uppercase' }}>
                                        {unit}
                                    </Typography>
                                </Box>
                                <Box sx={{ width: 40, height: 40, borderRadius: '8px', bgcolor: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.4)' }} />
                            </Box>
                        </Box>

                        {/* High Alarm */}
                        <Box>
                            <Typography variant="caption" sx={{ color: '#475569', fontWeight: '800', letterSpacing: 0.5, display: 'block', mb: 0.6, textTransform: 'uppercase' }}>
                                High Alarm
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                                <Box sx={{ position: 'relative', flexGrow: 1 }}>
                                    <TextField
                                        fullWidth
                                        type="number"
                                        value={highAlarm}
                                        onChange={(e) => setHighAlarm(e.target.value)}
                                        variant="standard"
                                        InputProps={{
                                            disableUnderline: true,
                                            style: { color: 'white', fontWeight: 'bold', fontSize: '1rem' }
                                        }}
                                        sx={{ bgcolor: '#111827', borderRadius: '10px', px: 2, py: 1.2, border: '1px solid #1f2937' }}
                                    />
                                    <Typography variant="caption" sx={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', color: '#475569', fontWeight: 'bold', textTransform: 'uppercase' }}>
                                        {unit}
                                    </Typography>
                                </Box>
                                <Box sx={{ width: 40, height: 40, borderRadius: '8px', bgcolor: '#fbbf24', border: '1px solid rgba(251, 191, 36, 0.4)' }} />
                            </Box>
                        </Box>

                        {/* Low Alarm */}
                        <Box>
                            <Typography variant="caption" sx={{ color: '#475569', fontWeight: '800', letterSpacing: 0.5, display: 'block', mb: 0.6, textTransform: 'uppercase' }}>
                                Low Alarm
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                                <Box sx={{ position: 'relative', flexGrow: 1 }}>
                                    <TextField
                                        fullWidth
                                        type="number"
                                        value={lowAlarm}
                                        onChange={(e) => setLowAlarm(e.target.value)}
                                        variant="standard"
                                        InputProps={{
                                            disableUnderline: true,
                                            style: { color: 'white', fontWeight: 'bold', fontSize: '1rem' }
                                        }}
                                        sx={{ bgcolor: '#111827', borderRadius: '10px', px: 2, py: 1.2, border: '1px solid #1f2937' }}
                                    />
                                    <Typography variant="caption" sx={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', color: '#475569', fontWeight: 'bold', textTransform: 'uppercase' }}>
                                        {unit}
                                    </Typography>
                                </Box>
                                <Box sx={{ width: 40, height: 40, borderRadius: '8px', bgcolor: '#fbbf24', border: '1px solid rgba(251, 191, 36, 0.4)' }} />
                            </Box>
                        </Box>

                        {/* Low Low Alarm */}
                        <Box>
                            <Typography variant="caption" sx={{ color: '#475569', fontWeight: '800', letterSpacing: 0.5, display: 'block', mb: 0.6, textTransform: 'uppercase' }}>
                                Low Low Alarm
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                                <Box sx={{ position: 'relative', flexGrow: 1 }}>
                                    <TextField
                                        fullWidth
                                        type="number"
                                        value={lowLowAlarm}
                                        onChange={(e) => setLowLowAlarm(e.target.value)}
                                        variant="standard"
                                        InputProps={{
                                            disableUnderline: true,
                                            style: { color: 'white', fontWeight: 'bold', fontSize: '1rem' }
                                        }}
                                        sx={{ bgcolor: '#111827', borderRadius: '10px', px: 2, py: 1.2, border: '1px solid #1f2937' }}
                                    />
                                    <Typography variant="caption" sx={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', color: '#475569', fontWeight: 'bold', textTransform: 'uppercase' }}>
                                        {unit}
                                    </Typography>
                                </Box>
                                <Box sx={{ width: 40, height: 40, borderRadius: '8px', bgcolor: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.4)' }} />
                            </Box>
                        </Box>

                        {/* Cancel Button */}
                        <Button
                            fullWidth
                            onClick={onClose}
                            variant="text"
                            sx={{
                                py: 1.8,
                                borderRadius: '14px',
                                bgcolor: '#111827',
                                color: '#94a3b8',
                                fontSize: '0.9rem',
                                fontWeight: 'bold',
                                textTransform: 'uppercase',
                                letterSpacing: 1,
                                border: '1px solid #1f2937',
                                '&:hover': {
                                    bgcolor: '#1f2937',
                                    color: 'white'
                                }
                            }}
                        >
                            Cancel
                        </Button>
                    </Box>
                </Grid>
            </Grid>
        </Dialog>
    );
}
