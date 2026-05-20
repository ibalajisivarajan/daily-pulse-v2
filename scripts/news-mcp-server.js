'use strict';

const { McpServer }          = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z }                  = require('zod');
const { XMLParser }          = require('fast-xml-parser');

const FETCH_TIMEOUT = 5000;

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractDomain(url) {
  if (!url) return '';
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function getItemLink(item) {
  const l = item.link;
  if (typeof l === 'string') return l.trim();
  if (l && typeof l === 'object') return (l['@_href'] || l['#text'] || '').trim();
  return '';
}

function getItemId(item) {
  const g = item.guid;
  if (typeof g === 'string') return g;
  if (g && typeof g === 'object') return g['#text'] || g['@_'] || '';
  return String(item.id || getItemLink(item) || `${item.title}${item.pubDate}`);
}

function getItemTitle(item) {
  const t = item.title;
  if (typeof t === 'string') return t.trim();
  if (t && typeof t === 'object') return (t['#text'] || '').trim();
  return '';
}

function parseTimestamp(raw) {
  if (!raw) return Math.floor(Date.now() / 1000);
  try {
    const ms = new Date(raw).getTime();
    return isNaN(ms) ? Math.floor(Date.now() / 1000) : Math.floor(ms / 1000);
  } catch { return Math.floor(Date.now() / 1000); }
}

async function fetchText(url) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, {
      signal:  ctrl.signal,
      headers: { 'User-Agent': 'DailyPulse/2.0', 'Accept': 'application/rss+xml, application/xml, text/xml, */*' },
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

function parseRSSItems(xml) {
  const parser = new XMLParser({
    ignoreAttributes:    false,
    attributeNamePrefix: '@_',
    textNodeName:        '#text',
    isArray:             (name) => name === 'item' || name === 'entry',
  });
  const doc  = parser.parse(xml);
  const chan  = doc?.rss?.channel || doc?.feed || {};
  const items = chan.item || chan.entry || [];
  return Array.isArray(items) ? items : [items];
}

async function getRSSStories(feedUrl, count) {
  try {
    const xml   = await fetchText(feedUrl);
    const items = parseRSSItems(xml);
    return items.slice(0, count).map(item => {
      const url = getItemLink(item);
      const raw = getItemId(item);
      const id  = raw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || String(Date.now());
      return {
        id,
        title:    getItemTitle(item),
        url,
        domain:   extractDomain(url),
        score:    0,
        comments: 0,
        time:     parseTimestamp(item.pubDate || item.updated || item.published),
      };
    }).filter(s => s.title && s.url);
  } catch (err) {
    console.error(`RSS fetch failed for ${feedUrl}:`, err.message);
    return [];
  }
}

// ── MCP Server ────────────────────────────────────────────────────────────────

const server = new McpServer({ name: 'news-mcp-server', version: '2.0.0' });

server.tool(
  'get_ai_tech_news',
  'Fetch AI and technology news from Hacker News front page with real upvote scores',
  { count: z.number().default(10) },
  async ({ count }) => {
    try {
      const ctrl  = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
      const res   = await fetch(
        `https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=${count}`,
        { signal: ctrl.signal, headers: { 'User-Agent': 'DailyPulse/2.0', 'Accept': 'application/json' } }
      );
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data    = await res.json();
      const stories = (data.hits || []).filter(h => h.url).slice(0, count).map(hit => ({
        id:       String(hit.objectID),
        title:    hit.title           || '',
        url:      hit.url,
        domain:   extractDomain(hit.url),
        score:    hit.points          ?? 0,
        comments: hit.num_comments    ?? 0,
        time:     hit.created_at_i    ?? Math.floor(Date.now() / 1000),
      }));
      return { content: [{ type: 'text', text: JSON.stringify(stories) }] };
    } catch (err) {
      console.error('get_ai_tech_news failed:', err.message);
      return { content: [{ type: 'text', text: '[]' }] };
    }
  }
);

server.tool(
  'get_finance_news',
  'Fetch business and finance news from Reuters',
  { count: z.number().default(8) },
  async ({ count }) => {
    const stories = await getRSSStories('https://feeds.reuters.com/reuters/businessNews', count);
    return { content: [{ type: 'text', text: JSON.stringify(stories) }] };
  }
);

server.tool(
  'get_geopolitics_news',
  'Fetch world and geopolitics news from Al Jazeera',
  { count: z.number().default(8) },
  async ({ count }) => {
    const stories = await getRSSStories('https://www.aljazeera.com/xml/rss/all.xml', count);
    return { content: [{ type: 'text', text: JSON.stringify(stories) }] };
  }
);

server.tool(
  'get_sports_news',
  'Fetch sports news from BBC Sport',
  { count: z.number().default(6) },
  async ({ count }) => {
    const stories = await getRSSStories('https://feeds.bbci.co.uk/news/sport/rss.xml', count);
    return { content: [{ type: 'text', text: JSON.stringify(stories) }] };
  }
);

server.tool(
  'get_science_news',
  'Fetch science and research news from The Guardian',
  { count: z.number().default(6) },
  async ({ count }) => {
    const stories = await getRSSStories('https://www.theguardian.com/science/rss', count);
    return { content: [{ type: 'text', text: JSON.stringify(stories) }] };
  }
);

server.tool(
  'get_health_news',
  'Fetch health and medicine news from CBC',
  { count: z.number().default(6) },
  async ({ count }) => {
    const stories = await getRSSStories('https://rss.cbc.ca/lineup/health.xml', count);
    return { content: [{ type: 'text', text: JSON.stringify(stories) }] };
  }
);

server.tool(
  'get_climate_news',
  'Fetch climate and environment news from The Guardian',
  { count: z.number().default(6) },
  async ({ count }) => {
    const stories = await getRSSStories('https://www.theguardian.com/environment/rss', count);
    return { content: [{ type: 'text', text: JSON.stringify(stories) }] };
  }
);

const transport = new StdioServerTransport();
server.connect(transport).catch(err => {
  console.error('MCP server fatal error:', err.message);
  process.exit(1);
});
