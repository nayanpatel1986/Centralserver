import React, { useMemo } from 'react';
import EquipmentPanel from '../rig/panels/EquipmentPanel';
import CatEngineDashboard from './CatEngineDashboard';

export default function AhwrWorkoverEquipment({ rigId, initialTab }) {
    const pageOverrides = useMemo(() => ({ cat: CatEngineDashboard }), []);
    return <EquipmentPanel rigId={rigId} initialTab={initialTab} pageOverrides={pageOverrides} />;
}
