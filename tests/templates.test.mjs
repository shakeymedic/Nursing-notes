import test from 'node:test';
import assert from 'node:assert/strict';
import { TEMPLATES, SOURCES } from '../js/templates.js';
import { renderNote, fieldLines } from '../js/note.js';

const TYPES = new Set(['flag', 'checks', 'choice', 'select', 'text', 'number', 'date', 'time', 'textarea', 'rows', 'computed', 'advice']);

test('every template is well formed', () => {
    const ids = new Set();
    for (const t of TEMPLATES) {
        assert.ok(!ids.has(t.id), `duplicate template id ${t.id}`);
        ids.add(t.id);
        assert.ok(t.title && t.blurb && t.sections.length, t.id);
        for (const s of t.sources) assert.ok(SOURCES[s], `${t.id}: unknown source ${s}`);
        const fieldIds = new Set();
        for (const sec of t.sections) {
            for (const f of sec.fields) {
                assert.ok(TYPES.has(f.type), `${t.id}.${f.id}: bad type ${f.type}`);
                assert.ok(!fieldIds.has(f.id), `${t.id}: duplicate field ${f.id}`);
                fieldIds.add(f.id);
                if (['checks', 'choice', 'select'].includes(f.type)) assert.ok(f.options.length > 1, `${t.id}.${f.id}`);
                if (['computed', 'advice'].includes(f.type)) assert.equal(typeof f.compute, 'function');
            }
        }
    }
});

test('the list Jake asked for is all there', () => {
    const ids = TEMPLATES.map((t) => t.id);
    for (const id of ['first-contact', 'deteriorating', 'skin', 'nutrition', 'falls', 'comfort', 'cannula', 'catheter', 'handover', 'declined']) {
        assert.ok(ids.includes(id), id);
    }
});

test('empty form gives an empty note; computed fields cope with no answers', () => {
    for (const t of TEMPLATES) {
        const r = renderNote(t, { __now: new Date() }, {});
        assert.equal(r.empty, true, t.id);
        assert.match(r.text, new RegExp(`^Nursing note: ${t.title.replace(/[()]/g, '\\$&')}`));
    }
});

test('deteriorating patient note', () => {
    const t = TEMPLATES.find((x) => x.id === 'deteriorating');
    const v = {
        __now: new Date(), rr: '26', spo2: '92', spo2scale: 'Scale 1', oxygen: 'Oxygen', o2detail: 'nasal cannulae 2 L/min',
        sbp: '95', dbp: '60', hr: '118', acvpu: 'Confusion (new)', temp: '38.6', prevNews: '4',
        concerns: ['Could this be an infection (think sepsis)'], escalatedTo: ['Ward doctor', 'Critical care outreach'], escTime: '14:10',
        sbarUsed: true, situation: 'NEWS2 15, new confusion'
    };
    const { text } = renderNote(t, v, { timeOfCare: '2026-10-26T14:05', role: 'Staff nurse' });
    assert.match(text, /Time of care: 26\/10\/2026 14:05/);
    assert.match(text, /- NEWS2: 15, high clinical risk/);
    assert.match(text, /Trend: Rising \(up 11 from 4\)/);
    assert.match(text, /Oxygen device and flow: nasal cannulae 2 L\/min/);
    assert.match(text, /Escalated to: Ward doctor; Critical care outreach/);
    assert.match(text, /Handed over using SBAR\./);
    assert.match(text, /Recorded by: Staff nurse/);
    assert.doesNotMatch(text, /RCP response/); // advice is screen only
    assert.doesNotMatch(text, /SpO2 scale:/);  // print: false
});

test('scale 2 on air at 95% scores 0 for SpO2', () => {
    const t = TEMPLATES.find((x) => x.id === 'deteriorating');
    const f = t.sections[1].fields.find((x) => x.id === 'newsResult');
    const v = { rr: '18', spo2: '95', spo2scale: 'Scale 2', oxygen: 'Air', sbp: '130', hr: '80', acvpu: 'Alert', temp: '37' };
    assert.match(f.compute(v).text, /^0, low/);
});

test('skin note lists damage rows and hides advice', () => {
    const t = TEMPLATES.find((x) => x.id === 'skin');
    const v = { tool: 'Waterlow', score: '15 (high risk)', damage: [{ site: 'Sacrum', side: 'Midline', finding: 'Category 2', size: '2 x 1 cm' }, {}] };
    const { text } = renderNote(t, v, {});
    assert.match(text, /Areas of concern:\n {2}\* Sacrum, Midline, Category 2, 2 x 1 cm/);
    assert.doesNotMatch(text, /report and refer/);
});

test('nutrition note works out BMI and weight change', () => {
    const t = TEMPLATES.find((x) => x.id === 'nutrition');
    const { text } = renderNote(t, { weight: '63', height: '170', prevWeight: '70', prevWhen: '3 months ago', mustScore: '2', mustRisk: 'High' }, {});
    assert.match(text, /BMI: 21\.8 kg\/m²/);
    assert.match(text, /Weight change: 10% lost since 3 months ago \(70 kg to 63 kg\)/);
    assert.match(text, /MUST score: 2/);
});

test('cannula note prints VIP wording and dwell time', () => {
    const t = TEMPLATES.find((x) => x.id === 'cannula');
    const { text } = renderNote(t, { __now: new Date(2026, 9, 26), site: 'Forearm', side: 'Left', inserted: '2026-10-23', vip: '2' }, {});
    assert.match(text, /In place for: 3 days \(inserted 23\/10\/2026\)/);
    assert.match(text, /VIP score: 2 \(two of: pain at the site, redness, swelling\)\. Early stage of phlebitis\./);
});

test('hidden fields do not print', () => {
    const t = TEMPLATES.find((x) => x.id === 'first-contact');
    const { text } = renderNote(t, { allergy: 'No known allergies', allergyDetail: 'penicillin' }, {});
    assert.doesNotMatch(text, /penicillin/);
});

test('multi-line free text is indented', () => {
    const f = { id: 'plan', type: 'textarea', label: 'Plan' };
    assert.deepEqual(fieldLines(f, { plan: 'one\ntwo' }), ['Plan:', '  one', '  two']);
});
