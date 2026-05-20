'use strict';

const { load }      = require('cheerio');
const { writeFileSync, readFileSync, mkdirSync } = require('fs');
const { join }      = require('path');

const OUTPUT_PATH = join(__dirname, '..', 'data', 'stories.json');
const PREFS_PATH  = join(__dirname, '..', 'data', 'preferences.json');

const HN_API     = 'https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=40';
const BATCH_SIZE = 5;
const OG_TIMEOUT = 4000;

const DEFAULT_PREFS = {
  ai: 3, tech: 3, finance: 3, geo: 3,
  sports: 3, science: 3, health: 3, climate: 3,
};

// ── Env loader (reads .env for local dev) ─────────────────────────────────────

function loadEnv() {
  try {
    const lines = readFileSync(join(__dirname, '..', '.env'), 'utf8').split('\n');
    for (const line of lines) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
      }
    }
  } catch {}
}

function loadPreferences() {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(readFileSync(PREFS_PATH, 'utf8')) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

// ── HN data source ────────────────────────────────────────────────────────────

function extractDomain(url) {
  if (!url) return '';
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

async function getOgImage(storyUrl) {
  if (!storyUrl) return null;
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), OG_TIMEOUT);
  try {
    const res = await fetch(storyUrl, {
      signal:  ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DailyPulse/2.0)', 'Accept': 'text/html' },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('text/html')) return null;
    const html = await res.text();
    const $    = load(html);
    const raw  =
      $('meta[property="og:image"]').attr('content')    ||
      $('meta[name="og:image"]').attr('content')        ||
      $('meta[property="twitter:image"]').attr('content') ||
      $('meta[name="twitter:image"]').attr('content')   || null;
    if (!raw) return null;
    const resolved = /^https?:\/\//i.test(raw) ? raw : new URL(raw, storyUrl).href;
    return /^https?:\/\//i.test(resolved) ? resolved : null;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

async function fetchHNStories() {
  console.log('Fetching HN front page…');
  const res = await fetch(HN_API, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DailyPulse/2.0)', 'Accept': 'application/json' },
  });
  if (!res.ok) throw new Error(`HN API HTTP ${res.status}`);
  const data = await res.json();
  const hits  = (data.hits || []).filter(h => h.url);
  console.log(`Got ${hits.length} stories with URLs.`);

  const stories = [];
  for (let i = 0; i < hits.length; i += BATCH_SIZE) {
    const batch   = hits.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map(async (hit, j) => {
      const ogImage = await getOgImage(hit.url);
      const id      = String(hit.objectID);
      return {
        id,
        title:    hit.title           || '',
        url:      hit.url,
        domain:   extractDomain(hit.url),
        score:    hit.points          ?? 0,
        comments: hit.num_comments    ?? 0,
        time:     hit.created_at_i    ?? Math.floor(Date.now() / 1000),
        image:    ogImage             || `https://picsum.photos/seed/${id}/900/1600`,
        gradient: ((i + j) % 5) + 1,
      };
    }));
    stories.push(...results);
    process.stdout.write(`  ${Math.min(i + BATCH_SIZE, hits.length)}/${hits.length}\r`);
  }
  console.log('');
  return stories;
}

// ── Groq enrichment ───────────────────────────────────────────────────────────

function buildSystemPrompt(prefs) {
  return `You are a news curator. Score each story based on these user interest levels (1-10):
🤖 AI: ${prefs.ai}
💻 Tech: ${prefs.tech}
💰 Finance: ${prefs.finance}
🌍 Geopolitics: ${prefs.geo}
⚽ Sports: ${prefs.sports}
🔬 Science: ${prefs.science}
🏥 Health: ${prefs.health}
🌱 Climate: ${prefs.climate}

For each story return:
1. category: one of 🤖 AI, 💻 Tech, 💰 Finance, 🌍 Geo, ⚽ Sports, 🔬 Science, 🏥 Health, 🌱 Climate
2. summary: one sentence max 20 words why this matters
3. relevance: integer 1-10 weighted by the interest levels above
4. filtered: true for job listings, polls, meta-discussions, relevance < 3

Return ONLY valid JSON array. No markdown. No explanation. No code blocks.
Each object: { id, title, url, domain, score, comments, time, image, gradient, category, summary, relevance, filtered }`;
}

async function enrichWithGroq(stories, prefs) {
  const _Groq  = require('groq-sdk');
  const Groq   = _Groq.default || _Groq;
  const client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const res = await client.chat.completions.create({
    model:       'llama-3.3-70b-versatile',
    messages:    [
      { role: 'system', content: buildSystemPrompt(prefs) },
      { role: 'user',   content: JSON.stringify(stories)  },
    ],
    temperature: 0.2,
    max_tokens:  8192,
  });
  return res.choices[0].message.content;
}

// ── parseGroqResponse ─────────────────────────────────────────────────────────

function parseGroqResponse(raw) {
  try {
    const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
    const stories = JSON.parse(cleaned);
    if (!Array.isArray(stories)) return [];
    return stories
      .filter(s => !s.filtered)
      .sort((a, b) => (b.relevance || 0) - (a.relevance || 0))
      .slice(0, 30);
  } catch {
    return [];
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  loadEnv();
  mkdirSync(join(__dirname, '..', 'data'), { recursive: true });
  const prefs = loadPreferences();

  // Step 1 — fetch stories from HN
  let rawStories;
  try {
    rawStories = await fetchHNStories();
  } catch (err) {
    console.error('HN fetch failed:', err.message, '— writing [] and exiting cleanly');
    writeFileSync(OUTPUT_PATH, '[]');
    console.log('Done. 0 stories written.');
    return;
  }

  if (!rawStories.length) {
    console.error('No stories fetched — writing []');
    writeFileSync(OUTPUT_PATH, '[]');
    console.log('Done. 0 stories written.');
    return;
  }

  console.log(`Got ${rawStories.length} raw stories. Sending to Groq…`);

  // Step 2 — enrich with Groq (fall back to raw stories on any failure)
  let finalStories;
  try {
    if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY not set');
    const groqRaw  = await enrichWithGroq(rawStories, prefs);
    const enriched = parseGroqResponse(groqRaw);
    if (!enriched.length) throw new Error('Groq returned empty result');
    finalStories = enriched;
    console.log(`Groq enriched ${finalStories.length} stories.`);
  } catch (err) {
    console.error('Groq enrichment failed:', err.message, '— using raw stories');
    finalStories = rawStories.slice(0, 30);
  }

  writeFileSync(OUTPUT_PATH, JSON.stringify(finalStories, null, 2));
  console.log(`Done. ${finalStories.length} stories written.`);
}

if (require.main === module) {
  main().catch(err => {
    console.error('Unexpected error:', err.message);
    writeFileSync(OUTPUT_PATH, '[]');
    process.exit(0);
  });
}

module.exports = { parseGroqResponse };
