const { storiesForSlider, splitCount } = require('../scripts/agent');

// ── storiesForSlider ──────────────────────────────────────────────────────────
describe('storiesForSlider', () => {
  test('returns 0 for slider 1',  () => expect(storiesForSlider(1)).toBe(0));
  test('returns 0 for slider 2',  () => expect(storiesForSlider(2)).toBe(0));
  test('returns 5 for slider 3',  () => expect(storiesForSlider(3)).toBe(5));
  test('returns 5 for slider 4',  () => expect(storiesForSlider(4)).toBe(5));
  test('returns 7 for slider 5',  () => expect(storiesForSlider(5)).toBe(7));
  test('returns 7 for slider 6',  () => expect(storiesForSlider(6)).toBe(7));
  test('returns 10 for slider 7', () => expect(storiesForSlider(7)).toBe(10));
  test('returns 10 for slider 8', () => expect(storiesForSlider(8)).toBe(10));
  test('returns 14 for slider 9', () => expect(storiesForSlider(9)).toBe(14));
  test('returns 14 for slider 10',() => expect(storiesForSlider(10)).toBe(14));
  test('coerces string to number', () => expect(storiesForSlider('5')).toBe(7));
  test('returns 0 for 0',         () => expect(storiesForSlider(0)).toBe(0));
});

// ── splitCount ────────────────────────────────────────────────────────────────
describe('splitCount', () => {
  test('total 0 across 2 parts returns [0, 0]', () => {
    expect(splitCount(0, 2)).toEqual([0, 0]);
  });
  test('total 0 across 3 parts returns [0, 0, 0]', () => {
    expect(splitCount(0, 3)).toEqual([0, 0, 0]);
  });
  test('total 5 across 2 parts returns [3, 2]', () => {
    expect(splitCount(5, 2)).toEqual([3, 2]);
  });
  test('total 7 across 2 parts returns [4, 3]', () => {
    expect(splitCount(7, 2)).toEqual([4, 3]);
  });
  test('total 10 across 2 parts returns [5, 5]', () => {
    expect(splitCount(10, 2)).toEqual([5, 5]);
  });
  test('total 7 across 3 parts returns [3, 2, 2]', () => {
    expect(splitCount(7, 3)).toEqual([3, 2, 2]);
  });
  test('total 10 across 3 parts returns [4, 3, 3]', () => {
    expect(splitCount(10, 3)).toEqual([4, 3, 3]);
  });
  test('total 14 across 3 parts returns [5, 5, 4]', () => {
    expect(splitCount(14, 3)).toEqual([5, 5, 4]);
  });
  test('output array has length equal to numParts', () => {
    expect(splitCount(7, 3)).toHaveLength(3);
    expect(splitCount(5, 2)).toHaveLength(2);
  });
  test('sum of parts equals total', () => {
    const parts = splitCount(7, 3);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(7);
  });
  test('sum of parts equals total for even split', () => {
    const parts = splitCount(10, 2);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(10);
  });
});

// ── stories.json output contract ──────────────────────────────────────────────
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
