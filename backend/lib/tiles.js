'use strict';
// Fleet-map basemap tiles, served same-origin with an on-disk cache.
//
// Why a proxy instead of the browser fetching a public tile server directly:
//  - The portal's CSP (helmet, img-src 'self') blocks third-party tile images
//    whenever the backend serves the frontend (Windows offline bundle).
//  - CARTO's public basemaps now return an "API KEY REQUIRED" image.
//  - DATA RESIDENCY: every tile viewed while online is cached, so the map keeps
//    working on an air-gapped CRMF. Set MAP_TILE_UPSTREAM_* to an internal tile
//    server, or to "off" to serve from the cache only (pre-seed TILE_CACHE_DIR).
//
// Defaults are Esri's key-free dark-gray canvas (base + labels), which match the
// ops theme. Templates use {z}/{x}/{y}.
const fs = require('fs');
const path = require('path');

const UPSTREAM = {
    base: process.env.MAP_TILE_UPSTREAM_BASE
        || 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    labels: process.env.MAP_TILE_UPSTREAM_LABELS
        || 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
};
const CACHE_DIR = process.env.TILE_CACHE_DIR || path.join(__dirname, '..', 'data', 'tiles');
const MAX_ZOOM = Math.min(19, Number(process.env.MAP_TILE_MAX_ZOOM) || 16);
const TIMEOUT_MS = Number(process.env.MAP_TILE_TIMEOUT_MS) || 8000;
const MAX_BYTES = 1024 * 1024;

// In-flight de-duplication: a burst of identical tile requests makes one fetch.
const inflight = new Map();

function sniffType(buf) {
    if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
    if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
    if (buf.length >= 12 && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
    return null;
}

function parseCoords(layer, z, x, y) {
    if (!Object.prototype.hasOwnProperty.call(UPSTREAM, layer)) return null;
    const [zi, xi, yi] = [z, x, y].map((v) => (/^\d{1,7}$/.test(String(v)) ? Number(v) : NaN));
    if (![zi, xi, yi].every(Number.isInteger) || zi > MAX_ZOOM) return null;
    const n = 2 ** zi;
    if (xi >= n || yi >= n) return null;
    return { layer, z: zi, x: xi, y: yi };
}

async function fetchUpstream(t) {
    const tpl = UPSTREAM[t.layer];
    if (!tpl || tpl === 'off') return null;
    const url = tpl.replace('{z}', t.z).replace('{x}', t.x).replace('{y}', t.y);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
        const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'CRMF-fleet-map/1.0' } });
        if (!res.ok) return null;
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > MAX_BYTES || !sniffType(buf)) return null;
        return buf;
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

// Returns { buf, type } or null when the tile is neither cached nor fetchable.
async function getTile(layer, z, x, y) {
    const t = parseCoords(layer, z, x, y);
    if (!t) return { invalid: true };
    const file = path.join(CACHE_DIR, t.layer, String(t.z), String(t.x), `${t.y}.tile`);
    try {
        const buf = await fs.promises.readFile(file);
        return { buf, type: sniffType(buf) || 'image/png', cached: true };
    } catch { /* not cached */ }

    const key = file;
    if (!inflight.has(key)) {
        inflight.set(key, (async () => {
            const buf = await fetchUpstream(t);
            if (buf) {
                try {
                    await fs.promises.mkdir(path.dirname(file), { recursive: true });
                    await fs.promises.writeFile(file, buf);
                } catch (e) {
                    console.warn('[tiles] cache write failed:', e.message);
                }
            }
            return buf;
        })().finally(() => inflight.delete(key)));
    }
    const buf = await inflight.get(key);
    return buf ? { buf, type: sniffType(buf), cached: false } : null;
}

module.exports = { getTile, parseCoords };
