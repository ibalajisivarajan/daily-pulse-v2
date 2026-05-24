'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

let passed = 0;
let failed = 0;

function check(label, fn) {
  try {
    const ok = fn();
    if (ok !== false) {
      console.log(`  ✅ ${label}`);
      passed++;
    } else {
      console.log(`  ❌ ${label}`);
      failed++;
    }
  } catch (err) {
    console.log(`  ❌ ${label}: ${err.message}`);
    failed++;
  }
}

// ── 1. Required files ────────────────────────────────────────────────────────
console.log('\n📁  File existence');
const REQUIRED_FILES = [
  'index.html',
  'data/stories.json',
  'scripts/fetch.js',
  'scripts/app-logic.js',
  '.github/workflows/fetch-stories.yml',
  'CLAUDE.md',
  'TESTPLAN.md',
  'package.json',
  'README.md',
];
REQUIRED_FILES.forEach(f => {
  check(`Exists: ${f}`, () => fs.existsSync(path.join(ROOT, f)));
});

// ── 2. data/stories.json ─────────────────────────────────────────────────────
console.log('\n📊  data/stories.json');
check('Valid JSON', () => {
  JSON.parse(fs.readFileSync(path.join(ROOT, 'data/stories.json'), 'utf8'));
  return true;
});
check('Is an array', () => {
  return Array.isArray(JSON.parse(fs.readFileSync(path.join(ROOT, 'data/stories.json'), 'utf8')));
});
check('First story has required fields and gradient 1–5 (skip if empty)', () => {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/stories.json'), 'utf8'));
  if (data.length === 0) return true;
  const s = data[0];
  const required = ['id', 'title', 'url', 'domain', 'score', 'comments', 'time', 'image', 'gradient'];
  const missing = required.filter(k => !(k in s));
  if (missing.length) throw new Error(`Missing fields: ${missing.join(', ')}`);
  if (s.gradient < 1 || s.gradient > 5) throw new Error(`Invalid gradient: ${s.gradient}`);
  return true;
});

// ── Output contract ──────────────────────────────────────────────────────────
console.log('\n── Output contract ──');

try {
  const stories = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'data/stories.json'), 'utf8')
  );

  const pass = (label)       => { console.log(`  ✅ ${label}`); passed++; };
  const fail = (label, msg)  => { console.log(`  ❌ ${label}: ${msg}`); failed++; };

  const hasFiltered = stories.some(s => s.filtered === true);
  if (hasFiltered) {
    fail('No filtered stories in output (DP2-013)',
         'stories.json contains filtered=true stories — backfill logic must be removed');
  } else {
    pass('No filtered stories in final output');
  }

  if (stories.length <= 30) {
    pass(`Story count within limit (${stories.length} stories)`);
  } else {
    fail('Story count within limit',
         `${stories.length} exceeds maximum of 30`);
  }

  const categories = [...new Set(stories.map(s => s.category))];
  if (categories.length >= 2) {
    pass(`Multiple categories present: ${categories.join(', ')}`);
  } else {
    fail('Multiple categories present',
         `Only found: ${categories.join(', ')}`);
  }

} catch (e) {
  console.log(`  ❌ Output contract check: ${e.message}`);
  failed++;
}

// ── 3. index.html content ────────────────────────────────────────────────────
console.log('\n🌐  index.html content');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
[
  'Barlow+Condensed',
  'Nunito+Sans',
  'scroll-snap-type',
  'scroll-snap-stop',
  '100dvh',
  'stories.json',
  'open-meteo.com',
  'nominatim.openstreetmap.org',
  'geolocation',
  'Enable location',
  'IntersectionObserver',
  'detectCategory',
  'timeAgo',
].forEach(s => check(`Contains "${s}"`, () => html.includes(s)));

// ── 4. fetch-stories.yml content ─────────────────────────────────────────────
console.log('\n⚙️   fetch-stories.yml content');
const yml = fs.readFileSync(path.join(ROOT, '.github/workflows/fetch-stories.yml'), 'utf8');
[
  'workflow_dispatch',
  'stories.json',
  'skip ci',
  'git config',
  'git diff',
].forEach(s => check(`Contains "${s}"`, () => yml.includes(s)));
check('No cron schedule (manual dispatch only)', () => !yml.includes('cron'));

// ── 5. package.json deps ─────────────────────────────────────────────────────
console.log('\n📦  package.json');
check('Has cheerio, node-fetch, jest and a test script', () => {
  const pkg  = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  if (!deps['cheerio'])    throw new Error('Missing cheerio');
  if (!deps['node-fetch']) throw new Error('Missing node-fetch');
  if (!deps['jest'])       throw new Error('Missing jest');
  if (!pkg.scripts || !pkg.scripts.test) throw new Error('Missing test script');
  return true;
});

// ── Summary ──────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(52));
console.log(`  ✅ PASSED:           ${passed}`);
console.log(`  ❌ FAILED:           ${failed}`);
console.log(`  ⚠️  MANUAL REQUIRED: 8`);
console.log('');
console.log('  Manual test checklist:');
console.log('  1. Scroll snap works on real iPhone Safari');
console.log('  2. Geolocation permission prompt appears on first load');
console.log('  3. Weather pill shows correct temp and city');
console.log('  4. Story images load correctly');
console.log('  5. Gradient fallbacks render with no broken images');
console.log('  6. Read button opens article in new tab');
console.log('  7. Swipe hint animates and fades on first card only');
console.log('  8. GitHub Pages URL loads correctly after deploy');
console.log('');

if (failed > 0) process.exit(1);
