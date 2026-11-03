const numeric = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));

export function sampleLiveTrendPacket(packet, keys, freshMs) {
    const packetTime = Date.parse(packet?._meta?.ts || '');
    if (!Number.isFinite(packetTime)) return null;
    const sample = {};
    let sourceTime = 0;
    for (const key of keys) {
        const value = packet?.cat_engine?.[key];
        const time = Date.parse(packet?._meta?.perTagTs?.['cat_engine.' + key] || '');
        if (!numeric(value) || !Number.isFinite(time) || Math.abs(packetTime - time) > freshMs || Date.now() - time > freshMs) continue;
        sample['cat_engine.' + key] = Number(value);
        sourceTime = Math.max(sourceTime, time);
    }
    if (!sourceTime) return null;
    if (numeric(packet?.drilling?.bit_depth)) sample['drilling.bit_depth'] = Number(packet.drilling.bit_depth);
    return { ...sample, timestamp: sourceTime };
}

export function appendLiveTrendSample(previous, sample) {
    const last = previous[previous.length - 1];
    if (last && sample.timestamp < last.timestamp) return previous;
    if (last && sample.timestamp === last.timestamp) {
        if (Object.keys(sample).every((key) => sample[key] === last[key])) return previous;
        return [...previous.slice(0, -1), { ...last, ...sample }];
    }
    return [...previous.filter((row) => row.timestamp > sample.timestamp - 180000), sample].slice(-180);
}
