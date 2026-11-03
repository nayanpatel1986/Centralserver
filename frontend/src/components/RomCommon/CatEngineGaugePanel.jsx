import React, { useEffect, useMemo, useState } from 'react';
import { Box, Typography } from '@mui/material';

function PortableAnalogGauge({
    value,
    min = 0,
    max = 2500,
    label = '',
    unit = 'RPM',
    size = 280,
    color = '#38bdf8',
    precision = 0
}) {
    const nValue = Number.isFinite(Number(value)) ? Number(value) : 0;
    const nMin = Number.isFinite(Number(min)) ? Number(min) : 0;
    const nMax = Number.isFinite(Number(max)) ? Number(max) : 100;
    const totalSize = Number.isFinite(Number(size)) ? Number(size) : 280;
    const center = totalSize / 2;
    const radius = totalSize / 2;
    const startAngle = -135;
    const endAngle = 135;
    const range = endAngle - startAngle;
    const majorTicks = 5;
    const minorTicks = 4;
    const valueRatio = Math.min(Math.max((nValue - nMin) / (nMax - nMin || 1), 0), 1);
    const angle = startAngle + (valueRatio * range);

    const polarToCartesian = (centerX, centerY, r, angleInDegrees) => {
        const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
        return {
            x: centerX + (r * Math.cos(angleInRadians)),
            y: centerY + (r * Math.sin(angleInRadians))
        };
    };

    const describeArc = (x, y, r, startA, endA) => {
        if (endA - startA < 0.1) return '';
        const start = polarToCartesian(x, y, r, endA);
        const end = polarToCartesian(x, y, r, startA);
        const largeArcFlag = endA - startA <= 180 ? '0' : '1';
        return ['M', start.x, start.y, 'A', r, r, 0, largeArcFlag, 0, end.x, end.y].join(' ');
    };

    const getAngleForValue = (val) => {
        const ratio = Math.min(Math.max((val - nMin) / (nMax - nMin || 1), 0), 1);
        return startAngle + (ratio * range);
    };

    const warnAngle = getAngleForValue(nMin + ((nMax - nMin) * 0.75));
    const critAngle = getAngleForValue(nMin + ((nMax - nMin) * 0.9));

    const ticks = [];
    const tickStep = (nMax - nMin) / majorTicks;
    for (let i = 0; i <= majorTicks; i += 1) {
        const tickValue = nMin + (i * tickStep);
        const tickRatio = (tickValue - nMin) / (nMax - nMin || 1);
        const tickAngle = startAngle + (tickRatio * range);
        const p1 = polarToCartesian(center, center, radius - 10, tickAngle);
        const p2 = polarToCartesian(center, center, radius - 22, tickAngle);
        const textPos = polarToCartesian(center, center, radius - (totalSize * 0.18), tickAngle);

        ticks.push(
            <line
                key={`major-${i}`}
                x1={p1.x}
                y1={p1.y}
                x2={p2.x}
                y2={p2.y}
                stroke="white"
                strokeWidth="2"
            />
        );

        ticks.push(
            <text
                key={`text-${i}`}
                x={textPos.x}
                y={textPos.y}
                textAnchor="middle"
                alignmentBaseline="middle"
                fill="#94a3b8"
                fontSize={totalSize * 0.055}
                fontWeight="bold"
            >
                {Math.round(tickValue)}
            </text>
        );

        if (i < majorTicks && minorTicks > 0) {
            const nextTickValue = nMin + ((i + 1) * tickStep);
            const minorStep = (nextTickValue - tickValue) / (minorTicks + 1);
            for (let j = 1; j <= minorTicks; j += 1) {
                const minorValue = tickValue + (j * minorStep);
                const minorRatio = (minorValue - nMin) / (nMax - nMin || 1);
                const minorAngle = startAngle + (minorRatio * range);
                const mp1 = polarToCartesian(center, center, radius - 10, minorAngle);
                const mp2 = polarToCartesian(center, center, radius - 16, minorAngle);
                ticks.push(
                    <line
                        key={`minor-${i}-${j}`}
                        x1={mp1.x}
                        y1={mp1.y}
                        x2={mp2.x}
                        y2={mp2.y}
                        stroke="#64748b"
                        strokeWidth="1"
                    />
                );
            }
        }
    }

    const needleTip = polarToCartesian(center, center, radius - 25, angle);
    const needleBaseL = polarToCartesian(center, center, 5, angle - 90);
    const needleBaseR = polarToCartesian(center, center, 5, angle + 90);

    return (
        <Box sx={{ position: 'relative', width: totalSize, height: totalSize }}>
            <svg width={totalSize} height={totalSize} style={{ overflow: 'visible' }}>
                <circle cx={center} cy={center} r={radius - 8} fill="none" stroke="rgba(30, 41, 59, 0.4)" strokeWidth="6" />
                <path d={describeArc(center, center, radius - 8, startAngle, warnAngle)} fill="none" stroke="#1e293b" strokeWidth="6" />
                {warnAngle < critAngle && (
                    <path d={describeArc(center, center, radius - 8, warnAngle, critAngle)} fill="none" stroke="#fbbf24" strokeWidth="6" />
                )}
                {critAngle < endAngle && (
                    <path d={describeArc(center, center, radius - 8, critAngle, endAngle)} fill="none" stroke="#ef4444" strokeWidth="6" />
                )}
                {ticks}
                <path
                    d={`M ${needleBaseL.x} ${needleBaseL.y} L ${needleTip.x} ${needleTip.y} L ${needleBaseR.x} ${needleBaseR.y} Z`}
                    fill={color}
                    stroke="black"
                    strokeWidth="1"
                    filter="drop-shadow(0px 2px 2px rgba(0,0,0,0.5))"
                />
                <circle cx={center} cy={center} r="6" fill="#334155" stroke="white" strokeWidth="1" />
            </svg>

            <Box sx={{ position: 'absolute', top: '53%', left: '50%', transform: 'translate(-50%, 0)', textAlign: 'center', width: '80%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <Typography sx={{ color, fontWeight: 'bold', lineHeight: 1, textShadow: '0 2px 4px rgba(0,0,0,0.5)', fontSize: `${totalSize * 0.14}px` }}>
                    {nValue.toFixed(precision)}
                </Typography>
                <Typography sx={{ color: '#94a3b8', fontSize: `${totalSize * 0.05}px`, lineHeight: 1, mt: 0.25 }}>
                    {unit}
                </Typography>
            </Box>

            <Typography sx={{ position: 'absolute', top: '28%', left: '50%', transform: 'translate(-50%, 0)', color: '#94a3b8', fontWeight: 'bold', fontSize: `${totalSize * 0.05}px`, textTransform: 'uppercase', letterSpacing: 1, whiteSpace: 'nowrap' }}>
                {label}
            </Typography>
        </Box>
    );
}

function TrendFooter({
    title,
    value,
    unit,
    valueColor,
    lineColor,
    history,
    onClick,
    isLeft = false
}) {
    const getY = (v, hist) => {
        const minVal = Math.min(...hist) || 0;
        const maxVal = Math.max(...hist) || 100;
        const range = (maxVal - minVal) || 1;
        if (maxVal === minVal) return 50;
        return 90 - (((v - minVal) / range) * 80);
    };

    return (
        <Box
            onClick={onClick}
            sx={{
                flex: 1,
                bgcolor: 'rgba(15, 23, 42, 0.6)',
                borderTop: '1px solid rgba(51, 65, 85, 0.5)',
                borderRight: isLeft ? '1px solid rgba(51, 65, 85, 0.5)' : 'none',
                borderBottomLeftRadius: isLeft ? '8px' : 0,
                borderBottomRightRadius: isLeft ? 0 : '8px',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                position: 'relative',
                overflow: 'hidden',
                cursor: onClick ? 'pointer' : 'default',
                transition: 'all 0.2s',
                '&:hover': onClick ? {
                    bgcolor: 'rgba(51, 65, 85, 0.8)',
                    borderColor: lineColor
                } : {}
            }}
        >
            <Box sx={{ zIndex: 2, position: 'relative', pt: 1 }}>
                <Typography sx={{ color: lineColor, fontWeight: 'bold', display: 'block', mb: 0.5, fontSize: '0.8rem', letterSpacing: 1 }}>
                    {title}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 0.5 }}>
                    <Typography sx={{ fontWeight: 'bold', color: valueColor, lineHeight: 1, fontSize: '2rem' }}>
                        {value}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: '0.8rem' }}>
                        {unit}
                    </Typography>
                </Box>
            </Box>

            <Box sx={{ width: '100%', height: '50%', position: 'absolute', bottom: 0, left: 0, opacity: 0.9, zIndex: 1 }}>
                <svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 98 100" style={{ overflow: 'visible', position: 'absolute', bottom: 0 }}>
                    <polyline
                        points={history.map((v, i) => {
                            const x = 98 - ((history.length - 1 - i) * 2);
                            return `${x},${getY(v, history)}`;
                        }).join(' ')}
                        fill="none"
                        stroke={lineColor}
                        strokeWidth="1.5"
                    />
                    {history.length > 0 && (
                        <polygon
                            points={`${98 - ((history.length - 1) * 2)},100 ${history.map((v, i) => {
                                const x = 98 - ((history.length - 1 - i) * 2);
                                return `${x},${getY(v, history)}`;
                            }).join(' ')} 98,100`}
                            fill={lineColor}
                            opacity="0.18"
                        />
                    )}
                </svg>
            </Box>
        </Box>
    );
}

