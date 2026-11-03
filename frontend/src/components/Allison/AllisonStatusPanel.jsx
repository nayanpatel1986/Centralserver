import React from 'react';
import { Box, Typography, Grid, Paper } from '@mui/material';
import { Truck, ArrowUpCircle, Activity, Thermometer, Gauge } from 'lucide-react';

const MetricItem = ({ label, value, unit, icon: Icon, color }) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1 }}>
        <Box sx={{ 
            p: 1, borderRadius: '8px', bgcolor: 'rgba(255,255,255,0.03)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
            <Icon size={16} color={color} />
        </Box>
        <Box sx={{ flexGrow: 1 }}>
            <Typography variant="caption" sx={{ color: '#64748b', display: 'block', lineHeight: 1, fontWeight: 700, fontSize: '0.75rem', letterSpacing: 0.5 }}>
                {label}
            </Typography>
            <Typography sx={{ color: 'white', fontWeight: 'bold', fontSize: '1.25rem', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
                {value} <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{unit}</span>
            </Typography>
        </Box>
    </Box>
);

export default function AllisonStatusPanel({ rigData, w, h }) {
    const data = rigData?.allison || {
        actual_gear: 'N',
        output_rpm: 0,
        input_rpm: 0,
        oil_temp: 0,
        oil_pressure: 0,
        mode: 0,
        lockup: false
    };

    const isHoisting = data.mode === 1;
    const accentColor = isHoisting ? '#38bdf8' : '#10b981';

    return (
        <Box sx={{ width: '100%', height: '100%', p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Grid container spacing={1.5} sx={{ flexGrow: 1 }}>
                {/* Visual Gear & Mode */}
                <Grid item xs={5}>
                    <Box sx={{ 
                        height: '100%', display: 'flex', flexDirection: 'column', 
                        justifyContent: 'center', alignItems: 'center',
                        bgcolor: 'rgba(30, 41, 59, 0.4)', borderRadius: '12px',
                        border: `1px solid ${accentColor}33`,
                        position: 'relative', overflow: 'hidden'
                    }}>
                        {/* Mode Indicator Overlay */}
                        <Box sx={{ 
                            position: 'absolute', top: 8, left: 8, display: 'flex', alignItems: 'center', gap: 0.5,
                            color: accentColor, opacity: 0.8
                        }}>
                            {isHoisting ? <ArrowUpCircle size={12} /> : <Truck size={12} />}
                            <Typography variant="caption" sx={{ fontSize: '0.55rem', fontWeight: 900 }}>
                                {isHoisting ? 'HOIST' : 'ROAD'}
                            </Typography>
                        </Box>

                        <Typography variant="h2" sx={{ 
                            color: 'white', fontWeight: 900, fontSize: h < 200 ? '3rem' : '4.5rem',
                            textShadow: `0 0 20px ${accentColor}66`
                        }}>
                            {data.actual_gear}
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 800 }}>GEAR</Typography>
                    </Box>
                </Grid>

                {/* Main Metrics */}
                <Grid item xs={7}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
                        <MetricItem 
                            label="OUTPUT SPEED"
                            value={data.output_rpm}
                            unit="RPM"
                            icon={Activity}
                            color={accentColor}
                        />
                        <Box sx={{ height: '1px', bgcolor: 'rgba(255,255,255,0.05)', my: 0.5 }} />
                        <Grid container spacing={1}>
                            <Grid item xs={6}>
                                <Typography variant="caption" sx={{ color: '#64748b', display: 'block', fontSize: '0.75rem', fontWeight: 'bold' }}>OIL TEMP</Typography>
                                <Typography sx={{ color: data.oil_temp > 95 ? '#ef4444' : 'white', fontWeight: 'bold', fontSize: '1.2rem', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
                                    {data.oil_temp}<span style={{ fontSize: '0.8rem' }}>°C</span>
                                </Typography>
                            </Grid>
                            <Grid item xs={6}>
                                <Typography variant="caption" sx={{ color: '#64748b', display: 'block', fontSize: '0.75rem', fontWeight: 'bold' }}>LINE PSI</Typography>
                                <Typography sx={{ color: 'white', fontWeight: 'bold', fontSize: '1.2rem', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
                                    {data.oil_pressure}
                                </Typography>
                            </Grid>
                        </Grid>
                    </Box>
                </Grid>
            </Grid>

            {/* Lockup & Input RPM Footer */}
            <Box sx={{ 
                mt: 'auto', px: 1, py: 0.5, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: '6px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ 
                        width: 8, height: 8, borderRadius: '50%', 
                        bgcolor: data.lockup ? '#4ade80' : '#64748b',
                        boxShadow: data.lockup ? '0 0 8px #4ade80' : 'none'
                    }} />
                    <Typography variant="caption" sx={{ color: data.lockup ? '#4ade80' : '#64748b', fontWeight: 800, fontSize: '0.8rem' }}>
                        LOCKUP {data.lockup ? 'ON' : 'OFF'}
                    </Typography>
                </Box>
                <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 700, fontSize: '0.8rem' }}>
                    IN: {data.input_rpm} RPM
                </Typography>
            </Box>
        </Box>
    );
}
