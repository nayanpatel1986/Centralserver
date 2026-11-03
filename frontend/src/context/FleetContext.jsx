import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../api';
import { socket, connectSocket } from '../socket';
import { useAuth } from './AuthContext';

const FleetContext = createContext(null);
export const useFleet = () => useContext(FleetContext);

// Holds the live fleet array + summary, kept current by Socket.IO deltas.
export function FleetProvider({ children }) {
    const { user } = useAuth();
    const scopedViewer = user?.role === 'viewer' && !!user.assetUnit;
    const [fleet, setFleet] = useState([]);
    const [summary, setSummary] = useState(null);
    const [connected, setConnected] = useState(socket.connected);
    const [error, setError] = useState('');
    const byId = useRef(new Map());

    const refresh = useCallback(async () => {
        const [f, s] = await Promise.all([api.fleet(), api.summary()]);
        byId.current = new Map(f.map((r) => [r.rigId, r]));
        setFleet(f);
        setSummary(s);
    }, []);

    useEffect(() => {
        // Surface non-401 REST failures so consumers can show a banner instead of a
        // permanently-empty fleet with no indication (audit #25). 401s are handled by the
        // axios interceptor (redirect to /login), so they are not treated as fleet errors.
        refresh().then(() => setError('')).catch((e) => {
            if (e?.response?.status !== 401) setError(e?.response?.data?.error || 'Unable to load fleet data');
        });
        if (!scopedViewer) connectSocket();

        const onUpdate = (row) => {
            byId.current.set(row.rigId, row);
            setFleet(Array.from(byId.current.values()).sort((a, b) => a.rigId.localeCompare(b.rigId, undefined, { numeric: true })));
            setError('');
        };
        const onRemove = (rigId) => {
            byId.current.delete(rigId);
            setFleet(Array.from(byId.current.values()).sort((a, b) => a.rigId.localeCompare(b.rigId, undefined, { numeric: true })));
            setError('');
        };
        const onSummary = (s) => { setSummary(s); setError(''); };
        const onConn = () => setConnected(true);
        const onDisc = () => setConnected(false);

        // Periodic REST re-sync: if the initial load failed, this lets the view self-heal
        // (and clears the error banner) without requiring a page reload.
        const poll = setInterval(() => {
            refresh().then(() => setError('')).catch((e) => {
                if (e?.response?.status !== 401) setError(e?.response?.data?.error || 'Unable to load fleet data');
            });
        }, 30000);

        socket.on('fleet_update', onUpdate);
        socket.on('fleet_remove', onRemove);
        socket.on('fleet_summary', onSummary);
        socket.on('connect', onConn);
        socket.on('disconnect', onDisc);
        return () => {
            clearInterval(poll);
            socket.off('fleet_update', onUpdate);
            socket.off('fleet_remove', onRemove);
            socket.off('fleet_summary', onSummary);
            socket.off('connect', onConn);
            socket.off('disconnect', onDisc);
        };
    }, [refresh, scopedViewer]);

    return (
        <FleetContext.Provider value={{ fleet, summary, connected, error, refresh }}>
            {children}
        </FleetContext.Provider>
    );
}
