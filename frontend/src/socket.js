import { io } from 'socket.io-client';

// One shared socket; auth token read fresh on every (re)connect.
export const socket = io('/', {
    autoConnect: false,
    auth: (cb) => cb({ token: localStorage.getItem('crmf_token') }),
});

export const connectSocket = () => {
    try {
        const user = JSON.parse(localStorage.getItem('crmf_user') || 'null');
        if (user?.role === 'viewer' && user.assetUnit) return;
    } catch { /* backend still enforces socket access */ }
    if (!socket.connected) socket.connect();
};
export const disconnectSocket = () => { if (socket.connected) socket.disconnect(); };
