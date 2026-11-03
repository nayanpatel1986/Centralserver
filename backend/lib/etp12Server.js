'use strict';
// CRMF ETP v1.2 Store endpoint for the AHWR Edge binary Avro publisher.
// The authenticated rig may only write its own objects and channel data.
const crypto = require('crypto');
const codec = require('./etp12/codec');
const { EtpSession } = require('./etp12/session');
const { query } = require('./db');
const { ingestBatch } = require('./ingest');

const { PROTOCOL: P, ERRORS } = codec;
const sessions = new Set();
const status = { accepted: 0, rejected: 0, objectsStored: 0, pointsStored: 0, lastRigId: null, lastDataAt: null, lastError: '' };

function channelMetadata(uri, id, metric, lastIndexUs) {
    const endIndex = lastIndexUs == null ? { item: null } : { item: { long: Number(lastIndexUs) } };
    return {
        uri, id, channelName: metric, dataKind: 'typeDouble', uom: '', depthDatum: '',
        channelClassUri: '', status: 'Active', source: 'CRMF ETP v1.2 Store',
        axisVectorLengths: [], attributeMetadata: [], customData: {},
        indexes: [{
            indexKind: 'DateTime', direction: 'Increasing', name: 'TIME', uom: 'us',
            depthDatum: '', indexPropertyKindUri: '', filterable: true,
            interval: { startIndex: { item: null }, endIndex, uom: 'us', depthDatum: '' },
        }],
    };
}

