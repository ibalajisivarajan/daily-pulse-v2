# Daily Pulse

TikTok-style news feed pulling top stories from Hacker News.

## Stack
- HN Algolia API (free, no auth)
- GitHub Actions (auto-fetch every 2 hours)
- GitHub Pages (hosting)
- Open-Meteo API (weather, free, no key)
- Zero monthly cost

## Local dev
```bash
cd scripts && npm install
cd ..
node scripts/fetch.js
```
Then open `index.html` in a browser (use a local server for `fetch()` to work, e.g. `npx serve .`).

## Phase 2
Groq LLM enrichment (category tagging, summaries, noise filtering)
