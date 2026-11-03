import React, { createContext, useContext, useMemo, useState } from 'react';
import { useRigData } from './RigDataContext';

const RigContext = createContext(null);

const noopSocket = {
    on: () => {},
    off: () => {},
};

function normalizeRomData(data) {
    const src = data || {};
    return {
        ...src,
        drawworks: src.drawworks || {},
        drilling: src.drilling || {},
        mudpump: src.mudpump || {},
        engine: src.engine || src.cat_engine || {},
        cat_engine: src.cat_engine || src.engine || {},
        well_control: src.well_control || src.wellcontrol || { available: false },
        wellcontrol: src.wellcontrol || src.well_control || { available: false },
        fluid: src.fluid || {},
        system: src.system || {},
        allison: src.allison || {},
    };
}

export function RigProvider({ children }) {
    const value = useRigValue();
    return <RigContext.Provider value={value}>{children}</RigContext.Provider>;
}

function useRigValue() {
    const { data, rigId } = useRigData();
    const [alarmEnabled, setAlarmEnabledState] = useState(() => localStorage.getItem('romii_global_alarm_enabled') !== 'false');

    const setAlarmEnabled = (next) => {
        const value = typeof next === 'function' ? next(alarmEnabled) : next;
        localStorage.setItem('romii_global_alarm_enabled', String(value));
        setAlarmEnabledState(value);
    };

    return useMemo(() => ({
        currentRig: { id: rigId || 'central-rom', name: rigId || 'ROM rig', ip: window.location.hostname },
        setCurrentRig: () => {},
        rigs: [],
        socket: noopSocket,
        apiBaseUrl: '',
        globalRigData: normalizeRomData(data),
        alarmEnabled,
        setAlarmEnabled,
    }), [data, rigId, alarmEnabled]);
}

export function useRig() {
    const existing = useContext(RigContext);
    const fallback = useRigValue();
    return existing || fallback;
}
