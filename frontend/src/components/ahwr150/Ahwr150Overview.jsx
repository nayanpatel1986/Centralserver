import React from 'react';
import CentralRigConsoleOverview from '../rig/CentralRigConsoleOverview';

// Shared CRMF overview shell with the edge CAT/HPU equipment summary for AHWR-150.
export default function Ahwr150Overview(props) {
    return <CentralRigConsoleOverview {...props} variant="ahwr150" />;
}
