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

test('filtered stories returned as-is (filtering happens in Phase 6)', () => {
  const input  = [makeStory(1, 8, false), makeStory(2, 2, true)];
  const result = parseGroqResponse(JSON.stringify(input));
  expect(result).toHaveLength(2);
});

test('all stories returned unsorted (sorting happens in Phase 6)', () => {
  const input  = [makeStory(1, 3), makeStory(2, 9), makeStory(3, 6)];
  const result = parseGroqResponse(JSON.stringify(input));
  expect(result).toHaveLength(3);
});

test('no cap applied (capping happens in Phase 6)', () => {
  const input = Array.from({ length: 40 }, (_, i) => makeStory(i, 5));
  expect(parseGroqResponse(JSON.stringify(input))).toHaveLength(40);
});

test('stories with undefined title are filtered', () => {
  const input = [
    makeStory(1, 8, false),
    { ...makeStory(2, 5, false), title: 'undefined' },
    { ...makeStory(3, 6, false), title: '' },
  ];
  const result = parseGroqResponse(JSON.stringify(input));
  expect(result).toHaveLength(1);
  expect(result[0].id).toBe('1');
});

test('handles json wrapped in markdown code block', () => {
  const raw = '```json\n' + JSON.stringify([makeStory(1, 7)]) + '\n```';
  expect(parseGroqResponse(raw)).toHaveLength(1);
});

test('empty string returns empty array', () => {
  expect(parseGroqResponse('')).toEqual([]);
});
