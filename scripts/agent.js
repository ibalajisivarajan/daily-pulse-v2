#!/usr/bin/env node
// scripts/agent.js
// Daily Pulse v2 — code-controlled news agent
// Fixes DP2-014 DP2-015 DP2-016 DP2-017 DP2-018 DP2-019

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// ─── storiesForSlider ───────────────────────────────────────────────────────
// Exported for tests
function storiesForSlider(value) {
  const v = Number(value);
  if (v <= 2) return 0;   // skip tool entirely
  if (v <= 4) return 5;   // low interest
  if (v <= 6) return 7;   // medium interest
  if (v <= 8) return 10;  // high interest
  return 14;              // very high interest (9-10)
}

// Split total count across N tools as evenly as possible
function splitCount(total, numParts) {
  if (total === 0) return Array(numParts).fill(0);
  const base = Math.floor(total / numParts);
  const rem = total % numParts;
  return Array(numParts).fill(0).map((_, i) => base + (i < rem ? 1 : 0));
}

// ─── Preferences ───────────────────────────────────────────────────────────
function readPrefs() {
  const defaults = { ai:3, tech:3, finance:3, geo:3, sports:3, science:3, health:3, climate:3 };
  try {
    const raw = fs.readFileSync(path.join(ROOT, 'data/preferences.json'), 'utf8');
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    console.log('preferences.json missing or invalid — using defaults');
    return defaults;
  }
}

// ─── Tool plan ──────────────────────────────────────────────────────────────
function buildToolPlan(prefs) {
  const plan = [];
  function add(key, tools) {
    const total = storiesForSlider(prefs[key] || 3);
    if (total === 0) { console.log(`Skipping ${key} (slider <= 2)`); return; }
    const counts = splitCount(total, tools.length);
    tools.forEach((name, i) => { if (counts[i] > 0) plan.push({ name, count: counts[i], key }); });
  }
  add('ai',      ['get_ai_news_hn',          'get_ai_news_cbc']);
  add('tech',    ['get_tech_news_hn',         'get_tech_news_guardian']);
  add('finance', ['get_finance_news_guardian', 'get_finance_news_cbc']);
  add('geo',     ['get_geo_news_aljazeera',    'get_geo_news_cbc']);
  add('sports',  ['get_sports_news_bbc',       'get_sports_news_cbc',      'get_sports_news_guardian']);
  add('science', ['get_science_news_guardian', 'get_science_news_cbc']);
  add('health',  ['get_health_news_cbc',       'get_health_news_guardian']);
  add('climate', ['get_climate_news_guardian', 'get_climate_news_cbc']);
  return plan;
}

