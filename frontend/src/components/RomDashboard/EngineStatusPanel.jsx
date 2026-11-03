import React from 'react';
import { Box, Typography } from '@mui/material';
import AnalogGauge from '../RomCommon/AnalogGauge';

const MetricCell = ({ label, value, unit, titleColor, valueColor, borderRight, borderBottom, onClick }) => (
    <Box 
        onClick={onClick}
        sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            p: 0.75,
            borderRight: borderRight ? '1px solid rgba(51, 65, 85, 0.5)' : 'none',
            borderBottom: borderBottom ? '1px solid rgba(51, 65, 85, 0.5)' : 'none',
            bgcolor: 'transparent',
            cursor: onClick ? 'pointer' : 'default',
            transition: 'background-color 0.2s ease',
            '&:hover': onClick ? {
                bgcolor: 'rgba(51, 65, 85, 0.4)'
            } : {}
        }}
    >
        <Typography variant="caption" sx={{ color: titleColor, fontWeight: 'bold', fontSize: '0.62rem', mb: 0.25, letterSpacing: 0.5, lineHeight: 1.1 }}>
            {label}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
            <Typography variant="h5" sx={{ color: valueColor, fontWeight: 'bold', lineHeight: 1, fontSize: '2rem' }}>
                {value}
            </Typography>
            <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: '0.6rem', fontWeight: 'bold' }}>
                {unit}
            </Typography>
        </Box>
    </Box>
);

const EngineStatusPanel = ({ rigData, w, h, onParameterClick }) => {
    const engineRpm = rigData?.engine_rpm || 0;
    const coolantTemp = rigData?.coolant_temp || 0;
    const oilPressure = rigData?.oil_pressure || 0;
    const oilTemp = rigData?.oil_temp || 0;
    const batteryVoltage = rigData?.battery_voltage || 0;

    const isEngineRunning = engineRpm > 100;

        const horizontalRoom = Math.max(180, (w || 420) - 32);
    const verticalRoom = Math.max(180, (h || 366) - 36 - 96 - 28);
    const gaugeSize = Math.min(420, horizontalRoom, verticalRoom);

    return (
        <Box 
            sx={{ 
                position: 'relative',
                flexGrow: 1, 
                display: 'flex', 
                flexDirection: 'column', 
                width: '100%',
                height: '100%',
                overflow: 'hidden',
                bgcolor: '#1e293b' // Dark navy background matching the screenshot
            }}
        >
            <Box
                sx={{
                    width: '100%',
                    bgcolor: 'rgba(51, 65, 85, 0.4)',
                    height: 36,
                    borderBottom: '1px solid rgba(51, 65, 85, 0.5)',
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-start',
                    px: 1.5
                }}
            >
                <Typography sx={{ color: '#cbd5e1', fontWeight: 'bold', letterSpacing: 1.5, fontSize: '0.8rem', lineHeight: 1, textTransform: 'uppercase' }}>
                    CAT ENGINE
                </Typography>
                <Typography
                    sx={{
                        position: 'absolute',
                        right: 12,
                        top: 10,
                        color: isEngineRunning ? '#22c55e' : '#64748b',
                        fontWeight: 'bold',
                        letterSpacing: 1,
                        fontSize: '0.62rem',
                        lineHeight: 1,
                        zIndex: 1
                    }}
                >
                    {isEngineRunning ? 'RUNNING' : 'STOPPED'}
                </Typography>
            </Box>

            <Box
                sx={{
                    flex: '1 1 auto',
                    minHeight: 0,
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'flex-start',
                    pt: 0.75,
                    pb: 0.5
                }}
            >
                <Box sx={{ transform: 'translateY(14px)' }}>
                    <AnalogGauge 
                        label=""
                        value={engineRpm}
                        min={0}
                        max={2500}
                        unit="RPM"
                        color="#38bdf8"
                        size={gaugeSize}
                    />
                </Box>
            </Box>

            <Box sx={{ 
                height: 96,
                borderTop: '1px solid rgba(51, 65, 85, 0.5)',
                display: 'flex',
                flexDirection: 'column',
                bgcolor: 'rgba(15, 23, 42, 0.3)',
                mt: -2,
                pt: 0
            }}>
                {/* Row 1 */}
                <Box sx={{ display: 'flex', flex: 1, minHeight: 42 }}>
                    <MetricCell 
                        label="OIL TEMP" 
                        value={Number(oilTemp).toFixed(1)} 
                        unit="C" 
                        titleColor="#ff4757" 
                        valueColor="#ff4757"
                        borderRight
                        borderBottom
                        onClick={() => onParameterClick && onParameterClick('oil_temp', 'Oil Temp', '°C')}
                    />
                    <MetricCell 
                        label="OIL PRESSURE" 
                        value={Number(oilPressure).toFixed(0)} 
                        unit="kPa" 
                        titleColor="#ffa502" 
                        valueColor="#2ed573"
                        borderBottom
                        onClick={() => onParameterClick && onParameterClick('oil_pressure', 'Oil Pressure', 'kPa')}
                    />
                </Box>
                {/* Row 2 */}
                <Box sx={{ display: 'flex', flex: 1, minHeight: 42 }}>
                    <MetricCell 
                        label="COOLANT TEMP" 
                        value={Number(coolantTemp).toFixed(1)} 
                        unit="C" 
                        titleColor="#1e90ff" 
                        valueColor="#1e90ff"
                        borderRight
                        onClick={() => onParameterClick && onParameterClick('coolant_temp', 'Coolant Temp', '°C')}
                    />
                    <MetricCell 
                        label="BATTERY VOL." 
                        value={Number(batteryVoltage).toFixed(1)} 
                        unit="V" 
                        titleColor="#a78bfa" 
                        valueColor="#a78bfa"
                        onClick={() => onParameterClick && onParameterClick('battery_voltage', 'Battery Voltage', 'V')}
                    />
                </Box>
            </Box>
        </Box>
    );
};

export default EngineStatusPanel;



