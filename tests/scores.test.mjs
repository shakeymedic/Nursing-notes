import test from 'node:test';
import assert from 'node:assert/strict';
import {
    news2, news2Response, rrPoints, spo2Scale1Points, spo2Scale2Points, sbpPoints, hrPoints, tempPoints,
    bmi, weightChangePercent, daysSince, formatDateTime, findIdentifiers, VIP
} from '../js/scores.js';

test('NEWS2 band edges (RCP 2017)', () => {
    assert.deepEqual([8, 9, 11, 12, 20, 21, 24, 25].map(rrPoints), [3, 1, 1, 0, 0, 2, 2, 3]);
    assert.deepEqual([91, 92, 93, 94, 95, 96].map(spo2Scale1Points), [3, 2, 2, 1, 1, 0]);
    assert.deepEqual([90, 91, 100, 101, 110, 111, 219, 220].map(sbpPoints), [3, 2, 2, 1, 1, 0, 0, 3]);
    assert.deepEqual([40, 41, 50, 51, 90, 91, 110, 111, 130, 131].map(hrPoints), [3, 1, 1, 0, 0, 1, 1, 2, 2, 3]);
    assert.deepEqual([35.0, 35.1, 36.0, 36.1, 38.0, 38.1, 39.0, 39.1].map(tempPoints), [3, 1, 1, 0, 0, 1, 1, 2]);
});

test('NEWS2 SpO2 scale 2', () => {
    assert.deepEqual([83, 84, 85, 86, 87, 88, 92].map((s) => spo2Scale2Points(s, false)), [3, 2, 2, 1, 1, 0, 0]);
    // 93 and above on air scores 0; on oxygen 93-94 = 1, 95-96 = 2, 97+ = 3
    assert.deepEqual([93, 97, 100].map((s) => spo2Scale2Points(s, false)), [0, 0, 0]);
    assert.deepEqual([93, 94, 95, 96, 97].map((s) => spo2Scale2Points(s, true)), [1, 1, 2, 2, 3]);
});

test('NEWS2 total, completeness and single red', () => {
    const normal = news2({ rr: 16, spo2: 98, oxygen: 'Air', sbp: 125, hr: 72, acvpu: 'A', temp: 36.8 });
    assert.equal(normal.score, 0);
    assert.equal(normal.complete, true);
    const sick = news2({ rr: 26, spo2: 92, oxygen: 'Oxygen', sbp: 95, hr: 118, acvpu: 'C', temp: 38.6 });
    assert.equal(sick.score, 3 + 2 + 2 + 2 + 2 + 3 + 1);
    const red = news2({ rr: 16, spo2: 98, oxygen: 'Air', sbp: 125, hr: 72, acvpu: 'V', temp: 36.8 });
    assert.equal(red.score, 3);
    assert.equal(red.singleRed, true);
    const partial = news2({ rr: 16 });
    assert.equal(partial.complete, false);
    assert.ok(partial.missing.includes('SpO2'));
});

test('NEWS2 response levels', () => {
    assert.match(news2Response(0, false).monitoring, /12 hours/);
    assert.match(news2Response(3, false).monitoring, /4 to 6 hours/);
    assert.match(news2Response(3, true).monitoring, /hourly/);
    assert.equal(news2Response(5, false).level, 'Medium');
    assert.equal(news2Response(7, false).level, 'High');
    assert.match(news2Response(7, false).monitoring, /Continuous/);
});

test('BMI and weight change', () => {
    assert.equal(bmi(70, 175), 22.9);
    assert.equal(bmi('', 175), null);
    assert.equal(weightChangePercent(80, 72), 10);
    assert.equal(weightChangePercent(70, 73.5), -5);
    assert.equal(weightChangePercent(0, 70), null);
});

test('dates', () => {
    assert.equal(daysSince('2026-10-24', new Date(2026, 9, 26, 9, 0)), 2);
    assert.equal(daysSince('2026-10-26', new Date(2026, 9, 26, 23, 59)), 0);
    // across the October clock change
    assert.equal(daysSince('2026-10-24', new Date(2026, 9, 27, 1, 0)), 3);
    assert.equal(daysSince('bad'), null);
    assert.equal(formatDateTime('2026-10-26T14:05'), '26/10/2026 14:05');
});

test('VIP table has 0 to 5', () => {
    assert.deepEqual(VIP.map((v) => v.score), [0, 1, 2, 3, 4, 5]);
});

test('identifier warning', () => {
    assert.deepEqual(findIdentifiers('Pressure area to sacrum'), []);
    assert.ok(findIdentifiers('NHS 943 476 5919').length);
    assert.ok(findIdentifiers('9434765919').length);
    assert.ok(findIdentifiers('Spoke to Mrs Smith').length);
    assert.ok(findIdentifiers('lives at B15 2TH').length);
    assert.ok(findIdentifiers('call 07700 900123').length);
    assert.ok(findIdentifiers('DOB 1/1/50').length);
    // ordinary clinical text should not trigger
    assert.deepEqual(findIdentifiers('BP 132/80 lying, 118/76 standing at 1 min. 12 Ch catheter. NEWS2 5 at 14:05'), []);
});
