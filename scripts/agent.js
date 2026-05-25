'use strict';

const { Client }               = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const { writeFileSync, readFileSync, mkdirSync } = require('fs');
const { join }                 = require('path');

const OUTPUT_PATH = join(__dirname, '..', 'data', 'stories.json');
const PREFS_PATH  = join(__dirname, '..', 'data', 'preferences.json');

const DEFAULT_PREFS = {
  ai: 3, tech: 3, finance: 3, geo: 3,
  sports: 3, science: 3, health: 3, climate: 3,
};

// ── Domain extractor (used in fallback) ──────────────────────────────────────

function extractDomain(url) {
  if (!url) return '';
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

// ── og:image scraper ──────────────────────────────────────────────────────────

async function scrapeOgImage(url) {
  if (!url) return null;
  try {
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(url, {
      signal:  controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DailyPulse/2.0)', 'Accept': 'text/html' },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const html  = await res.text();
    const match = html.match(
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i
    ) || html.match(
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i
    );
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

// ── Env loader ────────────────────────────────────────────────────────────────

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

// ── Phase 1 — Load preferences ────────────────────────────────────────────────

function loadPreferences() {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(readFileSync(PREFS_PATH, 'utf8')) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

// ── Phase 2 — Stories per slider ──────────────────────────────────────────────

function storiesForSlider(value) {
  if (value <= 2) return 0;
  if (value <= 4) return 5;
  if (value <= 6) return 7;
  if (value <= 8) return 10;
  return 14;
}

// ── parseGroqResponse (exported for tests) ────────────────────────────────────

function parseGroqResponse(raw) {
  try {
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const arr = JSON.parse(cleaned);
    if (!Array.isArray(arr)) return [];
    return arr.filter(s =>
      s.title &&
      s.title !== 'undefined' &&
      !isNaN(Number(s.time)) &&
      Number(s.time) > 0
    );
  } catch {
    return [];
  }
}

// ── Phase 4 — Groq enrichment prompt ─────────────────────────────────────────

function buildEnrichPrompt(prefs) {
  return `You are a strict news curator. For each story return enriched JSON.

CATEGORY RULES — read the title carefully, apply rules IN ORDER,
stop at the FIRST match:

1. Title or domain contains any of:
   AI, LLM, GPT, Claude, Gemini, neural, machine learning,
   artificial intelligence, chatbot, OpenAI, Anthropic, DeepMind,
   Mistral, Llama, Grok → category = "AI"

2. Title or domain contains any of:
   startup, software, app, developer, cloud, Apple, Google,
   Microsoft, Meta, Amazon, chip, semiconductor, programming,
   algorithm, coding, cybersecurity, data breach → category = "Tech"

3. Title or domain contains any of:
   market, stock, inflation, Fed, federal reserve, rate, bank,
   economy, GDP, recession, crypto, bitcoin, investment, earnings,
   trade war, tariff, dollar, IMF, Wall Street → category = "Finance"

4. Title contains any of:
   war, military, election, president, prime minister, minister,
   government, NATO, sanctions, treaty, diplomacy, Trump, Putin,
   Xi, nuclear, missile, ceasefire, coup, protest, summit,
   geopolitical → category = "Geo"

5. Title contains any of:
   match, game, championship, league, FIFA, NBA, NFL, NHL, MLB,
   Olympics, athlete, player, team, score, tournament, cricket,
   football, soccer, tennis, boxing → category = "Sports"

6. Title contains any of:
   climate, carbon, emissions, wildfire, flood, drought, sea level,
   fossil fuel, renewable, hurricane, glacier, deforestation,
   EPA, environmental → category = "Climate"

7. Title contains any of:
   health, hospital, disease, cancer, vaccine, FDA, drug,
   treatment, virus, pandemic, surgery, mental health, Ebola,
   outbreak, epidemic, NHS, WHO → category = "Health"

8. Title contains any of:
   space, NASA, planet, research, study, discovery, experiment,
   species, fossil, physics, biology, genetics, quantum,
   archaeology, prehistoric → category = "Science"

9. If no rule matched above → use the _sourceCategory value exactly.

IMAGEQUERY RULES:
Write a 2-4 word search query for a relevant Unsplash photo. Think: what visual best represents this story?
Examples: "Fed signals rate cuts" → "federal reserve building" / "SpaceX rocket explodes" → "rocket launch fire" / "Iran nuclear deal" → "diplomatic negotiation table" / "NBA playoffs overtime" → "basketball court crowd" / "Ebola outbreak DRC" → "medical workers africa" / "Wildfire threatens island" → "wildfire smoke forest"
Never use people's names as queries. Use scenes and concepts.

SUMMARY RULES — this is the most important field:
Write exactly ONE sentence. COUNT THE WORDS before outputting.
MINIMUM 12 words. MAXIMUM 20 words. Non-negotiable.
If your draft is under 12 words — rewrite it. Keep rewriting until
it is 12-20 words.

Formula: [what happened] + [why it matters right now]

Hard rules:
- NEVER use words that appear in the headline
- Must answer "so what" — state a real consequence or impact
- Must make the reader feel something: urgency, surprise, or relevance
- If it affects money, jobs, health, or safety — say so explicitly
- If surprising or counterintuitive — lead with that angle

BANNED words and phrases — never use these:
important, breaking, developing, update, latest, new development,
officials say, sources say, situation, event, marks a, comes as,
follows, concerns raised, potential impact, potential implications,
sheds light on, sparks interest, gains popularity, offers hope,
emerges, looms, underway

Bad (9 words, banned phrases): "Building collapse threatens lives of trapped individuals"
Good (16 words): "Rescue teams have a 72-hour window to reach 19 people still unaccounted for under the rubble"

Bad (7 words): "Iran-US deal details emerge with potential impact"
Good (15 words): "Nuclear standoff closer to resolution than at any point in a decade as oil markets begin pricing in a deal"

Bad (8 words): "Medics deaths in air strikes spark humanitarian concerns"
Good (14 words): "Twelve medical workers killed in strikes that violated international humanitarian law — accountability demands are mounting"

FILTERED RULES — mark filtered: true for ANY of these:
- Job postings or hiring announcements
- Polls or surveys
- Sponsored content or advertorials
- Press releases with no independent news value
- Listicles: "10 best...", "5 ways to...", "Top tips for..."
- How-to guides and tutorials
- Book recommendations or reviews
- Productivity tips and life advice
- Home decor or lifestyle content
- Opinion pieces with no hard news peg
- Any story that is clearly not a news event

Mark filtered: false for all genuine news stories — even if the
topic has low relevance to the user's interests.

RELEVANCE RULES:
Score 1-10 weighted by these interest levels:
AI:${prefs.ai} Finance:${prefs.finance} Geo:${prefs.geo}
Sports:${prefs.sports} Science:${prefs.science}
Health:${prefs.health} Climate:${prefs.climate}

Return ONLY a valid JSON array. No markdown. No explanation.
No text before or after the array.
Each object must include ALL original fields plus:
category, imageQuery, summary, relevance, filtered`;
}

// ── Gradient by category ──────────────────────────────────────────────────────

const CATEGORY_GRADIENT = {
  'AI':      1,
  'Tech':    1,
  'Finance': 2,
  'Geo':     3,
  'Sports':  4,
  'Science': 5,
  'Health':  2,
  'Climate': 3,
};

// ── Category and tool maps ────────────────────────────────────────────────────

const CATEGORY_MAP = {
  get_ai_news_hn:            'AI',
  get_ai_news_cbc:           'AI',
  get_tech_news_hn:          'Tech',
  get_tech_news_ap:          'Tech',
  get_finance_news_reuters:  'Finance',
  get_finance_news_et:       'Finance',
  get_geo_news_ap:           'Geo',
  get_geo_news_aljazeera:    'Geo',
  get_sports_news_ap:        'Sports',
  get_sports_news_cbc:       'Sports',
  get_science_news_guardian: 'Science',
  get_science_news_ap:       'Science',
  get_health_news_who:       'Health',
  get_health_news_cbc:       'Health',
  get_climate_news_guardian: 'Climate',
  get_climate_news_ap:       'Climate',
};

// ── Tool count split across two sources per category ─────────────────────────

function toolCountsFromPrefs(prefs) {
  function split(value) {
    const total = storiesForSlider(value);
    return [Math.ceil(total / 2), Math.floor(total / 2)];
  }
  const [aiA,   aiB]   = split(prefs.ai);
  const [techA, techB] = split(prefs.tech);
  const [finA,  finB]  = split(prefs.finance);
  const [geoA,  geoB]  = split(prefs.geo);
  const [sptA,  sptB]  = split(prefs.sports);
  const [sciA,  sciB]  = split(prefs.science);
  const [hlthA, hlthB] = split(prefs.health);
  const [climA, climB] = split(prefs.climate);
  return {
    get_ai_news_hn:            aiA,
    get_ai_news_cbc:           aiB,
    get_tech_news_hn:          techA,
    get_tech_news_ap:          techB,
    get_finance_news_reuters:  finA,
    get_finance_news_et:       finB,
    get_geo_news_ap:           geoA,
    get_geo_news_aljazeera:    geoB,
    get_sports_news_ap:        sptA,
    get_sports_news_cbc:       sptB,
    get_science_news_guardian: sciA,
    get_science_news_ap:       sciB,
    get_health_news_who:       hlthA,
    get_health_news_cbc:       hlthB,
    get_climate_news_guardian: climA,
    get_climate_news_ap:       climB,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  loadEnv();
  mkdirSync(join(__dirname, '..', 'data'), { recursive: true });
  const prefs = loadPreferences();

  if (!process.env.GROQ_API_KEY) {
    console.error('GROQ_API_KEY not set — writing [] and exiting');
    writeFileSync(OUTPUT_PATH, '[]');
    return;
  }

  try {
    // ── Phase 2 — Calculate fetch plan ───────────────────────────────────
    const toolCounts = toolCountsFromPrefs(prefs);
    console.log('Fetch plan:', JSON.stringify(toolCounts));

    // ── Phase 3 — Spawn MCP server and call tools directly ───────────────
    const transport = new StdioClientTransport({
      command: 'node',
      args:    [join(__dirname, 'news-mcp-server.js')],
    });
    const client = new Client({ name: 'daily-pulse-agent', version: '3.0' });
    await client.connect(transport);
    console.log('MCP server connected.');

    const allRawStories = [];

    for (const [toolName, count] of Object.entries(toolCounts)) {
      if (count === 0) {
        console.log(`Skipping ${toolName} (interest <= 2)`);
        continue;
      }
      try {
        const result = await client.callTool({ name: toolName, arguments: { count } });
        const text   = result.content?.[0]?.text || '[]';
        let stories  = [];
        try { stories = JSON.parse(text); } catch { stories = []; }

        stories = stories.filter(s =>
          s.title &&
          s.title !== 'undefined' &&
          s.url &&
          s.time &&
          !isNaN(Number(s.time)) &&
          Number(s.time) > 0
        );

        stories = stories.map(s => ({ ...s, _sourceCategory: CATEGORY_MAP[toolName] }));
        allRawStories.push(...stories);

        if (stories.length === 0) {
          console.warn(`WARNING: ${toolName} returned 0 stories — feed may be thin in this category`);
        } else {
          console.log(`Fetched ${stories.length} valid stories from ${toolName}`);
        }
      } catch (err) {
        console.error(`Tool ${toolName} failed:`, err.message);
      }
    }

    await client.close();
    console.log(`Total raw stories: ${allRawStories.length}`);

    // ── Minimum raw story fallback ────────────────────────────────────────
    if (allRawStories.length < 10) {
      console.warn('WARNING: Fewer than 10 raw stories collected.');
      console.warn('Falling back to HN direct fetch with count=30...');
      try {
        const res  = await fetch('https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=30');
        const data = await res.json();
        const hnStories = (data.hits || [])
          .filter(h => h.title && h.url && h.created_at_i)
          .map(h => ({
            id:              h.objectID,
            title:           h.title,
            url:             h.url,
            domain:          extractDomain(h.url),
            score:           h.points       || 0,
            comments:        h.num_comments || 0,
            time:            h.created_at_i,
            _sourceCategory: 'Tech',
          }));
        allRawStories.push(...hnStories);
        console.log(`Fallback: added ${hnStories.length} HN stories`);
      } catch (err) {
        console.error('HN fallback failed:', err.message);
      }
    }

    if (!allRawStories.length) {
      throw new Error('No raw stories fetched from any tool');
    }

    // ── Phase 4 — Enrich in batches of 8 via Groq ────────────────────────
    const _Groq = require('groq-sdk');
    const Groq  = _Groq.default || _Groq;
    const groq  = new Groq({ apiKey: process.env.GROQ_API_KEY });

    const systemPrompt       = buildEnrichPrompt(prefs);
    const allEnrichedStories = [];
    const BATCH_SIZE         = 8;
    const totalBatches       = Math.ceil(allRawStories.length / BATCH_SIZE);

    // Belt-and-suspenders guard (GROQ_API_KEY already checked at top of main)
    if (!process.env.GROQ_API_KEY) {
      console.warn('GROQ_API_KEY not set — skipping enrichment, using raw defaults');
      allRawStories.forEach(s => allEnrichedStories.push({
        ...s,
        category:   s._sourceCategory || 'Tech',
        imageQuery: (s._sourceCategory || 'tech').toLowerCase(),
        summary:    '',
        relevance:  5,
        filtered:   false,
      }));
    } else {
      for (let i = 0; i < allRawStories.length; i += BATCH_SIZE) {
        const batch    = allRawStories.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        console.log(`Enriching batch ${batchNum}/${totalBatches}...`);

        try {
          const completion = await groq.chat.completions.create({
            model:       'llama-3.3-70b-versatile',
            messages:    [
              { role: 'system', content: systemPrompt },
              { role: 'user',   content: JSON.stringify(batch) },
            ],
            max_tokens:  4000,
            temperature: 0.1,
          });

          const raw      = completion.choices[0]?.message?.content || '[]';
          const enriched = parseGroqResponse(raw);

          if (enriched.length === 0) {
            console.warn(`Batch ${batchNum} returned 0 enriched stories — keeping raw with defaults`);
            batch.forEach(s => allEnrichedStories.push({
              ...s,
              category:   s._sourceCategory || 'Tech',
              imageQuery: (s._sourceCategory || 'tech').toLowerCase(),
              summary:    '',
              relevance:  5,
              filtered:   false,
            }));
          } else {
            allEnrichedStories.push(...enriched);
            console.log(`Batch ${batchNum}: enriched ${enriched.length} stories`);
          }
        } catch (err) {
          console.warn(`Batch ${batchNum} failed: ${err.message} — using raw fallback`);
          batch.forEach(s => allEnrichedStories.push({
            ...s,
            category:   s._sourceCategory || 'Tech',
            imageQuery: (s._sourceCategory || 'tech').toLowerCase(),
            summary:    '',
            relevance:  5,
            filtered:   false,
          }));
        }
      }
    }

    // ── Phase 5 — Fetch images: og:image → Unsplash → null ───────────────
    const UNSPLASH_KEY = process.env.UNSPLASH_ACCESS_KEY;
    let unsplashRateLimited = false;

    console.log('Fetching images...');

    for (let i = 0; i < allEnrichedStories.length; i++) {
      const story = allEnrichedStories[i];

      // Priority 1 — og:image from article URL
      const ogImage = await scrapeOgImage(story.url);
      if (ogImage) {
        story.image       = ogImage;
        story.imageSource = 'article';
      }

      // Priority 2 — Unsplash with Groq-picked keyword
      if (!story.image && UNSPLASH_KEY && !unsplashRateLimited) {
        try {
          const res = await fetch(
            `https://api.unsplash.com/search/photos` +
            `?query=${encodeURIComponent(story.imageQuery || story.category)}` +
            `&per_page=1&orientation=portrait&client_id=${UNSPLASH_KEY}`
          );
          if (res.status === 429) {
            console.warn('Unsplash rate limit hit — skipping remaining image fetches');
            unsplashRateLimited = true;
          } else if (res.ok) {
            const data  = await res.json();
            const photo = data.results?.[0];
            if (photo) {
              story.image          = photo.urls.regular;
              story.imageCredit    = photo.user.name;
              story.imageCreditUrl = photo.user.links.html;
              story.imageSource    = 'unsplash';
            }
          }
        } catch (err) {
          console.error(`Unsplash failed for story ${i}:`, err.message);
        }
        await new Promise(r => setTimeout(r, 250));
      }

      // Priority 3 — null (CSS gradient shows in browser)
      if (!story.image) {
        story.image       = null;
        story.imageSource = 'gradient';
      }

      if (i % 5 === 0) {
        console.log(`Images: ${i + 1}/${allEnrichedStories.length}`);
      }
    }

    const imgBreakdown = { article: 0, unsplash: 0, gradient: 0 };
    allEnrichedStories.forEach(s => { imgBreakdown[s.imageSource || 'gradient']++; });
    console.log('Image sources:', JSON.stringify(imgBreakdown));

    // ── Phase 6 — Final output ────────────────────────────────────────────
    // IMPORTANT: Never backfill with filtered stories (DP2-013)
    // Filtered means Groq judged it as noise — job posts, polls,
    // press releases. Putting them back defeats the purpose of filtering.
    // 20 clean stories beats 30 with noise mixed in.
    const cleaned = allEnrichedStories.map(({ _sourceCategory, ...s }) => s);
    const finalStories = cleaned
      .filter(s => !s.filtered)
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 30)
      .map(s => {
        const { filtered, imageQuery, imageSource, ...rest } = s;
        return {
          ...rest,
          image:    rest.image    || `https://picsum.photos/seed/${rest.id}/900/1600`,
          gradient: CATEGORY_GRADIENT[rest.category] || 1,
        };
      });

    writeFileSync(OUTPUT_PATH, JSON.stringify(finalStories, null, 2));

    const cats = {};
    finalStories.forEach(s => { cats[s.category] = (cats[s.category] || 0) + 1; });
    const catStr = Object.entries(cats).map(([k, v]) => `${k}:${v}`).join(' ');
    console.log(`Done. ${finalStories.length} stories written.`);
    console.log(`Category breakdown: ${catStr}`);

  } catch (err) {
    // ── Phase 7 — Fallback ────────────────────────────────────────────────
    console.error('Agent failed:', err.message);
    console.error(err.stack);
    console.error('Attempting direct fallback…');

    try {
      const t2 = new StdioClientTransport({
        command: 'node',
        args:    [join(__dirname, 'news-mcp-server.js')],
      });
      const c2 = new Client({ name: 'daily-pulse-fallback', version: '3.0' });
      await c2.connect(t2);
      const result  = await c2.callTool({ name: 'get_ai_news_hn', arguments: { count: 30 } });
      await c2.close();
      const raw     = JSON.parse(result.content?.[0]?.text || '[]');
      const stories = raw.slice(0, 30).map((s, i) => ({
        ...s,
        image:    s.image || `https://picsum.photos/seed/${s.id}/900/1600`,
        gradient: (i % 5) + 1,
      }));
      writeFileSync(OUTPUT_PATH, JSON.stringify(stories, null, 2));
      console.log(`Done (fallback). ${stories.length} stories written.`);
    } catch (e2) {
      console.error('Fallback also failed:', e2.message, '— writing []');
      writeFileSync(OUTPUT_PATH, '[]');
    }
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('Unexpected error:', err.message);
    writeFileSync(OUTPUT_PATH, '[]');
    process.exit(0);
  });
}

module.exports = { parseGroqResponse, storiesForSlider };
