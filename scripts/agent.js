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

const CATEGORY_MAP = {
  get_ai_tech_news:     'AI',
  get_finance_news:     'Finance',
  get_geopolitics_news: 'Geo',
  get_sports_news:      'Sports',
  get_science_news:     'Science',
  get_health_news:      'Health',
  get_climate_news:     'Climate',
};

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
    const toolCounts = {
      get_ai_tech_news:     storiesForSlider(prefs.ai),
      get_finance_news:     storiesForSlider(prefs.finance),
      get_geopolitics_news: storiesForSlider(prefs.geo),
      get_sports_news:      storiesForSlider(prefs.sports),
      get_science_news:     storiesForSlider(prefs.science),
      get_health_news:      storiesForSlider(prefs.health),
      get_climate_news:     storiesForSlider(prefs.climate),
    };
    console.log('Fetch plan:', JSON.stringify(toolCounts));

    // ── Phase 3 — Spawn MCP server and call tools directly ───────────────
    const transport = new StdioClientTransport({
      command: 'node',
      args:    [join(__dirname, 'news-mcp-server.js')],
    });
    const client = new Client({ name: 'daily-pulse-agent', version: '2.0' });
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
        console.log(`Fetched ${stories.length} stories from ${toolName}`);
      } catch (err) {
        console.error(`Tool ${toolName} failed:`, err.message);
      }
    }

    await client.close();
    console.log(`Total raw stories: ${allRawStories.length}`);

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

        if (enriched.length) {
          allEnrichedStories.push(...enriched);
          console.log(`Batch ${batchNum}: enriched ${enriched.length} stories`);
        } else {
          throw new Error('Empty or invalid response from Groq');
        }
      } catch (err) {
        console.warn(`Batch ${batchNum} failed: ${err.message} — using raw fallback`);
        const fallback = batch.map(s => ({
          ...s,
          category:   s._sourceCategory,
          imageQuery: s._sourceCategory.toLowerCase() + ' news',
          summary:    '',
          relevance:  5,
          filtered:   false,
        }));
        allEnrichedStories.push(...fallback);
      }
    }

    // ── Phase 5 — Fetch Unsplash images ──────────────────────────────────
    const UNSPLASH_KEY = process.env.UNSPLASH_ACCESS_KEY;

    for (let i = 0; i < allEnrichedStories.length; i++) {
      const story = allEnrichedStories[i];
      if (UNSPLASH_KEY && story.imageQuery) {
        try {
          const res = await fetch(
            `https://api.unsplash.com/search/photos?query=${encodeURIComponent(story.imageQuery)}&per_page=1&orientation=portrait&client_id=${UNSPLASH_KEY}`
          );
          const data  = await res.json();
          const photo = data.results?.[0];
          if (photo) {
            story.image          = photo.urls.regular;
            story.imageCredit    = photo.user.name;
            story.imageCreditUrl = photo.user.links.html;
          }
        } catch { /* gradient fallback — do not crash */ }
        await new Promise(r => setTimeout(r, 200));
        if ((i + 1) % 5 === 0 || i === allEnrichedStories.length - 1) {
          console.log(`Fetched image for story ${i + 1} of ${allEnrichedStories.length}`);
        }
      } else {
        story.image = story.image || null;
      }
    }

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
        const { filtered, imageQuery, ...rest } = s;
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
      const c2 = new Client({ name: 'daily-pulse-fallback', version: '2.0' });
      await c2.connect(t2);
      const result  = await c2.callTool({ name: 'get_ai_tech_news', arguments: { count: 30 } });
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
