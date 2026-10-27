// app.js - screens and form handling. Answers live in memory only: nothing about the patient
// is written to storage or sent over the network.

import { TEMPLATES, SOURCES } from './templates.js';
import { renderNote, freeText, isVisible } from './note.js';
import { findIdentifiers } from './scores.js';
import { icon } from './icons.js';

export const VERSION = '1.1.1';

const GROUPS = ['Acute care', 'Assessments', 'Routine care', 'Communication'];
const main = document.getElementById('main');
document.getElementById('version').textContent = VERSION;

// Small, non-patient preferences only: theme, the nurse's own role label, note format and
// which templates were used recently (template names, never answers).
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

const fieldDomId = (f) => 'f-' + f.id;
const sectionId = (i) => 'sec-' + (i + 1);

function hasAnswer(v) {
    if (v === undefined || v === null || v === false || v === '') return false;
    if (Array.isArray(v)) return v.length > 0 && v.some((r) => typeof r !== 'object' || Object.values(r).some(Boolean));
    return true;
}

function recent() {
    return prefs.get('recent').split(',').filter((id) => TEMPLATES.some((t) => t.id === id));
}
function addRecent(id) {
    prefs.set('recent', [id, ...recent().filter((x) => x !== id)].slice(0, 4).join(','));
}

// ---------------------------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------------------------
function templateCard(t, compact = false) {
    return el('li', { 'data-search': `${t.title} ${t.blurb} ${t.group}`.toLowerCase() },
        el('a', { class: 'template-card' + (compact ? ' compact' : ''), href: `#t/${t.id}` },
            el('span', { class: `template-icon g-${t.group.split(' ')[0].toLowerCase()}` }, icon(t.icon, 22)),
            el('span', { class: 'template-text' },
                el('strong', { text: t.title }),
                compact ? null : el('span', { text: t.blurb })
            ),
            el('span', { class: 'chev' }, icon('chevron-right', 18))
        )
    );
}

function renderHome() {
    document.title = 'Nursing Notes';
    const search = el('input', { type: 'search', id: 'search', placeholder: 'Find a note, e.g. skin, NEWS2, cannula', 'aria-label': 'Find a note',
        oninput: (e) => filterHome(e.target.value) });
    const rec = recent();

    main.replaceChildren(...[
        el('section', { class: 'hero' },
            el('div', { class: 'hero-text' },
                el('p', { class: 'eyebrow', text: 'Nursing documentation aid' }),
                el('h1', { text: 'Structured nursing notes, ready for the record' }),
                el('p', { class: 'lead', text: 'Choose a task, record what you did and found, then copy a clear, time-stamped note into the electronic patient record.' }),
                el('ul', { class: 'trust', role: 'list' },
                    el('li', {}, icon('shield-check', 16), 'Nothing saved or sent'),
                    el('li', {}, icon('clock', 16), 'Time of care on every note'),
                    el('li', {}, icon('file-text', 16), 'Based on UK guidance')
                )
            ),
            el('label', { class: 'search' }, icon('search', 18), search)
        ),
        rec.length ? el('section', { class: 'group recent', 'aria-labelledby': 'recent-h' },
            el('h2', { id: 'recent-h', text: 'Recently used' }),
            el('ul', { class: 'template-grid compact', role: 'list' }, rec.map((id) => templateCard(TEMPLATES.find((t) => t.id === id), true)))
        ) : null,
        GROUPS.map((g) => el('section', { class: 'group', 'data-group': g, 'aria-labelledby': `g-${g}` },
            el('h2', { id: `g-${g}`, text: g }),
            el('ul', { class: 'template-grid', role: 'list' }, TEMPLATES.filter((t) => t.group === g).map((t) => templateCard(t)))
        )),
        el('p', { class: 'no-results', id: 'noResults', hidden: true, text: 'No notes match your search.' })
    ].flat().filter(Boolean));
}

