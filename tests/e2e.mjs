// End-to-end check in Chromium at phone and desktop sizes, served with the live CSP header.
// Run: node tests/e2e.mjs [screenshotDir]
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const root = new URL('..', import.meta.url).pathname;
const csp = readFileSync(join(root, 'netlify.toml'), 'utf8').match(/Content-Security-Policy = "([^"]+)"/)[1];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const f = join(root, p);
    if (!existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': types[extname(f)] || 'application/octet-stream', 'Content-Security-Policy': csp });
    res.end(readFileSync(f));
}).listen(0);
const base = `http://localhost:${server.address().port}/`;
const shots = process.argv[2];
if (shots) mkdirSync(shots, { recursive: true });

let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) failures++; };

const browser = await chromium.launch();
for (const [name, viewport] of [['phone', { width: 360, height: 740 }], ['desktop', { width: 1280, height: 860 }]]) {
    const ctx = await browser.newContext({ viewport, permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error' && !/raw\.githubusercontent/.test(m.text())) errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto(base);
    check(await page.locator('.template-card').count() === 10, `${name}: 10 templates on home`);
    if (shots) await page.screenshot({ path: `${shots}/${name}-home.png`, fullPage: true });

    await page.click('text=Deteriorating patient');
    await page.waitForSelector('#f-rr');
    for (const [id, val] of [['rr', '26'], ['spo2', '92'], ['sbp', '95'], ['hr', '118'], ['temp', '38.6'], ['prevNews', '4']]) {
        await page.fill(`#f-${id}`, val);
    }
    await page.click('[data-field="spo2scale"] >> text=Scale 1');
    await page.click('[data-field="oxygen"] >> text=Oxygen');
    await page.fill('#f-o2detail', 'nasal cannulae 2 L/min');
    await page.click('[data-field="acvpu"] >> text=Confusion (new)');
    await page.click('[data-field="escalatedTo"] >> text=Critical care outreach');
    const note = await page.textContent('#noteText');
    check(/NEWS2: 15, high clinical risk/.test(note), `${name}: NEWS2 15 in note`);
    check(/Rising \(up 11 from 4\)/.test(note), `${name}: trend in note`);
    check(await page.isVisible('[data-field="newsAdvice"] .callout.red'), `${name}: red RCP advice shown`);

    // tapping a selected choice again clears it
    await page.click('[data-field="acvpu"] >> text=Confusion (new)');
    check(/Partial score/.test(await page.textContent('#noteText')), `${name}: choice can be cleared`);
    await page.click('[data-field="acvpu"] >> text=Confusion (new)');

    await page.fill('#f-situation', 'Spoke to Mrs Jones about her NHS number 943 476 5919');
    check(await page.isVisible('#idWarning'), `${name}: identifier warning shown`);
    await page.fill('#f-situation', 'NEWS2 15 with new confusion');
    check(!(await page.isVisible('#idWarning')), `${name}: warning clears`);
    if (shots) await page.screenshot({ path: `${shots}/${name}-deteriorating.png`, fullPage: true });

    const copyBtn = name === 'phone' ? '#copyBarBtn' : '#copyBtn';
    await page.click(copyBtn);
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    check(clip.startsWith('Nursing note: Deteriorating patient') && clip.includes('NEWS2 15'), `${name}: copy puts the note on the clipboard`);

    // storage holds no patient data
    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
    check(!/26|92|confusion|NEWS2/i.test(stored), `${name}: nothing from the form is in storage (${stored})`);

    // skin template rows
    await page.goto(base + '#t/skin');
    await page.click('text=+ Add an area');
    const sel = page.locator('.row-item select');
    await sel.nth(0).selectOption('Sacrum');
    await sel.nth(2).selectOption('Category 2');
    check(/Sacrum, Category 2/.test(await page.textContent('#noteText')), `${name}: skin row in note`);
    check(await page.isVisible('[data-field="damageAdvice"] .callout.amber'), `${name}: category 2 advice shown`);
    if (shots) await page.screenshot({ path: `${shots}/${name}-skin.png`, fullPage: true });

    // every template opens without errors and without horizontal scroll
    for (const id of ['first-contact', 'nutrition', 'falls', 'comfort', 'cannula', 'catheter', 'handover', 'declined']) {
        await page.goto(base + '#t/' + id);
        await page.waitForSelector('.note-form');
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
        check(!overflow, `${name}: ${id} has no sideways scroll`);
        if (shots && name === 'phone' && id === 'cannula') await page.screenshot({ path: `${shots}/${name}-cannula.png`, fullPage: true });
    }

    // dark mode toggle
    await page.click('#themeBtn');
    check(['dark', 'light'].includes(await page.evaluate(() => document.documentElement.dataset.theme)), `${name}: theme toggles`);
    if (shots) await page.screenshot({ path: `${shots}/${name}-dark.png`, fullPage: false });

    check(errors.length === 0, `${name}: no console errors ${errors.join(' | ')}`);
    await ctx.close();
}
await browser.close();
server.close();
console.log(failures ? `${failures} failure(s)` : 'All e2e checks passed');
process.exit(failures ? 1 : 0);
