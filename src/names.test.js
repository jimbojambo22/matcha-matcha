import { describe, it, expect } from 'vitest';
import { resolveNames, defaultName } from './names.js';

describe('resolveNames', () => {
  it('blank entries default to "Player N"', () => {
    expect(resolveNames(['', '  Jimbo  ', undefined], 3)).toEqual(['Player 1', 'Jimbo', 'Player 3']);
  });

  it('works with no names at all (older saves)', () => {
    expect(resolveNames(undefined, 2)).toEqual([defaultName(0), defaultName(1)]);
  });

  it('caps long names and collapses whitespace', () => {
    expect(resolveNames(['A   very   long name indeed, too long'], 1)[0].length).toBeLessThanOrEqual(20);
    expect(resolveNames(['A   B'], 1)).toEqual(['A B']);
  });
});
