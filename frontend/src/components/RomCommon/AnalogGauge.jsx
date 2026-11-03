import React, { useState, useEffect } from 'react';
import { Box, Typography } from '@mui/material';
import { useRig } from '../../context/RigContext';

const AnalogGauge = ({
    value,
    min = 0,
    max = 100,
    label,
    unit,
    size = 200,
    startAngle = -135,
    endAngle = 135,
    majorTicks = 5,
    minorTicks = 4,
    color = '#38bdf8', // Default Cyan
    criticalLevel = 0.8, // 80%
    subValue,
    subLabel,
    precision = 0,
    dataKey,
    onClick,
    showTrend = false
}) => {
    const { alarmEnabled } = useRig();
    const [history, setHistory] = useState([]);
    // 1. Load customization from local storage if available
    let nMin = typeof min === 'number' && !isNaN(min) ? min : 0;
    let nMax = typeof max === 'number' && !isNaN(max) ? max : 100;
    let gaugeUnit = unit;
    
    let highHighLimit = null;
    let highLimit = null;
    let lowLimit = null;
    let lowLowLimit = null;
    let hornOn = false;

    if (dataKey) {
        const saved = localStorage.getItem(`romii_metric_cfg_${dataKey}`);
        if (saved) {
            try {
                const cfg = JSON.parse(saved);
                if (cfg.scaleMin !== undefined) nMin = Number(cfg.scaleMin);
                if (cfg.scaleMax !== undefined) nMax = Number(cfg.scaleMax);
                if (cfg.unit) gaugeUnit = cfg.unit;
                if (cfg.highHighAlarm !== undefined) highHighLimit = Number(cfg.highHighAlarm);
                if (cfg.highAlarm !== undefined) highLimit = Number(cfg.highAlarm);
                if (cfg.lowAlarm !== undefined) lowLimit = Number(cfg.lowAlarm);
                if (cfg.lowLowAlarm !== undefined) lowLowLimit = Number(cfg.lowLowAlarm);
                if (cfg.hornEnabled !== undefined) hornOn = !!cfg.hornEnabled;
            } catch (e) {
                console.warn("Failed to load saved configuration in gauge", e);
            }
        }
    }

    // Calculations
    const totalSize = typeof size === 'number' && !isNaN(size) ? size : 200;
    const nSize = totalSize;
    const nValue = typeof value === 'number' && !isNaN(value) ? value : 0;

    useEffect(() => {
        setHistory(prev => {
            const next = [...prev, nValue];
            if (next.length > 50) next.shift();
            return next;
        });
    }, [nValue]);
    
    const radius = nSize / 2;
    const center = nSize / 2;
    const range = endAngle - startAngle;
    const valueRatio = Math.min(Math.max((nValue - nMin) / (nMax - nMin || 1), 0), 1);
    const angle = startAngle + (valueRatio * range);

    // Determine alarm states and active color
    let activeColor = color;
    let pulseAnimation = {};
    let ringGlow = 'none';

    if (alarmEnabled) {
        if (highHighLimit !== null && nValue >= highHighLimit) {
            activeColor = '#ef4444'; // Red alarm
            ringGlow = '0 0 15px #ef4444';
            pulseAnimation = {
                animation: 'alarmPulse 1s infinite alternate',
                '@keyframes alarmPulse': {
                    '0%': { transform: 'scale(1)' },
                    '100%': { transform: 'scale(1.03)', boxShadow: '0 0 25px rgba(239, 68, 68, 0.4)' }
                }
            };
        } else if (highLimit !== null && nValue >= highLimit) {
            activeColor = '#fbbf24'; // Yellow warning
            ringGlow = '0 0 8px #fbbf24';
        } else if (lowLowLimit !== null && nValue <= lowLowLimit) {
            activeColor = '#ef4444'; // Red alarm
            ringGlow = '0 0 15px #ef4444';
            pulseAnimation = {
                animation: 'alarmPulse 1s infinite alternate',
                '@keyframes alarmPulse': {
                    '0%': { transform: 'scale(1)' },
                    '100%': { transform: 'scale(1.03)', boxShadow: '0 0 25px rgba(239, 68, 68, 0.4)' }
                }
            };
        } else if (lowLimit !== null && nValue <= lowLimit) {
            activeColor = '#fbbf24'; // Yellow warning
            ringGlow = '0 0 8px #fbbf24';
        }
    }

    // Polar to Cartesian
    const polarToCartesian = (centerX, centerY, radius, angleInDegrees) => {
        const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
        return {
            x: centerX + (radius * Math.cos(angleInRadians)),
            y: centerY + (radius * Math.sin(angleInRadians))
        };
    };

    const getAngleForValue = (val) => {
        const ratio = Math.min(Math.max((val - nMin) / (nMax - nMin || 1), 0), 1);
        return startAngle + (ratio * range);
    };

    const describeArc = (x, y, r, startA, endA) => {
        if (endA - startA < 0.1) return "";
        const start = polarToCartesian(x, y, r, endA);
        const end = polarToCartesian(x, y, r, startA);
        const largeArcFlag = endA - startA <= 180 ? "0" : "1";
        return [
            "M", start.x, start.y, 
            "A", r, r, 0, largeArcFlag, 0, end.x, end.y
        ].join(" ");
    };

    let warnVal = highLimit !== null ? highLimit : nMin + (nMax - nMin) * 0.75;
    let critVal = highHighLimit !== null ? highHighLimit : nMin + (nMax - nMin) * 0.90;
    if (warnVal > critVal) warnVal = critVal;

    const warnAngle = getAngleForValue(warnVal);
    const critAngle = getAngleForValue(critVal);

    let arcPaths = [];
    if (activeColor !== color) {
        arcPaths.push(
            <path key="alarmRing" d={describeArc(center, center, radius - 8, startAngle, endAngle)} fill="none" stroke={activeColor} strokeWidth="6" style={{ transition: 'stroke 0.3s' }} />
        );
    } else {
        arcPaths.push(<path key="normal" d={describeArc(center, center, radius - 8, startAngle, warnAngle)} fill="none" stroke="#1e293b" strokeWidth="6" />);
        if (warnAngle < critAngle) arcPaths.push(<path key="warn" d={describeArc(center, center, radius - 8, warnAngle, critAngle)} fill="none" stroke="#fbbf24" strokeWidth="6" />);
        if (critAngle < endAngle) arcPaths.push(<path key="crit" d={describeArc(center, center, radius - 8, critAngle, endAngle)} fill="none" stroke="#ef4444" strokeWidth="6" />);
    }

    // Generate Ticks
    const ticks = [];
    const tickStep = (nMax - nMin) / majorTicks;

    for (let i = 0; i <= majorTicks; i++) {
        const tickValue = nMin + (i * tickStep);
        const tickRatio = (tickValue - nMin) / (nMax - nMin || 1);
        const tickAngle = startAngle + (tickRatio * range);

        // Major Tick
        const p1 = polarToCartesian(center, center, radius - 10, tickAngle);
        const p2 = polarToCartesian(center, center, radius - 22, tickAngle);

        ticks.push(
            <line
                key={`major-${i}`}
                x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                stroke="white" strokeWidth="2"
            />
        );

        // Text Label for Tick
        const textPos = polarToCartesian(center, center, radius - (nSize * 0.18), tickAngle);
        ticks.push(
            <text
                key={`text-${i}`}
                x={textPos.x} y={textPos.y}
                textAnchor="middle" alignmentBaseline="middle"
                fill="#94a3b8" fontSize={nSize * 0.055} fontWeight="bold"
            >
                {Math.round(tickValue)}
            </text>
        );

        // Minor Ticks between this major and the next
        if (i < majorTicks && minorTicks > 0) {
            const nextTickValue = nMin + ((i + 1) * tickStep);
            const minorStep = (nextTickValue - tickValue) / (minorTicks + 1);
            for (let j = 1; j <= minorTicks; j++) {
                const minorValue = tickValue + (j * minorStep);
                const minorRatio = (minorValue - nMin) / (nMax - nMin || 1);
                const minorAngle = startAngle + (minorRatio * range);
                const mp1 = polarToCartesian(center, center, radius - 10, minorAngle);
                const mp2 = polarToCartesian(center, center, radius - 16, minorAngle);
                ticks.push(
                    <line
                        key={`minor-${i}-${j}`}
                        x1={mp1.x} y1={mp1.y} x2={mp2.x} y2={mp2.y}
                        stroke="#64748b" strokeWidth="1"
                    />
                );
            }
        }
    }

    // Needle
    const needleTip = polarToCartesian(center, center, radius - 25, angle);
    const needleBaseL = polarToCartesian(center, center, 5, angle - 90);
    const needleBaseR = polarToCartesian(center, center, 5, angle + 90);

    return (
        <Box 
            onClick={onClick}
            sx={{ 
                position: 'relative', 
                width: showTrend ? '100%' : totalSize, 
                height: showTrend ? '100%' : totalSize, 
                display: 'flex', 
                flexDirection: 'column',
                justifyContent: showTrend ? 'space-between' : 'center', 
                alignItems: 'center',
                cursor: onClick ? 'pointer' : 'default',
                borderRadius: showTrend ? '8px' : '50%',
                transition: 'all 0.2s ease-in-out',
                pt: showTrend ? 1 : 0, // slight padding top so it doesn't hit the absolute edge
                '&:hover': onClick ? { 
                    transform: 'scale(1.03)',
                    boxShadow: '0 0 15px rgba(56, 189, 248, 0.15)'
                } : {},
                ...pulseAnimation
            }}
        >
            <Box sx={{ flexGrow: 1, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', width: '100%' }}>
                <Box sx={{ position: 'relative', width: nSize, height: nSize, mt: -2 }}>
                    <svg width={nSize} height={nSize} style={{ overflow: 'visible' }}>
                {/* Gauge Background Arcs */}
                <g style={{ filter: ringGlow !== 'none' ? `drop-shadow(${ringGlow})` : 'none' }}>
                    {/* Full border round track */}
                    <circle cx={center} cy={center} r={radius - 8} fill="none" stroke="rgba(30, 41, 59, 0.4)" strokeWidth="6" />
                    {arcPaths}
                </g>

                {/* Ticks */}
                {ticks}

                {/* Needle */}
                <path
                    d={`M ${needleBaseL.x} ${needleBaseL.y} L ${needleTip.x} ${needleTip.y} L ${needleBaseR.x} ${needleBaseR.y} Z`}
                    fill={activeColor}
                    stroke="black"
                    strokeWidth="1"
                    filter="drop-shadow(0px 2px 2px rgba(0,0,0,0.5))"
                />
                <circle cx={center} cy={center} r="6" fill="#334155" stroke="white" strokeWidth="1" />
            </svg>

                {/* Value & Unit - Tightly packed to fit the inner circle */}
                <Box sx={{ position: 'absolute', top: '53%', left: '50%', transform: 'translate(-50%, 0)', textAlign: 'center', width: '80%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <Typography sx={{ color: label === 'WOH' ? '#22c55e' : activeColor, fontWeight: 'bold', lineHeight: 1, textShadow: '0 2px 4px rgba(0,0,0,0.5)', fontSize: `${nSize * 0.14}px` }}>
                        {typeof nValue === 'number' ? nValue.toFixed(precision) : nValue}
                    </Typography>
                    <Typography sx={{ color: '#94a3b8', fontSize: `${nSize * 0.05}px`, lineHeight: 1, mt: 0.25 }}>
                        {gaugeUnit}
                    </Typography>

                    {(subValue !== undefined && subValue !== null) && (
                        <Box sx={{ mt: 0.5, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <Box sx={{ borderTop: '1px solid rgba(51, 65, 85, 0.5)', width: '40%', mb: 0.5 }} />
                            <Typography sx={{ color: '#bef264', fontWeight: 'bold', fontSize: `${nSize * 0.10}px`, lineHeight: 1 }}>
                                {subValue}
                            </Typography>
                            <Typography sx={{ color: '#94a3b8', fontSize: `${nSize * 0.045}px`, whiteSpace: 'nowrap', lineHeight: 1, mt: 0.25 }}>
                                {label === 'HOOK LOAD' || label === 'WOH' ? (subLabel || 'BIT WEIGHT') : subLabel}
                            </Typography>
                        </Box>
                    )}
                </Box>

                {/* Label - Top Center */}
                <Typography variant="body2" sx={{ position: 'absolute', top: '28%', left: '50%', transform: 'translate(-50%, 0)', color: '#94a3b8', fontWeight: 'bold', fontSize: `${nSize * 0.05}px`, textTransform: 'uppercase', letterSpacing: 1 }}>
                    {label}
                </Typography>
            </Box>
        </Box>


            {showTrend && (
                <Box sx={{ 
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    px: 0,
                    pb: 0,
                    pt: 0,
                    zIndex: 10
                }}>
                    <Box sx={{ 
                        width: '100%', 
                        height: 75, 
                        bgcolor: 'rgba(15, 23, 42, 0.6)', 
                        borderBottomLeftRadius: '8px',
                        borderBottomRightRadius: '8px',
                        borderTop: '1px solid rgba(51, 65, 85, 0.5)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'flex-end',
                        position: 'relative',
                        overflow: 'hidden'
                    }}>
                        <Box sx={{ position: 'absolute', top: 4, left: 8, zIndex: 11 }}>
                            <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: '10px', fontWeight: 'bold' }}>{label} TREND</Typography>
                        </Box>
                        <svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 98 100" style={{ overflow: 'visible', position: 'absolute', bottom: 0 }}>
                            {/* Faint Grid Lines */}
                            <line x1="0" y1="25" x2="98" y2="25" stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="2,2" />
                            <line x1="0" y1="50" x2="98" y2="50" stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="2,2" />
                            <line x1="0" y1="75" x2="98" y2="75" stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="2,2" />
                            <polyline 
                                points={history.map((val, i) => {
                                    const ratio = Math.min(Math.max((val - nMin) / (nMax - nMin || 1), 0), 1);
                                    const x = 98 - ((history.length - 1 - i) * 2);
                                    return `${x},${100 - (ratio * 100)}`;
                                }).join(' ')}
                                fill="none"
                                stroke={activeColor}
                                strokeWidth="1.5"
                            />
                            {/* Shaded area under the line */}
                            {history.length > 0 && (
                                <polygon 
                                    points={`${98 - ((history.length - 1) * 2)},100 ${history.map((val, i) => {
                                        const ratio = Math.min(Math.max((val - nMin) / (nMax - nMin || 1), 0), 1);
                                        const x = 98 - ((history.length - 1 - i) * 2);
                                        return `${x},${100 - (ratio * 100)}`;
                                    }).join(' ')} 98,100`}
                                    fill={`url(#gradient-${dataKey})`}
                                    opacity="0.3"
                                />
                            )}
                            <defs>
                                <linearGradient id={`gradient-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor={activeColor} stopOpacity="1" />
                                    <stop offset="100%" stopColor={activeColor} stopOpacity="0" />
                                </linearGradient>
                            </defs>
                        </svg>
                    </Box>
                </Box>
            )}
        </Box>
    );
};

export default AnalogGauge;
