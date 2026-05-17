'use strict';

function detectCategory(domain, title) {
  const d = (domain || '').toLowerCase();
  const t = ' ' + (title || '').toLowerCase() + ' ';

  const aiDomains   = ['openai', 'anthropic', 'deepmind', 'huggingface', 'mistral'];
  const aiKeywords  = [' ai ', ' llm', 'model', 'gpt', 'claude', 'gemini', 'neural', 'machine learning'];
  if (aiDomains.some(k => d.includes(k)) || aiKeywords.some(k => t.includes(k))) return '🤖 AI';

  const finDomains  = ['wsj', 'bloomberg', 'ft.com', 'coindesk'];
  const finKeywords = ['market', 'stock', 'rate', 'inflation', 'fed ', 'bank', 'crypto', 'bitcoin'];
  if (finDomains.some(k => d.includes(k)) || finKeywords.some(k => t.includes(k))) return '💰 Finance';

  const geoKeywords = ['war', 'election', 'government', 'president', 'minister', 'nato', 'sanctions', 'treaty', 'summit'];
  if (geoKeywords.some(k => t.includes(k))) return '🌍 Geo';

  const sprDomains  = ['espn'];
  const sprKeywords = ['nba', 'nfl', 'fifa', 'championship', 'playoffs', 'match', 'tournament', 'cup'];
  if (sprDomains.some(k => d.includes(k)) || sprKeywords.some(k => t.includes(k))) return '⚽ Sports';

  return '💻 Tech';
}

function timeAgo(timestamp) {
  if (!timestamp) return 'just now';
  const s = Math.floor(Date.now() / 1000) - timestamp;
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60), rm = m % 60;
  if (h < 24) return rm > 0 ? `${h}h ${rm}m ago` : `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatScore(score) {
  if (score == null) return '0';
  if (score < 1000) return String(score);
  return (score / 1000).toFixed(1) + 'k';
}

module.exports = { detectCategory, timeAgo, formatScore };
