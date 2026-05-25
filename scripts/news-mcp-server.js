'use strict';

const { McpServer }            = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z }                    = require('zod');
const { XMLParser }            = require('fast-xml-parser');

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

// keywords: optional array of lowercase strings to filter on title+description
async function getRSSStories(feedUrl, count, keywords) {
  try {
    const xml   = await fetchText(feedUrl);
    const items = parseRSSItems(xml);
    let filtered = items;
    if (keywords && keywords.length) {
      filtered = items.filter(item => {
        const title = getItemTitle(item).toLowerCase();
        const desc  = (typeof item.description === 'string' ? item.description : '').toLowerCase();
        return keywords.some(kw => title.includes(kw) || desc.includes(kw));
      });
    }
    return filtered.slice(0, count).map(item => {
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

async function getHNStories(count) {
  try {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
    const res   = await fetch(
      `https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=${count}`,
      { signal: ctrl.signal, headers: { 'User-Agent': 'DailyPulse/2.0', 'Accept': 'application/json' } }
    );
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return (data.hits || [])
      .filter(h => h.url && h.title &&
        !h.title.includes('Ask HN') && !h.title.includes('Who is hiring'))
      .slice(0, count)
      .map(hit => ({
        id:       String(hit.objectID),
        title:    hit.title           || '',
        url:      hit.url,
        domain:   extractDomain(hit.url),
        score:    hit.points          ?? 0,
        comments: hit.num_comments    ?? 0,
        time:     hit.created_at_i    ?? Math.floor(Date.now() / 1000),
      }));
  } catch (err) {
    console.error('HN fetch failed:', err.message);
    return [];
  }
}

// ── MCP Server ────────────────────────────────────────────────────────────────

const server = new McpServer({ name: 'news-mcp-server', version: '3.0.0' });

// ── AI ────────────────────────────────────────────────────────────────────────

server.tool('get_ai_news_hn', 'Fetch AI and tech news from Hacker News front page',
  { count: z.number().default(8) },
  async ({ count }) => {
    const stories = await getHNStories(count);
    return { content: [{ type: 'text', text: JSON.stringify(stories) }] };
  }
);

server.tool('get_ai_news_cbc', 'Fetch technology news from CBC',
  { count: z.number().default(6) },
  async ({ count }) => {
    const stories = await getRSSStories('https://rss.cbc.ca/lineup/technology.xml', count);
    return { content: [{ type: 'text', text: JSON.stringify(stories) }] };
  }
);

// ── Tech ──────────────────────────────────────────────────────────────────────

server.tool('get_tech_news_hn', 'Fetch tech news from Hacker News front page',
  { count: z.number().default(8) },
  async ({ count }) => {
    const stories = await getHNStories(count);
    return { content: [{ type: 'text', text: JSON.stringify(stories) }] };
  }
);

server.tool('get_tech_news_ap', 'Fetch technology news from AP News via RSSHub',
  { count: z.number().default(6) },
  async ({ count }) => {
    const stories = await getRSSStories('https://rsshub.app/apnews/topics/technology', count);
    return { content: [{ type: 'text', text: JSON.stringify(stories) }] };
  }
);

// ── Finance ───────────────────────────────────────────────────────────────────

server.tool('get_finance_news_reuters', 'Fetch business and finance news from Reuters',
  { count: z.number().default(6) },
  async ({ count }) => {
    const stories = await getRSSStories('https://feeds.reuters.com/reuters/businessNews', count);
    return { content: [{ type: 'text', text: JSON.stringify(stories) }] };
  }
);

server.tool('get_finance_news_et', 'Fetch finance and business news from Economic Times',
  { count: z.number().default(6) },
  async ({ count }) => {
    const stories = await getRSSStories('https://economictimes.indiatimes.com/rssfeedstopstories.cms', count);
    return { content: [{ type: 'text', text: JSON.stringify(stories) }] };
  }
);

// ── Geo ───────────────────────────────────────────────────────────────────────

server.tool('get_geo_news_ap', 'Fetch world news from AP News via RSSHub',
  { count: z.number().default(6) },
  async ({ count }) => {
    const stories = await getRSSStories('https://rsshub.app/apnews/topics/world-news', count);
    return { content: [{ type: 'text', text: JSON.stringify(stories) }] };
  }
);

server.tool('get_geo_news_aljazeera', 'Fetch world and geopolitics news from Al Jazeera',
  { count: z.number().default(6) },
  async ({ count }) => {
    const stories = await getRSSStories('https://www.aljazeera.com/xml/rss/all.xml', count);
    return { content: [{ type: 'text', text: JSON.stringify(stories) }] };
  }
);

// ── Sports ────────────────────────────────────────────────────────────────────

server.tool('get_sports_news_ap', 'Fetch sports news from AP News via RSSHub',
  { count: z.number().default(5) },
  async ({ count }) => {
    const stories = await getRSSStories('https://rsshub.app/apnews/topics/sports', count);
    return { content: [{ type: 'text', text: JSON.stringify(stories) }] };
  }
);

server.tool('get_sports_news_cbc', 'Fetch sports news from CBC',
  { count: z.number().default(5) },
  async ({ count }) => {
    const stories = await getRSSStories('https://rss.cbc.ca/lineup/sports.xml', count);
    return { content: [{ type: 'text', text: JSON.stringify(stories) }] };
  }
);

// ── Science ───────────────────────────────────────────────────────────────────

server.tool('get_science_news_guardian', 'Fetch science news from The Guardian',
  { count: z.number().default(5) },
  async ({ count }) => {
    const stories = await getRSSStories('https://www.theguardian.com/science/rss', count);
    return { content: [{ type: 'text', text: JSON.stringify(stories) }] };
  }
);

server.tool('get_science_news_ap', 'Fetch science news from AP News via RSSHub',
  { count: z.number().default(5) },
  async ({ count }) => {
    const stories = await getRSSStories('https://rsshub.app/apnews/topics/science', count);
    return { content: [{ type: 'text', text: JSON.stringify(stories) }] };
  }
);

// ── Health ────────────────────────────────────────────────────────────────────

server.tool('get_health_news_who', 'Fetch health news from WHO',
  { count: z.number().default(5) },
  async ({ count }) => {
    const stories = await getRSSStories('https://www.who.int/rss-feeds/news-english.xml', count);
    return { content: [{ type: 'text', text: JSON.stringify(stories) }] };
  }
);

server.tool('get_health_news_cbc', 'Fetch health and medicine news from CBC',
  { count: z.number().default(5) },
  async ({ count }) => {
    const stories = await getRSSStories('https://rss.cbc.ca/lineup/health.xml', count);
    return { content: [{ type: 'text', text: JSON.stringify(stories) }] };
  }
);

// ── Climate ───────────────────────────────────────────────────────────────────

server.tool('get_climate_news_guardian', 'Fetch climate and environment news from The Guardian',
  { count: z.number().default(5) },
  async ({ count }) => {
    const stories = await getRSSStories('https://www.theguardian.com/environment/rss', count);
    return { content: [{ type: 'text', text: JSON.stringify(stories) }] };
  }
);

const CLIMATE_KEYWORDS = [
  'climate', 'carbon', 'emissions', 'wildfire', 'flood', 'drought',
  'sea level', 'fossil fuel', 'renewable', 'hurricane', 'glacier',
];

server.tool('get_climate_news_ap', 'Fetch climate-related science news from AP filtered by climate keywords',
  { count: z.number().default(5) },
  async ({ count }) => {
    const stories = await getRSSStories(
      'https://rsshub.app/apnews/topics/science',
      count,
      CLIMATE_KEYWORDS
    );
    return { content: [{ type: 'text', text: JSON.stringify(stories) }] };
  }
);

// ── Start ─────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
server.connect(transport).catch(err => {
  console.error('MCP server fatal error:', err.message);
  process.exit(1);
});