function filterHome(q) {
    const term = q.trim().toLowerCase();
    let shown = 0;
    document.querySelectorAll('.group:not(.recent)').forEach((g) => {
        let any = false;
        g.querySelectorAll('li[data-search]').forEach((li) => {
            const hit = !term || li.dataset.search.includes(term);
            li.hidden = !hit;
            if (hit) { any = true; shown++; }
        });
        g.hidden = !any;
    });
    const r = document.querySelector('.group.recent');
    if (r) r.hidden = !!term;
    document.getElementById('noResults').hidden = shown > 0;
}

// ---------------------------------------------------------------------------------------------
// Template screen
// ---------------------------------------------------------------------------------------------
let state = null; // { template, values, header, refs, sections }

function renderTemplate(template) {
    document.title = `${template.title} - Nursing Notes`;
    addRecent(template.id);
    state = {
        template,
        values: { __now: new Date() },
        header: { timeOfCare: nowLocal(), retrospective: false, role: prefs.get('role'), format: prefs.get('format') || 'list' },
        refs: {},
        sections: []
    };

    const form = el('form', { class: 'note-form', autocomplete: 'off', onsubmit: (e) => e.preventDefault() });

    form.append(el('section', { class: 'card header-card', 'aria-label': 'Note details' },
        el('div', { class: 'row' },
            el('label', { class: 'field grow' },
                el('span', { class: 'label', text: 'Time of care' }),
                el('input', { type: 'datetime-local', id: 'timeOfCare', value: state.header.timeOfCare,
                    oninput: (e) => { state.header.timeOfCare = e.target.value; update(); } })
            ),
            el('button', { type: 'button', class: 'btn secondary', onclick: () => {
                state.header.timeOfCare = nowLocal();
                document.getElementById('timeOfCare').value = state.header.timeOfCare;
                update();
            } }, icon('clock', 16), 'Now')
        ),
        el('div', { class: 'row wrap' },
            el('label', { class: 'field grow' },
                el('span', { class: 'label', text: 'Your role (optional)' }),
                el('input', { type: 'text', id: 'role', value: state.header.role, placeholder: 'e.g. Staff nurse, Band 5',
                    oninput: (e) => { state.header.role = e.target.value; prefs.set('role', e.target.value.trim()); update(); } })
            ),
            el('label', { class: 'flag inline' },
                el('input', { type: 'checkbox', id: 'retro', onchange: (e) => { state.header.retrospective = e.target.checked; update(); } }),
                el('span', { text: 'Written in retrospect' })
            )
        )
    ));

    if (template.intro) form.append(el('p', { class: 'callout neutral' }, icon('info', 18), el('span', { text: template.intro })));

    template.sections.forEach((section, i) => {
        const count = el('span', { class: 'count', 'aria-live': 'off' });
        const card = el('fieldset', { class: 'card section', id: sectionId(i) },
            el('legend', {}, el('span', { class: 'num', text: String(i + 1) }), el('span', { text: section.title }), count));
        for (const field of section.fields) card.append(renderField(field));
        form.append(card);
        state.sections.push({ section, count });
    });

    form.append(el('section', { class: 'card sources' },
        el('h2', { text: 'Based on' }),
        el('ul', {}, template.sources.map((k) => el('li', {}, el('a', { href: SOURCES[k].url, target: '_blank', rel: 'noopener', text: SOURCES[k].label }))))
    ));

    const formatBtn = (value, label, ic) => el('button', { type: 'button', role: 'radio', class: 'seg', 'data-format': value,
        'aria-checked': String(state.header.format === value), onclick: () => {
            state.header.format = value;
            prefs.set('format', value);
            document.querySelectorAll('[data-format]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.format === value)));
            update();
        } }, icon(ic, 15), label);

    const preview = el('aside', { class: 'preview', 'aria-labelledby': 'preview-h', id: 'preview' },
        el('div', { class: 'preview-head' },
            el('h2', { id: 'preview-h' }, icon('file-text', 18), 'Note preview'),
            el('div', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Note layout' },
                formatBtn('list', 'List', 'list'), formatBtn('paragraph', 'Paragraph', 'align-left'))
        ),
        el('div', { id: 'idWarning', class: 'callout red', role: 'alert', hidden: true }),
        el('pre', { id: 'noteText', class: 'note-text', tabindex: '0', 'aria-label': 'Note text' }),
        el('div', { class: 'preview-foot' },
            el('span', { id: 'charCount', class: 'muted' }),
            el('div', { class: 'preview-actions' },
                el('button', { type: 'button', class: 'btn ghost', id: 'clearBtn', onclick: clearForm }, icon('trash-2', 16), el('span', { text: 'Clear' })),
                el('button', { type: 'button', class: 'btn primary', id: 'copyBtn', onclick: copyNote }, icon('copy', 16), el('span', { text: 'Copy note' }))
            )
        ),
        el('p', { id: 'copyStatus', class: 'status', 'aria-live': 'polite' })
    );

    const nav = el('nav', { class: 'section-nav', 'aria-label': 'Sections' },
        template.sections.map((s, i) => el('a', { href: '#' + sectionId(i), 'data-sec': String(i), onclick: (e) => {
            e.preventDefault();
            document.getElementById(sectionId(i)).scrollIntoView({ behavior: 'smooth', block: 'start' });
        } }, el('span', { class: 'num', text: String(i + 1) }), s.title)));

    main.replaceChildren(
        el('a', { class: 'back', href: '#' }, icon('arrow-left', 16), 'All notes'),
        el('header', { class: 'page-head' },
            el('span', { class: `template-icon large g-${template.group.split(' ')[0].toLowerCase()}` }, icon(template.icon, 26)),
            el('div', {},
                el('p', { class: 'eyebrow', text: template.group }),
                el('h1', { text: template.title }),
                el('p', { class: 'lead', text: template.blurb })
            )
        ),
        nav,
        el('div', { class: 'layout' }, form, preview),
        el('div', { class: 'copy-bar' },
            el('button', { type: 'button', class: 'btn secondary', onclick: () => document.getElementById('preview').scrollIntoView({ behavior: 'smooth', block: 'start' }) },
                icon('eye', 16), 'Preview'),
            el('button', { type: 'button', class: 'btn primary wide', id: 'copyBarBtn', onclick: copyNote }, icon('copy', 16), el('span', { text: 'Copy note' }))
        )
    );
    update();
    main.focus({ preventScroll: true });
}

function setValue(id, value) {
    state.values[id] = value;
    update();
}

function renderField(field) {
    const v = state.values;
    const wrap = el('div', { class: `field-wrap type-${field.type}`, 'data-field': field.id });
    const add = (...nodes) => wrap.append(...nodes.filter(Boolean));
    const badge = field.score ? el('span', { class: 'score-badge', hidden: true, title: 'NEWS2 points for this parameter' }) : null;
    state.refs[field.id] = { field, wrap, badge };
    const hintId = fieldDomId(field) + '-hint';
    const hint = field.hint ? el('span', { class: 'hint', id: hintId, text: field.hint }) : null;
    const describedBy = hint ? hintId : undefined;
    const labelRow = (labelEl, extra) => el('div', { class: 'label-row' }, labelEl, badge, extra);

    switch (field.type) {
        case 'flag':
            add(el('label', { class: 'flag' },
                el('input', { type: 'checkbox', id: fieldDomId(field), onchange: (e) => setValue(field.id, e.target.checked) }),
                el('span', { text: field.label })
            ));
            break;

        case 'checks': {
            v[field.id] = [];
            const group = el('div', { class: 'options', role: 'group', 'aria-labelledby': fieldDomId(field) + '-label' });
            const boxes = field.options.map((opt) => {
                const box = el('input', { type: 'checkbox', value: opt, onchange: () => {
                    setValue(field.id, boxes.filter((b) => b.checked).map((b) => b.value));
                } });
                group.append(el('label', { class: 'option check' }, box, el('span', { class: 'tick' }, icon('check', 14)), el('span', { text: opt })));
                return box;
            });
            const all = field.selectAll ? el('button', { type: 'button', class: 'link-btn', text: 'Tick all', onclick: () => {
                const every = boxes.every((b) => b.checked);
                boxes.forEach((b) => { b.checked = !every; });
                setValue(field.id, boxes.filter((b) => b.checked).map((b) => b.value));
            } }) : null;
            add(labelRow(el('span', { class: 'label', id: fieldDomId(field) + '-label', text: field.label }), all), hint, group);
            break;
        }

        case 'choice': {
            const group = el('div', { class: 'options choices', role: 'radiogroup', 'aria-labelledby': fieldDomId(field) + '-label' });
            const buttons = field.options.map((opt, i) => {
                const b = el('button', { type: 'button', class: 'option choice', role: 'radio', 'aria-checked': 'false', 'data-value': opt,
                    onclick: () => {
                        const next = state.values[field.id] === opt ? '' : opt; // tap again to clear
                        buttons.forEach((x) => x.setAttribute('aria-checked', String(x.dataset.value === next)));
                        setValue(field.id, next);
                    } },
                el('span', { class: 'opt-main', text: opt }),
                field.optionHints ? el('small', { text: field.optionHints[i] }) : null);
                group.append(b);
                return b;
            });
            add(labelRow(el('span', { class: 'label', id: fieldDomId(field) + '-label', text: field.label })), hint, group);
            break;
        }

        case 'select':
            add(labelRow(el('label', { class: 'label', for: fieldDomId(field), text: field.label })),
                el('select', { id: fieldDomId(field), 'aria-describedby': describedBy, onchange: (e) => setValue(field.id, e.target.value) },
                    field.options.map((o) => el('option', { value: o, text: o || 'Choose…' }))), hint);
            break;

        case 'textarea':
            add(labelRow(el('label', { class: 'label', for: fieldDomId(field), text: field.label })),
                el('textarea', { id: fieldDomId(field), rows: '3', 'aria-describedby': describedBy, placeholder: field.hint || '',
                    oninput: (e) => setValue(field.id, e.target.value) }));
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
            add(labelRow(el('label', { class: 'label', for: fieldDomId(field), text: field.label })),
                el('div', { class: 'input-unit' + (field.type === 'number' ? ' number' : '') }, input, field.unit ? el('span', { class: 'unit', text: field.unit }) : null),
                hint);
            break;
        }

        case 'rows': {
            v[field.id] = [];
            const list = el('div', { class: 'rows' });
            const addBtn = el('button', { type: 'button', class: 'btn secondary small', text: '+ ' + (field.addLabel || 'Add'), onclick: () => {
                state.values[field.id].push({});
                drawRows();
                update();
                const first = list.lastElementChild && list.lastElementChild.querySelector('select, input');
                if (first) first.focus();
            } });
            function drawRows() {
                list.replaceChildren(...state.values[field.id].map((row, idx) => el('div', { class: 'row-item' },
                    field.columns.map((c) => el('label', { class: 'field' },
                        el('span', { class: 'label small', text: c.label }),
                        c.type === 'select'
                            ? el('select', { onchange: (e) => { row[c.id] = e.target.value; update(); } },
                                c.options.map((o) => el('option', { value: o, text: o || '-', selected: row[c.id] === o })))
                            : el('input', { type: 'text', value: row[c.id] || '', oninput: (e) => { row[c.id] = e.target.value; update(); } })
                    )),
                    el('button', { type: 'button', class: 'icon-btn small', 'aria-label': `Remove area ${idx + 1}`, onclick: () => {
                        state.values[field.id].splice(idx, 1);
                        drawRows();
                        update();
                    } }, icon('x', 16))
                )));
            }
            add(el('span', { class: 'label', text: field.label }), list, addBtn);
            break;
        }

        case 'computed':
            if (field.display === 'score') {
                add(el('div', { class: 'score-tile', 'aria-live': 'polite' },
                    el('div', { class: 'score-num' }, el('span', { class: 'score-label', text: field.label }), el('output', { class: 'big', text: '-' })),
                    el('div', { class: 'score-text' }, el('strong', { class: 'sub' }), el('span', { class: 'detail' }))));
            } else {
                add(el('div', { class: 'computed', 'aria-live': 'polite' },
                    el('span', { class: 'label', text: field.label }),
                    el('output', { id: fieldDomId(field), class: 'computed-value', text: '-' })));
            }
            break;

        case 'advice':
            add(el('p', { class: 'callout', id: fieldDomId(field), 'aria-live': 'polite' }, icon('info', 18), el('span', {})));
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

    for (const { field, wrap, badge } of Object.values(refs)) {
        const visible = isVisible(field, values);
        wrap.hidden = !visible;
        if (badge) {
            const pts = visible ? field.score(values) : null;
            const show = typeof pts === 'number';
            badge.hidden = !show;
            badge.textContent = show ? `+${pts}` : '';
            badge.dataset.points = show ? String(pts) : '';
        }
        if (field.type === 'computed') {
            const r = visible ? field.compute(values) : null;
            if (field.display === 'score') {
                const tile = wrap.querySelector('.score-tile');
                tile.dataset.tone = r ? r.tone : '';
                tile.querySelector('.big').textContent = r ? r.big : '-';
                tile.querySelector('.sub').textContent = r ? r.sub : 'Enter observations';
                tile.querySelector('.detail').textContent = r ? r.text.replace(/^[^.]*\.\s*/, '') : 'The score updates as you type.';
            } else {
                const out = wrap.querySelector('output');
                out.textContent = r ? r.text : '-';
                out.dataset.tone = r ? r.tone : '';
            }
        }
        if (field.type === 'advice') {
            const r = visible ? field.compute(values) : null;
            const p = wrap.querySelector('p');
            wrap.hidden = !r;
            p.lastElementChild.textContent = r ? r.text : '';
            p.className = 'callout ' + (r ? r.tone : '');
        }
    }

    state.sections.forEach(({ section, count }, i) => {
        const n = section.fields.filter((f) => !['computed', 'advice'].includes(f.type) && isVisible(f, values) && hasAnswer(values[f.id])).length;
        count.textContent = n ? `${n} recorded` : '';
        count.hidden = !n;
        const link = document.querySelector(`.section-nav [data-sec="${i}"]`);
        if (link) link.classList.toggle('done', n > 0);
    });

    const { text, empty } = renderNote(template, values, {
        timeOfCare: header.timeOfCare, retrospective: header.retrospective, role: header.role.trim(), format: header.format
    });
    const pre = document.getElementById('noteText');
    pre.textContent = empty ? text + '\n\nFill in the form and your note builds here.' : text;
    pre.dataset.empty = String(empty);
    document.getElementById('charCount').textContent = empty ? '' : `${text.length} characters`;

    const ids = findIdentifiers(freeText(template, values) + '\n' + header.role);
    const warn = document.getElementById('idWarning');
    warn.hidden = ids.length === 0;
    warn.textContent = ids.length ? `This looks like it may contain ${ids.join(', ')}. Please remove patient details before copying.` : '';
}

function setBtnLabel(id, label) {
    const b = document.getElementById(id);
    if (b) b.querySelector('span').textContent = label;
}

async function copyNote() {
    const { template, values, header } = state;
    const { text, empty } = renderNote(template, values, {
        timeOfCare: header.timeOfCare, retrospective: header.retrospective, role: header.role.trim(), format: header.format
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
    if (ok) {
        ['copyBtn', 'copyBarBtn'].forEach((id) => setBtnLabel(id, 'Copied'));
        setTimeout(() => ['copyBtn', 'copyBarBtn'].forEach((id) => setBtnLabel(id, 'Copy note')), 2000);
    }
}

function clearForm() {
    const btn = document.getElementById('clearBtn');
    if (btn.dataset.confirm !== 'yes') {
        btn.dataset.confirm = 'yes';
        setBtnLabel('clearBtn', 'Tap again to clear');
        setTimeout(() => { if (btn.isConnected) { btn.dataset.confirm = ''; setBtnLabel('clearBtn', 'Clear'); } }, 3000);
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
    if (state && Object.entries(state.values).some(([k, v]) => k !== '__now' && hasAnswer(v))) {
        e.preventDefault();
        e.returnValue = '';
    }
});

function themeIcon() {
    const root = document.documentElement;
    const dark = (root.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark';
    const btn = document.getElementById('themeBtn');
    btn.replaceChildren(icon(dark ? 'sun' : 'moon', 18));
    btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
}

document.getElementById('themeBtn').addEventListener('click', () => {
    const root = document.documentElement;
    const current = root.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = current === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    prefs.set('theme', next);
    themeIcon();
});

themeIcon();
route();
