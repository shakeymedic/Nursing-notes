// note.js - turns a template and the answers into plain text for pasting into the EPR.
// Pure (no DOM), so the tests can run it in Node.

import { formatDateTime, formatDate } from './scores.js';

export function isVisible(field, values) {
    return typeof field.showIf === 'function' ? !!field.showIf(values) : true;
}

function hasValue(v) {
    if (v === undefined || v === null || v === false) return false;
    if (Array.isArray(v)) return v.length > 0;
    return String(v).trim() !== '';
}

// One field -> zero or more lines (without the leading "- ").
export function fieldLines(field, values) {
    if (field.print === false || field.type === 'advice') return [];
    if (!isVisible(field, values)) return [];
    const raw = values[field.id];
    const unit = field.unit ? (field.unit.startsWith('/') || field.unit === '%' || field.unit === '°C' ? field.unit : ` ${field.unit}`) : '';

    switch (field.type) {
        case 'computed': {
            const r = field.compute(values);
            return r && r.text ? [`${field.label}: ${r.text}`] : [];
        }
        case 'flag':
            return raw === true ? [field.note || field.label] : [];
        case 'checks':
            return hasValue(raw) ? [`${field.label}: ${raw.join('; ')}`] : [];
        case 'rows': {
            const rows = (Array.isArray(raw) ? raw : []).filter((r) => field.columns.some((c) => hasValue(r[c.id])));
            if (!rows.length) return [];
            return [`${field.label}:`].concat(rows.map((r) => '  * ' + field.columns
                .map((c) => (hasValue(r[c.id]) ? String(r[c.id]).trim() : ''))
                .filter(Boolean).join(', ')));
        }
        case 'date':
            return hasValue(raw) ? [`${field.label}: ${formatDate(raw)}`] : [];
        case 'textarea': {
            if (!hasValue(raw)) return [];
            const text = String(raw).trim();
            return text.includes('\n') ? [`${field.label}:`, ...text.split('\n').map((l) => '  ' + l)] : [`${field.label}: ${text}`];
        }
        default:
            return hasValue(raw) ? [`${field.label}: ${String(raw).trim()}${unit}`] : [];
    }
}

// opts: { timeOfCare: 'yyyy-mm-ddThh:mm', role: 'RN' }
export function renderNote(template, values, opts = {}) {
    const out = [`Nursing note: ${template.title}`];
    if (opts.timeOfCare) out.push(`Time of care: ${formatDateTime(opts.timeOfCare)}`);
    if (opts.retrospective) out.push('Written in retrospect.');

    let body = 0;
    for (const section of template.sections) {
        const lines = section.fields.flatMap((f) => fieldLines(f, values));
        if (!lines.length) continue;
        body += lines.length;
        out.push('', section.title);
        for (const l of lines) out.push(l.startsWith('  ') ? l : `- ${l}`);
    }
    if (opts.role) out.push('', `Recorded by: ${opts.role}`);
    return { text: out.join('\n'), empty: body === 0 };
}

// All free text the nurse typed, for the identifier check.
export function freeText(template, values) {
    const parts = [];
    for (const s of template.sections) {
        for (const f of s.fields) {
            const v = values[f.id];
            if (['text', 'textarea'].includes(f.type) && typeof v === 'string') parts.push(v);
            if (f.type === 'rows' && Array.isArray(v)) v.forEach((r) => Object.values(r).forEach((x) => typeof x === 'string' && parts.push(x)));
        }
    }
    return parts.join('\n');
}
