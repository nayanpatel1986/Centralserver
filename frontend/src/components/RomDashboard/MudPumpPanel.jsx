import React, { useState, useEffect } from 'react';
import { Box, Typography } from '@mui/material';
import AnalogGauge from '../RomCommon/AnalogGauge';

const MudPumpPanel = ({ rigData, w, h, onParameterClick }) => {
    const spm1 = rigData?.spm1 || 0;
    const spm2 = rigData?.spm2 || 0;
    const totalSpm = rigData?.total_spm || (Number(spm1) + Number(spm2)) || 0;
    const totalStrokes = rigData?.total_strokes || 0;

    const [spmHistory, setSpmHistory] = useState([]);
    const [strokeHistory, setStrokeHistory] = useState([]);

    useEffect(() => {
        setSpmHistory(prev => {
            const next = [...prev, Number(totalSpm) || 0];
            if (next.length > 50) next.shift();
            return next;
        });
    }, [totalSpm]);

    useEffect(() => {
        setStrokeHistory(prev => {
            const next = [...prev, Number(totalStrokes) || 0];
            if (next.length > 50) next.shift();
            return next;
        });
    }, [totalStrokes]);

    const getY = (v, hist) => {
        const minVal = Math.min(...hist) || 0;
        const maxVal = Math.max(...hist) || 100;
        const range = (maxVal - minVal) || 1;
        if (maxVal === minVal) return 50;
        const normalized = (v - minVal) / range;
        return 90 - (normalized * 80);
    };

    const hMetric = h || 400;
    const wMetric = w || 300;
    const isSmall = !h || h < 7;
    
        const horizontalRoom = Math.max(180, (w || 300) - 32);
    const verticalRoom = Math.max(180, (h || 400) - 36 - 75 - 28);
    const gaugeSize = Math.min(420, horizontalRoom, verticalRoom);

    return (
        <Box 
            sx={{ 
                position: 'relative',
                flexGrow: 1, 
                display: 'flex', 
                flexDirection: 'column', 
                p: isSmall ? 1 : 1,
                gap: isSmall ? 1 : 2, 
                justifyContent: 'center',
                width: '100%',
                height: '100%',
                overflowY: 'auto',
                '&::-webkit-scrollbar': { display: 'none' },
            }}
        >
            <Box sx={{ flexGrow: 1, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', width: '100%' }}>
                <AnalogGauge 
                    label="SPP"
                    value={rigData?.pump_pressure || 0}
                    min={0}
                    max={5000}
                    unit="psi"
                    color="#facc15"
                    size={gaugeSize}
                />
            </Box>

            <Box sx={{ 
                position: 'absolute', 
                bottom: 0, 
                left: 0, 
                right: 0, 
                height: 75,
                display: 'flex', 
                gap: 0, 
                px: 0,
                pb: 0,
                pt: 0,
                bgcolor: 'transparent',
                zIndex: 10 
            }}>
                <Box 
                    onClick={() => onParameterClick && onParameterClick('total_spm', 'Total SPM', 'SPM')}
                    sx={{ 
                        flex: 1, 
                        bgcolor: 'rgba(15, 23, 42, 0.6)', 
                        borderBottomLeftRadius: '8px', 
                        p: 0, 
                        textAlign: 'center',
                        borderTop: '1px solid rgba(51, 65, 85, 0.5)',
                        borderRight: '1px solid rgba(51, 65, 85, 0.5)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        position: 'relative',
                        overflow: 'hidden',
                        cursor: onParameterClick ? 'pointer' : 'default',
                        transition: 'all 0.2s',
                        '&:hover': onParameterClick ? {
                            bgcolor: 'rgba(51, 65, 85, 0.8)',
                            borderColor: '#fbbf24'
                        } : {}
                    }}
                >
                    <Box sx={{ zIndex: 2, position: 'relative', pt: 1 }}>
                        <Typography variant="caption" sx={{ color: '#fbbf24', fontWeight: 'bold', display: 'block', mb: 0.5, fontSize: isSmall ? '0.65rem' : '0.8rem', letterSpacing: 1 }}>
                            SPM
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 0.5 }}>
                            <Typography variant={isSmall ? 'h5' : 'h4'} sx={{ fontWeight: 'bold', color: '#fbbf24', lineHeight: 1 }}>
                                {Number(totalSpm).toFixed(0)}
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: isSmall ? '0.6rem' : '0.8rem' }}>SPM</Typography>
                        </Box>
                    </Box>
                    <Box sx={{ width: '100%', height: '50%', position: 'absolute', bottom: 0, left: 0, opacity: 0.9, zIndex: 1 }}>
                        <svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 98 100" style={{ overflow: 'visible', position: 'absolute', bottom: 0 }}>
                            <polyline 
                                points={spmHistory.map((v, i) => {
                                    const x = 98 - ((spmHistory.length - 1 - i) * 2);
                                    return `${x},${getY(v, spmHistory)}`;
                                }).join(' ')}
                                fill="none"
                                stroke="#fbbf24"
                                strokeWidth="1.5"
                            />
                            {spmHistory.length > 0 && (
                                <polygon 
                                    points={`${98 - ((spmHistory.length - 1) * 2)},100 ${spmHistory.map((v, i) => {
                                        const x = 98 - ((spmHistory.length - 1 - i) * 2);
                                        return `${x},${getY(v, spmHistory)}`;
                                    }).join(' ')} 98,100`}
                                    fill="url(#gradient-spm)"
                                    opacity="0.3"
                                />
                            )}
                            <defs>
                                <linearGradient id="gradient-spm" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#fbbf24" stopOpacity="1" />
                                    <stop offset="100%" stopColor="#fbbf24" stopOpacity="0" />
                                </linearGradient>
                            </defs>
                        </svg>
                    </Box>
                </Box>
                
                <Box 
                    onClick={() => onParameterClick && onParameterClick('total_strokes', 'Total Strokes', 'strokes')}
                    sx={{ 
                        flex: 1, 
                        bgcolor: 'rgba(15, 23, 42, 0.6)', 
                        borderBottomRightRadius: '8px', 
                        p: 0, 
                        textAlign: 'center',
                        borderTop: '1px solid rgba(51, 65, 85, 0.5)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        position: 'relative',
                        overflow: 'hidden',
                        cursor: onParameterClick ? 'pointer' : 'default',
                        transition: 'all 0.2s',
                        '&:hover': onParameterClick ? {
                            bgcolor: 'rgba(51, 65, 85, 0.8)',
                            borderColor: '#38bdf8'
                        } : {}
                    }}
                >
                    <Box sx={{ zIndex: 2, position: 'relative', pt: 1 }}>
                        <Typography variant="caption" sx={{ color: '#38bdf8', fontWeight: 'bold', display: 'block', mb: 0.5, fontSize: isSmall ? '0.65rem' : '0.8rem', letterSpacing: 1 }}>
                            STROKES
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 0.5 }}>
                            <Typography variant={isSmall ? 'h5' : 'h4'} sx={{ fontWeight: 'bold', color: '#38bdf8', lineHeight: 1 }}>
                                {Number(totalStrokes).toFixed(0)}
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: isSmall ? '0.6rem' : '0.8rem' }}>strokes</Typography>
                        </Box>
                    </Box>
                    <Box sx={{ width: '100%', height: '50%', position: 'absolute', bottom: 0, left: 0, opacity: 0.9, zIndex: 1 }}>
                        <svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 98 100" style={{ overflow: 'visible', position: 'absolute', bottom: 0 }}>
                            <polyline 
                                points={strokeHistory.map((v, i) => {
                                    const x = 98 - ((strokeHistory.length - 1 - i) * 2);
                                    return `${x},${getY(v, strokeHistory)}`;
                                }).join(' ')}
                                fill="none"
                                stroke="#38bdf8"
                                strokeWidth="1.5"
                            />
                            {strokeHistory.length > 0 && (
                                <polygon 
                                    points={`${98 - ((strokeHistory.length - 1) * 2)},100 ${strokeHistory.map((v, i) => {
                                        const x = 98 - ((strokeHistory.length - 1 - i) * 2);
                                        return `${x},${getY(v, strokeHistory)}`;
                                    }).join(' ')} 98,100`}
                                    fill="url(#gradient-strokes)"
                                    opacity="0.3"
                                />
                            )}
                            <defs>
                                <linearGradient id="gradient-strokes" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#38bdf8" stopOpacity="1" />
                                    <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
                                </linearGradient>
                            </defs>
                        </svg>
                    </Box>
                </Box>
            </Box>
        </Box>
    );
};

export default MudPumpPanel;


