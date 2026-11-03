'use strict';

// Run on the CRMF PC after configuring HTTPS: node test/https-proxy-smoke.cjs <ip> <port> <ca-file>
const https = require('https');
const fs = require('fs');
const WebSocket = require('ws');

const [, , host, rawPort, caFile] = process.argv;
if (!host || !rawPort || !caFile) {
    console.error('Usage: node https-proxy-smoke.cjs <ip> <port> <ca-file>');
    process.exit(2);
}
const ca = fs.readFileSync(caFile);
function get(path) {
    return new Promise((resolve, reject) => {
        const req = https.get({ hostname: host, port: Number(rawPort), path, ca, timeout: 5000 }, (res) => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => { body += chunk; });
            res.on('end', () => resolve({ status: res.statusCode, body }));
        });
        req.on('timeout', () => req.destroy(new Error('HTTPS request timed out')));
        req.on('error', reject);
    });
}
function checkIngestRoute() {
    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: host, port: Number(rawPort), path: '/ingest', method: 'POST', ca,
            timeout: 5000, headers: { 'Content-Type': 'application/json' },
        }, (res) => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => { body += chunk; });
            res.on('end', () => {
                if (res.statusCode === 400 && JSON.parse(body).error === 'bad json') resolve();
                else reject(new Error(`Unexpected ingest route response: ${res.statusCode}`));
            });
        });
        req.on('timeout', () => req.destroy(new Error('HTTPS ingest request timed out')));
        req.on('error', reject);
        req.end('not-json');
    });
}
function checkWebSocket() {
    return new Promise((resolve, reject) => {
        const socket = new WebSocket(`wss://${host}:${rawPort}/socket.io/?EIO=4&transport=websocket`, { ca });
        const timeout = setTimeout(() => { socket.terminate(); reject(new Error('WebSocket upgrade timed out')); }, 5000);
        socket.once('message', (data) => {
            clearTimeout(timeout);
            socket.close();
            if (String(data).startsWith('0{')) resolve();
            else reject(new Error('Unexpected Socket.IO WebSocket handshake'));
        });
        socket.once('error', (error) => { clearTimeout(timeout); reject(error); });
    });
}
(async () => {
    const health = await get('/healthz');
    if (health.status !== 200 || JSON.parse(health.body).service !== 'crmf-backend') {
        throw new Error(`Unexpected HTTPS health response: ${health.status}`);
    }
    console.log(`HTTPS certificate and CRMF health: OK (${host}:${rawPort})`);
    await checkIngestRoute();
    console.log('Ingest route through HTTPS: OK');
    const polling = await get('/socket.io/?EIO=4&transport=polling');
    if (polling.status !== 200 || !polling.body.startsWith('0{')) {
        throw new Error(`Socket.IO polling failed: ${polling.status}`);
    }
    console.log('Socket.IO polling through HTTPS: OK');
    await checkWebSocket();
    console.log('Socket.IO WebSocket through HTTPS: OK');
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
