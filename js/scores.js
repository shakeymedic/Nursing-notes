// scores.js - pure calculations used by the note templates. No DOM, so the tests can import it.

const has = (v) => v !== undefined && v !== null && v !== '' && !Number.isNaN(Number(v));

// ---------------------------------------------------------------------------------------------
// NEWS2 (Royal College of Physicians, 2017). Adults 16 and over; not validated in pregnancy.
// ---------------------------------------------------------------------------------------------
export function rrPoints(rr) {
    if (rr <= 8) return 3;
    if (rr <= 11) return 1;
    if (rr <= 20) return 0;
    if (rr <= 24) return 2;
    return 3;
}

export function spo2Scale1Points(s) {
    if (s <= 91) return 3;
    if (s <= 93) return 2;
    if (s <= 95) return 1;
    return 0;
}

// Scale 2 is only for patients with a prescribed target of 88-92% (e.g. hypercapnic respiratory
// failure). Readings of 93% and above score only when the patient is on oxygen.
export function spo2Scale2Points(s, onOxygen) {
    if (s <= 83) return 3;
    if (s <= 85) return 2;
    if (s <= 87) return 1;
    if (s <= 92) return 0;
    if (!onOxygen) return 0;
    if (s <= 94) return 1;
    if (s <= 96) return 2;
    return 3;
}

export function sbpPoints(sbp) {
    if (sbp <= 90) return 3;
    if (sbp <= 100) return 2;
    if (sbp <= 110) return 1;
    if (sbp <= 219) return 0;
    return 3;
}

export function hrPoints(hr) {
    if (hr <= 40) return 3;
    if (hr <= 50) return 1;
    if (hr <= 90) return 0;
    if (hr <= 110) return 1;
    if (hr <= 130) return 2;
    return 3;
}

export function tempPoints(t) {
    if (t <= 35.0) return 3;
    if (t <= 36.0) return 1;
    if (t <= 38.0) return 0;
    if (t <= 39.0) return 1;
    return 2;
}

// obs: { rr, spo2, scale2 (bool), oxygen ('Air' | 'Oxygen'), sbp, hr, acvpu ('A','C','V','P','U'), temp }
export function news2(obs) {
    const parts = [];
    const missing = [];
    const add = (label, value, points) => parts.push({ label, value, points });

    if (has(obs.rr)) add('RR', obs.rr, rrPoints(Number(obs.rr))); else missing.push('RR');
    if (has(obs.spo2)) {
        const s = Number(obs.spo2);
        add(obs.scale2 ? 'SpO2 (scale 2)' : 'SpO2', s,
            obs.scale2 ? spo2Scale2Points(s, obs.oxygen === 'Oxygen') : spo2Scale1Points(s));
    } else missing.push('SpO2');
    if (obs.oxygen === 'Air' || obs.oxygen === 'Oxygen') add(obs.oxygen === 'Oxygen' ? 'On oxygen' : 'Air', '', obs.oxygen === 'Oxygen' ? 2 : 0);
    else missing.push('air or oxygen');
    if (has(obs.sbp)) add('Systolic BP', obs.sbp, sbpPoints(Number(obs.sbp))); else missing.push('systolic BP');
    if (has(obs.hr)) add('HR', obs.hr, hrPoints(Number(obs.hr))); else missing.push('HR');
    if (obs.acvpu) add('ACVPU', obs.acvpu, obs.acvpu === 'A' ? 0 : 3); else missing.push('consciousness');
    if (has(obs.temp)) add('Temp', obs.temp, tempPoints(Number(obs.temp))); else missing.push('temperature');

    const score = parts.reduce((s, p) => s + p.points, 0);
    return {
        score,
        parts,
        missing,
        complete: missing.length === 0,
        singleRed: parts.some((p) => p.points === 3)
    };
}

// RCP NEWS2 trigger levels and minimum monitoring frequency.
export function news2Response(score, singleRed) {
    if (score >= 7) return {
        level: 'High',
        monitoring: 'Continuous monitoring of vital signs',
        response: 'Emergency response: registered nurse to inform the medical team immediately; emergency assessment by a team with critical care competencies (e.g. critical care outreach), including airway skills. Consider transfer to a higher level of care.'
    };
    if (score >= 5) return {
        level: 'Medium',
        monitoring: 'At least hourly',
        response: 'Urgent response: registered nurse to inform the medical team immediately; urgent review by a clinician or team with competencies in assessing acutely ill patients. Care in an area with monitoring facilities.'
    };
    if (singleRed) return {
        level: 'Low-medium (a single parameter scores 3)',
        monitoring: 'At least hourly',
        response: 'Registered nurse to inform the medical team, who will review and decide whether escalation is needed.'
    };
    if (score >= 1) return {
        level: 'Low',
        monitoring: 'At least every 4 to 6 hours',
        response: 'Registered nurse to assess and decide whether monitoring should be increased or the patient escalated.'
    };
    return {
        level: 'Low',
        monitoring: 'At least every 12 hours',
        response: 'Continue routine NEWS2 monitoring.'
    };
}

