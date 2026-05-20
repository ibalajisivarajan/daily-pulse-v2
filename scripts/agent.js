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

function loadPreferences() {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(readFileSync(PREFS_PATH, 'utf8')) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

// ── Groq system prompt ────────────────────────────────────────────────────────

function buildSystemPrompt(prefs) {
  return `You are a news curator with access to 7 news tools.
Call tools based on user interest levels. High interest = call that tool with more stories. Interest below 3 = skip that tool entirely.

User interest levels (1-10):
AI/Tech: ${prefs.ai}
Finance: ${prefs.finance}
Geopolitics: ${prefs.geo}
Sports: ${prefs.sports}
Science: ${prefs.science}
Health: ${prefs.health}
Climate: ${prefs.climate}

After collecting stories via tools, return a JSON array.
For each story include:
- id, title, url, domain, score, comments, time (from tool results)
- image: https://picsum.photos/seed/{id}/900/1600
- gradient: cycling 1-5 by index
- category: one of AI, Tech, Finance, Geo, Sports, Science, Health, Climate
- summary: one sentence max 20 words why this matters
- relevance: integer 1-10 weighted by interest levels above
- filtered: true for job posts, polls, press releases, relevance < 3

Return ONLY a valid JSON array. No markdown. No code blocks. No explanation.`;
}

// ── parseGroqResponse (exported for tests) ────────────────────────────────────

function parseGroqResponse(raw) {
  try {
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed  = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(s => !s.filtered)
      .sort((a, b) => (b.relevance || 0) - (a.relevance || 0))
      .slice(0, 30);
  } catch {
    return [];
  }
}

// ── Normalise stories (ensure image + gradient always set) ────────────────────

function normalise(stories) {
  return stories.map((s, i) => ({
    ...s,
    image:    s.image    || `https://picsum.photos/seed/${s.id}/900/1600`,
    gradient: s.gradient || (i % 5) + 1,
  }));
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

  // Spawn MCP server as child process
  const transport = new StdioClientTransport({
    command: 'node',
    args:    [join(__dirname, 'news-mcp-server.js')],
  });
  const client = new Client({ name: 'daily-pulse-agent', version: '2.0' });

  try {
    await client.connect(transport);
    console.log('MCP server connected.');

    // Discover available tools
    const { tools } = await client.listTools();
    console.log(`Available tools: ${tools.map(t => t.name).join(', ')}`);

    // Map to Groq tool format
    const groqTools = tools.map(t => ({
      type:     'function',
      function: { name: t.name, description: t.description, parameters: t.inputSchema },
    }));

    // Initialise Groq
    const _Groq = require('groq-sdk');
    const Groq  = _Groq.default || _Groq;
    const groq  = new Groq({ apiKey: process.env.GROQ_API_KEY });

    // ── Agentic tool-call loop ──────────────────────────────────────────────
    let messages = [
      { role: 'system', content: buildSystemPrompt(prefs) },
      { role: 'user',   content: 'Fetch and curate the news now.' },
    ];

    let finalText  = '';
    const MAX_ITER = 10;

    for (let iter = 0; iter < MAX_ITER; iter++) {
      const completion = await groq.chat.completions.create({
        model:       'llama-3.3-70b-versatile',
        messages,
        tools:       groqTools,
        tool_choice: 'auto',
        max_tokens:  8000,
      });

      const choice = completion.choices[0];

      if (choice.finish_reason !== 'tool_calls') {
        finalText = choice.message.content || '';
        console.log(`Groq finished after ${iter + 1} iteration(s).`);
        break;
      }

      // Add assistant message (with tool_calls) to history
      messages.push(choice.message);

      // Execute each tool call
      for (const tc of choice.message.tool_calls) {
        console.log(`  → calling ${tc.function.name}`);
        let resultText = '[]';
        try {
          const args   = JSON.parse(tc.function.arguments || '{}');
          const result = await client.callTool({ name: tc.function.name, arguments: args });
          resultText   = result.content?.[0]?.text || '[]';
        } catch (err) {
          console.error(`  Tool ${tc.function.name} failed:`, err.message);
        }
        messages.push({ role: 'tool', tool_call_id: tc.id, content: resultText });
      }
    }

    await client.close();

    // ── Parse + normalise final output ─────────────────────────────────────
    let finalStories = normalise(parseGroqResponse(finalText));

    if (!finalStories.length) {
      throw new Error('Groq loop produced no stories');
    }

    writeFileSync(OUTPUT_PATH, JSON.stringify(finalStories, null, 2));
    console.log(`Done. ${finalStories.length} stories written.`);

  } catch (err) {
    console.error('Agent failed:', err.message, '— attempting direct fallback…');

    // Fallback: reconnect and call get_ai_tech_news directly
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
      const stories = normalise(raw.slice(0, 30));
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

module.exports = { parseGroqResponse };