function accept(ws, { rigId, token }) {
    const session = new EtpSession(ws, { side: 'server' });
    const channelsById = new Map();
    let nextChannelId = 1;
    let opened = false;
    let work = Promise.resolve();
    sessions.add(ws);
    status.accepted += 1;
    status.lastRigId = rigId;
    status.lastError = '';

    async function handle(msg) {
        if (msg.protocol === P.Core && msg.name === 'RequestSession') {
            if (opened) return session.exception(msg, ERRORS.EINVALID_STATE, 'session already open');
            opened = true;
            const supported = [P.Store, P.ChannelDataLoad]
                .map((protocol) => ({ protocol, protocolVersion: codec.VERSION, role: 'store', protocolCapabilities: {} }));
            session.reply(msg, 'OpenSession', {
                applicationName: 'CRMF ETP v1.2 Store', applicationVersion: '1.0.0',
                serverInstanceId: crypto.randomBytes(16), sessionId: crypto.randomBytes(16),
                supportedProtocols: supported,
                supportedDataObjects: msg.body.supportedDataObjects || [],
                supportedCompression: '', supportedFormats: ['xml'],
                currentDateTime: Date.now() * 1000, earliestRetainedChangeTime: 0,
                endpointCapabilities: {},
            });
            return;
        }
        if (msg.protocol === P.Core && msg.name === 'CloseSession') {
            session.close('client closed session');
            return;
        }
        if (!opened) return session.exception(msg, ERRORS.EINVALID_STATE, 'open a session first');

        if (msg.protocol === P.Store && msg.name === 'PutDataObjects') {
            const success = {};
            for (const [key, object] of Object.entries(msg.body.dataObjects || {})) {
                const uri = String(object.resource?.uri || '');
                if (!uri || uri.length > 2048 || !Buffer.isBuffer(object.data) || object.data.length > 8 * 1024 * 1024) {
                    throw new Error('invalid ETP data object');
                }
                await query(`INSERT INTO etp12_objects (rig_id, uri, format, data)
                             VALUES ($1, $2, $3, $4)
                             ON CONFLICT (rig_id, uri) DO UPDATE SET
                                 format = EXCLUDED.format, data = EXCLUDED.data, updated_at = now()`,
                    [rigId, uri, String(object.format || 'xml'), object.data]);
                const metric = object.resource?.customData?.metric?.item?.string;
                if (typeof metric === 'string' && metric.length > 0 && metric.length <= 256) {
                    await query(`INSERT INTO etp12_channels (rig_id, uri, metric)
                                 VALUES ($1, $2, $3)
                                 ON CONFLICT (rig_id, uri) DO UPDATE SET
                                     metric = EXCLUDED.metric, updated_at = now()`,
                        [rigId, uri, metric]);
                }
                success[key] = {
                    createdContainedObjectUris: [], deletedContainedObjectUris: [],
                    joinedContainedObjectUris: [], unjoinedContainedObjectUris: [],
                };
                status.objectsStored += 1;
            }
            session.reply(msg, 'PutDataObjectsResponse', { success });
            return;
        }

        if (msg.protocol === P.ChannelDataLoad && msg.name === 'OpenChannels') {
            const requested = Object.entries(msg.body.uris || {});
            const result = {};
            const errors = {};
            for (const [key, uri] of requested) {
                const { rows } = await query(
                    'SELECT metric, last_index_us FROM etp12_channels WHERE rig_id = $1 AND uri = $2',
                    [rigId, uri]);
                if (!rows.length) {
                    errors[key] = { code: ERRORS.ENOT_FOUND, message: 'channel object not found in CRMF Store' };
                    continue;
                }
                const id = nextChannelId++;
                channelsById.set(id, { uri, metric: rows[0].metric });
                result[key] = {
                    metadata: channelMetadata(uri, id, rows[0].metric, rows[0].last_index_us),
                    preferRealtime: true, dataChanges: true,
                };
            }
            if (errors && Object.keys(errors).length) {
                // A map ProtocolException is a partial response; FIN belongs on it.
                if (Object.keys(result).length) {
                    session.send(P.ChannelDataLoad, 'OpenChannelsResponse', { channels: result },
                        { correlationId: msg.header.messageId, final: false });
                }
                session.exception(msg, ERRORS.ENOT_FOUND, 'some channels were not found', { errors });
            } else {
                session.reply(msg, 'OpenChannelsResponse', { channels: result });
            }
            return;
        }

        if (msg.protocol === P.ChannelDataLoad && msg.name === 'ChannelData') {
            const byTs = new Map();
            const maxIndexByUri = new Map();
            for (const item of msg.body.data || []) {
                const channel = channelsById.get(Number(item.channelId));
                if (!channel) throw new Error('channel data references an unopened channel');
                const indexUs = codec.indexOf(item.indexes?.[0]);
                const value = Number(codec.dataValueOf(item.value));
                if (!Number.isFinite(indexUs) || !Number.isFinite(value)) continue;
                const date = new Date(Math.floor(indexUs / 1000));
                if (!Number.isFinite(date.getTime())) continue;
                const ts = date.toISOString();
                if (!byTs.has(ts)) byTs.set(ts, {});
                byTs.get(ts)[channel.metric] = value;
                maxIndexByUri.set(channel.uri, Math.max(indexUs, maxIndexByUri.get(channel.uri) || 0));
            }
            if (!byTs.size) return;
            // The edge may send 5,000 items in one frame. Keep each ingest call
            // below the central per-batch snapshot limit so no data is truncated.
            const snapshots = Array.from(byTs, ([ts, values]) => ({ ts, values }));
            for (let offset = 0; offset < snapshots.length; offset += 1000) {
                const batch = {
                    seq: null, deviceId: rigId, createdAt: new Date().toISOString(),
                    channels: snapshots.slice(offset, offset + 1000), events: [],
                };
                const result = await ingestBatch({ rigId, token, schemaVersion: 'etp12-channel-data' }, batch);
                if (!result.ok) throw new Error(`ETP data ingest rejected: ${result.error || result.code}`);
                status.pointsStored += result.points || 0;
            }
            for (const [uri, indexUs] of maxIndexByUri) {
                await query(`UPDATE etp12_channels SET
                                 last_index_us = GREATEST(COALESCE(last_index_us, 0), $3), updated_at = now()
                             WHERE rig_id = $1 AND uri = $2`, [rigId, uri, Math.floor(indexUs)]);
            }
            status.lastDataAt = new Date().toISOString();
            return;
        }

        session.exception(msg, ERRORS.ENOTSUPPORTED, `unsupported ETP request ${msg.protocol}/${msg.name}`);
    }

    session.on('message', (msg) => {
        work = work.then(() => handle(msg)).catch((error) => {
            status.rejected += 1;
            status.lastError = error.message;
            session.exception(msg, ERRORS.EREQUEST_DENIED, error.message);
            if (msg.name === 'ChannelData') session.close('channel data not stored; reconnect to resume');
        });
    });
    session.on('close', () => sessions.delete(ws));
    session.on('transportError', (error) => { status.lastError = error.message; });
}

function getStatus() { return { ...status, clientCount: sessions.size, protocol: 'ETP v1.2' }; }
module.exports = { accept, getStatus };
