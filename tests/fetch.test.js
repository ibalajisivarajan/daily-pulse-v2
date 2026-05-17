const { extractDomain, assignGradient, buildStoryObject } = require('../scripts/fetch');

describe('extractDomain', () => {
  test('extracts domain from full URL', () => {
    expect(extractDomain('https://www.theverge.com/ai/1234')).toBe('theverge.com');
  });
  test('strips www prefix', () => {
    expect(extractDomain('https://www.wsj.com/articles/test')).toBe('wsj.com');
  });
  test('handles URL without www', () => {
    expect(extractDomain('https://blog.cloudflare.com/post')).toBe('blog.cloudflare.com');
  });
  test('returns empty string for null', () => {
    expect(extractDomain(null)).toBe('');
  });
  test('returns empty string for undefined', () => {
    expect(extractDomain(undefined)).toBe('');
  });
  test('returns empty string for empty string', () => {
    expect(extractDomain('')).toBe('');
  });
  test('handles URL with query string', () => {
    expect(extractDomain('https://github.com/user/repo?tab=readme')).toBe('github.com');
  });
});

describe('assignGradient', () => {
  test('returns 1 for index 0', () => { expect(assignGradient(0)).toBe(1); });
  test('returns 2 for index 1', () => { expect(assignGradient(1)).toBe(2); });
  test('returns 5 for index 4', () => { expect(assignGradient(4)).toBe(5); });
  test('cycles back to 1 at index 5', () => { expect(assignGradient(5)).toBe(1); });
  test('always returns value between 1 and 5', () => {
    for (let i = 0; i < 100; i++) {
      const g = assignGradient(i);
      expect(g).toBeGreaterThanOrEqual(1);
      expect(g).toBeLessThanOrEqual(5);
    }
  });
});

describe('buildStoryObject', () => {
  const hit = { objectID: '12345', title: 'Test story', url: 'https://theverge.com/ai/test', points: 2341, num_comments: 847, created_at_i: 1747390000 };
  test('builds correct story with image', () => {
    const s = buildStoryObject(hit, 'https://cdn.theverge.com/og.jpg', 0);
    expect(s.id).toBe('12345');
    expect(s.domain).toBe('theverge.com');
    expect(s.image).toBe('https://cdn.theverge.com/og.jpg');
    expect(s.gradient).toBe(1);
  });
  test('builds correct story with null image', () => {
    const s = buildStoryObject(hit, null, 2);
    expect(s.image).toBeNull();
    expect(s.gradient).toBe(3);
  });
  test('handles null points', () => {
    const s = buildStoryObject({ ...hit, points: null }, null, 0);
    expect(s.score).toBe(0);
  });
  test('handles null num_comments', () => {
    const s = buildStoryObject({ ...hit, num_comments: null }, null, 0);
    expect(s.comments).toBe(0);
  });
  test('handles null url', () => {
    const s = buildStoryObject({ ...hit, url: null }, null, 0);
    expect(s.url).toBeNull();
    expect(s.domain).toBe('');
  });
});
