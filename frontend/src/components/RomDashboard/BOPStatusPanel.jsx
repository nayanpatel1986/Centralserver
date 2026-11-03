import React from 'react';
import { Box, Typography, Grid, Paper } from '@mui/material';

const StatusTile = ({ label, status, isSmall }) => {
    let color = '#475569'; // Default Gray
    let statusText = '???';
    let glow = 'none';

    if (status === 'closed') {
        color = '#ef4444'; // Red
        statusText = 'CLOSED';
        glow = '0 0 8px #ef4444';
    } else if (status === 'open') {
        color = '#22c55e'; // Green
        statusText = 'OPEN';
        glow = '0 0 8px #22c55e';
    }

    return (
        <Paper
            sx={{
                p: isSmall ? 1 : 1.5,
                bgcolor: 'rgba(30, 41, 59, 0.4)',
                border: '1px solid rgba(51, 65, 85, 0.5)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                minHeight: isSmall ? 70 : 85,
                borderRadius: 2
            }}
        >
            <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 'bold', mb: isSmall ? 0.5 : 1, letterSpacing: 0.5, fontSize: isSmall ? '0.65rem' : '0.8rem' }}>
                {label}
            </Typography>
            <Box
                sx={{
                    width: isSmall ? 8 : 12,
                    height: isSmall ? 8 : 12,
                    borderRadius: '50%',
                    bgcolor: color,
                    boxShadow: glow,
                    mb: isSmall ? 0.5 : 1
                }}
            />
            <Typography variant={isSmall ? "body1" : "h6"} sx={{ color: color, fontWeight: 'bold' }}>
                {statusText}
            </Typography>
        </Paper>
    );
};

