// app.js - screens and form handling. Answers live in memory only: nothing about the patient
// is written to storage or sent over the network.

import { TEMPLATES, SOURCES } from './templates.js';
import { renderNote, freeText, isVisible } from './note.js';
import { findIdentifiers } from './scores.js';

export const VERSION = '1.0.0';

const main = document.getElementById('main');
document.getElementById('version').textContent = VERSION;

// Small, non-patient preferences only (theme, the nurse's own role label).
const prefs = {
    get(k) { try { return localStorage.getItem('nn-' + k) || ''; } catch (e) { return ''; } },
    set(k, v) { try { if (v) localStorage.setItem('nn-' + k, v); else localStorage.removeItem('nn-' + k); } catch (e) { /* ignore */ } }
};

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------
function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (v === undefined || v === null || v === false) continue;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) {
        if (c === null || c === undefined || c === false) continue;
        node.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return node;
}

function nowLocal() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
}

function fieldDomId(f) { return 'f-' + f.id; }

// ---------------------------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------------------------
function renderHome() {
    document.title = 'Nursing Notes';
    main.replaceChildren(
        el('section', { class: 'intro' },
            el('h1', { text: 'Write clear nursing notes, faster' }),
            el('p', { text: 'Pick a task, tick what you did and found, then copy the finished note into the electronic record. Every note starts with the time of care.' })
        ),
        el('ul', { class: 'template-list', role: 'list' },
            TEMPLATES.map((t) => el('li', {},
                el('a', { class: 'template-card', href: `#t/${t.id}` },
                    el('span', { class: 'template-icon', 'aria-hidden': 'true', text: t.icon }),
                    el('span', { class: 'template-text' },
                        el('strong', { text: t.title }),
                        el('span', { text: t.blurb })
                    )
                )
            ))
        )
    );
}

// ---------------------------------------------------------------------------------------------
// Template screen
// ---------------------------------------------------------------------------------------------
let state = null; // { template, values, header, refs }

function renderTemplate(template) {
    document.title = `${template.title} - Nursing Notes`;
    state = {
        template,
        values: { __now: new Date() },
        header: { timeOfCare: nowLocal(), retrospective: false, role: prefs.get('role') },
        refs: {}
    };

    const form = el('form', { class: 'note-form', autocomplete: 'off', onsubmit: (e) => e.preventDefault() });

    form.append(el('div', { class: 'card header-card' },
        el('div', { class: 'row' },
            el('label', { class: 'field grow' },
                el('span', { class: 'label', text: 'Time of care' }),
                el('input', { type: 'datetime-local', id: 'timeOfCare', value: state.header.timeOfCare,
                    oninput: (e) => { state.header.timeOfCare = e.target.value; update(); } })
            ),
            el('button', { type: 'button', class: 'btn small', text: 'Now', onclick: () => {
                state.header.timeOfCare = nowLocal();
                document.getElementById('timeOfCare').value = state.header.timeOfCare;
                update();
            } })
        ),
        el('label', { class: 'flag' },
            el('input', { type: 'checkbox', id: 'retro', onchange: (e) => { state.header.retrospective = e.target.checked; update(); } }),
            el('span', { text: 'Written in retrospect' })
        ),
        el('label', { class: 'field' },
            el('span', { class: 'label', text: 'Your role (optional)' }),
            el('input', { type: 'text', id: 'role', value: state.header.role, placeholder: 'e.g. Staff nurse, Band 5',
                oninput: (e) => { state.header.role = e.target.value; prefs.set('role', e.target.value.trim()); update(); } }),
            el('span', { class: 'hint', text: 'Remembered on this device. Your EPR login records who you are.' })
        )
    ));

    if (template.intro) form.append(el('p', { class: 'callout neutral', text: template.intro }));

    for (const section of template.sections) {
        const card = el('fieldset', { class: 'card section' }, el('legend', { text: section.title }));
        for (const field of section.fields) card.append(renderField(field));
        form.append(card);
    }

    form.append(el('div', { class: 'card sources' },
        el('h2', { text: 'Based on' }),
        el('ul', {}, template.sources.map((k) => el('li', {}, el('a', { href: SOURCES[k].url, target: '_blank', rel: 'noopener', text: SOURCES[k].label }))))
    ));

    const preview = el('aside', { class: 'preview', 'aria-label': 'Your note' },
        el('div', { class: 'preview-head' },
            el('h2', { text: 'Your note' }),
            el('div', { class: 'preview-actions' },
                el('button', { type: 'button', class: 'btn primary', id: 'copyBtn', text: 'Copy note', onclick: copyNote }),
                el('button', { type: 'button', class: 'btn', id: 'clearBtn', text: 'Clear', onclick: clearForm })
            )
        ),
        el('div', { id: 'idWarning', class: 'callout red', role: 'alert', hidden: true }),
        el('pre', { id: 'noteText', class: 'note-text', tabindex: '0' }),
        el('p', { id: 'copyStatus', class: 'status', 'aria-live': 'polite' })
    );

    main.replaceChildren(
        el('nav', { class: 'crumbs' }, el('a', { href: '#', text: '← All notes' })),
        el('h1', { class: 'template-title' }, el('span', { 'aria-hidden': 'true', text: template.icon + ' ' }), template.title),
        el('div', { class: 'layout' }, form, preview),
        el('div', { class: 'copy-bar' },
            el('button', { type: 'button', class: 'btn primary wide', id: 'copyBarBtn', text: 'Copy note', onclick: copyNote }),
            el('a', { class: 'btn', href: '#note-anchor', text: 'View note', onclick: (e) => {
                e.preventDefault(); document.getElementById('noteText').scrollIntoView({ behavior: 'smooth', block: 'center' });
            } })
        )
    );
    update();
    main.focus();
}

