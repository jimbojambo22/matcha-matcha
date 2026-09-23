// Phase 2: the odds model. Every classification rule gets a case with an
// obvious expected answer, and the classifier is checked against the engine's
// own matching logic so the two can never silently drift apart.
import { describe, it, expect } from 'vitest';
import { buildDeck, cardSuits, cardNumbers } from './cards.js';
import {
  classifyCard,
  classifyAll,
  alignedPick,
  bustProb,
  correctProb,
  matchBaseRate,
  naiveRemaining,
  trueRemaining,
  analyseDecision,
} from './probability.js';

const N = (suit, number) => ({ id: `${suit}-${number}`, kind: 'number', suit, number });
const DS = (a, b) => ({ id: `ds-${a}-${b}`, kind: 'dualSuit', suits: [a, b] });
const DN = (a, b) => ({ id: `dn-${a}-${b}`, kind: 'dualNumber', numbers: [a, b] });
const LS = () => ({ id: 'special-lastSip', kind: 'special', name: 'lastSip' });
const FS = (i = 1) => ({ id: `special-freeSpace-${i}`, kind: 'special', name: 'freeSpace' });

describe('classifyCard', () => {
  const S = ['leaf', 'cup'];
  const NUM = [1, 2];

  it('basic card: suit and number both live -> MATCHA', () => {
    expect(classifyCard(N('leaf', 1), S, NUM)).toBe('MATCHA');
    expect(classifyCard(N('cup', 2), S, NUM)).toBe('MATCHA');
  });

  it('basic card: exactly one axis live -> MATCH', () => {
    expect(classifyCard(N('leaf', 7), S, NUM)).toBe('MATCH'); // suit only
    expect(classifyCard(N('whisk', 1), S, NUM)).toBe('MATCH'); // number only
  });

  it('basic card: neither axis live -> NOMATCH', () => {
    expect(classifyCard(N('whisk', 7), S, NUM)).toBe('NOMATCH');
  });

  it('double-suit: either suit live -> MATCH, never MATCHA', () => {
    expect(classifyCard(DS('leaf', 'whisk'), S, NUM)).toBe('MATCH');
    expect(classifyCard(DS('whisk', 'teapot'), S, NUM)).toBe('NOMATCH');
    // Carries no number, so it cannot hit both axes however live the numbers.
    expect(classifyCard(DS('leaf', 'cup'), S, [1, 2, 3, 4, 5, 6, 7, 8])).toBe('MATCH');
  });

  it('double-number: either number live -> MATCH, never MATCHA', () => {
    expect(classifyCard(DN(1, 5), S, NUM)).toBe('MATCH');
    expect(classifyCard(DN(5, 6), S, NUM)).toBe('NOMATCH');
    expect(classifyCard(DN(1, 2), ['leaf', 'cup', 'whisk', 'teapot', 'blossom'], NUM)).toBe('MATCH');
  });

  it('specials are their own categories regardless of the table', () => {
    expect(classifyCard(FS(), S, NUM)).toBe('FREE_SPACE');
    expect(classifyCard(LS(), S, NUM)).toBe('LAST_SIP');
    expect(classifyCard(FS(), [], [])).toBe('FREE_SPACE');
  });

  it('an empty table makes every ordinary card a NOMATCH', () => {
    expect(classifyCard(N('leaf', 1), [], [])).toBe('NOMATCH');
    expect(classifyCard(DS('leaf', 'cup'), [], [])).toBe('NOMATCH');
  });

  it('agrees with the engine matching rule for every card in the deck', () => {
    // The engine computes: suitHit && numberHit -> matcha, either -> match.
    // Re-derived here independently over the whole deck.
    const S2 = ['leaf', 'whisk'];
    const NUM2 = [3, 8];
    for (const card of buildDeck()) {
      if (card.kind === 'special') continue;
      const suitHit = cardSuits(card).some((s) => S2.includes(s));
      const numberHit = cardNumbers(card).some((n) => NUM2.includes(n));
      const expected = suitHit && numberHit ? 'MATCHA' : suitHit || numberHit ? 'MATCH' : 'NOMATCH';
      expect(classifyCard(card, S2, NUM2)).toBe(expected);
    }
  });
});

describe('classifyAll', () => {
  it('counts every category and the total', () => {
    // vs suits {leaf}, numbers {1}:
    //   leaf-1  -> both axes live      -> MATCHA
    //   leaf-7  -> suit only           -> MATCH
    //   whisk-7 -> neither             -> NOMATCH
    //   ds leaf/whisk -> suit only     -> MATCH
    const counts = classifyAll(
      [N('leaf', 1), N('leaf', 7), N('whisk', 7), FS(), LS(), DS('leaf', 'whisk')],
      ['leaf'],
      [1],
    );
    expect(counts).toEqual({ MATCH: 2, NOMATCH: 1, MATCHA: 1, FREE_SPACE: 1, LAST_SIP: 1, total: 6 });
  });

  it('an empty candidate set gives all zeros', () => {
    expect(classifyAll([], ['leaf'], [1])).toEqual({
      MATCH: 0,
      NOMATCH: 0,
      MATCHA: 0,
      FREE_SPACE: 0,
      LAST_SIP: 0,
      total: 0,
    });
  });
});

