import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from '@mui/material';
import { api } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { groups, lines } from './hpuAnalytics.mjs';

const SECTIONS = [
    { key: 'pressureSetpoints', title: 'Pressure setpoints (bar)', fields: lines.map(([id, label]) => [id, label]) },
    { key: 'ratedFlows', title: 'Rated flow at 100% (L/min)', fields: groups.flatMap(group => group.pumps).concat(['sf_esch1_actoilflow', 'sf_esch2_actoilflow']).map(id => [id, id.replaceAll('_', ' ').toUpperCase()]) },
    { key: 'healthWeights', title: 'Health score weights', fields: ['pressure', 'pumps', 'oil', 'cooling', 'safety'].map(id => [id, id.toUpperCase()]) },
];

export default function HpuSettings({ rigId, config, onSaved }) {
    const { can } = useAuth();
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState({});
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    useEffect(() => { if (!open) setDraft(config || {}); }, [config, open]);
    if (!can('admin')) return null;

    const change = (section, key, raw) => setDraft(prev => ({
        ...prev, [section]: { ...(prev[section] || {}), [key]: raw === '' ? null : Number(raw) }
    }));
    const save = async () => {
        setSaving(true); setError('');
        try {
            const value = await api.saveRigHpuAnalytics(rigId, draft);
            onSaved(value); setOpen(false);
        } catch (err) {
            setError(err?.response?.data?.error || 'Unable to save HPU analytics settings');
        } finally { setSaving(false); }
    };
    return <>
        <Button size="small" variant="outlined" onClick={() => { setDraft(config || {}); setError(''); setOpen(true); }}>HPU analytics setup</Button>
        <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="lg">
            <DialogTitle>HPU analytics setup · {rigId}</DialogTitle>
            <DialogContent>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    These engineering values calibrate displayed calculations for this rig. Empty values remain unavailable. They do not write to the PLC.
                </Typography>
                {SECTIONS.map(section => <Box key={section.key} sx={{ mb: 2 }}>
                    <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 800 }}>{section.title}</Typography>
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 1 }}>
                        {section.fields.map(([key, label]) => <TextField key={key} size="small" type="number" label={label}
                            value={draft[section.key]?.[key] ?? ''} inputProps={{ min: 0, max: 100000, step: 'any' }}
                            onChange={event => change(section.key, key, event.target.value)} />)}
                    </Box>
                </Box>)}
                {error && <Alert severity="error">{error}</Alert>}
            </DialogContent>
            <DialogActions><Button onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} disabled={saving} variant="contained">Save</Button></DialogActions>
        </Dialog>
    </>;
}
