import React, { useMemo } from 'react';
import EquipmentPanel from '../rig/panels/EquipmentPanel';
import CatEngineDashboard from './CatEngineDashboard';
import HpuDashboard from './HpuDashboard';

// Keep every AHWR equipment tab; replace only CAT and HPU for this rig type.
export default function Ahwr150Equipment({ rigId, initialTab, initialEngine = 'engine1' }) {
    const pageOverrides = useMemo(() => ({
        cat: ({ rigId: selectedRigId }) => <CatEngineDashboard rigId={selectedRigId} engineId={initialEngine} />,
        hpu: HpuDashboard,
    }), [initialEngine]);
    return <EquipmentPanel key={rigId} rigId={rigId} initialTab={initialTab} pageOverrides={pageOverrides} />;
}
