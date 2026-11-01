import { validatePool } from '../../src/services/poolValidation.js';
import { buildPool } from '../helpers/poolFixture.js';

const inGame = (pool, slug) => pool.questions.filter((q) => q.gameSlug === slug);

function run(mutate) {
  const pool = buildPool();
  mutate?.(pool);
  return validatePool(pool);
}

const hasError = (errors, regex) => errors.some((e) => regex.test(e));

describe('validatePool', () => {
  test('a valid pool has no errors', () => {
    expect(run()).toEqual([]);
  });

  test('Game 1 must have exactly 6 active questions', () => {
    const errors = run((p) => {
      inGame(p, 'match-the-word')[0].active = false;
    });
    expect(hasError(errors, /Game "match-the-word" has 5 active questions, expected 6/)).toBe(true);
  });

  test('inactive questions are not counted', () => {
    const errors = run((p) => {
      inGame(p, 'satellite-or-ground')[0].active = false;
    });
    expect(hasError(errors, /Game "satellite-or-ground" has 29 active/)).toBe(true);
  });

  test('duplicate keys are reported', () => {
    const errors = run((p) => {
      const g2 = inGame(p, 'satellite-or-ground');
      g2[1].key = g2[0].key;
    });
    expect(hasError(errors, /duplicate key/)).toBe(true);
  });

  test('correctChoiceKey must exist in choices', () => {
    const errors = run((p) => {
      inGame(p, 'fix-the-field')[0].correctChoiceKey = 'z';
    });
    expect(hasError(errors, /correctChoiceKey "z" is not in choices/)).toBe(true);
  });

  test('a wrong choice cannot have the same label as the correct one', () => {
    const errors = run((p) => {
      const q = inGame(p, 'crop-superpowers')[0];
      q.choices[1].label = q.choices[0].label;
    });
    expect(hasError(errors, /same label as the correct choice/)).toBe(true);
  });

  test('Games 2 to 5 need exactly 3 choices', () => {
    const errors = run((p) => {
      inGame(p, 'fix-the-field')[0].choices.pop();
    });
    expect(hasError(errors, /exactly 3 choices/)).toBe(true);
  });

  test('Game 2 needs 10 questions per group', () => {
    const errors = run((p) => {
      const q = inGame(p, 'satellite-or-ground').find((x) => x.group === 'satellite');
      q.group = 'both';
      q.correctChoiceKey = 'both';
    });
    expect(hasError(errors, /group "satellite" has 9/)).toBe(true);
  });

  test('Game 2 choices must be in the fixed order', () => {
    const errors = run((p) => {
      const q = inGame(p, 'satellite-or-ground')[0];
      [q.choices[0], q.choices[1]] = [q.choices[1], q.choices[0]];
    });
    expect(hasError(errors, /Game 2 choices must be/)).toBe(true);
  });

  test('Game 2 must not have a collectionItem', () => {
    const errors = run((p) => {
      inGame(p, 'satellite-or-ground')[0].collectionItem = {
        key: 'x',
        label: 'x',
        iconKey: 'fix-a',
      };
    });
    expect(hasError(errors, /must not have a collectionItem/)).toBe(true);
  });

  test('Game 3 needs all 8 groups', () => {
    const errors = run((p) => {
      for (const q of inGame(p, 'crop-superpowers')) {
        if (q.group === 'H') q.group = 'G';
      }
    });
    expect(hasError(errors, /group H has 0/)).toBe(true);
  });

  test('Game 1 correctChoiceKey must equal the question key', () => {
    const errors = run((p) => {
      const q = inGame(p, 'match-the-word')[0];
      q.correctChoiceKey = 'x';
      q.choices[0].key = 'x';
    });
    expect(hasError(errors, /must equal the question key/)).toBe(true);
  });

  test('Games 1, 3, 4, 5 need a collectionItem', () => {
    const errors = run((p) => {
      delete inGame(p, 'fix-the-field')[0].collectionItem;
    });
    expect(hasError(errors, /missing collectionItem/)).toBe(true);
  });

  test('Game 4 needs illustrationFixedKey', () => {
    const errors = run((p) => {
      delete inGame(p, 'fix-the-field')[0].illustrationFixedKey;
    });
    expect(hasError(errors, /Game 4 needs illustrationFixedKey/)).toBe(true);
  });

  test('every iconKey must exist in icon-keys.json', () => {
    const errors = run((p) => {
      inGame(p, 'weather-and-crops')[0].choices[0].iconKey = 'nope';
    });
    expect(hasError(errors, /"nope" is not in icon-keys\.json/)).toBe(true);
  });

  test('nextGameSlug must point to a real game', () => {
    const errors = run((p) => {
      p.games[0].nextGameSlug = 'ghost';
    });
    expect(hasError(errors, /nextGameSlug "ghost"/)).toBe(true);
  });

  test('the finale nextGameSlug must be null', () => {
    const errors = run((p) => {
      p.games.find((g) => g.slug === 'weather-and-crops').nextGameSlug = 'fix-the-field';
    });
    expect(hasError(errors, /nextGameSlug must be null/)).toBe(true);
  });

  test('only weather-and-crops may have a null nextGameSlug', () => {
    const errors = run((p) => {
      p.games[0].nextGameSlug = null;
    });
    expect(hasError(errors, /can be null only for weather-and-crops/)).toBe(true);
  });
});