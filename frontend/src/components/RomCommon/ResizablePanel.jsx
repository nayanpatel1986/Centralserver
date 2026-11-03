import React, { useState, useEffect, useRef } from 'react';
import { Box } from '@mui/material';

/**
 * ResizablePanel
 * Renders children in a container with resize handles (right, bottom, corner).
 * All dimensions are in PIXELS (no grid-unit math).
 *
 * Props:
 *   children        – panel content
 *   w               – panel width in px
 *   h               – panel height in px
 *   editMode        – show handles only when true
 *   onResize(w, h)  – called continuously while dragging
 *   onResizeEnd()   – called once on mouse-up (persist)
 *   minW / maxW     – pixel width clamps  (default 120 / 4000)
 *   minH / maxH     – pixel height clamps (default 80  / 3000)
 */
export default function ResizablePanel({
    children,
    w,
    h,
    editMode,
    onResize,
    onResizeEnd,
    minW = 120,
    maxW = 4000,
    minH = 80,
    maxH = 3000,
}) {
    const [resizeType, setResizeType] = useState(null); // 'w' | 'h' | 'both'
    const startX   = useRef(0);
    const startY   = useRef(0);
    const startW   = useRef(w);
    const startH   = useRef(h);
    const onResizeEndRef = useRef(onResizeEnd);

    useEffect(() => { onResizeEndRef.current = onResizeEnd; }, [onResizeEnd]);

    const beginResize = (e, type) => {
        if (!editMode) return;
        setResizeType(type);
        startX.current = e.clientX;
        startY.current = e.clientY;
        startW.current = w;
        startH.current = h;
        document.body.style.cursor =
            type === 'w' ? 'ew-resize' :
            type === 'h' ? 'ns-resize' : 'nwse-resize';
        e.preventDefault();
        e.stopPropagation();
    };

    useEffect(() => {
        if (!resizeType) return;

        const onMove = (e) => {
            let nw = startW.current;
            let nh = startH.current;
            if (resizeType === 'w' || resizeType === 'both') {
                nw = Math.max(minW, Math.min(maxW, startW.current + (e.clientX - startX.current)));
            }
            if (resizeType === 'h' || resizeType === 'both') {
                nh = Math.max(minH, Math.min(maxH, startH.current + (e.clientY - startY.current)));
            }
            onResize(nw, nh);
        };

        const onUp = () => {
            setResizeType(null);
            document.body.style.cursor = 'default';
            if (onResizeEndRef.current) onResizeEndRef.current();
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, [resizeType, minW, maxW, minH, maxH, onResize]);

    const handleStyle = {
        position: 'absolute',
        zIndex: 110,
    };

    return (
        <Box sx={{
            position: 'absolute',
            width: `${w}px`,
            height: `${h}px`,
            overflow: 'hidden',
            boxSizing: 'border-box',
            border: editMode ? '1px dashed rgba(56,189,248,0.25)' : 'none',
            borderRadius: 1,
            transition: resizeType ? 'none' : 'box-shadow 0.2s',
        }}>
            {children}

            {editMode && (
                <>
                    {/* Right handle */}
                    <Box
                        onMouseDown={(e) => beginResize(e, 'w')}
                        sx={{
                            ...handleStyle,
                            right: 0, top: '10%', bottom: '10%', width: 8,
                            cursor: 'ew-resize',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            '&:hover': { bgcolor: 'rgba(56,189,248,0.3)' },
                            '&::after': {
                                content: '""', width: 2, height: 30,
                                bgcolor: resizeType === 'w' ? '#38bdf8' : '#475569',
                                borderRadius: 1,
                            }
                        }}
                    />

                    {/* Bottom handle */}
                    <Box
                        onMouseDown={(e) => beginResize(e, 'h')}
                        sx={{
                            ...handleStyle,
                            bottom: 0, left: '10%', right: 8, height: 8,
                            cursor: 'ns-resize',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            '&:hover': { bgcolor: 'rgba(56,189,248,0.3)' },
                            '&::after': {
                                content: '""', height: 2, width: 30,
                                bgcolor: resizeType === 'h' ? '#38bdf8' : '#475569',
                                borderRadius: 1,
                            }
                        }}
                    />

                    {/* Corner handle */}
                    <Box
                        onMouseDown={(e) => beginResize(e, 'both')}
                        sx={{
                            ...handleStyle,
                            right: 0, bottom: 0, width: 16, height: 16,
                            cursor: 'nwse-resize',
                            clipPath: 'polygon(100% 0, 100% 100%, 0 100%)',
                            bgcolor: resizeType === 'both' ? '#38bdf8' : '#475569',
                            '&:hover': { bgcolor: 'rgba(56,189,248,0.7)' },
                            zIndex: 120,
                        }}
                    />
                </>
            )}
        </Box>
    );
}
