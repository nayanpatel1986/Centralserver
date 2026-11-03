'use strict';

// TLS termination for the portable CRMF. Forwards API, frontend and Socket.IO
// traffic to the existing local HTTP listener without changing its URL.
const fs = require('fs');
const http = require('http');
const https = require('https');
const net = require('net');

const port = Number(process.env.CRMF_HTTPS_PORT || 8443);
const upstreamPort = Number(process.env.CRMF_HTTP_PORT || 8090);
const pfxPath = process.env.CRMF_TLS_PFX_FILE;
const passphrasePath = process.env.CRMF_TLS_PASSPHRASE_FILE;
if (!pfxPath || !passphrasePath) throw new Error('CRMF HTTPS certificate is not configured');

const options = {
    pfx: fs.readFileSync(pfxPath),
    passphrase: fs.readFileSync(passphrasePath, 'utf8').trim(),
    minVersion: 'TLSv1.2',
};

const server = https.createServer(options, (request, response) => {
    const headers = {
        ...request.headers,
        'x-forwarded-for': request.socket.remoteAddress,
        'x-forwarded-proto': 'https',
    };
    const upstream = http.request({
        hostname: '127.0.0.1', port: upstreamPort,
        method: request.method, path: request.url, headers,
    }, (upstreamResponse) => {
        response.writeHead(upstreamResponse.statusCode, upstreamResponse.headers);
        upstreamResponse.pipe(response);
    });
    upstream.on('error', () => {
        if (!response.headersSent) response.writeHead(502, { 'Content-Type': 'text/plain' });
        response.end('CRMF backend unavailable');
    });
    request.pipe(upstream);
});

// Socket.IO upgrades use the same authenticated TLS connection as polling.
server.on('upgrade', (request, client, head) => {
    const upstream = net.createConnection({ host: '127.0.0.1', port: upstreamPort });
    upstream.on('connect', () => {
        const lines = [`${request.method} ${request.url} HTTP/${request.httpVersion}`];
        for (let i = 0; i < request.rawHeaders.length; i += 2) {
            const name = request.rawHeaders[i];
            if (!/^x-forwarded-(for|proto)$/i.test(name)) {
                lines.push(`${name}: ${request.rawHeaders[i + 1]}`);
            }
        }
        lines.push(`X-Forwarded-For: ${request.socket.remoteAddress}`);
        lines.push('X-Forwarded-Proto: https', '', '');
        upstream.write(lines.join('\r\n'));
        if (head.length) upstream.write(head);
        client.pipe(upstream).pipe(client);
    });
    upstream.on('error', () => client.destroy());
    client.on('error', () => upstream.destroy());
    client.on('close', () => upstream.destroy());
});

server.listen(port, '0.0.0.0', () => {
    console.log(`CRMF HTTPS listening on :${port}; forwarding to 127.0.0.1:${upstreamPort}`);
});
