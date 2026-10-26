# Nursing Notes

An educational aid that helps nurses write clear, structured notes for tasks they document many times a shift, ready to copy into the electronic patient record (EPR).

**Nothing about the patient is stored or sent.** Answers live in the browser tab's memory only. The app warns if free text looks like it contains an identifier (NHS number, phone number, postcode, email, a name with a title, DOB/MRN wording).

## Templates

First contact / admission, Deteriorating patient (NEWS2 worked out, SBAR escalation), Skin check (aSSKINg), Nutrition check (BMI and weight change worked out; MUST result recorded from the nurse's own form), Falls check (multifactorial, no risk score, per NICE NG249), Comfort round, Cannula check (VIP score), Catheter care, Handover (SBAR), Declined care.

Templates are data in `js/templates.js`; `js/note.js` turns answers into text; `js/scores.js` holds the calculations (NEWS2, BMI, weight change, dates, VIP wording, identifier check).

## Deliberately not calculated

- MUST: (c) BAPEN, adaptation needs their written permission. The app records the score from the nurse's MUST form.
- Waterlow, Braden, PURPOSE T: copyrighted and locally chosen. The app records the score from the local form.

## Running and testing

Static site, no build. Serve the folder with any static server.

```
npm test            # smoke test (precache list + versions) and unit tests
node tests/e2e.mjs  # Chromium checks at phone and desktop size, with the live CSP
```

Release: bump `VERSION` in `js/app.js` and `SW_VERSION` in `sw.js` together (the smoke test fails if they differ).

Hosted on Netlify (publish directory `.`, build command `node scripts/smoke-test.js`). Provided by West Midlands Evidence Based Emergency Medicine Ltd (company no. 16644703).
