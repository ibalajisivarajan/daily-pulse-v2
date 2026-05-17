'use strict';

// Node 20 provides global fetch — no node-fetch import needed
const { load }                    = require('cheerio');
const { writeFileSync, mkdirSync } = require('fs');
const { join }                    = require('path');

const OUTPUT_PATH    = join(__dirname, '..', 'data', 'stories.json');
const HN_API         = 'https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=30';
const BATCH_SIZE     = 5;
const FETCH_TIMEOUT_MS = 8000;

// ── Exported pure helpers ────────────────────────────────────────────────────

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
    id:       hit.objectID,
    title:    hit.title        || '',
    url,
    domain:   extractDomain(url),
    score:    hit.points       != null ? hit.points       : 0,
    comments: hit.num_comments != null ? hit.num_comments : 0,
    time:     hit.created_at_i || 0,
    image:    image || null,
    gradient: assignGradient(index),
  };
}

// ── Private helpers ──────────────────────────────────────────────────────────

function resolveUrl(src, base) {
  if (!src) return null;
  if (/^https?:\/\//i.test(src)) return src;
  try {
    return new URL(src, base).href;
  } catch {
    return null;
  }
}

function isHttpUrl(url) {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

async function getOgImage(storyUrl) {
  if (!storyUrl || !isHttpUrl(storyUrl)) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(storyUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DailyPulse/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
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
      $('meta[name="og:image"]').attr('content') ||
      $('meta[property="twitter:image"]').attr('content') ||
      $('meta[name="twitter:image"]').attr('content') ||
      null;

    const resolved = resolveUrl(raw, storyUrl);
    return resolved && isHttpUrl(resolved) ? resolved : null;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

async function processHit(hit, index) {
  const image = await getOgImage(hit.url || null);
  return buildStoryObject(hit, image, index);
}

async function main() {
  console.log('Fetching top HN stories…');

  const res = await fetch(HN_API);
  if (!res.ok) throw new Error(`HN API error: ${res.status}`);

  const data = await res.json();
  const hits = data.hits || [];
  console.log(`Got ${hits.length} stories. Fetching og:images in batches of ${BATCH_SIZE}…`);

  const stories = [];
  for (let i = 0; i < hits.length; i += BATCH_SIZE) {
    const batch = hits.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map((hit, j) => processHit(hit, i + j)));
    stories.push(...results);
    const done = Math.min(i + BATCH_SIZE, hits.length);
    process.stdout.write(`  Progress: ${done}/${hits.length}\r`);
  }

  console.log('');
  mkdirSync(join(__dirname, '..', 'data'), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(stories, null, 2));
  console.log(`Done. ${stories.length} stories written to data/stories.json`);
}

// Only execute when run directly — not when required by tests
if (require.main === module) {
  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { extractDomain, assignGradient, buildStoryObject };
