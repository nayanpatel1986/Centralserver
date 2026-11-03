import React, { useEffect, useState, useCallback } from 'react';
import {
    Box, Paper, Typography, Table, TableBody, TableCell, TableHead, TableRow, TableContainer,
    Stack, Chip, Select, MenuItem, TextField, Button, Dialog, DialogTitle, DialogContent,
    DialogActions, IconButton, Tooltip, Alert, Switch,
} from '@mui/material';
import { Add, DeleteOutline, LockReset } from '@mui/icons-material';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';

const ROLES = ['admin', 'operator', 'viewer'];
const ROLE_COLOR = { admin: 'secondary', operator: 'info', viewer: 'default' };

export default function Users() {
    const { user } = useAuth();
    const [rows, setRows] = useState([]);
    const [assetUnits, setAssetUnits] = useState([]);
    const [err, setErr] = useState('');
    const [loading, setLoading] = useState(true);
    const [addOpen, setAddOpen] = useState(false);
    const [draft, setDraft] = useState({ username: '', password: '', display: '', role: 'viewer', assetUnit: '' });
    const [saving, setSaving] = useState(false);
    const [pwTarget, setPwTarget] = useState(null);
    const [pwValue, setPwValue] = useState('');
    const [scopeTarget, setScopeTarget] = useState(null);
    const [scopeValue, setScopeValue] = useState('');

    const load = useCallback(() => {
        setErr('');
        api.users()
            .then((u) => setRows(Array.isArray(u) ? u : []))
            .catch((e) => { if (e?.response?.status !== 401) setErr(e?.response?.data?.error || 'Failed to load users'); })
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        setLoading(true); load();
        api.assetUnits().then((units) => setAssetUnits(Array.isArray(units) ? units : []))
            .catch(() => setErr('Failed to load asset units'));
    }, [load]);

    const act = async (fn) => {
        setErr('');
        try { await fn(); load(); return true; }
        catch (e) { if (e?.response?.status !== 401) setErr(e?.response?.data?.error || 'Action failed'); return false; }
    };

    const addUser = async () => {
        if (!draft.username || !draft.password) return;
        setSaving(true);
        try {
            await api.addUser(draft);
            setAddOpen(false);
            setDraft({ username: '', password: '', display: '', role: 'viewer', assetUnit: '' });
            load();
        } catch (e) {
            if (e?.response?.status !== 401) setErr(e?.response?.data?.error || 'Failed to add user');
        } finally {
            setSaving(false);
        }
    };

    const resetPw = async () => {
        if (!pwTarget || !pwValue) return;
        await act(() => api.updateUser(pwTarget.username, { password: pwValue }));
        setPwTarget(null);
        setPwValue('');
    };

    return (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <Stack direction="row" alignItems="center" spacing={2} mb={2}>
                <Typography variant="h5" fontWeight={800} sx={{ flexGrow: 1 }}>User &amp; Access Management</Typography>
                <Button variant="contained" startIcon={<Add />} onClick={() => setAddOpen(true)}>Add user</Button>
            </Stack>

            <Alert severity="info" sx={{ mb: 2 }}>
                Local accounts and RBAC for the CRMF portal. Roles: <b>admin</b> (full + user management),
                <b> operator</b> (governance / maintenance edits), <b>viewer</b> (read-only, limited to a selected asset unit). Monitoring-only — no rig control.
            </Alert>
            {err && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErr('')}>{err}</Alert>}

            <Paper sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                <TableContainer sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
                    <Table size="small" stickyHeader>
                        <TableHead><TableRow>
                            <TableCell>Username</TableCell><TableCell>Display name</TableCell>
                            <TableCell>Role</TableCell><TableCell>Asset unit</TableCell><TableCell align="center">Enabled</TableCell>
                            <TableCell align="right">Actions</TableCell>
                        </TableRow></TableHead>
                        <TableBody>
                            {rows.map((u) => {
                                const isSelf = u.username === user?.username;
                                return (
                                    <TableRow key={u.username} hover>
                                        <TableCell>
                                            <Typography variant="body2" fontWeight={700} fontFamily="monospace">{u.username}</Typography>
                                            {isSelf && <Chip size="small" variant="outlined" label="you" sx={{ ml: 1 }} />}
                                        </TableCell>
                                        <TableCell>{u.display || '—'}</TableCell>
                                        <TableCell>
                                            <Select size="small" variant="standard" value={u.role} disabled={isSelf}
                                                onChange={(e) => {
                                                    if (e.target.value === 'viewer' && !u.assetUnit) {
                                                        setScopeTarget(u); setScopeValue('');
                                                    } else act(() => api.updateUser(u.username, { role: e.target.value }));
                                                }}
                                                renderValue={(v) => <Chip size="small" color={ROLE_COLOR[v] || 'default'} variant="outlined" label={v} />}>
                                                {ROLES.map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)}
                                            </Select>
                                        </TableCell>
                                        <TableCell>
                                            {u.role === 'viewer' ? (
                                                <Select size="small" variant="standard" value={u.assetUnit || ''} displayEmpty
                                                    onChange={(e) => act(() => api.updateUser(u.username, { assetUnit: e.target.value }))}
                                                    renderValue={(v) => v || 'All units (existing)'}>
                                                    {!u.assetUnit && <MenuItem value="" disabled>All units (existing)</MenuItem>}
                                                    {assetUnits.map((unit) => <MenuItem key={unit} value={unit}>{unit}</MenuItem>)}
                                                </Select>
                                            ) : 'All units'}
                                        </TableCell>
                                        <TableCell align="center">
                                            <Tooltip title={isSelf ? 'You cannot disable your own account' : (u.disabled ? 'Disabled — enable' : 'Enabled — disable')}>
                                                <span>
                                                    <Switch size="small" checked={!u.disabled} disabled={isSelf}
                                                        onChange={(e) => act(() => api.updateUser(u.username, { disabled: !e.target.checked }))} />
                                                </span>
                                            </Tooltip>
                                        </TableCell>
                                        <TableCell align="right">
                                            <Tooltip title="Reset password"><IconButton size="small" onClick={() => { setPwTarget(u); setPwValue(''); }}><LockReset fontSize="small" /></IconButton></Tooltip>
                                            <Tooltip title={isSelf ? 'You cannot delete your own account' : 'Delete user'}>
                                                <span>
                                                    <IconButton size="small" disabled={isSelf} color="error"
                                                        onClick={() => { if (window.confirm(`Delete user "${u.username}"?`)) act(() => api.deleteUser(u.username)); }}>
                                                        <DeleteOutline fontSize="small" />
                                                    </IconButton>
                                                </span>
                                            </Tooltip>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                            {!loading && !rows.length && (
                                <TableRow><TableCell colSpan={6} align="center" sx={{ py: 5, color: 'text.secondary' }}>No users.</TableCell></TableRow>
                            )}
                            {loading && !rows.length && (
                                <TableRow><TableCell colSpan={6} align="center" sx={{ py: 5, color: 'text.secondary' }}>Loading users…</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Paper>

            {/* Add user */}
            <Dialog open={addOpen} onClose={() => setAddOpen(false)} fullWidth maxWidth="xs">
                <DialogTitle>Add user</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} mt={0.5}>
                        {err && <Alert severity="error">{err}</Alert>}
                        <TextField size="small" label="Username" value={draft.username} onChange={(e) => setDraft({ ...draft, username: e.target.value })} autoComplete="off" />
                        <TextField size="small" label="Display name" value={draft.display} onChange={(e) => setDraft({ ...draft, display: e.target.value })} />
                        <TextField size="small" label="Password" type="password" value={draft.password} onChange={(e) => setDraft({ ...draft, password: e.target.value })} autoComplete="new-password" />
                        <Select size="small" value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })}>
                            {ROLES.map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)}
                        </Select>
                        {draft.role === 'viewer' && <TextField select size="small" label="Viewer asset unit" required
                            value={draft.assetUnit} onChange={(e) => setDraft({ ...draft, assetUnit: e.target.value })}
                            helperText="This viewer will see rigs and wells from this asset only.">
                            {assetUnits.map((unit) => <MenuItem key={unit} value={unit}>{unit}</MenuItem>)}
                        </TextField>}
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setAddOpen(false)}>Cancel</Button>
                    <Button variant="contained" onClick={addUser} disabled={saving || !draft.username || !draft.password || (draft.role === 'viewer' && !draft.assetUnit)}>{saving ? 'Saving…' : 'Add'}</Button>
                </DialogActions>
            </Dialog>

            {/* Assign an asset when changing an existing account to viewer. */}
            <Dialog open={!!scopeTarget} onClose={() => setScopeTarget(null)} fullWidth maxWidth="xs">
                <DialogTitle>Viewer asset — {scopeTarget?.username}</DialogTitle>
                <DialogContent>
                    {err && <Alert severity="error" sx={{ mb: 1 }}>{err}</Alert>}
                    <TextField select fullWidth size="small" label="Asset unit" value={scopeValue} sx={{ mt: 1 }}
                        onChange={(e) => setScopeValue(e.target.value)} helperText="The viewer will only see this asset's monitoring data.">
                        {assetUnits.map((unit) => <MenuItem key={unit} value={unit}>{unit}</MenuItem>)}
                    </TextField>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setScopeTarget(null)}>Cancel</Button>
                    <Button variant="contained" disabled={!scopeValue} onClick={async () => {
                        if (await act(() => api.updateUser(scopeTarget.username, { role: 'viewer', assetUnit: scopeValue }))) setScopeTarget(null);
                    }}>Save</Button>
                </DialogActions>
            </Dialog>

            {/* Reset password */}
            <Dialog open={!!pwTarget} onClose={() => setPwTarget(null)} fullWidth maxWidth="xs">
                <DialogTitle>Reset password — {pwTarget?.username}</DialogTitle>
                <DialogContent>
                    <TextField size="small" fullWidth label="New password" type="password" sx={{ mt: 1 }}
                        value={pwValue} onChange={(e) => setPwValue(e.target.value)} autoComplete="new-password" />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setPwTarget(null)}>Cancel</Button>
                    <Button variant="contained" onClick={resetPw} disabled={!pwValue}>Reset</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
