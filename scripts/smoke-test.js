// Fails the build if a file the service worker precaches is missing, or the versions disagree.
import { readFileSync, existsSync } from 'node:fs';

const sw = readFileSync('sw.js', 'utf8');
const list = sw.match(/STATIC_ASSETS = \[([\s\S]*?)\]/)[1].match(/'([^']+)'/g).map((s) => s.slice(1, -1));
const missing = list.filter((p) => p !== './' && !existsSync(p));
if (missing.length) { console.error('Missing precached files:', missing); process.exit(1); }

const swVersion = sw.match(/SW_VERSION = 'nn-v([\d.]+)'/)[1];
const appVersion = readFileSync('js/app.js', 'utf8').match(/VERSION = '([\d.]+)'/)[1];
if (swVersion !== appVersion) { console.error(`sw.js (${swVersion}) and app.js (${appVersion}) versions differ`); process.exit(1); }
console.log(`Smoke test passed: ${list.length} precached files, version ${appVersion}`);
