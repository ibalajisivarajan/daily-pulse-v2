const { detectCategory, timeAgo, formatScore } = require('../scripts/app-logic');

describe('detectCategory', () => {
  test('detects AI from openai domain', () => { expect(detectCategory('openai.com', 'GPT-5 released')).toBe('🤖 AI'); });
  test('detects AI from anthropic domain', () => { expect(detectCategory('anthropic.com', 'New Claude')).toBe('🤖 AI'); });
  test('detects AI from llm in title', () => { expect(detectCategory('github.com', 'Building a local LLM runner')).toBe('🤖 AI'); });
  test('detects AI from model in title', () => { expect(detectCategory('theverge.com', 'New AI model beats benchmarks')).toBe('🤖 AI'); });
  test('detects Finance from wsj domain', () => { expect(detectCategory('wsj.com', 'Rate decision today')).toBe('💰 Finance'); });
  test('detects Finance from bitcoin in title', () => { expect(detectCategory('reddit.com', 'Bitcoin hits $100k')).toBe('💰 Finance'); });
  test('detects Finance from inflation in title', () => { expect(detectCategory('reuters.com', 'Inflation drops to 2%')).toBe('💰 Finance'); });
  test('detects Geo from war in title', () => { expect(detectCategory('bbc.com', 'War in Middle East escalates')).toBe('🌍 Geo'); });
  test('detects Geo from election in title', () => { expect(detectCategory('reuters.com', 'German election results')).toBe('🌍 Geo'); });
  test('detects Geo from summit in title', () => { expect(detectCategory('reuters.com', 'G7 summit agreement')).toBe('🌍 Geo'); });
  test('detects Sports from espn domain', () => { expect(detectCategory('espn.com', 'Lakers win')).toBe('⚽ Sports'); });
  test('detects Sports from nba in title', () => { expect(detectCategory('reddit.com', 'NBA playoffs game 7')).toBe('⚽ Sports'); });
  test('defaults to Tech', () => { expect(detectCategory('cloudflare.com', 'Workers now support Python')).toBe('💻 Tech'); });
  test('AI domain beats Tech default', () => { expect(detectCategory('huggingface.co', 'New model released')).toBe('🤖 AI'); });
});

describe('timeAgo', () => {
  const now = Math.floor(Date.now() / 1000);
  test('shows just now for < 60s', () => { expect(timeAgo(now - 30)).toBe('just now'); });
  test('shows minutes', () => { expect(timeAgo(now - 120)).toBe('2m ago'); });
  test('shows hours and minutes', () => { expect(timeAgo(now - 3900)).toBe('1h 5m ago'); });
  test('shows days', () => { expect(timeAgo(now - 90000)).toBe('1d ago'); });
  test('handles null without crash', () => { expect(() => timeAgo(null)).not.toThrow(); });
  test('handles 0 without crash', () => { expect(() => timeAgo(0)).not.toThrow(); });
  test('returns a string', () => { expect(typeof timeAgo(now - 100)).toBe('string'); });
});

describe('formatScore', () => {
  test('returns string for < 1000', () => { expect(formatScore(500)).toBe('500'); });
  test('formats 1000 as 1.0k', () => { expect(formatScore(1000)).toBe('1.0k'); });
  test('formats 2341 as 2.3k', () => { expect(formatScore(2341)).toBe('2.3k'); });
  test('handles 0', () => { expect(formatScore(0)).toBe('0'); });
  test('handles null', () => { expect(formatScore(null)).toBe('0'); });
  test('handles undefined', () => { expect(formatScore(undefined)).toBe('0'); });
});