const PressureTile = ({ label, value, unit, color, isSmall, onClick, index = 0 }) => {
    const [hist, setHist] = React.useState([]);
    const nVal = Number(value);

    React.useEffect(() => {
        setHist(prev => {
            const next = [...prev, isNaN(nVal) ? 0 : nVal];
            if (next.length > 50) next.shift();
            return next;
        });
    }, [nVal]);

    const activeColor = color || '#38bdf8';
    const minVal = Math.min(...hist) || 0;
    const maxVal = Math.max(...hist) || 100;
    const range = (maxVal - minVal) || 1;

    const getY = (v) => {
        if (maxVal === minVal) return 50;
        const normalized = (v - minVal) / range;
        return 90 - (normalized * 80);
    };

    return (
        <Paper
            onClick={onClick}
            sx={{
                p: isSmall ? 1 : 1.5,
                bgcolor: 'rgba(30, 41, 59, 0.4)',
                border: '1px solid rgba(51, 65, 85, 0.5)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                minHeight: isSmall ? 70 : 85,
                borderRadius: 2,
                cursor: onClick ? 'pointer' : 'default',
                position: 'relative',
                overflow: 'hidden',
                transition: 'all 0.2s',
                '&:hover': onClick ? {
                    bgcolor: 'rgba(51, 65, 85, 0.6)',
                    borderColor: '#38bdf8',
                    transform: 'translateY(-2px)'
                } : {}
            }}
        >
            <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 'bold', mb: isSmall ? 0.5 : 1, letterSpacing: 0.5, fontSize: isSmall ? '0.65rem' : '0.8rem', zIndex: 1 }}>
                {label}
            </Typography>
            <Typography variant={isSmall ? "h5" : "h4"} sx={{ color: activeColor, fontWeight: 'bold', mb: 0.2, zIndex: 1, textShadow: '0 2px 4px rgba(0,0,0,0.5)', lineHeight: 1 }}>
                {value ?? 0}
            </Typography>
            <Typography variant="caption" sx={{ color: '#64748b', fontSize: isSmall ? '0.6rem' : '0.8rem', fontWeight: 'bold', zIndex: 1 }}>
                {unit || "PSI"}
            </Typography>

            <Box sx={{ width: '100%', height: '40%', position: 'absolute', bottom: 0, left: 0, opacity: 0.9, pointerEvents: 'none' }}>
                <svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 49 100" style={{ overflow: 'visible' }}>
                    <polyline 
                        points={hist.map((v, i) => `${i},${getY(v)}`).join(' ')}
                        fill="none"
                        stroke={activeColor}
                        strokeWidth="2"
                    />
                    <polygon 
                        points={`0,100 ${hist.map((v, i) => `${i},${getY(v)}`).join(' ')} ${hist.length > 0 ? hist.length - 1 : 0},100`}
                        fill={`url(#gradient-bop-${label.replace(/\s+/g, '')})`}
                        opacity="0.3"
                    />
                    <defs>
                        <linearGradient id={`gradient-bop-${label.replace(/\s+/g, '')}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={activeColor} stopOpacity="1" />
                            <stop offset="100%" stopColor={activeColor} stopOpacity="0" />
                        </linearGradient>
                    </defs>
                </svg>
            </Box>
        </Paper>
    );
};

const BOPStatusPanel = ({ rigData, w, h, onParameterClick }) => {
    // Ram Status Logic
    const getStatus = (closed, open) => {
        if (closed === true || closed === 1) return 'closed';
        if (open === true || open === 1) return 'open';
        return 'unknown';
    };

    const pipeStatus = getStatus(rigData.pipe_ram_close, rigData.pipe_ram_open);
    const blindStatus = getStatus(rigData.blind_ram_close, rigData.blind_ram_open);
    const annularStatus = getStatus(rigData.annular_close, rigData.annular_open);

    const isSmall = !h || h < 7;

    return (
        <Box sx={{ p: isSmall ? 1 : 2, flexGrow: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
            <Grid 
                container 
                spacing={isSmall ? 1 : 2} 
                sx={{ 
                    flexGrow: 1, 
                    overflow: 'auto',
                    /* Hide scrollbar for Chrome, Safari and Opera */
                    '&::-webkit-scrollbar': { display: 'none' },
                    /* Hide scrollbar for IE, Edge and Firefox */
                    'msOverflowStyle': 'none',
                    'scrollbarWidth': 'none',
                }}
            >
                {/* Row 1: Status Indicators */}
                <Grid item xs={4}>
                    <StatusTile 
                        label="PIPE" 
                        status={pipeStatus} 
                        isSmall={isSmall}
                    />
                </Grid>
                <Grid item xs={4}>
                    <StatusTile 
                        label="BLIND" 
                        status={blindStatus} 
                        isSmall={isSmall}
                    />
                </Grid>
                <Grid item xs={4}>
                    <StatusTile 
                        label="ANNLR" 
                        status={annularStatus} 
                        isSmall={isSmall}
                    />
                </Grid>
                {/* Row 2: Pressure Values */}
                <Grid item xs={4}>
                    <PressureTile 
                        label="ANNULAR" 
                        value={rigData.annular_pressure} 
                        unit="PSI" 
                        color="#4ade80" 
                        isSmall={isSmall}
                        onClick={() => onParameterClick && onParameterClick('annular_pressure', 'Annular Pressure', 'PSI')}
                    />
                </Grid>
                <Grid item xs={4}>
                    <PressureTile 
                        label="ACCUM" 
                        value={rigData.accumulator_pressure} 
                        unit="PSI" 
                        color="#38bdf8" 
                        isSmall={isSmall}
                        onClick={() => onParameterClick && onParameterClick('accumulator_pressure', 'Accumulator Pressure', 'PSI')}
                    />
                </Grid>
                <Grid item xs={4}>
                    <PressureTile 
                        label="MANIFOLD" 
                        value={rigData.manifold_pressure} 
                        unit="PSI" 
                        color="#fb923c" 
                        isSmall={isSmall}
                        onClick={() => onParameterClick && onParameterClick('manifold_pressure', 'Manifold Pressure', 'PSI')}
                    />
                </Grid>
            </Grid>
        </Box>
    );
};

export default BOPStatusPanel;
