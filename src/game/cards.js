// Card definitions for Matcha! Matcha!
//
// A card is a plain immutable object, discriminated by `kind`:
//   { id, kind: 'number',     suit, number }    — 40 cards: 5 suits × numbers 1–8
//   { id, kind: 'dualSuit',   suits: [a, b] }   — counts as BOTH suits; has no number
//   { id, kind: 'dualNumber', numbers: [a, b] } — counts as BOTH numbers; has no suit
//   { id, kind: 'special',    name: 'lastSip' | 'freeSpace' } — no suit, no number
//
// Because no two cards in the deck can match each other on BOTH suit and
// number, a Matcha-Matcha is only ever possible against two or more table
// cards combined (table-wide matching). See engine.test.js for the proof.

export const SUITS = ['leaf', 'cup', 'whisk', 'teapot', 'blossom'];

export const DUAL_SUIT_PAIRS = [
  ['leaf', 'cup'],
  ['cup', 'whisk'],
  ['whisk', 'teapot'],
  ['teapot', 'blossom'],
  ['blossom', 'leaf'],
];

export const DUAL_NUMBER_PAIRS = [
  [1, 2],
  [3, 4],
  [5, 6],
  [7, 8],
];

/** Build the full 52-card deck (unshuffled). */
export function buildDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (let number = 1; number <= 8; number++) {
      deck.push({ id: `${suit}-${number}`, kind: 'number', suit, number });
    }
  }
  for (const [a, b] of DUAL_SUIT_PAIRS) {
    deck.push({ id: `ds-${a}-${b}`, kind: 'dualSuit', suits: [a, b] });
  }
  for (const [a, b] of DUAL_NUMBER_PAIRS) {
    deck.push({ id: `dn-${a}-${b}`, kind: 'dualNumber', numbers: [a, b] });
  }
  deck.push({ id: 'special-lastSip', kind: 'special', name: 'lastSip' });
  deck.push({ id: 'special-freeSpace-1', kind: 'special', name: 'freeSpace' });
  deck.push({ id: 'special-freeSpace-2', kind: 'special', name: 'freeSpace' });
  return deck;
}

/** All suits this card counts as (empty for dual-number and special cards). */
export function cardSuits(card) {
  if (card.kind === 'number') return [card.suit];
  if (card.kind === 'dualSuit') return card.suits;
  return [];
}

/** All numbers this card counts as (empty for dual-suit and special cards). */
export function cardNumbers(card) {
  if (card.kind === 'number') return [card.number];
  if (card.kind === 'dualNumber') return card.numbers;
  return [];
}

/** True if the card is a special card (optionally of a specific name). */
export function isSpecial(card, name) {
  return card.kind === 'special' && (name === undefined || card.name === name);
}
