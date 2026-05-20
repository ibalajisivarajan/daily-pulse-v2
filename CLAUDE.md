# CLAUDE.md — Daily Pulse

## Who You Are Building For
Balaji Sivarajan — Senior TPM, Surrey BC Canada. iPhone is primary device. Surface Pro Windows 11 is dev machine. GitHub: ibalajisivarajan

## What Daily Pulse Is
TikTok-style vertical scroll news app. Phase 2: newsmcp MCP → Groq LLM → enriched stories.json, served via GitHub Pages. Full-screen snap-scroll cards, photo background, headline + AI summary overlay. Preferences UI with 8-topic sliders, localStorage + GitHub Gist sync. Zero monthly cost.

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
| Automation | GitHub Actions cron every 2 hours |
| Hosting | GitHub Pages root/main |
| App architecture | Single index.html — no build step |
| Refresh | Pull-to-refresh + "Save & Refresh Feed" button dispatches workflow |
| Preferences | 8-topic sliders, localStorage + GitHub Gist sync (GIST_ID, GIST_TOKEN) |

## Secrets Required (GitHub → Settings → Secrets → Actions)
- GROQ_API_KEY — from console.groq.com
- GIST_ID — ID of a GitHub Gist containing preferences.json
- GIST_TOKEN — GitHub PAT with gist + workflow scopes

## Repo Structure
daily-pulse-v2/
├── .github/workflows/fetch-stories.yml
├── scripts/
│   ├── agent.js          ← Phase 2 main (newsmcp + Groq)
│   ├── pull-prefs.js     ← pulls preferences.json from Gist before agent runs
│   ├── fetch.js          ← Phase 1 (kept for reference)
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
