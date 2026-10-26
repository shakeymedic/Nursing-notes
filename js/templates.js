// templates.js - the note templates. Each template is data: sections of fields, plus a few
// computed lines. note.js turns a template and the nurse's answers into text for the EPR.
//
// Field types
//   flag      single tick box; prints `note` (or the label) when ticked
//   checks    several tick boxes; prints "Label: a; b; c"
//   choice    one of several buttons; prints "Label: value"
//   select    drop-down; prints "Label: value"
//   text / number / date / time / textarea   prints "Label: value [unit]"
//   rows      repeatable small table (e.g. areas of skin damage)
//   computed  worked out from other answers; `compute(v)` returns { text, tone } or null
//   advice    shown on screen only, never printed; `compute(v)` returns { text, tone } or null
// Optional on any field: showIf(v), hint, unit, note (flag text), print: false

import {
    news2, news2Response, bmi, weightChangePercent, daysSince, formatDate, VIP,
    rrPoints, spo2Scale1Points, spo2Scale2Points, sbpPoints, hrPoints, tempPoints
} from './scores.js';

const SOURCES = {
    nmc: { label: 'NMC: The Code (2018), section 10 - keep clear and accurate records', url: 'https://www.nmc.org.uk/standards/code/' },
    hello: { label: '#hellomynameis campaign', url: 'https://www.hellomynameis.org.uk/' },
    news2: { label: 'Royal College of Physicians: NEWS2 (2017)', url: 'https://www.rcp.ac.uk/media/a4ibkkbf/news2-final-report_0_0.pdf' },
    martha: { label: "NHS England: Martha's Rule", url: 'https://www.england.nhs.uk/patient-safety/marthas-rule/' },
    sepsis: { label: 'NICE NG253: Suspected sepsis in people aged 16 or over (2025)', url: 'https://www.nice.org.uk/guidance/ng253' },
    pu: { label: 'NHS England: Pressure ulcers - revised definition and measurement framework (2018)', url: 'https://www.england.nhs.uk/pressure-ulcers-revised-definition-and-measurement-framework/' },
    must: { label: "BAPEN: 'MUST' and the online MUST calculator", url: 'https://www.bapen.org.uk/must-and-self-screening/must-calculator/' },
    iddsi: { label: 'IDDSI framework (texture-modified food and thickened drinks)', url: 'https://www.iddsi.org/' },
    headinjury: { label: 'NICE NG232: Head injury - assessment and early management (2023)', url: 'https://www.nice.org.uk/guidance/ng232' },
    falls: { label: 'NICE NG249: Falls - assessment and prevention in older people and in people 50 and over at higher risk (2025)', url: 'https://www.nice.org.uk/guidance/ng249' },
    vip: { label: 'Visual Infusion Phlebitis (VIP) score - Andrew Jackson', url: 'https://ivteam.com/intravenous-literature/infusion-phlebitis/the-importance-of-grading-infusion-phlebitis/' },
    mca: { label: 'Mental Capacity Act 2005 code of practice', url: 'https://www.gov.uk/government/publications/mental-capacity-act-code-of-practice' }
};

const PRESSURE_SITES = [
    'Back of head', 'Ears', 'Nose / face (device)', 'Shoulders', 'Spine', 'Elbows', 'Sacrum', 'Buttocks',
    'Hips', 'Knees', 'Ankles', 'Heels', 'Toes', 'Under a device (tube, mask, splint, cast)'
];

const yes = (v, key) => v[key] === true || (Array.isArray(v[key]) && v[key].length > 0);
const num = (x) => x !== undefined && x !== null && x !== '' && !Number.isNaN(Number(x));
const includes = (v, key, option) => Array.isArray(v[key]) && v[key].includes(option);

function news2From(v) {
    return news2({
        rr: v.rr, spo2: v.spo2, scale2: v.spo2scale === 'Scale 2', oxygen: v.oxygen,
        sbp: v.sbp, hr: v.hr, acvpu: v.acvpu ? v.acvpu[0] : '', temp: v.temp
    });
}

// ---------------------------------------------------------------------------------------------

