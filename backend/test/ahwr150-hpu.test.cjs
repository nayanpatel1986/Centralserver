'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validate } = require('../lib/ahwr150Hpu');

test('AHWR-150 HPU display calibration preserves missing values and scopes accepted settings', () => {
    assert.deepEqual(validate({}), { staleMs: 30000 });
    assert.deepEqual(validate({ ratedFlows: { pdw_pump1_1: null }, healthWeights: { pressure: 2 } }), {
        staleMs: 30000, ratedFlows: { pdw_pump1_1: null }, healthWeights: { pressure: 2 }
    });
    assert.throws(() => validate({ ratedFlows: { pdw_pump1_1: -1 } }), /invalid ratedFlows value/);
    assert.throws(() => validate({ healthWeights: { unauthorized: 1 } }), /invalid healthWeights key/);
    assert.throws(() => validate({ staleMs: 0 }), /staleMs/);
});
