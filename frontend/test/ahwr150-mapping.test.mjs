import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { reading } from '../src/components/ahwr150/hpuAnalytics.mjs';

const catalog = JSON.parse(readFileSync(fileURLToPath(new URL('../src/components/ahwr150/db119Catalog.json', import.meta.url)), 'utf8'));

test('CAT engines have separate DB119 RPM sources', () => {
    const first = catalog.find(tag => tag.measurement === 'cat_engine' && tag.field === 'rpm');
    const second = catalog.find(tag => tag.measurement === 'cat_engine_2' && tag.field === 'rpm');
    assert.ok(first && second);
    assert.notEqual(first.address, second.address);
});

test('HPU sensor values require their own valid fresh quality bit', () => {
    const now = Date.now();
    const payload = {
        hpu: { oil_temp: 64, oil_temp_ok: 1 },
        _meta: { connected: true, stale: false },
        _fieldTimes: { 'hpu.oil_temp': new Date(now).toISOString(), 'hpu.oil_temp_ok': new Date(now).toISOString() },
    };
    assert.equal(reading(payload, 'oil_temp', { staleMs: 30000 }, now).value, 64);
    payload.hpu.oil_temp_ok = 0;
    assert.equal(reading(payload, 'oil_temp', { staleMs: 30000 }, now).quality, 'SENSOR BAD');
    payload.hpu.oil_temp_ok = 1;
    payload._fieldTimes['hpu.oil_temp'] = new Date(now - 31000).toISOString();
    assert.equal(reading(payload, 'oil_temp', { staleMs: 30000 }, now).quality, 'STALE');
});
