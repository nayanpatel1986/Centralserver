import React, { useState, useEffect, useRef } from 'react';
import { Box } from '@mui/material';

/**
 * GridResizablePanel
 * A version of ResizablePanel that works with MUI Grid columns (1-12).
 * Instead of absolute pixels, it calculates a grid width.
 */
export default function GridResizablePanel({
    children,
    gridWidth,
    editMode,
    onResize,
    containerId,
}) {
    const [isResizing, setIsResizing] = useState(false);
    const startX = useRef(0);
    const startGridW = useRef(gridWidth);

    const beginResize = (e) => {
        if (!editMode) return;
        setIsResizing(true);
        startX.current = e.clientX;
        startGridW.current = gridWidth;
        document.body.style.cursor = 'ew-resize';
        e.preventDefault();
        e.stopPropagation();
    };

    useEffect(() => {
        if (!isResizing) return;

        const onMove = (e) => {
            const container = document.getElementById(containerId);
            if (!container) return;

            const containerWidth = container.offsetWidth;
            const pxPerCol = containerWidth / 12;
            const deltaPx = e.clientX - startX.current;
            const deltaCols = Math.round(deltaPx / pxPerCol);
            
            const newGridW = Math.max(1, Math.min(12, startGridW.current + deltaCols));
            if (newGridW !== gridWidth) {
                onResize(newGridW);
            }
        };

        const onUp = () => {
            setIsResizing(false);
            document.body.style.cursor = 'default';
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, [isResizing, gridWidth, onResize, containerId]);

    return (
        <Box sx={{
            position: 'relative',
            width: '100%',
            height: '100%',
            overflow: 'hidden',
            border: editMode ? '1px dashed rgba(56,189,248,0.4)' : 'none',
            borderRadius: 1,
        }}>
            {children}

            {editMode && (
                <Box
                    onMouseDown={beginResize}
                    sx={{
                        position: 'absolute',
                        right: 0,
                        top: 0,
                        bottom: 0,
                        width: 8,
                        cursor: 'ew-resize',
                        zIndex: 100,
                        '&:hover': { bgcolor: 'rgba(56,189,248,0.3)' },
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        '&::after': {
                            content: '""',
                            width: 2,
                            height: '20%',
                            bgcolor: isResizing ? '#38bdf8' : '#475569',
                            borderRadius: 1
                        }
                    }}
                />
            )}
        </Box>
    );
}
