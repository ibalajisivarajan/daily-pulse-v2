#!/usr/bin/env node
// scripts/news-mcp-server.js
// 17-tool MCP news server — stdio transport
// Daily Pulse v2 | Fixes DP2-015 DP2-016 DP2-018

(async () => {
  const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
  const { CallToolRequestSchema, ListToolsRequestSchema } = await import('@modelcontextprotocol/sdk/types.js');
  const { XMLParser } = await import('fast-xml-parser');
  const nodeFetch = await import('node-fetch');
  const fetch = nodeFetch.default || nodeFetch;

  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

  async function fetchRSS(url, count) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'DailyPulse/2.0' },
        signal: controller.signal
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`RSS ${res.status} ${url}`);
      const xml = await res.text();
      const parsed = parser.parse(xml);
      const rawItems = parsed?.rss?.channel?.item || parsed?.feed?.entry || [];
      const items = Array.isArray(rawItems) ? rawItems : [rawItems];
      return items.slice(0, count).map(item => ({
        title: String(item.title || '').replace(/<[^>]+>/g, '').trim(),
        url: String(item.link?.['#text'] || item.link || '').trim(),
        time: Math.floor(new Date(item.pubDate || item.published || item.updated || Date.now()).getTime() / 1000)
      })).filter(s => s.title && s.url);
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }

  async function fetchHN(query, count) {
    const q = query ? `&query=${encodeURIComponent(query)}` : '';
    const url = `https://hn.algolia.com/api/v1/search_by_date?tags=story&hitsPerPage=${count}${q}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HN ${res.status}`);
      const data = await res.json();
      return (data.hits || [])
        .filter(h => h.title && h.url)
        .slice(0, count)
        .map(h => ({
          title: String(h.title).trim(),
          url: String(h.url).trim(),
          time: h.created_at_i || Math.floor(Date.now() / 1000)
        }));
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }

  const TOOLS = [
    // AI (2 tools)
    { name: 'get_ai_news_hn',           desc: 'Hacker News AI & ML stories',        fn: (c) => fetchHN('artificial intelligence LLM machine learning GPT', c) },
    { name: 'get_ai_news_cbc',           desc: 'CBC Technology (AI focus)',           fn: (c) => fetchRSS('https://www.cbc.ca/cmlink/rss-technology', c) },
    // Tech (2 tools)
    { name: 'get_tech_news_hn',          desc: 'Hacker News top tech stories',        fn: (c) => fetchHN('', c) },
    { name: 'get_tech_news_guardian',    desc: 'Guardian Technology',                 fn: (c) => fetchRSS('https://www.theguardian.com/technology/rss', c) },
    // Finance (2 tools) — Reuters blocked, ET fails; Guardian + CBC are stable
    { name: 'get_finance_news_guardian', desc: 'Guardian Business',                   fn: (c) => fetchRSS('https://www.theguardian.com/business/rss', c) },
    { name: 'get_finance_news_cbc',      desc: 'CBC Business',                        fn: (c) => fetchRSS('https://www.cbc.ca/cmlink/rss-business', c) },
    // Geopolitics (2 tools)
    { name: 'get_geo_news_aljazeera',    desc: 'Al Jazeera World',                    fn: (c) => fetchRSS('https://www.aljazeera.com/xml/rss/all.xml', c) },
    { name: 'get_geo_news_cbc',          desc: 'CBC World News',                      fn: (c) => fetchRSS('https://www.cbc.ca/cmlink/rss-world', c) },
    // Sports (3 tools — more sources, more volume)
    { name: 'get_sports_news_bbc',       desc: 'BBC Sport',                           fn: (c) => fetchRSS('http://feeds.bbci.co.uk/sport/rss.xml', c) },
    { name: 'get_sports_news_cbc',       desc: 'CBC Sports',                          fn: (c) => fetchRSS('https://www.cbc.ca/cmlink/rss-sports', c) },
    { name: 'get_sports_news_guardian',  desc: 'Guardian Sport',                      fn: (c) => fetchRSS('https://www.theguardian.com/sport/rss', c) },
    // Science (2 tools)
    { name: 'get_science_news_guardian', desc: 'Guardian Science',                    fn: (c) => fetchRSS('https://www.theguardian.com/science/rss', c) },
    { name: 'get_science_news_cbc',      desc: 'CBC Technology (science angle)',       fn: (c) => fetchRSS('https://www.cbc.ca/cmlink/rss-technology', c) },
    // Health (2 tools)
    { name: 'get_health_news_cbc',       desc: 'CBC Health',                          fn: (c) => fetchRSS('https://www.cbc.ca/cmlink/rss-health', c) },
    { name: 'get_health_news_guardian',  desc: 'Guardian Society (health focus)',      fn: (c) => fetchRSS('https://www.theguardian.com/society/rss', c) },
    // Climate (2 tools)
    { name: 'get_climate_news_guardian', desc: 'Guardian Environment',                fn: (c) => fetchRSS('https://www.theguardian.com/environment/rss', c) },
    { name: 'get_climate_news_cbc',      desc: 'CBC Environment & Climate',            fn: (c) => fetchRSS('https://www.cbc.ca/cmlink/rss-environment', c) },
  ];

  const server = new Server(
    { name: 'daily-pulse-news', version: '2.0.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map(t => ({
      name: t.name,
      description: t.desc,
      inputSchema: {
        type: 'object',
        properties: { count: { type: 'number', description: 'Number of stories to fetch' } },
        required: ['count']
      }
    }))
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    const count = Math.max(1, Math.min(20, Number(args?.count || 5)));
    const tool = TOOLS.find(t => t.name === name);
    if (!tool) throw new Error(`Unknown tool: ${name}`);
    try {
      const stories = await tool.fn(count);
      return { content: [{ type: 'text', text: JSON.stringify(stories) }] };
    } catch (err) {
      console.error(`[${name}] failed:`, err.message);
      return { content: [{ type: 'text', text: '[]' }] };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
})();