export default function CatEngineGaugePanel({
    engineRpm = 0,
    coolantTemp = 0,
    oilPressure = 0,
    title = 'CAT ENGINE',
    width = 420,
    height = 366,
    onCoolantClick,
    onOilPressureClick
}) {
    const [coolantHistory, setCoolantHistory] = useState([]);
    const [oilHistory, setOilHistory] = useState([]);

    useEffect(() => {
        setCoolantHistory((prev) => {
            const next = [...prev, Number(coolantTemp) || 0];
            if (next.length > 50) next.shift();
            return next;
        });
    }, [coolantTemp]);

    useEffect(() => {
        setOilHistory((prev) => {
            const next = [...prev, Number(oilPressure) || 0];
            if (next.length > 50) next.shift();
            return next;
        });
    }, [oilPressure]);

    const gaugeSize = useMemo(() => Math.min(width - 10, height - 100), [width, height]);

    return (
        <Box
            sx={{
                width: '100%',
                height: '100%',
                minHeight: height,
                bgcolor: '#243045',
                border: '1px solid rgba(71, 85, 105, 0.6)',
                borderRadius: '14px',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column'
            }}
        >
            <Box
                sx={{
                    height: 52,
                    px: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 1.25,
                    bgcolor: 'rgba(51, 65, 85, 0.38)',
                    borderBottom: '1px solid rgba(51, 65, 85, 0.6)'
                }}
            >
                <Typography sx={{ color: '#38bdf8', fontSize: '1.1rem', lineHeight: 1 }}>⌁</Typography>
                <Typography sx={{ color: '#e2e8f0', fontWeight: 800, letterSpacing: 2, fontSize: '0.9rem' }}>
                    {title}
                </Typography>
            </Box>

            <Box sx={{ flex: 1, position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', pt: 1.5, px: 1 }}>
                <PortableAnalogGauge
                    label=""
                    value={engineRpm}
                    min={0}
                    max={2500}
                    unit="RPM"
                    color="#38bdf8"
                    size={gaugeSize}
                />
            </Box>

            <Box sx={{ height: 112, display: 'flex' }}>
                <TrendFooter
                    title="COOLANT TEMP"
                    value={Number(coolantTemp).toFixed(1)}
                    unit="°C"
                    valueColor="#38bdf8"
                    lineColor="#38bdf8"
                    history={coolantHistory}
                    onClick={onCoolantClick}
                    isLeft
                />
                <TrendFooter
                    title="OIL PRESSURE"
                    value={Number(oilPressure).toFixed(0)}
                    unit="psi"
                    valueColor="#22c55e"
                    lineColor="#f59e0b"
                    history={oilHistory}
                    onClick={onOilPressureClick}
                />
            </Box>
        </Box>
    );
}