// ─── Groq system prompt ─────────────────────────────────────────────────────
const GROQ_SYSTEM = `You are a news classifier. Return ONLY a valid JSON array — no markdown, no backticks, no preamble.

For each story output exactly one object:
{"category":"<cat>","summary":"<12-20 word summary>","relevance":<1-10>,"imageQuery":"<2-3 words>","filtered":<true|false>}

CATEGORY RULES — apply in this exact order, first match wins:
1. AI — title contains any of: GPT, LLM, Claude, Gemini, OpenAI, Anthropic, artificial intelligence, machine learning, neural network, deep learning, ChatGPT, Llama, Mistral, diffusion model, AI agent, transformer model, foundation model
2. Finance — stock, market, economy, GDP, inflation, interest rate, Fed, Federal Reserve, bank, bonds, crypto, bitcoin, ETF, earnings, revenue, IPO, recession, trade deal, tariff
3. Geo — war, conflict, sanctions, treaty, election, president, prime minister, NATO, UN, military, nuclear, diplomat, ceasefire, invasion, missile, coup
4. Sports — NBA, NFL, NHL, MLB, soccer, football, basketball, tennis, golf, Olympics, championship, World Cup, league, match, tournament, player, coach, team, score
5. Science — research, study, discovery, space, NASA, biology, physics, genetics, vaccine, planet, asteroid, gene, experiment
6. Health — health, hospital, disease, cancer, drug, FDA, medical, mental health, nutrition, diet, pandemic, virus, treatment, clinical trial
7. Climate — climate change, global warming, carbon, emissions, renewable energy, solar, wind power, flood, drought, wildfire, sea level, fossil fuel, sustainability
8. Tech — all other genuine tech, startup, software, hardware, developer, open source news
9. filtered:true — if the story is: a personal project showcase, blog post, opinion piece, job posting, salary poll, "Ask HN", "Show HN" without a product link, or does not fit any category above

SUMMARY RULES (strictly enforced):
- Minimum 12 words, maximum 20 words
- State the specific consequence or what changed — not just that something happened
- No filler openers: never start with "A new", "In a", "This is", "The latest"
- BANNED WORDS — never use these, especially not ending a sentence: always, now, currently, recently, easily, quickly
- BANNED PHRASES: may impact, may lead, may improve, could affect, might change
- End with a concrete outcome, not a hedge
- BAD: "OpenAI releases new model that may impact developer productivity now"
- GOOD: "OpenAI's o3 model scores 25% higher than GPT-4o on graduate-level science benchmarks"

RELEVANCE 1-10:
- 9-10: Major breaking news, significant policy/market/tech shift affecting many people
- 7-8: Important but not urgent, clearly worth reading
- 5-6: Interesting to the target audience
- 3-4: Minor, niche, or routine
- 1-2: Low value, filler

IMAGE QUERY: 2-3 specific descriptive words only. Examples: "bitcoin price chart", "nasa space telescope", "nba finals crowd", "wildfire california"`;

// ─── Groq enrichment ────────────────────────────────────────────────────────
async function enrichBatch(groq, stories) {
  const input = stories.map((s, i) => `${i + 1}. "${s.title}"`).join('\n');
  try {
    const res = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      temperature: 0.1,
      max_tokens: 1000,
      messages: [
        { role: 'system', content: GROQ_SYSTEM },
        { role: 'user', content: `Classify these ${stories.length} stories:\n${input}\n\nReturn a JSON array with exactly ${stories.length} objects in the same order.` }
      ]
    });
    const text = (res.choices[0]?.message?.content || '[]').replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Groq batch failed:', err.message);
    return stories.map(() => ({ category: 'Tech', summary: 'Story content unavailable for this item.', relevance: 3, imageQuery: 'news headline', filtered: false }));
  }
}

async function enrichAll(groq, stories) {
  const BATCH_SIZE = 8;
  const DELAY_MS = 6000;
  const enriched = [];
  const totalBatches = Math.ceil(stories.length / BATCH_SIZE);
  for (let i = 0; i < stories.length; i += BATCH_SIZE) {
    const batch = stories.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    console.log(`Groq batch ${batchNum}/${totalBatches} (${batch.length} stories)`);
    const results = await enrichBatch(groq, batch);
    batch.forEach((s, j) => enriched.push({ ...s, ...(results[j] || {}) }));
    if (i + BATCH_SIZE < stories.length) {
      console.log(`Waiting ${DELAY_MS / 1000}s before next batch (Groq TPM guard)...`);
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }
  return enriched;
}

// ─── Image resolution ───────────────────────────────────────────────────────
async function getOgImage(fetch, url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'DailyPulse/2.0' },
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
           || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    return m ? m[1] : null;
  } catch { clearTimeout(timer); return null; }
}