// ---------------------------------------------------------------------------------------------
// Nutrition helpers. These are arithmetic only: the MUST score itself is recorded from the
// nurse's own MUST form (MUST is (c) BAPEN; adaptation needs their written permission).
// ---------------------------------------------------------------------------------------------
export function bmi(weightKg, heightCm) {
    if (!has(weightKg) || !has(heightCm)) return null;
    const w = Number(weightKg);
    const h = Number(heightCm) / 100;
    if (w <= 0 || h <= 0) return null;
    return Math.round((w / (h * h)) * 10) / 10;
}

// Positive = weight lost, negative = weight gained, as a percentage of the earlier weight.
export function weightChangePercent(previousKg, nowKg) {
    if (!has(previousKg) || !has(nowKg)) return null;
    const p = Number(previousKg);
    const n = Number(nowKg);
    if (p <= 0 || n <= 0) return null;
    return Math.round(((p - n) / p) * 1000) / 10;
}

// ---------------------------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------------------------
// Whole calendar days between an ISO date (yyyy-mm-dd) and a reference Date.
export function daysSince(isoDate, now = new Date()) {
    if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
    const [y, m, d] = isoDate.split('-').map(Number);
    const start = Date.UTC(y, m - 1, d);
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((today - start) / 86400000);
}

export function formatDate(isoDate) {
    if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate || '';
    const [y, m, d] = isoDate.split('-');
    return `${d}/${m}/${y}`;
}

// 'yyyy-mm-ddThh:mm' (datetime-local) -> 'dd/mm/yyyy hh:mm'
export function formatDateTime(local) {
    if (!local || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(local)) return local || '';
    return `${formatDate(local.slice(0, 10))} ${local.slice(11, 16)}`;
}

// ---------------------------------------------------------------------------------------------
// Visual Infusion Phlebitis (VIP) score, devised by Andrew Jackson (Rotherham). Wording paraphrased.
// ---------------------------------------------------------------------------------------------
export const VIP = [
    { score: 0, signs: 'IV site appears healthy', stage: 'No signs of phlebitis', action: 'Observe cannula' },
    { score: 1, signs: 'one of: slight pain near the site, or slight redness near the site', stage: 'Possibly first signs of phlebitis', action: 'Observe cannula' },
    { score: 2, signs: 'two of: pain at the site, redness, swelling', stage: 'Early stage of phlebitis', action: 'Resite cannula' },
    { score: 3, signs: 'all of: pain along the path of the cannula, redness, induration', stage: 'Medium stage of phlebitis', action: 'Resite cannula and consider treatment' },
    { score: 4, signs: 'all of: pain along the path of the cannula, redness, induration, palpable venous cord', stage: 'Advanced stage of phlebitis or start of thrombophlebitis', action: 'Resite cannula and consider treatment' },
    { score: 5, signs: 'all of: pain along the path of the cannula, redness, induration, palpable venous cord, pyrexia', stage: 'Advanced stage of thrombophlebitis', action: 'Start treatment and resite cannula' }
];

// ---------------------------------------------------------------------------------------------
// Possible patient identifiers in free text. A prompt only: it cannot catch everything.
// ---------------------------------------------------------------------------------------------
const ID_PATTERNS = [
    { kind: 'an NHS-number-like number', re: /\b\d{3}[ -]?\d{3}[ -]?\d{4}\b/ },
    { kind: 'a phone number', re: /\b(?:\+44\s?7\d{3}|07\d{3})\s?\d{3}\s?\d{3}\b/ },
    { kind: 'an email address', re: /[^\s@]+@[^\s@]+\.[a-z]{2,}/i },
    { kind: 'a postcode', re: /\b[A-Z]{1,2}\d[A-Z\d]?\s+\d[A-Z]{2}\b/ },
    { kind: 'a name with a title', re: /\b(?:Mr|Mrs|Ms|Miss|Mx|Master)\.?\s+[A-Z][a-z]+/ },
    { kind: 'a date of birth', re: /\b(?:DOB|D\.O\.B|date of birth)\b/i },
    { kind: 'a hospital number', re: /\b(?:MRN|hospital (?:no|number)|unit (?:no|number))\b/i }
];

export function findIdentifiers(text) {
    if (!text) return [];
    return ID_PATTERNS.filter((p) => p.re.test(text)).map((p) => p.kind);
}