function setValue(id, value) {
    state.values[id] = value;
    update();
}

function renderField(field) {
    const v = state.values;
    const wrap = el('div', { class: `field-wrap type-${field.type}`, 'data-field': field.id });
    state.refs[field.id] = { field, wrap };
    const add = (...nodes) => wrap.append(...nodes.filter(Boolean));
    const hint = field.hint ? el('span', { class: 'hint', id: fieldDomId(field) + '-hint', text: field.hint }) : null;
    const describedBy = hint ? fieldDomId(field) + '-hint' : undefined;

    switch (field.type) {
        case 'flag':
            add(el('label', { class: 'flag' },
                el('input', { type: 'checkbox', id: fieldDomId(field), onchange: (e) => setValue(field.id, e.target.checked) }),
                el('span', { text: field.label })
            ));
            break;

        case 'checks': {
            v[field.id] = [];
            const group = el('div', { class: 'pills', role: 'group', 'aria-labelledby': fieldDomId(field) + '-label' });
            const boxes = field.options.map((opt) => {
                const box = el('input', { type: 'checkbox', value: opt, onchange: () => {
                    setValue(field.id, boxes.filter((b) => b.checked).map((b) => b.value));
                } });
                group.append(el('label', { class: 'pill' }, box, el('span', { text: opt })));
                return box;
            });
            const head = el('div', { class: 'label-row' }, el('span', { class: 'label', id: fieldDomId(field) + '-label', text: field.label }));
            if (field.selectAll) {
                head.append(el('button', { type: 'button', class: 'link-btn', text: 'Tick all', onclick: () => {
                    const all = boxes.every((b) => b.checked);
                    boxes.forEach((b) => { b.checked = !all; });
                    setValue(field.id, boxes.filter((b) => b.checked).map((b) => b.value));
                } }));
            }
            add(head, hint, group);
            break;
        }

        case 'choice': {
            const group = el('div', { class: 'pills', role: 'radiogroup', 'aria-labelledby': fieldDomId(field) + '-label' });
            const buttons = field.options.map((opt, i) => {
                const b = el('button', { type: 'button', class: 'pill choice', role: 'radio', 'aria-checked': 'false', 'data-value': opt,
                    onclick: () => {
                        const next = state.values[field.id] === opt ? '' : opt; // tap again to clear
                        buttons.forEach((x) => x.setAttribute('aria-checked', String(x.dataset.value === next)));
                        setValue(field.id, next);
                    } },
                el('span', { text: opt }),
                field.optionHints ? el('small', { text: field.optionHints[i] }) : null);
                group.append(b);
                return b;
            });
            add(el('span', { class: 'label', id: fieldDomId(field) + '-label', text: field.label }), hint, group);
            break;
        }

        case 'select':
            add(el('label', { class: 'field' },
                el('span', { class: 'label', text: field.label }),
                el('select', { id: fieldDomId(field), 'aria-describedby': describedBy, onchange: (e) => setValue(field.id, e.target.value) },
                    field.options.map((o) => el('option', { value: o, text: o || 'Choose…' })))
            ), hint);
            break;

        case 'textarea':
            add(el('label', { class: 'field' },
                el('span', { class: 'label', text: field.label }),
                el('textarea', { id: fieldDomId(field), rows: '3', 'aria-describedby': describedBy, placeholder: field.hint || '',
                    oninput: (e) => setValue(field.id, e.target.value) })
            ));
            break;

        case 'number':
        case 'text':
        case 'date':
        case 'time': {
            const input = el('input', {
                type: field.type === 'number' ? 'text' : field.type,
                inputmode: field.type === 'number' ? 'decimal' : undefined,
                id: fieldDomId(field), 'aria-describedby': describedBy,
                oninput: (e) => setValue(field.id, field.type === 'number' ? cleanNumber(e.target.value) : e.target.value)
            });
            add(el('label', { class: 'field' + (field.type === 'number' ? ' number' : '') },
                el('span', { class: 'label', text: field.label }),
                el('span', { class: 'input-unit' }, input, field.unit ? el('span', { class: 'unit', text: field.unit }) : null)
            ), hint);
            break;
        }

        case 'rows': {
            v[field.id] = [];
            const list = el('div', { class: 'rows' });
            const addBtn = el('button', { type: 'button', class: 'btn small', text: '+ ' + (field.addLabel || 'Add'), onclick: () => {
                state.values[field.id].push({});
                drawRows();
                update();
                const selects = list.querySelectorAll('select');
                if (selects.length) selects[selects.length - field.columns.filter((c) => c.type === 'select').length].focus();
            } });
            function drawRows() {
                list.replaceChildren(...state.values[field.id].map((row, idx) => el('div', { class: 'row-item' },
                    field.columns.map((c) => el('label', { class: 'field' },
                        el('span', { class: 'label', text: c.label }),
                        c.type === 'select'
                            ? el('select', { onchange: (e) => { row[c.id] = e.target.value; update(); } },
                                c.options.map((o) => el('option', { value: o, text: o || '-', selected: row[c.id] === o })))
                            : el('input', { type: 'text', value: row[c.id] || '', oninput: (e) => { row[c.id] = e.target.value; update(); } })
                    )),
                    el('button', { type: 'button', class: 'link-btn', text: 'Remove', 'aria-label': `Remove area ${idx + 1}`, onclick: () => {
                        state.values[field.id].splice(idx, 1);
                        drawRows();
                        update();
                    } })
                )));
            }
            add(el('span', { class: 'label', text: field.label }), list, addBtn);
            break;
        }

        case 'computed':
            add(el('div', { class: 'computed', 'aria-live': 'polite' },
                el('span', { class: 'label', text: field.label }),
                el('output', { id: fieldDomId(field), class: 'computed-value', text: '-' })
            ));
            break;

        case 'advice':
            add(el('p', { class: 'callout', id: fieldDomId(field), 'aria-live': 'polite' }));
            break;
    }
    return wrap;
}

