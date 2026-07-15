import { describe, it, expect } from 'vitest';
import { buildDeck, cardSuits, cardNumbers, SUITS } from './cards.js';

describe('deck composition', () => {
  const deck = buildDeck();

  it('has exactly 52 cards', () => {
    expect(deck).toHaveLength(52);
  });

  it('has 40 number cards: 5 suits x 1-8', () => {
    const numbers = deck.filter((c) => c.kind === 'number');
    expect(numbers).toHaveLength(40);
    for (const suit of SUITS) {
      const ofSuit = numbers.filter((c) => c.suit === suit).map((c) => c.number);
      expect([...ofSuit].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    }
  });

  it('has 5 dual-suit, 4 dual-number, 1 Last Sip, 2 Free Space', () => {
    expect(deck.filter((c) => c.kind === 'dualSuit')).toHaveLength(5);
    expect(deck.filter((c) => c.kind === 'dualNumber')).toHaveLength(4);
    expect(deck.filter((c) => c.kind === 'special' && c.name === 'lastSip')).toHaveLength(1);
    expect(deck.filter((c) => c.kind === 'special' && c.name === 'freeSpace')).toHaveLength(2);
  });

  it('has unique card ids', () => {
    const ids = new Set(deck.map((c) => c.id));
    expect(ids.size).toBe(52);
  });
});

describe('card suit/number reading', () => {
  it('number cards have one suit and one number', () => {
    const card = { kind: 'number', suit: 'leaf', number: 3 };
    expect(cardSuits(card)).toEqual(['leaf']);
    expect(cardNumbers(card)).toEqual([3]);
  });

  it('dual-suit cards count as both suits and have no number', () => {
    const card = { kind: 'dualSuit', suits: ['leaf', 'cup'] };
    expect(cardSuits(card)).toEqual(['leaf', 'cup']);
    expect(cardNumbers(card)).toEqual([]);
  });

  it('dual-number cards count as both numbers and have no suit', () => {
    const card = { kind: 'dualNumber', numbers: [1, 2] };
    expect(cardSuits(card)).toEqual([]);
    expect(cardNumbers(card)).toEqual([1, 2]);
  });

  it('special cards have neither suit nor number', () => {
    const card = { kind: 'special', name: 'lastSip' };
    expect(cardSuits(card)).toEqual([]);
    expect(cardNumbers(card)).toEqual([]);
  });
});

describe('single-card Matcha-Matcha impossibility', () => {
  // The rule "Matcha-Matcha is table-wide" only makes sense because no two
  // cards in the deck can match each other on BOTH suit and number. Prove it.
  it('no pair of deck cards matches on both suit and number', () => {
    const deck = buildDeck();
    for (const a of deck) {
      for (const b of deck) {
        if (a.id === b.id) continue;
        const suitMatch = cardSuits(a).some((s) => cardSuits(b).includes(s));
        const numberMatch = cardNumbers(a).some((n) => cardNumbers(b).includes(n));
        expect(suitMatch && numberMatch).toBe(false);
      }
    }
  });
});
