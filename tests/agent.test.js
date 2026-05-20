const { parseGroqResponse } = require('../scripts/agent');

const makeStory = (id, relevance, filtered = false) => ({
  id:       String(id),
  title:    'Test',
  url:      'https://test.com',
  domain:   'test.com',
  score:    10,
  comments: 5,
  time:     1747390000,
  image:    `https://picsum.photos/seed/${id}/900/1600`,
  gradient: 1,
  category: 'Tech',
  summary:  'Test summary',
  relevance,
  filtered,
});

test('valid JSON returns correct array', () => {
  const result = parseGroqResponse(JSON.stringify([makeStory(1, 8)]));
  expect(result).toHaveLength(1);
  expect(result[0].summary).toBe('Test summary');
});

test('invalid JSON returns empty array', () => {
  expect(parseGroqResponse('not json')).toEqual([]);
});

test('filtered stories removed', () => {
  const input  = [makeStory(1, 8, false), makeStory(2, 2, true)];
  const result = parseGroqResponse(JSON.stringify(input));
  expect(result).toHaveLength(1);
  expect(result[0].id).toBe('1');
});

test('sorted by relevance descending', () => {
  const input  = [makeStory(1, 3), makeStory(2, 9), makeStory(3, 6)];
  const result = parseGroqResponse(JSON.stringify(input));
  expect(result[0].relevance).toBe(9);
  expect(result[1].relevance).toBe(6);
});

test('capped at 30 stories', () => {
  const input = Array.from({ length: 40 }, (_, i) => makeStory(i, 5));
  expect(parseGroqResponse(JSON.stringify(input))).toHaveLength(30);
});

test('handles json wrapped in markdown code block', () => {
  const raw = '```json\n' + JSON.stringify([makeStory(1, 7)]) + '\n```';
  expect(parseGroqResponse(raw)).toHaveLength(1);
});