function cleanNumber(s) {
    const t = String(s).replace(',', '.').trim();
    return t === '' || Number.isNaN(Number(t)) ? '' : t;
}

// Re-evaluate visibility, worked-out values and the note after every change.
function update() {
    const { template, values, header, refs } = state;
    values.__now = new Date();

    for (const { field, wrap } of Object.values(refs)) {
        const visible = isVisible(field, values);
        wrap.hidden = !visible;
        if (field.type === 'computed') {
            const r = visible ? field.compute(values) : null;
            const out = wrap.querySelector('output');
            out.textContent = r ? r.text : '-';
            out.dataset.tone = r ? r.tone : '';
        }
        if (field.type === 'advice') {
            const r = visible ? field.compute(values) : null;
            const p = wrap.querySelector('p');
            wrap.hidden = !r;
            p.textContent = r ? r.text : '';
            p.className = 'callout ' + (r ? r.tone : '');
        }
    }

    const { text, empty } = renderNote(template, values, {
        timeOfCare: header.timeOfCare, retrospective: header.retrospective, role: header.role.trim()
    });
    const pre = document.getElementById('noteText');
    pre.textContent = empty ? text + '\n\n(Fill in the form to build your note.)' : text;
    pre.dataset.empty = String(empty);

    const ids = findIdentifiers(freeText(template, values) + '\n' + header.role);
    const warn = document.getElementById('idWarning');
    warn.hidden = ids.length === 0;
    warn.textContent = ids.length ? `This looks like it may contain ${ids.join(', ')}. Please remove patient details before copying.` : '';
}