describe('alignedPick', () => {
  const counts = (MATCH, NOMATCH, extra = {}) => ({
    MATCH,
    NOMATCH,
    MATCHA: 0,
    FREE_SPACE: 0,
    LAST_SIP: 0,
    total: MATCH + NOMATCH,
    ...extra,
  });

  it('points at whichever of MATCH / NOMATCH is larger', () => {
    expect(alignedPick(counts(10, 3))).toBe('match');
    expect(alignedPick(counts(3, 10))).toBe('nomatch');
  });

  it('a dead heat is a tie', () => {
    expect(alignedPick(counts(5, 5))).toBe('tie');
    expect(alignedPick(counts(0, 0))).toBe('tie');
  });

  it('Free Spaces and Last Sips never swing the direction', () => {
    const lopsided = { MATCH: 4, NOMATCH: 5, MATCHA: 20, FREE_SPACE: 30, LAST_SIP: 9, total: 68 };
    expect(alignedPick(lopsided)).toBe('nomatch');
  });
});

describe('bustProb / correctProb / matchBaseRate', () => {
  const counts = { MATCH: 4, NOMATCH: 4, MATCHA: 2, FREE_SPACE: 1, LAST_SIP: 1, total: 12 };

  it('bustProb is MATCHA over the whole candidate set', () => {
    expect(bustProb(counts)).toBeCloseTo(2 / 12);
    expect(bustProb({ MATCH: 0, NOMATCH: 0, MATCHA: 0, FREE_SPACE: 0, LAST_SIP: 0, total: 0 })).toBe(0);
  });

  it('correctProb credits Free Spaces and drops Last Sips from the denominator', () => {
    // guessing match: (4 MATCH + 1 FREE_SPACE) / (12 - 1 LAST_SIP)
    expect(correctProb(counts, 'match')).toBeCloseTo(5 / 11);
    expect(correctProb(counts, 'nomatch')).toBeCloseTo(5 / 11);
  });

  it('matchBaseRate uses only the cards that settle the question', () => {
    expect(matchBaseRate(counts)).toBeCloseTo(0.5);
    expect(matchBaseRate({ MATCH: 0, NOMATCH: 0, MATCHA: 3, FREE_SPACE: 0, LAST_SIP: 0, total: 3 })).toBeNull();
  });
});

describe('the two remaining-card models', () => {
  it('naive starts from a full 52-card deck', () => {
    expect(naiveRemaining([])).toHaveLength(52);
  });

  it('naive subtracts the whole own pile, not just hidden cards', () => {
    const ownPile = [N('leaf', 1), N('cup', 2), FS(1)];
    const remaining = naiveRemaining(ownPile);

    expect(remaining).toHaveLength(49);
    const ids = remaining.map((c) => c.id);
    expect(ids).not.toContain('leaf-1');
    expect(ids).not.toContain('cup-2');
    expect(ids).not.toContain('special-freeSpace-1');
    // The other Free Space is a different card and stays in.
    expect(ids).toContain('special-freeSpace-2');
  });

  it('naive ignores other players and out-of-play cards by construction', () => {
    // Two identical own piles give identical models regardless of context.
    expect(naiveRemaining([N('leaf', 1)]).map((c) => c.id)).toEqual(naiveRemaining([N('leaf', 1)]).map((c) => c.id));
  });

  it('naive never mutates the shared deck', () => {
    naiveRemaining([N('leaf', 1)]);
    expect(naiveRemaining([])).toHaveLength(52);
  });

  it('true model reads the captured pile, and is null when redacted', () => {
    expect(trueRemaining({ remaining: [N('leaf', 1)] })).toHaveLength(1);
    expect(trueRemaining({ remaining: null })).toBeNull();
  });
});

describe('analyseDecision', () => {
  const context = {
    visibleSuits: ['leaf'],
    visibleNumbers: [1],
    ownPot: [N('leaf', 1)],
    remaining: [N('leaf', 2), N('leaf', 3), N('whisk', 7), N('whisk', 8)],
  };

  it('derives both models and their picks from one context blob', () => {
    const a = analyseDecision(context, 'match');

    // True pile: leaf-2, leaf-3 hit the suit; whisk-7/8 hit nothing.
    expect(a.trueCounts).toMatchObject({ MATCH: 2, NOMATCH: 2, MATCHA: 0, total: 4 });
    expect(a.trueAlignedPick).toBe('tie');
    expect(a.trueBustProb).toBe(0);
    // Naive: a full deck minus leaf-1 -> plenty of leaf and plenty of 1s.
    expect(a.naiveCounts.total).toBe(51);
    expect(a.naiveAlignedPick).toBe('nomatch'); // most of a full deck misses
  });

  it('degrades to naive-only when the pile was redacted', () => {
    const a = analyseDecision({ ...context, remaining: null }, 'match');

    expect(a.naiveCounts).toBeTruthy();
    expect(a.trueCounts).toBeNull();
    expect(a.trueAlignedPick).toBeNull();
    expect(a.trueBustProb).toBeNull();
    expect(a.trueCorrectProb).toBeNull();
  });

  it('flags a genuinely dangerous spot', () => {
    const dangerous = {
      visibleSuits: ['leaf', 'cup'],
      visibleNumbers: [1, 2],
      ownPot: [],
      remaining: [N('leaf', 1), N('cup', 2), N('whisk', 7)],
    };
    const a = analyseDecision(dangerous, 'match');
    expect(a.trueCounts.MATCHA).toBe(2);
    expect(a.trueBustProb).toBeCloseTo(2 / 3);
  });
});
