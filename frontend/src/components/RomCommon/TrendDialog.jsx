import React, { useState, useEffect } from 'react';
import { Dialog, DialogTitle, DialogContent, IconButton, Typography, Box, CircularProgress } from '@mui/material';
import { X } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import axios from 'axios';
import { useRig } from '../../context/RigContext';

export default function TrendDialog({ open, onClose, title, dataKey, color }) {
    const { apiBaseUrl } = useRig();
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!open || !dataKey) return;
        
        const fetchData = async () => {
            if (data.length === 0) setLoading(true);
            try {
                // Fetch last 1 hour
                const res = await axios.get(`${apiBaseUrl}/api/history?range=-1h`);
                if (res.data) {
                    const sorted = res.data.sort((a, b) => a.timestamp - b.timestamp);
                    setData(sorted);
                }
            } catch (error) {
                console.error("Failed to fetch trend data", error);
            }
            setLoading(false);
        };
        fetchData();
        
        // Poll every 5 seconds while open to keep graph live
        const interval = setInterval(fetchData, 5000);
        return () => clearInterval(interval);
    }, [open, dataKey, apiBaseUrl]);

    return (
        <Dialog 
            open={open} 
            onClose={onClose}
            maxWidth="md"
            fullWidth
            PaperProps={{ sx: { bgcolor: '#1e293b', border: '1px solid #334155', borderRadius: 2 } }}
        >
            <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #334155', pb: 2 }}>
                <Typography variant="h6" sx={{ color: 'white', fontWeight: 'bold' }}>
                    {title} Trend (Last 1 Hour)
                </Typography>
                <IconButton onClick={onClose} sx={{ color: '#94a3b8' }}>
                    <X size={20} />
                </IconButton>
            </DialogTitle>
            <DialogContent sx={{ p: 3, height: 400 }}>
                {loading && data.length === 0 ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                        <CircularProgress sx={{ color: color || '#38bdf8' }} />
                    </Box>
                ) : data.length === 0 ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                        <Typography sx={{ color: '#64748b' }}>No historical data available yet.</Typography>
                    </Box>
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={data}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                            <XAxis 
                                dataKey="timestamp" 
                                type="number" 
                                scale="time" 
                                domain={['dataMin', 'dataMax']}
                                stroke="#94a3b8"
                                tickFormatter={(unixTime) => {
                                    const date = new Date(unixTime);
                                    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                }}
                            />
                            <YAxis stroke="#94a3b8" />
                            <Tooltip 
                                labelFormatter={(unixTime) => new Date(unixTime).toLocaleString()}
                                contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: 8 }}
                                itemStyle={{ color: '#e2e8f0' }}
                            />
                            <Line 
                                type="monotone" 
                                dataKey={dataKey} 
                                name={title}
                                stroke={color || '#38bdf8'} 
                                dot={false} 
                                strokeWidth={2} 
                                isAnimationActive={false}
                                connectNulls={true}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                )}
            </DialogContent>
        </Dialog>
    );
}
