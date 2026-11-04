import { io } from 'socket.io-client';

// One shared socket; the handshake authenticates with the HttpOnly session cookie.
export const socket = io('/', {
    autoConnect: false,
});

export const connectSocket = () => {
    try {
        const user = JSON.parse(localStorage.getItem('crmf_user') || 'null');
        if (user?.role === 'viewer' && user.assetUnit) return;
    } catch { /* backend still enforces socket access */ }
    if (!socket.connected) socket.connect();
};
export const disconnectSocket = () => { if (socket.connected) socket.disconnect(); };
