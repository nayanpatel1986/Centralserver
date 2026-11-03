import React from 'react';
import { Box, Typography } from '@mui/material';

/**
 * DashboardPanelHeader
 * A standardized header for all dashboard panels to ensure consistent styling and title positioning.
 * 
 * Props:
 *   title      - The title text to display in the header.
 *   icon       - An optional Lucide icon component.
 *   iconColor  - An optional color for the icon.
 *   isSmall    - A boolean to reduce padding and font size for height-constrained panels.
 */
const DashboardPanelHeader = ({ title, icon: Icon, iconColor = '#38bdf8', isSmall = false }) => {
    return (
        <Box sx={{ 
            width: '100%', 
            bgcolor: 'rgba(51, 65, 85, 0.4)', 
            height: isSmall ? 28 : 36, // Fixed height for perfect alignment across columns
            borderBottom: '1px solid rgba(51, 65, 85, 0.5)', 
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            px: 1.5 // Standard horizontal padding
        }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%', justifyContent: 'center' }}>
                {Icon && (
                    <Icon size={isSmall ? 14 : 16} color={iconColor} strokeWidth={2.5} />
                )}
                
                <Typography variant="body2" sx={{ 
                    color: '#cbd5e1', 
                    fontWeight: 'bold', 
                    letterSpacing: 1.5, 
                    textTransform: 'uppercase',
                    fontSize: isSmall ? '0.65rem' : '0.8rem',
                    lineHeight: 1,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                }}>
                    {title}
                </Typography>
            </Box>
        </Box>
    );
};

export default DashboardPanelHeader;