async function copyNote() {
    const { template, values, header } = state;
    const { text, empty } = renderNote(template, values, {
        timeOfCare: header.timeOfCare, retrospective: header.retrospective, role: header.role.trim()
    });
    const status = document.getElementById('copyStatus');
    if (empty) { status.textContent = 'Nothing to copy yet: fill in the form first.'; return; }
    let ok = false;
    try {
        await navigator.clipboard.writeText(text);
        ok = true;
    } catch (e) {
        // Older browsers or blocked clipboard: select the text so it can be copied by hand.
        const range = document.createRange();
        range.selectNodeContents(document.getElementById('noteText'));
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
    }
    status.textContent = ok ? 'Copied. Paste it into the record and check it before saving.' : 'Could not copy automatically. The note is selected: copy it by hand.';
    for (const id of ['copyBtn', 'copyBarBtn']) {
        const b = document.getElementById(id);
        if (b && ok) { b.textContent = 'Copied ✓'; setTimeout(() => { b.textContent = 'Copy note'; }, 2000); }
    }
}

function clearForm() {
    const btn = document.getElementById('clearBtn');
    if (btn.dataset.confirm !== 'yes') {
        btn.dataset.confirm = 'yes';
        btn.textContent = 'Tap again to clear';
        setTimeout(() => { if (btn.isConnected) { btn.dataset.confirm = ''; btn.textContent = 'Clear'; } }, 3000);
        return;
    }
    renderTemplate(state.template);
    document.getElementById('copyStatus').textContent = 'Cleared.';
}

// ---------------------------------------------------------------------------------------------
// Routing and theme
// ---------------------------------------------------------------------------------------------
function route() {
    const m = location.hash.match(/^#t\/([\w-]+)/);
    const t = m && TEMPLATES.find((x) => x.id === m[1]);
    if (t) renderTemplate(t);
    else { state = null; renderHome(); }
    window.scrollTo(0, 0);
}

window.addEventListener('hashchange', route);
window.addEventListener('beforeunload', (e) => {
    // Warn before losing an unfinished note (answers are never saved).
    if (state && Object.entries(state.values).some(([k, v]) => k !== '__now' && (Array.isArray(v) ? v.length : v))) {
        e.preventDefault();
        e.returnValue = '';
    }
});

document.getElementById('themeBtn').addEventListener('click', () => {
    const root = document.documentElement;
    const current = root.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = current === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    prefs.set('theme', next);
});

route();
