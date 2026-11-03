import React from 'react';
import { Box, Typography, Divider } from '@mui/material';

const VerticalTank = ({ label, value, unit, percent, color, isSmall, tankSize = 'normal', onClick }) => (
    <Box 
        onClick={onClick}
        sx={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            justifyContent: 'flex-end',
            px: 1,
            cursor: onClick ? 'pointer' : 'default',
            transition: 'all 0.2s',
            borderRadius: 1.5,
            '&:hover': onClick ? {
                transform: 'translateY(-2px)',
                bgcolor: 'rgba(255,255,255,0.02)'
            } : {}
        }}
    >
        <Box sx={{ 
            width: tankSize === 'small' ? (isSmall ? '16px' : '24px') : (isSmall ? '24px' : '36px'), 
            height: '120px', 
            bgcolor: 'rgba(15, 23, 42, 0.6)', 
            borderRadius: '4px', 
            position: 'relative', 
            overflow: 'hidden',
        }}>
            <Box sx={{ 
                width: '100%', 
                height: `${percent}%`, 
                bgcolor: color, 
                position: 'absolute', 
                bottom: 0, 
                left: 0,
                transition: 'height 1s ease-in-out',
            }} />
        </Box>
        <Typography sx={{ color: 'white', fontWeight: 'bold', fontSize: isSmall ? '1rem' : '1.25rem', mt: 1, lineHeight: 1 }}>
            {Number(value).toFixed(1)}
        </Typography>
        <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: isSmall ? '0.65rem' : '0.75rem', letterSpacing: 0.5, fontWeight: 'bold', whiteSpace: 'nowrap', mt: 0.5 }}>
            {label}
        </Typography>
    </Box>
);

const MudVolumePanel = ({ rigData, w, h, onParameterClick }) => {
    const tripTank = rigData?.trip_tank || 0;
    const tank1 = rigData?.tank1 || 0;
    const tank2 = rigData?.tank2 || 0;
    const flowRate = rigData?.flow_rate || 0;
    const flowOut = rigData?.flow_out || 0;
    const gainLoss = rigData?.gain_loss || -100.0;

    const isTiny = h && h < 3;
    const isSmall = !h || h < 7;
    const maxTankCap = 500;
    const getProgress = (val) => Math.min((val / maxTankCap) * 100, 100);

    return (
        <Box 
            sx={{ 
                flexGrow: 1, 
                display: 'flex', 
                flexDirection: 'column', 
                p: 0,
                width: '100%',
                height: '100%',
                overflow: 'hidden',
                bgcolor: '#0f172a'
            }}
        >
            {/* Upper Section: Vertical Tanks */}
            <Box sx={{ 
                flexGrow: 1, 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'flex-end', 
                gap: isSmall ? 2 : 4,
                pt: 2, 
                pb: 1,
                px: 1
            }}>
                <VerticalTank 
                    label="Tank 1" 
                    value={tank1} 
                    unit="m³" 
                    percent={getProgress(tank1)} 
                    color="#3b82f6" 
                    isSmall={isSmall} 
                    tankSize="small"
                    onClick={() => onParameterClick && onParameterClick('tank1', 'Tank 1', 'm³')}
                />
                <VerticalTank 
                    label="Tank 2" 
                    value={tank2} 
                    unit="m³" 
                    percent={getProgress(tank2)} 
                    color="#3b82f6" 
                    isSmall={isSmall} 
                    tankSize="small"
                    onClick={() => onParameterClick && onParameterClick('tank2', 'Tank 2', 'm³')}
                />
                <VerticalTank 
                    label="Trip Tank" 
                    value={tripTank} 
                    unit="m³" 
                    percent={getProgress(tripTank)} 
                    color="#f59e0b" 
                    isSmall={isSmall} 
                    onClick={() => onParameterClick && onParameterClick('trip_tank', 'Trip Tank', 'm³')}
                />
            </Box>

            {/* Divider */}
            <Divider sx={{ borderColor: 'rgba(51, 65, 85, 0.4)', mx: 2, my: 1 }} />

            {/* Bottom Section: Flow Metrics */}
            {!isTiny && (
                <Box sx={{ pb: 2, pt: 1 }}>
                    <Box sx={{ display: 'flex', gap: 0.5, px: 0.5 }}>
                        <Box 
                            onClick={() => onParameterClick && onParameterClick('flow_rate', 'Flow Rate', 'gpm')}
                            sx={{ 
                                flex: 1, 
                                textAlign: 'center',
                                cursor: onParameterClick ? 'pointer' : 'default',
                                p: 0.5,
                                transition: 'all 0.2s',
                                borderRadius: 1,
                                '&:hover': onParameterClick ? { bgcolor: 'rgba(56,189,248,0.05)' } : {}
                            }}
                        >
                            <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 'bold', fontSize: '0.7rem', display: 'block', letterSpacing: 1 }}>FLOW RATE</Typography>
                            <Typography sx={{ color: '#38bdf8', fontWeight: 'bold', fontSize: '1.25rem', my: 0.2, textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>{Number(flowRate).toFixed(1)}</Typography>
                            <Typography variant="caption" sx={{ color: '#475569', fontSize: '0.75rem', fontWeight: 'bold', display: 'block' }}>gpm</Typography>
                        </Box>
                        
                        <Box sx={{ width: '1px', bgcolor: 'rgba(51, 65, 85, 0.3)', my: 0.5 }} />
                        
                        <Box 
                            onClick={() => onParameterClick && onParameterClick('flow_out', 'Flow Out', '%')}
                            sx={{ 
                                flex: 1, 
                                textAlign: 'center',
                                cursor: onParameterClick ? 'pointer' : 'default',
                                p: 0.5,
                                transition: 'all 0.2s',
                                borderRadius: 1,
                                '&:hover': onParameterClick ? { bgcolor: 'rgba(16,185,129,0.05)' } : {}
                            }}
                        >
                            <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 'bold', fontSize: '0.7rem', display: 'block', letterSpacing: 1 }}>FLOW OUT</Typography>
                            <Typography sx={{ color: '#10b981', fontWeight: 'bold', fontSize: '1.25rem', my: 0.2, textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>{Number(flowOut).toFixed(1)}</Typography>
                            <Typography variant="caption" sx={{ color: '#475569', fontSize: '0.75rem', fontWeight: 'bold', display: 'block' }}>%</Typography>
                        </Box>
                        
                        <Box sx={{ width: '1px', bgcolor: 'rgba(51, 65, 85, 0.3)', my: 0.5 }} />
                        
                        <Box 
                            onClick={() => onParameterClick && onParameterClick('gain_loss', 'Gain/Loss', '%')}
                            sx={{ 
                                flex: 1, 
                                textAlign: 'center',
                                cursor: onParameterClick ? 'pointer' : 'default',
                                p: 0.5,
                                transition: 'all 0.2s',
                                borderRadius: 1,
                                '&:hover': onParameterClick ? { bgcolor: 'rgba(251,191,36,0.05)' } : {}
                            }}
                        >
                            <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 'bold', fontSize: '0.7rem', display: 'block', letterSpacing: 1 }}>GAIN/LOSS</Typography>
                            <Typography sx={{ color: '#fbbf24', fontWeight: 'bold', fontSize: '1.25rem', my: 0.2, textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>{Number(gainLoss).toFixed(1)}</Typography>
                            <Typography variant="caption" sx={{ color: '#475569', fontSize: '0.75rem', fontWeight: 'bold', display: 'block' }}>%</Typography>
                        </Box>
                    </Box>
                </Box>
            )}
        </Box>
    );
};

export default MudVolumePanel;
