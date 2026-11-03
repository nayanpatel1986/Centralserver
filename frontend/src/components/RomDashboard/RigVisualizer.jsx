import React, { useState, useEffect, useRef } from 'react';
import { Box, Typography, Paper } from '@mui/material';

const RigVisualizer = ({ crownomatic, flooromatic, travellingUp, travellingDown, height = 500 }) => {
    const MAX_BLOCK_POSITION_M = 20;
    // We completely abandon React state for this value to avoid React 18 re-render desyncs 
    // against the 1-second interval Websocket props coming from the parent Dashboard.
    const posRef = useRef(0);
    const boxRef = useRef(null);
    const textRef = useRef(null);

    const lastTimeRef = useRef(performance.now());
    const animFrameRef = useRef(null);

    // Track active status for "Smart Triggering" alerts visually
    const [isCrownAlert, setIsCrownAlert] = useState(false);
    const [isFloorAlert, setIsFloorAlert] = useState(false);

    // Animate the block while travelling
    useEffect(() => {
        const animate = (time) => {
            const deltaMs = time - lastTimeRef.current;
            lastTimeRef.current = time;

            // 0.2 m/s across a 0..20 m travel range = 1% of travel per second.
            const percentPerSecond = 1.0;
            const step = (percentPerSecond * deltaMs) / 1000;

            // Update the absolute reference, not a state closure
            let next = posRef.current;
            if (travellingUp) next = Math.min(100, next + step);
            if (travellingDown) next = Math.max(0, next - step);
            posRef.current = next;

            // Updated Smart Triggering (Visual threshold) - Only trigger if moving towards danger or input is active
            setIsCrownAlert(crownomatic === false);
            setIsFloorAlert(flooromatic === false);

            // Step fully outside the React Render Cycle
            if (boxRef.current) {
                boxRef.current.style.bottom = `${5 + (next * 0.85)}%`;
            }
            if (textRef.current) {
                textRef.current.innerText = ((next / 100) * MAX_BLOCK_POSITION_M).toFixed(1);
            }

            animFrameRef.current = requestAnimationFrame(animate);
        };

        if (travellingUp || travellingDown) {
            lastTimeRef.current = performance.now(); // Reset time when movement starts
            animFrameRef.current = requestAnimationFrame(animate);
        } else {
            // Static check for alerts - only use PLC inputs when stationary
            setIsCrownAlert(crownomatic === false);
            setIsFloorAlert(flooromatic === false);
        }

        return () => {
            if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        };
    }, [travellingUp, travellingDown, crownomatic, flooromatic]);

    // Initial static value
    const initialPositionMeters = ((posRef.current / 100) * MAX_BLOCK_POSITION_M).toFixed(1);

    // Calculate scaling factor based on container height (standard is 500)
    const scaleFactor = Math.min(1.2, Math.max(0.6, height / 500));

    return (
        <Paper
            sx={{
                width: '100%',
                p: 2,
                bgcolor: '#0f172a',
                color: 'white',
                height: height,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid #1e293b',
                background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
                position: 'relative',
                overflow: 'hidden'
            }}
        >
            <Box sx={{ 
                position: 'relative', 
                width: '100%', 
                height: 'calc(100% - 60px)', // Leave space for BLK POS box at bottom
                display: 'flex', 
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                transform: `scale(${scaleFactor})`,
                transformOrigin: 'center center'
            }}>
                <Box sx={{ position: 'relative', width: 320, height: 440 }}>
                    {/* SVG Schematic Layer */}
                    <svg width="100%" height="100%" viewBox="0 0 320 440" style={{ filter: 'drop-shadow(0 0 5px rgba(0,0,0,0.5))' }}>
                        <defs>
                            <linearGradient id="derrick-grad" x1="0%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%" stopColor="#1e293b" />
                                <stop offset="100%" stopColor="#0f172a" />
                            </linearGradient>
                            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.02)" strokeWidth="1" />
                            </pattern>
                        </defs>

                        {/* Background Grid */}
                        <rect width="100%" height="100%" fill="url(#grid)" />

                        {/* --- DERRICK STRUCTURE (THINNER PROPORTIONS) --- */}
                        <path d="M 60 420 L 120 60 L 200 60 L 260 420 Z" fill="rgba(255, 255, 255, 0.15)" stroke="white" strokeWidth="1" opacity="0.8" />

                        {/* Structural Cross-Bracing (X-pattern) */}
                        <g stroke="white" strokeWidth="1" opacity="0.2">
                            <line x1="60" y1="420" x2="250" y2="360" />
                            <line x1="260" y1="420" x2="70" y2="360" />
                            <line x1="70" y1="360" x2="240" y2="300" />
                            <line x1="250" y1="360" x2="80" y2="300" />
                            <line x1="80" y1="300" x2="230" y2="240" />
                            <line x1="240" y1="300" x2="90" y2="240" />
                            <line x1="90" y1="240" x2="220" y2="180" />
                            <line x1="230" y1="240" x2="100" y2="180" />
                            <line x1="100" y1="180" x2="210" y2="120" />
                            <line x1="220" y1="180" x2="110" y2="120" />
                            <line x1="110" y1="120" x2="200" y2="60" />
                            <line x1="210" y1="120" x2="120" y2="60" />
                        </g>

                        {/* Horizontal Segments (6 uniform dividers) */}
                        <g stroke="white" strokeWidth="1" opacity="0.8">
                            <line x1="70" y1="360" x2="250" y2="360" />
                            <line x1="80" y1="300" x2="240" y2="300" />
                            <line x1="90" y1="240" x2="230" y2="240" />
                            <line x1="100" y1="180" x2="220" y2="180" />
                            <line x1="110" y1="120" x2="210" y2="120" />
                            <line x1="120" y1="60" x2="200" y2="60" />
                        </g>

                        {/* Crown Block Assembly */}
                        <rect x="125" y="20" width="70" height="15" fill="#334155" rx="4" />
                        <circle cx="145" cy="27.5" r="4" fill="#38bdf8" />
                        <circle cx="175" cy="27.5" r="4" fill="#38bdf8" />

                        <path d="M 135 35 H 185 L 180 47.5 H 140 Z" fill="#ef4444" />
                        <path d="M 140 47.5 H 180 L 175 60 H 145 Z" fill="#fbbf24" />

                        {/* Guide Tracks */}
                        <line x1="145" y1="60" x2="145" y2="420" stroke="#1e293b" strokeWidth="2" />
                        <line x1="160" y1="60" x2="160" y2="420" stroke="#1e293b" strokeWidth="2" />
                        <line x1="175" y1="60" x2="175" y2="420" stroke="#1e293b" strokeWidth="2" />

                        {/* Substructure Base */}
                        <rect x="40" y="420" width="240" height="6" fill="#1e293b" rx="1" />
                    </svg>

                    {/* --- ANIMATED TRAVELLING BLOCK --- */}
                    <Box
                        ref={boxRef}
                        sx={{
                            position: 'absolute',
                            left: '50%',
                            bottom: `${5 + (posRef.current * 0.85)}%`,
                            transform: 'translateX(-50%)',
                            width: 60,
                            height: 80,
                            zIndex: 2,
                            transition: 'bottom 0.2s linear'
                        }}
                    >
                        <svg width="60" height="80" viewBox="0 0 60 80">
                            <line x1="15" y1="0" x2="15" y2="-400" stroke="#475569" strokeWidth="1.5" />
                            <line x1="30" y1="0" x2="30" y2="-400" stroke="#475569" strokeWidth="1.5" />
                            <line x1="45" y1="0" x2="45" y2="-400" stroke="#475569" strokeWidth="1.5" />

                            <path d="M 5 0 H 55 V 25 L 50 30 H 10 L 5 25 Z" fill="#ef4444" />
                            <rect x="10" y="30" width="40" height="20" fill="#fbbf24" />
                            <path d="M 10 50 H 50 L 55 55 V 65 H 5 V 55 Z" fill="#ef4444" />
                            <path d="M 30 65 L 30 72 L 28 65" fill="#ef4444" />
                        </svg>
                    </Box>

                    {/* Integrated Saver Popups */}
                    {/* CROWN SAVER */}
                    {isCrownAlert && (
                        <Box sx={{
                            position: 'absolute',
                            bottom: 60,
                            left: '50%',
                            transform: 'translateX(-50%)',
                            width: '90%',
                            zIndex: 100,
                            pointerEvents: 'none',
                            bgcolor: 'rgba(239, 68, 68, 0.85)',
                            backdropFilter: 'blur(8px)',
                            border: '3px solid #ef4444',
                            color: 'white',
                            borderRadius: '12px',
                            p: 2,
                            textAlign: 'center',
                            boxShadow: '0 0 40px rgba(239, 68, 68, 0.5)',
                            animation: 'saverPulse 0.6s infinite alternate ease-in-out',
                            '@keyframes saverPulse': {
                                '0%': { transform: 'translateX(-50%) scale(1)', boxShadow: '0 0 20px rgba(239, 68, 68, 0.4)' },
                                '100%': { transform: 'translateX(-50%) scale(1.05)', boxShadow: '0 0 50px rgba(239, 68, 68, 0.7)' }
                            },
                        }}>
                            <Typography variant="h4" sx={{ fontWeight: '900', letterSpacing: 3, textShadow: '2px 2px 8px rgba(0,0,0,0.6)' }}>
                                CROWN SAVER ON
                            </Typography>
                        </Box>
                    )}

                    {/* FLOOR SAVER */}
                    {isFloorAlert && (
                        <Box sx={{
                            position: 'absolute',
                            top: 40,
                            left: '50%',
                            transform: 'translateX(-50%)',
                            width: '90%',
                            zIndex: 100,
                            pointerEvents: 'none',
                            bgcolor: 'rgba(245, 158, 11, 0.85)',
                            backdropFilter: 'blur(8px)',
                            border: '3px solid #f59e0b',
                            color: 'white',
                            borderRadius: '12px',
                            p: 2,
                            textAlign: 'center',
                            boxShadow: '0 0 40px rgba(245, 158, 11, 0.5)',
                            animation: 'saverPulseFloor 0.6s infinite alternate ease-in-out',
                            '@keyframes saverPulseFloor': {
                                '0%': { transform: 'translateX(-50%) scale(1)', boxShadow: '0 0 20px rgba(245, 158, 11, 0.4)' },
                                '100%': { transform: 'translateX(-50%) scale(1.05)', boxShadow: '0 0 50px rgba(245, 158, 11, 0.7)' }
                            }
                        }}>
                            <Typography variant="h4" sx={{ fontWeight: '900', letterSpacing: 3, textShadow: '2px 2px 8px rgba(0,0,0,0.6)' }}>
                                FLOOR SAVER ON
                            </Typography>
                        </Box>
                    )}
                </Box>
            </Box>

            {/* Digital Readout */}
            <Box sx={{
                mt: 1,
                px: 2, py: 0.5,
                bgcolor: 'rgba(15, 23, 42, 0.9)',
                borderRadius: '16px',
                display: 'flex',
                gap: 1,
                alignItems: 'baseline',
                border: '1px solid #38bdf8',
                boxShadow: '0 0 10px rgba(56, 189, 248, 0.2)',
                justifyContent: 'center',
                zIndex: 20,
                whiteSpace: 'nowrap'
            }}>
                <Typography sx={{ color: 'white', fontWeight: 'bold', fontSize: '11px', letterSpacing: 1 }}>BLK POS:</Typography>
                <Typography sx={{ color: '#38bdf8', fontWeight: 'bold', fontSize: '18px', lineHeight: 1 }}>
                    <span ref={textRef}>{Number(initialPositionMeters).toFixed(2)}</span><span style={{ fontSize: '12px', marginLeft: 2, fontWeight: 'normal' }}>m</span>
                </Typography>
            </Box>
        </Paper>
    );
};

export default RigVisualizer;
