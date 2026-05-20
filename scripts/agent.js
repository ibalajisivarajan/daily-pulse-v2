'use strict';

const { spawn }     = require('child_process');
const { writeFileSync, readFileSync, mkdirSync } = require('fs');
const { join }      = require('path');

const OUTPUT_PATH = join(__dirname, '..', 'data', 'stories.json');
const PREFS_PATH  = join(__dirname, '..', 'data', 'preferences.json');

const DEFAULT_PREFS = {
  ai: 3, tech: 3, finance: 3, geo: 3,
  sports: 3, science: 3, health: 3, climate: 3,
};

// ── Env loader (reads .env for local dev without a dotenv dep) ────────────────

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

// ── MCP stdio client ──────────────────────────────────────────────────────────

function createMCPClient() {
  return new Promise((resolve, reject) => {
    let serverEntry;
    try {
      serverEntry = require.resolve('@newsmcp/server');
    } catch {
      reject(new Error('@newsmcp/server not installed'));
      return;
    }

    const proc = spawn('node', [serverEntry], { stdio: ['pipe', 'pipe', 'pipe'] });

    let buf = '';
    let nextId = 1;
    const pending = new Map();
    let ready = false;
    let readyResolve;
    const readyP = new Promise(r => { readyResolve = r; });

    function send(msg) {
      const json  = JSON.stringify(msg);
      const frame = `Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`;
      proc.stdin.write(frame);
    }

    proc.stdout.on('data', chunk => {
      buf += chunk.toString();
      while (true) {
        const sep = buf.indexOf('\r\n\r\n');
        if (sep === -1) break;
        const header = buf.slice(0, sep);
        const m = header.match(/Content-Length:\s*(\d+)/i);
        if (!m) { buf = buf.slice(sep + 4); continue; }
        const len   = parseInt(m[1], 10);
        const start = sep + 4;
        if (buf.length < start + len) break;
        const body = buf.slice(start, start + len);
        buf = buf.slice(start + len);
        try {
          const msg = JSON.parse(body);
          if (!ready && (msg.result?.capabilities !== undefined || msg.method === 'initialized')) {
            ready = true;
            readyResolve();
          } else if (msg.id != null && pending.has(msg.id)) {
            const { res, rej } = pending.get(msg.id);
            pending.delete(msg.id);
            if (msg.error) rej(new Error(msg.error.message || 'MCP error'));
            else res(msg.result);
          }
        } catch {}
      }
    });

    proc.stderr.on('data', d => console.error('[newsmcp]', d.toString().trim()));
    proc.on('error', reject);
    proc.on('exit', code => { if (!ready) reject(new Error(`newsmcp exited (${code})`)); });

    send({
      jsonrpc: '2.0', id: nextId++, method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities:    {},
        clientInfo:      { name: 'DailyPulse', version: '2.0' },
      },
    });

    const timeout = setTimeout(() => {
      if (!ready) { proc.kill(); reject(new Error('MCP init timeout')); }
    }, 15000);

    readyP.then(() => {
      clearTimeout(timeout);
      send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });

      resolve({
        async callTool(name, args) {
          return new Promise((res, rej) => {
            const id = nextId++;
            pending.set(id, { res, rej });
            send({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });
            setTimeout(() => {
              if (pending.has(id)) {
                pending.delete(id);
                rej(new Error(`Tool call timeout: ${name}`));
              }
            }, 30000);
          });
        },
        close() { try { proc.kill(); } catch {} },
      });
    });
  });
}

// ── MCP result → normalised story objects ─────────────────────────────────────

function parseMCPStories(result) {
  try {
    const text = result?.content?.[0]?.text ?? JSON.stringify(result);
    let items;
    try   { items = JSON.parse(text); }
    catch { const m = text.match(/\[[\s\S]*\]/); if (!m) return []; items = JSON.parse(m[0]); }
    if (!Array.isArray(items)) return [];
    return items.map((item, i) => {
      const url = item.url || item.link || '';
      let domain = '';
      try { domain = new URL(url).hostname.replace(/^www\./, ''); } catch {}
      const id = String(item.id || item.objectID || `${Date.now()}_${i}`);
      const ts  = item.time || item.created_at_i ||
        (item.publishedAt
          ? Math.floor(new Date(item.publishedAt).getTime() / 1000)
          : Math.floor(Date.now() / 1000));
      return {
        id, title: item.title || '', url, domain,
        score:    item.score    ?? item.points        ?? 0,
        comments: item.comments ?? item.num_comments  ?? 0,
        time:     ts,
        image:    item.image || `https://picsum.photos/seed/${id}/900/1600`,
        gradient: (i % 5) + 1,
      };
    });
  } catch (err) {
    console.error('parseMCPStories failed:', err.message);
    return [];
  }
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

  // Step 1 — fetch headlines from newsmcp MCP server
  let rawStories = [];
  let mcpClient;
  try {
    console.log('Starting newsmcp MCP server…');
    mcpClient = await createMCPClient();

    const batches = [
      { category: 'technology', count: 8 },
      { category: 'business',   count: 8 },
      { category: 'world',      count: 8 },
      { category: 'sports',     count: 6 },
    ];

    for (const batch of batches) {
      console.log(`Fetching ${batch.count} ${batch.category} headlines…`);
      try {
        const result   = await mcpClient.callTool('get_headlines', batch);
        const stories  = parseMCPStories(result);
        console.log(`  → ${stories.length} stories`);
        rawStories.push(...stories);
      } catch (err) {
        console.error(`  ${batch.category} failed:`, err.message);
      }
    }
  } catch (err) {
    console.error('newsmcp unavailable:', err.message, '— writing [] and exiting cleanly');
    writeFileSync(OUTPUT_PATH, '[]');
    console.log('Done. 0 stories written.');
    return;
  } finally {
    mcpClient?.close();
  }

  if (!rawStories.length) {
    console.error('No stories from newsmcp — writing []');
    writeFileSync(OUTPUT_PATH, '[]');
    console.log('Done. 0 stories written.');
    return;
  }

  console.log(`Got ${rawStories.length} raw stories. Sending to Groq…`);

  // Step 2 — enrich with Groq (fall back to raw on any failure)
  let finalStories;
  try {
    if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY not set');
    const groqRaw = await enrichWithGroq(rawStories, prefs);
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
