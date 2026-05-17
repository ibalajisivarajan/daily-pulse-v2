'use strict';

const { load }                     = require('cheerio');
const { writeFileSync, mkdirSync } = require('fs');
const { join }                     = require('path');

const OUTPUT_PATH  = join(__dirname, '..', 'data', 'stories.json');
const HN_API       = 'https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=30';
const BATCH_SIZE   = 5;
const OG_TIMEOUT_MS = 3000;

// ── Exported pure helpers (used by tests) ────────────────────────────────────

function extractDomain(url) {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function assignGradient(index) {
  return (index % 5) + 1;
}

function buildStoryObject(hit, image, index) {
  const url = hit.url || null;
  return {
    id:       String(hit.objectID),
    title:    hit.title        || '',
    url,
    domain:   extractDomain(url),
    score:    hit.points       != null ? hit.points       : 0,
    comments: hit.num_comments != null ? hit.num_comments : 0,
    time:     hit.created_at_i || 0,
    image,          // always a non-null string
    gradient: assignGradient(index),
  };
}

// ── Private helpers ──────────────────────────────────────────────────────────

async function getOgImage(storyUrl) {
  if (!storyUrl) return null;
  const domain = extractDomain(storyUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OG_TIMEOUT_MS);
  try {
    const res = await fetch(storyUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DailyPulse/1.0)',
        'Accept':     'text/html,application/xhtml+xml',
      },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('text/html')) return null;
    const html = await res.text();
    const $ = load(html);
    const raw =
      $('meta[property="og:image"]').attr('content') ||
      $('meta[name="og:image"]').attr('content')     ||
      $('meta[property="twitter:image"]').attr('content') ||
      $('meta[name="twitter:image"]').attr('content') ||
      null;
    if (!raw) return null;
    const resolved = /^https?:\/\//i.test(raw) ? raw : new URL(raw, storyUrl).href;
    return /^https?:\/\//i.test(resolved) ? resolved : null;
  } catch (err) {
    clearTimeout(timer);
    console.error('og:image failed for:', extractDomain(storyUrl), err.message);
    return null;
  }
}

async function processHit(hit, index) {
  const ogImage = await getOgImage(hit.url || null);
  const image   = ogImage || `https://picsum.photos/seed/${hit.objectID}/900/1600`;
  return buildStoryObject(hit, image, index);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  mkdirSync(join(__dirname, '..', 'data'), { recursive: true });

  // Fetch HN front page — write [] and exit cleanly on any failure
  let hits = [];
  try {
    console.log('Fetching HN front page…');
    const res = await fetch(HN_API, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DailyPulse/1.0)',
        'Accept':     'application/json',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    hits = data.hits || [];
    console.log(`Got ${hits.length} stories from HN.`);
  } catch (err) {
    console.error('HN API failed:', err.message, '— writing [] and exiting cleanly');
    writeFileSync(OUTPUT_PATH, '[]');
    console.log('0 stories written to data/stories.json');
    return;
  }

  // Scrape og:images in parallel batches
  console.log(`Fetching og:images (${OG_TIMEOUT_MS / 1000}s timeout, batches of ${BATCH_SIZE})…`);
  const stories = [];
  for (let i = 0; i < hits.length; i += BATCH_SIZE) {
    const batch   = hits.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map((hit, j) => processHit(hit, i + j)));
    stories.push(...results);
    process.stdout.write(`  ${Math.min(i + BATCH_SIZE, hits.length)}/${hits.length}\r`);
  }
  console.log('');

  writeFileSync(OUTPUT_PATH, JSON.stringify(stories, null, 2));
  console.log(`Done. ${stories.length} stories written to data/stories.json`);
}

if (require.main === module) {
  main().catch(err => {
    console.error('Unexpected error:', err.message);
    writeFileSync(OUTPUT_PATH, '[]');
    process.exit(0); // exit cleanly — never leave the workflow red for infra reasons
  });
}

module.exports = { extractDomain, assignGradient, buildStoryObject };
