const { parseGroqResponse, storiesForSlider } = require('../scripts/agent');

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

// ── storiesForSlider ──────────────────────────────────────
describe('storiesForSlider', () => {
  test('returns 0 for slider 1', () => expect(storiesForSlider(1)).toBe(0));
  test('returns 0 for slider 2', () => expect(storiesForSlider(2)).toBe(0));
  test('returns 5 for slider 3', () => expect(storiesForSlider(3)).toBe(5));
  test('returns 5 for slider 4', () => expect(storiesForSlider(4)).toBe(5));
  test('returns 7 for slider 5', () => expect(storiesForSlider(5)).toBe(7));
  test('returns 7 for slider 6', () => expect(storiesForSlider(6)).toBe(7));
  test('returns 10 for slider 7', () => expect(storiesForSlider(7)).toBe(10));
  test('returns 10 for slider 8', () => expect(storiesForSlider(8)).toBe(10));
  test('returns 14 for slider 9', () => expect(storiesForSlider(9)).toBe(14));
  test('returns 14 for slider 10', () => expect(storiesForSlider(10)).toBe(14));
});

// ── stories.json output contract ─────────────────────────
describe('stories.json output contract', () => {
  let stories;
  beforeAll(() => {
    try {
      stories = require('../data/stories.json');
    } catch {
      stories = [];
    }
  });

  test('is an array', () => {
    expect(Array.isArray(stories)).toBe(true);
  });

  test('no filtered stories in final output (DP2-013)', () => {
    const hasFiltered = stories.some(s => s.filtered === true);
    expect(hasFiltered).toBe(false);
  });

  test('story count does not exceed 30', () => {
    expect(stories.length).toBeLessThanOrEqual(30);
  });

  test('all stories have valid non-empty titles', () => {
    stories.forEach(s => {
      expect(s.title).toBeTruthy();
      expect(s.title).not.toBe('undefined');
      expect(typeof s.title).toBe('string');
      expect(s.title.trim().length).toBeGreaterThan(0);
    });
  });

  test('all stories have valid timestamps', () => {
    stories.forEach(s => {
      expect(Number(s.time)).toBeGreaterThan(0);
    });
  });

  test('all stories have a recognised category', () => {
    const validCats = ['AI','Tech','Finance','Geo',
                       'Sports','Science','Health','Climate'];
    stories.forEach(s => {
      expect(validCats).toContain(s.category);
    });
  });

  test('summaries that exist have minimum 10 characters', () => {
    stories
      .filter(s => s.summary)
      .forEach(s => {
        expect(s.summary.length).toBeGreaterThanOrEqual(10);
      });
  });
});
