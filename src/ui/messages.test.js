import { describe, it, expect } from 'vitest';
import { describeGuess, explainResult, pickFresh } from './messages.js';

const N = (suit, number) => ({ id: `${suit}-${number}`, kind: 'number', suit, number });
const DS = (a, b) => ({ id: `ds-${a}-${b}`, kind: 'dualSuit', suits: [a, b] });
const DN = (a, b) => ({ id: `dn-${a}-${b}`, kind: 'dualNumber', numbers: [a, b] });

describe('explainResult', () => {
  it('guessed No Match but the leaf matched', () => {
    expect(explainResult({ card: N('leaf', 5), actual: 'match', matched: { suits: ['leaf'], numbers: [] } })).toEqual([
      'The ',
      { suit: 'leaf' },
      ' matched',
    ]);
  });

  it('guessed Match but nothing matched: names the card values that were missing', () => {
    expect(explainResult({ card: N('whisk', 5), actual: 'nomatch', matched: { suits: [], numbers: [] } })).toEqual([
      'No ',
      { suit: 'whisk' },
      ' or ',
      '5',
      ' on the table',
    ]);
    expect(explainResult({ card: DN(1, 2), actual: 'nomatch', matched: { suits: [], numbers: [] } })).toEqual([
      'No ',
      '1',
      ' or ',
      '2',
      ' on the table',
    ]);
  });

  it('Matcha-Matcha names both halves', () => {
    expect(explainResult({ card: N('leaf', 5), actual: 'matcha', matched: { suits: ['leaf'], numbers: [5] } })).toEqual([
      'The ',
      { suit: 'leaf' },
      ' and ',
      '5',
      ' both matched',
    ]);
  });

  it('dual-suit card matching on both suits', () => {
    expect(
      explainResult({ card: DS('cup', 'leaf'), actual: 'match', matched: { suits: ['cup', 'leaf'], numbers: [] } }),
    ).toEqual(['The ', { suit: 'cup' }, ' and ', { suit: 'leaf' }, ' matched']);
  });

  it('degrades to null without match details (old saves)', () => {
    expect(explainResult({ card: N('leaf', 5), actual: 'match' })).toBeNull();
  });
});

describe('describeGuess', () => {
  it('wrong-guess headlines never repeat back to back', () => {
    let prev = null;
    for (let i = 0; i < 50; i++) {
      const { headline } = describeGuess({ card: N('leaf', 1), actual: 'nomatch', correct: false, matched: { suits: [], numbers: [] } });
      expect(headline).not.toBe(prev);
      prev = headline;
    }
  });

  it('pickFresh with a single option still works', () => {
    const pool = ['only'];
    expect(pickFresh(pool)).toBe('only');
    expect(pickFresh(pool)).toBe('only');
  });
});
