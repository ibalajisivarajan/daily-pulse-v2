# CLAUDE.md — Daily Pulse

## Who You Are Building For
Balaji Sivarajan — Senior TPM, Surrey BC Canada. iPhone is primary device. Surface Pro Windows 11 is dev machine. GitHub: ibalajisivarajan

## What Daily Pulse Is
TikTok-style vertical scroll news app. Pulls top 30 stories from HN Algolia API every 2h via GitHub Actions, writes to data/stories.json, serves single-file index.html via GitHub Pages. Full-screen snap-scroll cards, photo background, headline overlay. Zero monthly cost.

## Architecture Decisions (All Locked)
| Decision | Choice |
|---|---|
| Data source | HN Algolia API — free, no auth |
| Image source | og:image scrape per story |
| Image fallback | CSS gradient (5 variants, keyed 1–5) |
| LLM enrichment | None in Phase 1 — Phase 2 uses Groq |
| Category detection | Keyword matching in JS |
| Weather | Open-Meteo + Nominatim via browser geolocation |
| Time display | Location-based via browser |
| Automation | GitHub Actions cron every 2 hours |
| Hosting | GitHub Pages root/main |
| App architecture | Single index.html — no build step |
| Refresh | Manual only in v1 |

## Repo Structure
daily-pulse/
├── .github/workflows/fetch-stories.yml
├── scripts/
│   ├── fetch.js
│   ├── app-logic.js
│   └── smoke_test.js
├── tests/
│   ├── fetch.test.js
│   └── app.test.js
├── data/stories.json
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
