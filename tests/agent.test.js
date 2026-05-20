const { parseGroqResponse } = require('../scripts/agent');

test('valid JSON returns correct array', () => {
  const raw = JSON.stringify([
    { id: '1', title: 'Test', url: 'https://test.com', domain: 'test.com',
      score: 100, comments: 10, time: 1234567890, image: 'https://picsum.photos/seed/1/900/1600',
      gradient: 1, category: '🤖 AI', summary: 'Test summary', relevance: 8, filtered: false }
  ]);
  const result = parseGroqResponse(raw);
  expect(result).toHaveLength(1);
  expect(result[0].summary).toBe('Test summary');
});

test('invalid JSON returns empty array', () => {
  expect(parseGroqResponse('not json')).toEqual([]);
});

test('filtered stories are removed', () => {
  const raw = JSON.stringify([
    { id: '1', filtered: false, relevance: 8, category: '🤖 AI',
      summary: 'good', title: 'A', url: 'https://a.com', domain: 'a.com',
      score: 10, comments: 1, time: 123, image: 'https://picsum.photos/seed/1/900/1600', gradient: 1 },
    { id: '2', filtered: true, relevance: 2, category: '💻 Tech',
      summary: 'noise', title: 'B', url: 'https://b.com', domain: 'b.com',
      score: 5, comments: 0, time: 123, image: 'https://picsum.photos/seed/2/900/1600', gradient: 2 }
  ]);
  const result = parseGroqResponse(raw);
  expect(result).toHaveLength(1);
  expect(result[0].id).toBe('1');
});

test('sorted by relevance descending', () => {
  const stories = [3,9,1,7].map((r, i) => ({
    id: String(i), filtered: false, relevance: r,
    category: '🤖 AI', summary: 'x', title: 'T', url: 'https://t.com',
    domain: 't.com', score: 1, comments: 0, time: 1,
    image: 'https://picsum.photos/seed/1/900/1600', gradient: 1
  }));
  const result = parseGroqResponse(JSON.stringify(stories));
  expect(result[0].relevance).toBe(9);
  expect(result[1].relevance).toBe(7);
});

test('capped at 30 stories', () => {
  const stories = Array.from({ length: 40 }, (_, i) => ({
    id: String(i), filtered: false, relevance: 5,
    category: '🤖 AI', summary: 'x', title: 'T', url: 'https://t.com',
    domain: 't.com', score: 1, comments: 0, time: 1,
    image: 'https://picsum.photos/seed/1/900/1600', gradient: 1
  }));
  expect(parseGroqResponse(JSON.stringify(stories))).toHaveLength(30);
});
