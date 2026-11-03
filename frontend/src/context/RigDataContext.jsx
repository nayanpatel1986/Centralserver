import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { api } from '../api';
import { socket, connectSocket } from '../socket';

// Per-rig live data for the remote HMI mirror. Polls /api/rigs/:id/live (the edge
// `rig_data` shape reconstructed centrally) on an interval and exposes it via a hook,
// so the ported edge operator panels read `data.<measurement>.<field>` unchanged.
// READ-ONLY: this only fetches reshaped telemetry already received from the rig.
const RigDataContext = createContext(null);
export const useRigData = () => useContext(RigDataContext) || { data: null, loading: true, error: '' };

export function RigDataProvider({ rigId, intervalMs = 2000, children }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const alive = useRef(true);
    const refreshTimer = useRef(null);
    const lastSocketUpdate = useRef(0);
    const lastPayloadTs = useRef(null);
    const lastFreshAt = useRef(0);
    const staleAfterMs = Math.max(4000, Math.round(intervalMs * 2));

    const normalizeLivePayload = useCallback((payload) => {
        if (!payload || typeof payload !== 'object') return payload;
        const payloadTs = Date.parse(String(payload?._meta?.ts || ''));
        const now = Date.now();
        const advanced = Number.isFinite(payloadTs) && payloadTs !== lastPayloadTs.current;
        if (advanced) {
            lastPayloadTs.current = payloadTs;
            lastFreshAt.current = now;
        } else if (!lastFreshAt.current && Number.isFinite(payloadTs)) {
            // First successful payload: treat it as fresh until telemetry stops
            // advancing for long enough that the rig is clearly no longer live.
            lastPayloadTs.current = payloadTs;
            lastFreshAt.current = now;
        }

        const fresh = !lastFreshAt.current ? false : (now - lastFreshAt.current <= staleAfterMs);
        const connected = fresh && payload?._meta?.connected !== false && payload?._meta?.stale !== true;
        return {
            ...payload,
            _meta: {
                ...(payload._meta || {}),
                connected,
                stale: !connected,
                status: connected ? (payload?._meta?.status || 'online') : 'offline',
            }
        };
    }, [staleAfterMs]);

    const load = useCallback(() => {
        if (!rigId) return;
        api.rigLive(rigId)
            .then((d) => {
                if (!alive.current) return;
                setData(normalizeLivePayload(d));
                setError('');
            })
            .catch((e) => { if (alive.current && e?.response?.status !== 401) setError(e?.response?.data?.error || 'live data unavailable'); })
            .finally(() => { if (alive.current) setLoading(false); });
    }, [rigId, normalizeLivePayload]);

    useEffect(() => {
        alive.current = true;
        setLoading(true); load();
        const t = setInterval(load, intervalMs);
        return () => {
            alive.current = false;
            clearInterval(t);
            if (refreshTimer.current) clearTimeout(refreshTimer.current);
        };
    }, [load, intervalMs]);

    useEffect(() => {
        if (!rigId) return undefined;
        connectSocket();
        const onRigLive = (payload) => {
            if (payload?.rigId !== rigId) return;
            if (!alive.current) return;
            const now = Date.now();
            if (now - lastSocketUpdate.current < Math.max(750, intervalMs)) return;
            lastSocketUpdate.current = now;
            setData(normalizeLivePayload(payload.data));
            setError('');
            setLoading(false);
        };
        const onFleetUpdate = (row) => {
            const updateRigId = row?.rigId || row?.rig_id;
            if (updateRigId !== rigId) return;
            if (refreshTimer.current) return;
            refreshTimer.current = setTimeout(() => {
                refreshTimer.current = null;
                load();
            }, 120);
        };
        socket.on('rig_live', onRigLive);
        socket.on('fleet_update', onFleetUpdate);
        return () => {
            socket.off('rig_live', onRigLive);
            socket.off('fleet_update', onFleetUpdate);
        };
    }, [rigId, load, intervalMs]);

    return (
        <RigDataContext.Provider value={{ data, loading, error, rigId, refresh: load }}>
            {children}
        </RigDataContext.Provider>
    );
}


