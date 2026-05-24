# CLAUDE.md — Daily Pulse

## Who You Are Building For
Balaji Sivarajan — Senior TPM, Surrey BC Canada. iPhone is primary device. Surface Pro Windows 11 is dev machine. GitHub: ibalajisivarajan

## What Daily Pulse Is
Full-screen vertical scroll news app. Phase 2: newsmcp MCP → Groq LLM → enriched stories.json, served via GitHub Pages. Full-screen snap-scroll cards, photo background, headline + AI summary overlay. Preferences UI with 8-topic sliders synced via Cloudflare Worker. Zero monthly cost.

## Architecture Decisions (All Locked)
| Decision | Choice |
|---|---|
| Data source | Phase 2: newsmcp MCP server (technology/business/world/sports) |
| Image source | og:image scrape per story |
| Image fallback | CSS gradient (5 variants, keyed 1–5) |
| LLM enrichment | Groq (llama-3.3-70b-versatile) via scripts/agent.js |
| Category detection | Groq classification + keyword matching fallback in JS |
| Weather | Open-Meteo + Nominatim via browser geolocation |
| Time display | Location-based via browser |
| Automation | GitHub Actions workflow_dispatch (manual trigger via Cloudflare Worker) |
| Hosting | GitHub Pages root/main |
| App architecture | Single index.html — no build step |
| Refresh | Pull-to-refresh + "Save & Refresh Feed" button dispatches workflow |
| Preferences | 8-topic sliders, written to repo by Cloudflare Worker (no browser token) |

## Secrets Required (GitHub → Settings → Secrets → Actions)
- GROQ_API_KEY — from console.groq.com

## Secrets Required (Cloudflare → Workers → daily-pulse-refresh → Settings → Variables)
- GITHUB_TOKEN — GitHub PAT with repo + workflow scopes (writes preferences.json + triggers dispatch)

## Phase 2 — MCP + Groq Architecture

### MCP Server: scripts/news-mcp-server.js
Exposes 7 tools — one per news category. Groq decides at runtime which to call based on user preferences.

| Tool | Source | URL |
|---|---|---|
| get_ai_tech_news | Hacker News | hn.algolia.com/api/v1/search?tags=front_page |
| get_finance_news | Reuters Business | feeds.reuters.com/reuters/businessNews |
| get_geopolitics_news | Al Jazeera | aljazeera.com/xml/rss/all.xml |
| get_sports_news | BBC Sport | feeds.bbci.co.uk/news/sport/rss.xml |
| get_science_news | Guardian Science | theguardian.com/science/rss |
| get_health_news | CBC Health | rss.cbc.ca/lineup/health.xml |
| get_climate_news | Guardian Environment | theguardian.com/environment/rss |

### Agent: scripts/agent.js
MCP client that spawns news-mcp-server.js, passes all 7 tools to Groq, runs the tool-call loop until Groq returns final JSON array. Falls back to direct get_ai_tech_news call if Groq loop fails.

### Secrets Required
- GROQ_API_KEY — GitHub Actions secret for Groq API
- GITHUB_TOKEN — Cloudflare Worker secret (repo + workflow scopes); writes preferences.json to repo and triggers dispatch

## Repo Structure
daily-pulse-v2/
├── .github/workflows/fetch-stories.yml
├── scripts/
│   ├── news-mcp-server.js ← Phase 2 MCP server (7 tools)
│   ├── agent.js           ← Phase 2 agent (MCP client + Groq loop)
│   ├── fetch.js           ← Phase 1 (kept for reference)
│   ├── app-logic.js
│   └── smoke_test.js
├── tests/
│   ├── agent.test.js
│   ├── fetch.test.js
│   └── app.test.js
├── data/
│   ├── stories.json
│   └── preferences.json
├── index.html
├── CLAUDE.md
├── TESTPLAN.md
├── package.json
└── README.md

## Constraints — Never Violate
- NO API keys in repo
- NO build step — index.html is self-contained
- stories.json must always be valid JSON — write [] on total failure
- Per-story fetch errors caught individually — one bad URL cannot crash script
- Actions only commits if stories.json changed (git diff check)
- Must work on iPhone Safari — test scroll-snap specifically
- Geolocation must fail gracefully — never block app load

## Release Gate — Mandatory Before Every Version Bump
1. Run: npm test — all must pass
2. Run: node scripts/smoke_test.js — 0 FAILED required
3. Self-review TESTPLAN.md
4. Check: silent catch blocks, stories.json always writes, geolocation timeout, scroll-snap-stop: always
5. Only then: bump version comment in index.html and push