async function getUnsplashImage(fetch, query) {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`,
      { headers: { Authorization: `Client-ID ${key}` }, signal: controller.signal }
    );
    clearTimeout(timer);
    if (res.status === 429) return 'RATE_LIMITED';
    if (!res.ok) return null;
    const data = await res.json();
    return data?.results?.[0]?.urls?.regular || null;
  } catch { clearTimeout(timer); return null; }
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
  const { default: Groq } = await import('groq-sdk');
  const nodeFetch = await import('node-fetch');
  const fetch = nodeFetch.default || nodeFetch;

  fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });

  if (!process.env.GROQ_API_KEY) {
    console.error('GROQ_API_KEY not set — writing [] and exiting');
    fs.writeFileSync(path.join(ROOT, 'data/stories.json'), '[]');
    return;
  }

  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  const prefs = readPrefs();
  console.log('Preferences:', JSON.stringify(prefs));

  const plan = buildToolPlan(prefs);
  console.log('Tool plan:', plan.map(p => `${p.name}(${p.count})`).join(', '));

  // Spawn MCP server and connect
  const transport = new StdioClientTransport({
    command: 'node',
    args: [path.join(__dirname, 'news-mcp-server.js')]
  });
  const client = new Client({ name: 'daily-pulse-agent', version: '2.0.0' }, { capabilities: {} });
  await client.connect(transport);
  console.log('MCP client connected');

  // Fetch all raw stories — code controls tool calls, NOT Groq
  const allRaw = [];
  for (const { name, count, key } of plan) {
    try {
      const result = await client.callTool({ name, arguments: { count } });
      const text = result?.content?.[0]?.text || '[]';
      let stories = [];
      try { stories = JSON.parse(text); } catch { stories = []; }
      stories = stories
        .filter(s => s.title && s.title !== 'undefined' && s.url && !isNaN(Number(s.time)) && Number(s.time) > 0)
        .map(s => ({ ...s, _sourceCategory: key }));
      console.log(`${name}: ${stories.length} stories`);
      allRaw.push(...stories);
    } catch (err) {
      console.error(`${name} failed:`, err.message);
    }
  }
  await client.close();
  console.log(`Total raw: ${allRaw.length}`);

  // Deduplicate by URL
  const seen = new Set();
  const deduped = allRaw.filter(s => {
    if (seen.has(s.url)) return false;
    seen.add(s.url); return true;
  });
  console.log(`After dedup: ${deduped.length}`);

  // Enrich with Groq in batches
  const enriched = await enrichAll(groq, deduped);

  // Filter non-news
  const valid = enriched.filter(s => !s.filtered);
  console.log(`After filter: ${valid.length}`);

  // Resolve images — og:image → Unsplash → null (CSS gradient fallback)
  console.log('Resolving images...');
  let unsplashBlocked = false;
  const withImages = await Promise.all(valid.map(async (s) => {
    const og = await getOgImage(fetch, s.url);
    if (og) return { ...s, image: og };

    if (!unsplashBlocked && s.imageQuery) {
      const img = await getUnsplashImage(fetch, s.imageQuery);
      if (img === 'RATE_LIMITED') {
        console.warn('Unsplash rate limit hit — stopping further calls');
        unsplashBlocked = true;
      } else if (img) {
        return { ...s, image: img };
      }
    }

    return { ...s, image: null };  // CSS gradient fallback in browser
  }));

  // Sort by relevance, cap at 30, strip internal fields
  const CATEGORY_GRADIENT = { AI:1, Tech:1, Finance:2, Geo:3, Sports:4, Science:5, Health:2, Climate:3 };
  const output = withImages
    .sort((a, b) => (b.relevance || 0) - (a.relevance || 0))
    .slice(0, 30)
    .map(({
      filtered:        _f,
      imageQuery:      _iq,
      imageSource:     _is,
      _sourceCategory: _sc,
      comments:        _c,
      num_comments:    _nc,
      comment_count:   _cc,
      points:          _p,
      author:          _a,
      objectID:        _oid,
      ...keep
    }) => ({ ...keep, gradient: CATEGORY_GRADIENT[keep.category] || 1 }));

  // Write output
  const outPath = path.join(ROOT, 'data/stories.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  const cats = {};
  output.forEach(s => { cats[s.category] = (cats[s.category] || 0) + 1; });
  console.log(`Done — ${output.length} stories written to data/stories.json`);
  console.log('Categories:', JSON.stringify(cats));
}

if (require.main === module) {
  main().catch(err => { console.error('Agent fatal error:', err); process.exit(1); });
}

module.exports = { storiesForSlider, splitCount };