export const TEMPLATES = [
    {
        id: 'first-contact',
        title: 'First contact / admission',
        blurb: 'Meeting a patient for the first time on your shift or on arrival to the ward.',
        icon: 'user-round-check',
        group: 'Assessments',
        sources: ['nmc', 'hello'],
        sections: [
            {
                title: 'Introduction and identity',
                fields: [
                    { id: 'intro', type: 'flag', label: 'Introduced myself by name and role', note: 'Introduced myself by name and role.' },
                    { id: 'idcheck', type: 'choice', label: 'Identity', options: [
                        'Confirmed with the patient and against the ID band',
                        'ID band checked against records (patient unable to confirm)',
                        'ID band applied',
                        'Could not confirm identity - escalated'
                    ] },
                    { id: 'allergy', type: 'choice', label: 'Allergies', options: [
                        'No known allergies', 'Allergies recorded (below)', 'Not yet established - to confirm'
                    ] },
                    { id: 'allergyDetail', type: 'text', label: 'Allergy and reaction', showIf: (v) => v.allergy === 'Allergies recorded (below)' },
                    { id: 'redband', type: 'flag', label: 'Red allergy band applied', note: 'Red allergy band applied.', showIf: (v) => v.allergy === 'Allergies recorded (below)' }
                ]
            },
            {
                title: 'First observations',
                fields: [
                    { id: 'news', type: 'number', label: 'NEWS2 score', min: 0, max: 20, hint: 'Use the Deteriorating patient note to work out NEWS2 and record escalation.' },
                    { id: 'newsAdvice', type: 'advice', compute: (v) => (v.news !== '' && v.news !== undefined && Number(v.news) >= 5)
                        ? { tone: 'red', text: 'NEWS2 of 5 or more needs an urgent response. Escalate and use the Deteriorating patient note.' } : null },
                    { id: 'pain', type: 'number', label: 'Pain score', unit: '/10', min: 0, max: 10 },
                    { id: 'firstObsNote', type: 'text', label: 'Other observations', hint: 'e.g. capillary glucose, urinalysis' }
                ]
            },
            {
                title: 'Orientation and daily living',
                fields: [
                    { id: 'orient', type: 'checks', label: 'Shown or explained', options: [
                        'Call bell (in reach, patient can use it)', 'Bed controls', 'Toilets and bathroom',
                        'Meal and drink times', 'Visiting arrangements', 'Who is looking after them today'
                    ] },
                    { id: 'mobility', type: 'choice', label: 'Mobility', options: [
                        'Independent', 'Independent with walking aid', 'Needs help of 1', 'Needs help of 2', 'Hoist', 'Bed-bound'
                    ] },
                    { id: 'continence', type: 'choice', label: 'Continence', options: [
                        'Continent', 'Incontinent of urine', 'Incontinent of faeces', 'Incontinent of urine and faeces', 'Catheter in place', 'Stoma'
                    ] },
                    { id: 'diet', type: 'choice', label: 'Diet', options: [
                        'Normal diet', 'Special or modified diet (see notes)', 'Nil by mouth (as instructed)'
                    ] }
                ]
            },
            {
                title: 'Communication and support needs',
                fields: [
                    { id: 'comms', type: 'checks', label: 'Needs identified', options: [
                        'No additional needs identified', 'Interpreter needed', 'Hearing aid(s)', 'Glasses', 'Dentures',
                        'Learning disability or autism (hospital passport / reasonable adjustments)',
                        'Dementia or memory problems', 'New confusion - delirium screen needed',
                        'Carer or family to be involved in care'
                    ] },
                    { id: 'language', type: 'text', label: 'Preferred language', showIf: (v) => includes(v, 'comms', 'Interpreter needed') }
                ]
            },
            {
                title: 'Property and medicines',
                fields: [
                    { id: 'property', type: 'choice', label: 'Property', options: [
                        'No valuables', 'Valuables recorded and stored as per policy', 'Valuables sent home with family or carer',
                        'Patient keeping valuables - responsibility explained'
                    ] },
                    { id: 'meds', type: 'choice', label: 'Own medicines', options: [
                        'None brought in', 'Brought in and stored as per policy', 'Sent home'
                    ] }
                ]
            },
            {
                title: 'Family and next steps',
                fields: [
                    { id: 'nok', type: 'choice', label: 'Next of kin', options: [
                        'Aware of admission', 'To be contacted', 'Patient asked us not to contact anyone', 'No next of kin'
                    ] },
                    { id: 'assessments', type: 'checks', label: 'Assessments started', options: [
                        'Skin / pressure ulcer risk', 'Nutrition (MUST)', 'Falls', 'Moving and handling', 'Bed rails',
                        'VTE (prompted medical team)', 'Infection screening as per local policy'
                    ] },
                    { id: 'plan', type: 'textarea', label: 'Plan / other' }
                ]
            }
        ]
    },

    // -----------------------------------------------------------------------------------------
    {
        id: 'deteriorating',
        title: 'Deteriorating patient',
        blurb: 'Observations, NEWS2, your concerns, escalation (SBAR), response and plan.',
        icon: 'activity',
        group: 'Acute care',
        sources: ['news2', 'martha', 'sepsis', 'nmc'],
        intro: 'NEWS2 is for adults (16 and over) and is not validated in pregnancy. Use your local paediatric or maternity chart for those patients. Your concern always counts, whatever the score.',
        sections: [
            {
                title: 'Observations',
                fields: [
                    { id: 'rr', type: 'number', label: 'Respiratory rate', unit: '/min', min: 0, max: 80, score: (v) => num(v.rr) && rrPoints(Number(v.rr)) },
                    { id: 'spo2', type: 'number', label: 'SpO2', unit: '%', min: 50, max: 100, score: (v) => num(v.spo2) && (v.spo2scale === 'Scale 2' ? spo2Scale2Points(Number(v.spo2), v.oxygen === 'Oxygen') : spo2Scale1Points(Number(v.spo2))) },
                    { id: 'spo2scale', type: 'choice', label: 'SpO2 scale', options: ['Scale 1', 'Scale 2'], print: false,
                        hint: 'Scale 2 only when a clinician has set a target of 88-92% (e.g. hypercapnic respiratory failure).' },
                    { id: 'oxygen', type: 'choice', label: 'Breathing', options: ['Air', 'Oxygen'], print: false, score: (v) => v.oxygen ? (v.oxygen === 'Oxygen' ? 2 : 0) : null },
                    { id: 'o2detail', type: 'text', label: 'Oxygen device and flow', hint: 'e.g. nasal cannulae 2 L/min', showIf: (v) => v.oxygen === 'Oxygen' },
                    { id: 'sbp', type: 'number', label: 'Systolic BP', unit: 'mmHg', min: 30, max: 300, score: (v) => num(v.sbp) && sbpPoints(Number(v.sbp)) },
                    { id: 'dbp', type: 'number', label: 'Diastolic BP', unit: 'mmHg', min: 10, max: 200, hint: 'Recorded but not scored in NEWS2.' },
                    { id: 'hr', type: 'number', label: 'Heart rate', unit: '/min', min: 0, max: 250, score: (v) => num(v.hr) && hrPoints(Number(v.hr)) },
                    { id: 'acvpu', type: 'choice', label: 'Consciousness (ACVPU)', options: [
                        'Alert', 'Confusion (new)', 'Voice', 'Pain', 'Unresponsive'
                    ], score: (v) => v.acvpu ? (v.acvpu === 'Alert' ? 0 : 3) : null },
                    { id: 'temp', type: 'number', label: 'Temperature', unit: '°C', step: '0.1', min: 25, max: 45, score: (v) => num(v.temp) && tempPoints(Number(v.temp)) },
                    { id: 'glucose', type: 'number', label: 'Capillary glucose', unit: 'mmol/L', step: '0.1' },
                    { id: 'pain', type: 'number', label: 'Pain score', unit: '/10', min: 0, max: 10 },
                    { id: 'otherObs', type: 'text', label: 'Other', hint: 'e.g. urine output, capillary refill' }
                ]
            },
            {
                title: 'NEWS2',
                fields: [
                    { id: 'newsResult', type: 'computed', label: 'NEWS2', display: 'score', compute: (v) => {
                        const r = news2From(v);
                        if (r.parts.length === 0) return null;
                        const resp = news2Response(r.score, r.singleRed);
                        const breakdown = r.parts.map((p) => `${p.label}${p.value !== '' ? ' ' + p.value : ''} = ${p.points}`).join(', ');
                        if (!r.complete) {
                            // RCP only defines a score from all seven parameters: never call a partial score low risk.
                            return { tone: r.score >= 7 ? 'red' : 'amber', big: `≥${r.score}`, sub: `${r.parts.length} of 7 recorded`,
                                text: `At least ${r.score} (${r.parts.length} of 7 parameters recorded; missing ${r.missing.join(', ')}). ${breakdown}` };
                        }
                        const tone = r.score >= 7 ? 'red' : (r.score >= 5 || r.singleRed) ? 'amber' : 'green';
                        return { tone, big: String(r.score), sub: `${resp.level} clinical risk`, text: `${r.score}, ${resp.level.toLowerCase()} clinical risk. ${breakdown}` };
                    } },
                    { id: 'newsAdvice', type: 'advice', compute: (v) => {
                        const r = news2From(v);
                        if (!r.complete && !(r.score >= 5 || r.singleRed)) return r.parts.length ? { tone: 'neutral', text: 'Record all seven parameters to complete the NEWS2 score.' } : null;
                        const resp = news2Response(r.score, r.singleRed);
                        const tone = r.score >= 7 ? 'red' : (r.score >= 5 || r.singleRed) ? 'amber' : 'green';
                        const early = r.complete ? '' : 'Already at this level before all observations are recorded. ';
                        return { tone, text: `${early}RCP response: ${resp.response} Monitoring: ${resp.monitoring.toLowerCase()}. Follow your local escalation policy.` };
                    } },
                    { id: 'prevNews', type: 'number', label: 'Previous NEWS2', min: 0, max: 20 },
                    { id: 'trend', type: 'computed', label: 'Trend', compute: (v) => {
                        const r = news2From(v);
                        if (!r.complete || v.prevNews === '' || v.prevNews === undefined) return null;
                        const diff = r.score - Number(v.prevNews);
                        if (diff > 0) return { tone: 'amber', text: `Rising (up ${diff} from ${v.prevNews})` };
                        if (diff < 0) return { tone: 'green', text: `Falling (down ${-diff} from ${v.prevNews})` };
                        return { tone: 'neutral', text: `Unchanged from ${v.prevNews}` };
                    } }
                ]
            },
            {
                title: 'My assessment',
                fields: [
                    { id: 'concerns', type: 'checks', label: 'Concerns', options: [
                        'I am worried even though the score is low', 'Patient says they feel worse', 'Family or carer worried',
                        'Could this be an infection (think sepsis)', 'New or worsening pain', 'Reduced urine output',
                        'New confusion or drowsiness', 'Bleeding', 'Low or high blood glucose'
                    ] },
                    { id: 'sepsisAdvice', type: 'advice', compute: (v) => includes(v, 'concerns', 'Could this be an infection (think sepsis)')
                        ? { tone: 'amber', text: 'Suspected infection: follow your local sepsis pathway (NICE NG253 for people aged 16 or over).' } : null },
                    { id: 'martha', type: 'flag', label: "Patient or family asked for an urgent review (Martha's Rule / call for concern)",
                        note: "Patient or family asked for an urgent review (Martha's Rule / call for concern)." },
                    { id: 'assessment', type: 'textarea', label: 'What I found', hint: 'A to E findings, what has changed' }
                ]
            },
            {
                title: 'Escalation (SBAR)',
                fields: [
                    { id: 'escalatedTo', type: 'checks', label: 'Escalated to', options: [
                        'Nurse in charge', 'Ward doctor', 'Senior doctor (registrar or above)', 'Critical care outreach',
                        'Medical emergency / rapid response team', 'Cardiac arrest call (2222)'
                    ] },
                    { id: 'escTime', type: 'time', label: 'Time escalated' },
                    { id: 'sbarUsed', type: 'flag', label: 'Handed over using SBAR', note: 'Handed over using SBAR.' },
                    { id: 'situation', type: 'textarea', label: 'Situation', hint: 'I am calling because…' },
                    { id: 'background', type: 'textarea', label: 'Background', hint: 'Reason for admission, relevant history' },
                    { id: 'recommendation', type: 'textarea', label: 'Recommendation / what I asked for', hint: 'e.g. please review within 30 minutes' }
                ]
            },
            {
                title: 'Response and plan',
                fields: [
                    { id: 'reviewedBy', type: 'text', label: 'Reviewed by (role)' },
                    { id: 'reviewTime', type: 'time', label: 'Time reviewed' },
                    { id: 'actions', type: 'checks', label: 'Actions', options: [
                        'Treatment given as prescribed', 'IV fluids started as prescribed', 'Oxygen started or changed as prescribed',
                        'Bloods / cultures taken', 'Moved to a monitored bed', 'Referred to critical care', 'Transferred to a higher level of care'
                    ] },
                    { id: 'obsFreq', type: 'choice', label: 'Observations now', options: [
                        'Continuous monitoring', 'Every 15 minutes', 'Every 30 minutes', 'Hourly', 'Every 4 hours', 'As per medical plan'
                    ] },
                    { id: 'ceiling', type: 'choice', label: 'Treatment escalation plan', options: [
                        'For full escalation', 'Treatment escalation plan / ReSPECT form in place (see record)', 'Not yet discussed - raised with medical team'
                    ] },
                    { id: 'family', type: 'flag', label: 'Family or carer informed (with consent where possible)', note: 'Family or carer informed.' },
                    { id: 'reescalate', type: 'flag', label: 'Will re-escalate if no review in the agreed time or if worse', note: 'Will re-escalate if not reviewed within the agreed time or if the patient gets worse.' },
                    { id: 'plan', type: 'textarea', label: 'Plan' }
                ]
            }
        ]
    },

    // -----------------------------------------------------------------------------------------
    {
        id: 'post-fall',
        title: 'Post-fall check',
        blurb: 'After a fall: injury checks, head injury, moving the patient, escalation.',
        icon: 'triangle-alert',
        group: 'Acute care',
        sources: ['headinjury', 'falls', 'nmc'],
        intro: "Follow your organisation's post-fall protocol, including checking for injury before the patient is moved.",
        sections: [
            {
                title: 'The fall',
                fields: [
                    { id: 'fallTime', type: 'time', label: 'Time of fall (or when found)' },
                    { id: 'witnessed', type: 'choice', label: 'Fall was', options: ['Witnessed', 'Unwitnessed', 'Reported by patient'] },
                    { id: 'where', type: 'text', label: 'Where', hint: 'e.g. beside bed, bathroom' },
                    { id: 'account', type: 'textarea', label: 'What happened', hint: "the patient's account, in their words if possible" }
                ]
            },
            {
                title: 'Checks before moving',
                fields: [
                    { id: 'checked', type: 'checks', label: 'Checked', selectAll: true, options: [
                        'Airway, breathing and circulation', 'Level of consciousness', 'Signs of head injury',
                        'Neck or back pain (possible spinal injury)', 'Signs of fracture (pain, shortening, rotation, deformity)',
                        'Skin tears or bleeding'
                    ] },
                    { id: 'injuries', type: 'checks', label: 'Injuries found', options: [
                        'None seen', 'Head injury', 'Possible fracture', 'Skin tear or wound', 'Bruising', 'New pain'
                    ] },
                    { id: 'injuryDetail', type: 'text', label: 'Injury details', showIf: (v) => Array.isArray(v.injuries) && v.injuries.some((x) => x !== 'None seen') },
                    { id: 'moved', type: 'choice', label: 'Got up by', options: [
                        'Getting up independently', 'Assisted to stand', 'Hoist', 'Flat-lifting equipment', 'Stayed on the floor until reviewed'
                    ] },
                    { id: 'anticoag', type: 'choice', label: 'Anticoagulant or antiplatelet', options: [
                        'None', 'Aspirin only', 'Anticoagulant or other antiplatelet'
                    ] },
                    { id: 'headAdvice', type: 'advice', compute: (v) => (includes(v, 'injuries', 'Head injury') || v.witnessed === 'Unwitnessed')
                        ? { tone: 'amber', text: 'Possible head injury (or unwitnessed fall): follow your local head injury protocol. For people admitted for head injury observation, NICE NG232 sets a minimum of half-hourly neurological observations until GCS 15; with GCS 15, half-hourly for 2 hours, then hourly for 4 hours, then 2-hourly.' } : null },
                    { id: 'anticoagAdvice', type: 'advice', compute: (v) => v.anticoag === 'Anticoagulant or other antiplatelet'
                        ? { tone: 'amber', text: 'Tell the medical team now: anticoagulant or antiplatelet treatment (other than aspirin alone) is a head injury risk factor in NICE NG232.' } : null }
                ]
            },
            {
                title: 'Observations after the fall',
                fields: [
                    { id: 'news', type: 'number', label: 'NEWS2', min: 0, max: 20 },
                    { id: 'gcs', type: 'number', label: 'GCS', min: 3, max: 15, unit: '/15' },
                    { id: 'pupils', type: 'text', label: 'Pupils', hint: 'e.g. equal and reactive' },
                    { id: 'glucose', type: 'number', label: 'Capillary glucose', unit: 'mmol/L', step: '0.1' },
                    { id: 'pain', type: 'number', label: 'Pain score', unit: '/10', min: 0, max: 10 },
                    { id: 'neuro', type: 'flag', label: 'Neurological observations started', note: 'Neurological observations started.' }
                ]
            },
            {
                title: 'Escalation and follow-up',
                fields: [
                    { id: 'informed', type: 'checks', label: 'Informed', options: [
                        'Nurse in charge', 'Medical team', 'Family or carer (with consent where possible)'
                    ] },
                    { id: 'reviewTime', type: 'time', label: 'Medical review at' },
                    { id: 'followUp', type: 'checks', label: 'Done', options: [
                        'Incident report completed', 'Falls care plan reviewed', 'Bed rails assessment reviewed',
                        'Lying and standing BP planned', 'Medication review requested'
                    ] },
                    { id: 'plan', type: 'textarea', label: 'Plan' }
                ]
            }
        ]
    },

    // -----------------------------------------------------------------------------------------
    {
        id: 'skin',
        title: 'Skin check',
        blurb: 'Pressure areas and skin care, set out using aSSKINg.',
        icon: 'bandage',
        group: 'Assessments',
        sources: ['pu', 'nmc'],
        intro: 'Record the risk score from the tool your organisation uses (for example Waterlow, Braden or PURPOSE T). This app does not calculate those scores.',
        sections: [
            {
                title: 'Assess risk',
                fields: [
                    { id: 'tool', type: 'choice', label: 'Risk tool', options: ['Waterlow', 'Braden', 'PURPOSE T', 'Other local tool'] },
                    { id: 'score', type: 'text', label: 'Score and risk category', hint: 'as shown on your form' }
                ]
            },
            {
                title: 'Skin inspection',
                fields: [
                    { id: 'consent', type: 'choice', label: 'Consent', options: [
                        'Verbal consent given', 'Lacks capacity for this decision - checked in best interests', 'Declined (see note)'
                    ] },
                    { id: 'extent', type: 'choice', label: 'Checked', options: ['Whole skin', 'All pressure areas', 'Specific areas only'] },
                    { id: 'tone', type: 'flag', label: 'Darker skin tone considered: checked for warmth, coolness, swelling, hardness and colour change, not only redness',
                        note: 'Skin tone considered: checked for warmth, coolness, swelling, hardness and colour change, not only redness.' },
                    { id: 'intact', type: 'checks', label: 'Intact, no damage seen', options: PRESSURE_SITES, selectAll: true },
                    { id: 'damage', type: 'rows', label: 'Areas of concern', addLabel: 'Add an area', columns: [
                        { id: 'site', label: 'Site', type: 'select', options: PRESSURE_SITES.concat(['Other']) },
                        { id: 'side', label: 'Side', type: 'select', options: ['', 'Left', 'Right', 'Both', 'Midline'] },
                        { id: 'finding', label: 'Finding', type: 'select', options: [
                            'Blanching redness', 'Category 1 (non-blanching)', 'Category 2', 'Category 3', 'Category 4',
                            'Unstageable', 'Deep tissue injury', 'Device-related', 'Moisture-associated skin damage', 'Other skin damage'
                        ] },
                        { id: 'size', label: 'Size / notes', type: 'text' }
                    ] },
                    { id: 'damageAdvice', type: 'advice', compute: (v) => {
                        const rows = Array.isArray(v.damage) ? v.damage : [];
                        const serious = rows.some((r) => /Category [234]|Unstageable|Deep tissue|Device/.test(r.finding || ''));
                        return serious ? { tone: 'amber', text: 'Category 2 or above, unstageable, deep tissue injury or device-related damage: report and refer as per your local policy (usually incident report and tissue viability).' } : null;
                    } },
                    { id: 'skinActions', type: 'checks', label: 'Actions', options: [
                        'Wound care plan started or updated', 'Photograph taken as per policy', 'Reported on incident system',
                        'Referred to tissue viability', 'Medical team informed'
                    ] }
                ]
            },
            {
                title: 'Surface',
                fields: [
                    { id: 'mattress', type: 'choice', label: 'Mattress', options: [
                        'Standard foam', 'High-specification foam', 'Hybrid', 'Dynamic (alternating) air'
                    ] },
                    { id: 'seat', type: 'choice', label: 'Seating', options: ['Not sitting out', 'Pressure-relieving cushion', 'Standard chair'] },
                    { id: 'heels', type: 'flag', label: 'Heels offloaded', note: 'Heels offloaded.' }
                ]
            },
            {
                title: 'Keep moving',
                fields: [
                    { id: 'moves', type: 'choice', label: 'Repositioning', options: ['Moves independently', 'Needs help to reposition', 'Declined repositioning'] },
                    { id: 'freq', type: 'text', label: 'Repositioning plan', hint: 'e.g. every 2 hours' },
                    { id: 'position', type: 'choice', label: 'Position now', options: ['Left side (30° tilt)', 'Right side (30° tilt)', 'On back', 'Sitting out'] }
                ]
            },
            {
                title: 'Incontinence and moisture',
                fields: [
                    { id: 'moisture', type: 'checks', label: 'Care', options: [
                        'Continent', 'Pad checked and changed', 'Skin cleaned and dried', 'Barrier product applied', 'Sweating or wound leakage managed'
                    ] }
                ]
            },
            {
                title: 'Nutrition and hydration',
                fields: [
                    { id: 'nutrition', type: 'checks', label: 'Nutrition', options: [
                        'Nutrition screen (MUST) up to date', 'Eating and drinking well', 'Poor intake - see nutrition note', 'Fluids encouraged'
                    ] }
                ]
            },
            {
                title: 'Giving information',
                fields: [
                    { id: 'info', type: 'checks', label: 'Information', options: [
                        'Patient advised on moving and pressure relief', 'Family or carer advised', 'Leaflet given'
                    ] },
                    { id: 'next', type: 'text', label: 'Next skin check due' },
                    { id: 'plan', type: 'textarea', label: 'Plan / other' }
                ]
            }
        ]
    },

    // -----------------------------------------------------------------------------------------
    {
        id: 'nutrition',
        title: 'Nutrition check',
        blurb: 'Weight, BMI, weight change, MUST result, eating and drinking.',
        icon: 'utensils',
        group: 'Assessments',
        sources: ['must', 'iddsi', 'nmc'],
        intro: "Complete 'MUST' on your organisation's form or BAPEN's online calculator and record the result here. This app works out BMI and weight change to help, but does not score MUST.",
        sections: [
            {
                title: 'Measurements',
                fields: [
                    { id: 'weight', type: 'number', label: 'Weight', unit: 'kg', step: '0.1', min: 1, max: 400 },
                    { id: 'weightHow', type: 'choice', label: 'Weight was', options: ['Measured', 'Reported by patient', 'Estimated'] },
                    { id: 'height', type: 'number', label: 'Height', unit: 'cm', step: '0.1', min: 40, max: 250 },
                    { id: 'heightHow', type: 'choice', label: 'Height was', options: ['Measured', 'Reported by patient', 'Estimated (e.g. ulna length)'] },
                    { id: 'bmiResult', type: 'computed', label: 'BMI', compute: (v) => {
                        const b = bmi(v.weight, v.height);
                        return b === null ? null : { tone: 'neutral', text: `${b} kg/m²` };
                    } },
                    { id: 'prevWeight', type: 'number', label: 'Previous weight', unit: 'kg', step: '0.1', min: 1, max: 400 },
                    { id: 'prevWhen', type: 'text', label: 'Previous weight when', hint: 'e.g. 3 months ago' },
                    { id: 'change', type: 'computed', label: 'Weight change', compute: (v) => {
                        const c = weightChangePercent(v.prevWeight, v.weight);
                        if (c === null) return null;
                        const when = v.prevWhen ? ` since ${v.prevWhen}` : '';
                        if (c > 0) return { tone: c >= 5 ? 'amber' : 'neutral', text: `${c}% lost${when} (${v.prevWeight} kg to ${v.weight} kg)` };
                        if (c < 0) return { tone: 'neutral', text: `${-c}% gained${when} (${v.prevWeight} kg to ${v.weight} kg)` };
                        return { tone: 'neutral', text: `No change${when}` };
                    } },
                    { id: 'acute', type: 'flag', label: 'Acutely unwell and has had, or is likely to have, no nutritional intake for more than 5 days',
                        note: 'Acutely unwell with no nutritional intake for more than 5 days, or likely to be.' }
                ]
            },
            {
                title: 'MUST result',
                fields: [
                    { id: 'mustScore', type: 'number', label: 'MUST score', min: 0, max: 6 },
                    { id: 'mustRisk', type: 'choice', label: 'Risk of malnutrition', options: ['Low', 'Medium', 'High'] },
                    { id: 'mustAdvice', type: 'advice', compute: (v) => v.mustRisk
                        ? { tone: v.mustRisk === 'High' ? 'amber' : 'neutral', text: 'Follow the care plan for this risk category on your MUST form or local policy.' } : null }
                ]
            },
            {
                title: 'Eating and drinking',
                fields: [
                    { id: 'diet', type: 'checks', label: 'Diet', options: [
                        'Normal diet', 'Texture-modified food (IDDSI level below)', 'Thickened drinks (IDDSI level below)',
                        'Special diet (e.g. diabetic, renal, coeliac)', 'Cultural, religious or personal food needs',
                        'Food allergy or intolerance', 'Nil by mouth (as instructed)', 'Enteral (tube) feed', 'Parenteral nutrition'
                    ] },
                    { id: 'dietDetail', type: 'text', label: 'Diet details', hint: 'e.g. IDDSI level 5 minced and moist, level 1 slightly thick drinks' },
                    { id: 'help', type: 'choice', label: 'Help needed', options: [
                        'Independent', 'Set-up only (opening packets, positioning)', 'Prompting', 'Full assistance'
                    ] },
                    { id: 'eatingIssues', type: 'checks', label: 'Problems', options: [
                        'None', 'Poor appetite', 'Nausea or vomiting', 'Sore mouth or teeth / dentures', 'Swallowing concerns', 'Constipation or diarrhoea'
                    ] },
                    { id: 'swallowAdvice', type: 'advice', compute: (v) => includes(v, 'eatingIssues', 'Swallowing concerns')
                        ? { tone: 'amber', text: 'Swallowing concerns: follow your local swallow screen and speech and language therapy referral policy.' } : null }
                ]
            },
            {
                title: 'Intake',
                fields: [
                    { id: 'meal', type: 'choice', label: 'Last meal eaten', options: ['All', 'Three quarters', 'Half', 'Quarter', 'None', 'Declined'] },
                    { id: 'fluids', type: 'number', label: 'Oral fluids so far today', unit: 'mL', min: 0, max: 10000 },
                    { id: 'charts', type: 'checks', label: 'Charts', options: ['Food chart started', 'Fluid balance chart started', 'Weekly weight planned'] }
                ]
            },
            {
                title: 'Actions',
                fields: [
                    { id: 'actions', type: 'checks', label: 'Actions', options: [
                        'Referred to dietitian', 'Supplements given as prescribed', 'Snacks offered between meals',
                        'Help with meals arranged', 'Speech and language therapy referral', 'Medical team informed', 'Re-screen planned'
                    ] },
                    { id: 'plan', type: 'textarea', label: 'Plan / other' }
                ]
            }
        ]
    },

    // -----------------------------------------------------------------------------------------
    {
        id: 'falls',
        title: 'Falls check',
        blurb: 'Multifactorial falls check and safety measures, without a risk score.',
        icon: 'footprints',
        group: 'Assessments',
        sources: ['falls', 'nmc'],
        intro: 'NICE NG249 (2025) advises against using falls risk prediction tools to predict falls. Instead, look for and act on each risk factor.',
        sections: [
            {
                title: 'History',
                fields: [
                    { id: 'history', type: 'choice', label: 'Falls', options: [
                        'No falls in the last year', 'Has fallen in the last year', 'Admitted after a fall', 'Fallen during this admission'
                    ] },
                    { id: 'fear', type: 'flag', label: 'Worried about falling', note: 'Worried about falling.' }
                ]
            },
            {
                title: 'Risk factors checked',
                fields: [
                    { id: 'lsbp', type: 'choice', label: 'Lying and standing BP', options: [
                        'Done - no significant drop', 'Done - drop found, medical team told', 'Not possible (see notes)', 'Planned'
                    ] },
                    { id: 'lsbpValues', type: 'text', label: 'Lying and standing BP readings', hint: 'e.g. lying 132/80; standing 1 min 118/76; 3 min 115/74' },
                    { id: 'cognition', type: 'choice', label: 'Cognition / delirium', options: [
                        'No concerns', 'Delirium screen negative', 'Delirium screen positive - medical team told', 'Known dementia or cognitive impairment'
                    ] },
                    { id: 'factors', type: 'checks', label: 'Other factors found', options: [
                        'Unsteady walking or balance', 'Needs a walking aid', 'Poor eyesight', 'Hearing problems',
                        'Needs to get to the toilet urgently or often', 'Dizziness', 'Medicines that raise falls risk',
                        'Low sodium or other blood result flagged', 'Unsafe or poorly fitting footwear', 'Alcohol'
                    ] }
                ]
            },
            {
                title: 'Safety measures in place',
                fields: [
                    { id: 'measures', type: 'checks', label: 'In place', selectAll: true, options: [
                        'Call bell in reach and patient can use it', 'Bed at lowest safe height, brakes on',
                        'Well-fitting, non-slip footwear', 'Walking aid within reach', 'Glasses and hearing aids on or in reach',
                        'Clutter cleared and lighting suitable', 'Toileting plan', 'Bed rails assessment completed',
                        'Close observation / bay with staff presence'
                    ] },
                    { id: 'referrals', type: 'checks', label: 'Referred or requested', options: [
                        'Medication review', 'Physiotherapy', 'Occupational therapy', 'Bone health review'
                    ] },
                    { id: 'info', type: 'flag', label: 'Falls information given to patient or family', note: 'Falls information given to patient or family.' },
                    { id: 'plan', type: 'textarea', label: 'Plan / other' }
                ]
            }
        ]
    },

    // -----------------------------------------------------------------------------------------
    {
        id: 'comfort',
        title: 'Comfort round',
        blurb: 'Intentional rounding: pain, position, personal needs, possessions.',
        icon: 'bed-double',
        group: 'Routine care',
        sources: ['nmc'],
        sections: [
            {
                title: 'Round',
                fields: [
                    { id: 'state', type: 'choice', label: 'Patient', options: ['Awake', 'Asleep - not woken, breathing observed'] },
                    { id: 'pain', type: 'number', label: 'Pain score', unit: '/10', min: 0, max: 10 },
                    { id: 'painAction', type: 'choice', label: 'Pain', options: [
                        'No pain', 'Pain relief offered or given as prescribed', 'Pain escalated'
                    ] },
                    { id: 'position', type: 'choice', label: 'Position', options: [
                        'Repositioned - left side', 'Repositioned - right side', 'Repositioned - on back', 'Sitting out',
                        'Moves independently', 'Declined repositioning'
                    ] },
                    { id: 'personal', type: 'checks', label: 'Personal needs', options: [
                        'Toilet offered', 'Pad checked or changed', 'Catheter bag checked', 'Mouth care given',
                        'Drink offered', 'Food or snack offered'
                    ] },
                    { id: 'reach', type: 'checks', label: 'Within reach and safe', selectAll: true, options: [
                        'Call bell', 'Drink', 'Glasses, hearing aids or phone', 'Bed at lowest height, brakes on',
                        'Comfortable temperature, light and noise'
                    ] },
                    { id: 'notes', type: 'textarea', label: 'Patient said / other' }
                ]
            }
        ]
    },

    // -----------------------------------------------------------------------------------------
    {
        id: 'cannula',
        title: 'Cannula check',
        blurb: 'Peripheral cannula site check with VIP score.',
        icon: 'syringe',
        group: 'Routine care',
        sources: ['vip', 'nmc'],
        intro: 'Check and score the site as often as your local policy says. Remove any cannula that is no longer needed.',
        sections: [
            {
                title: 'Cannula',
                fields: [
                    { id: 'site', type: 'select', label: 'Site', options: ['', 'Back of hand', 'Forearm', 'Wrist', 'Antecubital fossa', 'Upper arm', 'Foot', 'Other'] },
                    { id: 'side', type: 'choice', label: 'Side', options: ['Left', 'Right'] },
                    { id: 'gauge', type: 'select', label: 'Size', options: ['', '24G (yellow)', '22G (blue)', '20G (pink)', '18G (green)', '16G (grey)', '14G (orange)'] },
                    { id: 'inserted', type: 'date', label: 'Date inserted' },
                    { id: 'age', type: 'computed', label: 'In place for', compute: (v) => {
                        const d = daysSince(v.inserted, v.__now);
                        if (d === null || d < 0) return null;
                        return { tone: 'neutral', text: `${d} day${d === 1 ? '' : 's'} (inserted ${formatDate(v.inserted)})` };
                    } }
                ]
            },
            {
                title: 'VIP score',
                fields: [
                    { id: 'vip', type: 'choice', label: 'VIP score', print: false, options: VIP.map((x) => `${x.score}`),
                        optionHints: VIP.map((x) => x.signs) },
                    { id: 'vipResult', type: 'computed', label: 'VIP score', compute: (v) => {
                        if (v.vip === undefined || v.vip === '') return null;
                        const x = VIP[Number(v.vip)];
                        return { tone: x.score >= 2 ? 'amber' : 'green', text: `${x.score} (${x.signs}). ${x.stage}.` };
                    } },
                    { id: 'vipAdvice', type: 'advice', compute: (v) => {
                        if (v.vip === undefined || v.vip === '') return null;
                        const x = VIP[Number(v.vip)];
                        return { tone: x.score >= 2 ? 'amber' : 'green', text: `Suggested action: ${x.action}.` };
                    } }
                ]
            },
            {
                title: 'Care',
                fields: [
                    { id: 'dressing', type: 'checks', label: 'Dressing', options: ['Clean, dry and intact', 'Changed', 'Cannula secure'] },
                    { id: 'flush', type: 'choice', label: 'Flush', options: ['Flushed without problem', 'Not flushed', 'Resistance or pain on flushing'] },
                    { id: 'needed', type: 'choice', label: 'Still needed?', options: [
                        'Yes (reason below)', 'No - removed, tip intact', 'Removed because of VIP score - resite requested'
                    ] },
                    { id: 'reason', type: 'text', label: 'Reason still needed', showIf: (v) => v.needed === 'Yes (reason below)' },
                    { id: 'notes', type: 'textarea', label: 'Notes' }
                ]
            }
        ]
    },

    // -----------------------------------------------------------------------------------------
    {
        id: 'catheter',
        title: 'Catheter care',
        blurb: 'Urinary catheter check: reason, care, output and plan.',
        icon: 'droplet',
        group: 'Routine care',
        sources: ['nmc'],
        intro: 'Review every day whether the catheter is still needed.',
        sections: [
            {
                title: 'Catheter',
                fields: [
                    { id: 'type', type: 'choice', label: 'Type', options: ['Urethral', 'Suprapubic'] },
                    { id: 'details', type: 'text', label: 'Size and type', hint: 'e.g. 12 Ch, short-term' },
                    { id: 'inserted', type: 'date', label: 'Date inserted' },
                    { id: 'age', type: 'computed', label: 'In place for', compute: (v) => {
                        const d = daysSince(v.inserted, v.__now);
                        if (d === null || d < 0) return null;
                        return { tone: 'neutral', text: `${d} day${d === 1 ? '' : 's'} (inserted ${formatDate(v.inserted)})` };
                    } },
                    { id: 'reason', type: 'checks', label: 'Reason still needed', options: [
                        'Retention or obstruction', 'Haematuria with clots', 'After urological surgery',
                        'Accurate urine output monitoring', 'Open sacral or perineal wound with incontinence',
                        'End-of-life comfort', 'Immobility (e.g. unstable fracture)', 'Long-term catheter',
                        'No clear reason - raised for removal'
                    ] }
                ]
            },
            {
                title: 'Care given',
                fields: [
                    { id: 'care', type: 'checks', label: 'Care', selectAll: true, options: [
                        'Meatal or site hygiene', 'Closed system intact', 'Bag below bladder and off the floor',
                        'Catheter secured with fixation device', 'Bag emptied', 'Catheter passport in place'
                    ] },
                    { id: 'output', type: 'number', label: 'Urine output', unit: 'mL', min: 0, max: 10000 },
                    { id: 'outputOver', type: 'text', label: 'Output over', hint: 'e.g. 4 hours' },
                    { id: 'urine', type: 'checks', label: 'Urine', options: [
                        'Clear, straw-coloured', 'Concentrated', 'Cloudy', 'Debris or sediment', 'Blood-stained', 'Offensive smell'
                    ] },
                    { id: 'problems', type: 'checks', label: 'Problems', options: [
                        'None', 'Fever or rigors', 'New confusion', 'Suprapubic or loin pain', 'Bypassing', 'Not draining'
                    ] }
                ]
            },
            {
                title: 'Plan',
                fields: [
                    { id: 'next', type: 'choice', label: 'Plan', options: [
                        'Continue', 'Trial without catheter planned', 'Removed', 'Changed', 'Medical team informed'
                    ] },
                    { id: 'plan', type: 'textarea', label: 'Plan / other' }
                ]
            }
        ]
    },

    // -----------------------------------------------------------------------------------------
    {
        id: 'handover',
        title: 'Handover (SBAR)',
        blurb: 'Structured handover summary for the record.',
        icon: 'arrow-left-right',
        group: 'Communication',
        sources: ['nmc'],
        sections: [
            {
                title: 'SBAR',
                fields: [
                    { id: 'situation', type: 'textarea', label: 'Situation' },
                    { id: 'background', type: 'textarea', label: 'Background' },
                    { id: 'news', type: 'number', label: 'Latest NEWS2', min: 0, max: 20 },
                    { id: 'trend', type: 'choice', label: 'Trend', options: ['Improving', 'Stable', 'Worsening'] },
                    { id: 'assessment', type: 'textarea', label: 'Assessment' },
                    { id: 'recommendation', type: 'textarea', label: 'Recommendation' }
                ]
            },
            {
                title: 'Risks and tasks',
                fields: [
                    { id: 'risks', type: 'checks', label: 'Risks to note', options: [
                        'Allergies', 'Falls risk', 'Pressure ulcer risk or damage', 'Nutrition risk', 'Delirium or confusion',
                        'Infection precautions / isolation', 'Safeguarding concern', 'DNACPR / ReSPECT in place',
                        'Diabetes', 'Anticoagulants', 'Nil by mouth'
                    ] },
                    { id: 'tasks', type: 'textarea', label: 'Outstanding tasks' }
                ]
            }
        ]
    },

    // -----------------------------------------------------------------------------------------
    {
        id: 'declined',
        title: 'Declined care',
        blurb: 'When a patient declines care, treatment or observations.',
        icon: 'hand',
        group: 'Communication',
        sources: ['mca', 'nmc'],
        sections: [
            {
                title: 'What happened',
                fields: [
                    { id: 'offered', type: 'text', label: 'Care or treatment offered' },
                    { id: 'explained', type: 'flag', label: 'Explained what it involves, why it is recommended and the risks of declining',
                        note: 'Explained what it involves, why it is recommended and the risks of declining.' },
                    { id: 'reason', type: 'textarea', label: "Patient's reason", hint: 'in their own words if possible' }
                ]
            },
            {
                title: 'Capacity',
                fields: [
                    { id: 'capacity', type: 'choice', label: 'Capacity', options: [
                        'No concerns about capacity for this decision',
                        'Concerns - capacity assessed (see record)',
                        'Concerns - escalated for capacity assessment'
                    ] }
                ]
            },
            {
                title: 'Next steps',
                fields: [
                    { id: 'alternatives', type: 'checks', label: 'Offered', options: [
                        'An alternative', 'At a different time', 'With a different member of staff', 'With family or carer present (with consent)'
                    ] },
                    { id: 'escalated', type: 'checks', label: 'Escalated to', options: ['Nurse in charge', 'Medical team', 'Safeguarding team'] },
                    { id: 'reoffer', type: 'text', label: 'Will offer again at' },
                    { id: 'notes', type: 'textarea', label: 'Notes' }
                ]
            }
        ]
    }
];

export { SOURCES, yes };
