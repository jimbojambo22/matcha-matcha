// Matcha! Matcha! — pure odds model.
//
// Given what is face-up on the table and a multiset of cards that might come
// next, classify every candidate and count the outcomes. No DOM, no storage,
// no dependencies beyond ./cards.js.
//
// The classifier mirrors the engine's own matching rule (engine.js doGuess):
// a card matches on suit if ANY of its suits is live, on number if ANY of its
// numbers is live, and hitting both at once is a Matcha-Matcha. Double cards
// fall out of that rule for free — a dual-suit card carries no number, so its
// number axis can never hit, and it can never be a Matcha. If the engine's
// rule ever changes, this must change with it.

import { buildDeck, cardSuits, cardNumbers, isSpecial } from './cards.js';

/** The full 52-card deck, built once. Cards are immutable, so sharing is safe. */
const FULL_DECK = buildDeck();

export const CATEGORIES = ['MATCH', 'NOMATCH', 'MATCHA', 'FREE_SPACE', 'LAST_SIP'];

/**
 * Which outcome a card would produce against the live suits/numbers.
 * @returns {'MATCH'|'NOMATCH'|'MATCHA'|'FREE_SPACE'|'LAST_SIP'}
 */
export function classifyCard(card, liveSuits, liveNumbers) {
  if (isSpecial(card, 'freeSpace')) return 'FREE_SPACE';
  if (isSpecial(card, 'lastSip')) return 'LAST_SIP';

  const suitHit = cardSuits(card).some((s) => liveSuits.includes(s));
  const numberHit = cardNumbers(card).some((n) => liveNumbers.includes(n));

  if (suitHit && numberHit) return 'MATCHA';
  if (suitHit || numberHit) return 'MATCH';
  return 'NOMATCH';
}

/**
 * Count how each candidate card would resolve.
 * @returns {{MATCH:number, NOMATCH:number, MATCHA:number, FREE_SPACE:number, LAST_SIP:number, total:number}}
 */
export function classifyAll(candidates, liveSuits, liveNumbers) {
  const counts = { MATCH: 0, NOMATCH: 0, MATCHA: 0, FREE_SPACE: 0, LAST_SIP: 0, total: 0 };
  for (const card of candidates) {
    counts[classifyCard(card, liveSuits, liveNumbers)] += 1;
    counts.total += 1;
  }
  return counts;
}

/**
 * Which way the odds point.
 *
 * Only MATCH vs NOMATCH moves the needle: a Free Space makes either
 * prediction correct and a Last Sip resolves neither, so neither can favour a
 * direction. A dead heat is a genuine 'tie' — no prediction is "aligned" with
 * it, which is why ties count against alignment rather than being discarded.
 *
 * @returns {'match'|'nomatch'|'tie'}
 */
export function alignedPick(counts) {
  if (counts.MATCH > counts.NOMATCH) return 'match';
  if (counts.NOMATCH > counts.MATCH) return 'nomatch';
  return 'tie';
}

/** Probability the next card is an instant bust. 0 when nothing is left. */
export function bustProb(counts) {
  return counts.total === 0 ? 0 : counts.MATCHA / counts.total;
}

/**
 * Probability a given prediction resolves correct, over the same candidates.
 * Free Spaces count as correct either way; Last Sips resolve nothing and are
 * removed from the denominator — matching how accuracy is scored.
 */
export function correctProb(counts, guess) {
  const resolvable = counts.total - counts.LAST_SIP;
  if (resolvable === 0) return 0;
  const hits = (guess === 'match' ? counts.MATCH : counts.NOMATCH) + counts.FREE_SPACE;
  return hits / resolvable;
}

/**
 * Directional base rate: of the cards that actually settle match-vs-no-match,
 * what share are a match? Used to judge a player's leaning against reality.
 * Null when nothing in the candidate set settles the question.
 */
export function matchBaseRate(counts) {
  const directional = counts.MATCH + counts.NOMATCH;
  return directional === 0 ? null : counts.MATCH / directional;
}

// --- the two remaining-card models ------------------------------------------
//
// Both are adjustable modelling choices, not laws. They are deliberately
// different in ONE way — what the player is assumed to know — so that
// comparing a player's picks against each measures a different skill.

/**
 * NAIVE model: a full 52-card deck minus every card this player currently
 * holds (face-up pile, cards buried under a Free Space, and anything steeped
 * away). Ignores other players' cards, cards already out of play, and the
 * round-2 reshuffle.
 *
 * This is "the odds I'd estimate in my head knowing only my own cards" — a
 * player always sees what is in front of them; that was never the naive part.
 *
 * The card about to be revealed is NOT subtracted: at decision time it is
 * unseen and genuinely still a candidate.
 */
export function naiveRemaining(ownPile = []) {
  const held = new Set(ownPile.map((c) => c.id));
  return FULL_DECK.filter((c) => !held.has(c.id));
}

/**
 * TRUE model: the actual draw pile at that decision point — exactly what a
 * perfect card-counter would know, since every card that ever left the pile
 * was revealed publicly first.
 *
 * Scoped to the current round for free: the harness captures the live pile,
 * which during round 1 never includes round2Deck (a counter cannot see a deck
 * that has not been shuffled into play yet). Returns null for a redacted
 * snapshot, where the pile was withheld and true odds are not computable.
 */
export function trueRemaining(context) {
  return context.remaining ?? null;
}

/**
 * Everything the stats layer needs about one decision point.
 * `trueCounts` and friends are null when the pile was redacted.
 */
export function analyseDecision(context, guess) {
  const { visibleSuits, visibleNumbers, ownPot } = context;

  const naiveCounts = classifyAll(naiveRemaining(ownPot), visibleSuits, visibleNumbers);
  const remaining = trueRemaining(context);
  const trueCounts = remaining ? classifyAll(remaining, visibleSuits, visibleNumbers) : null;

  return {
    naiveCounts,
    trueCounts,
    naiveAlignedPick: alignedPick(naiveCounts),
    trueAlignedPick: trueCounts ? alignedPick(trueCounts) : null,
    trueBustProb: trueCounts ? bustProb(trueCounts) : null,
    trueCorrectProb: trueCounts ? correctProb(trueCounts, guess) : null,
    trueMatchBaseRate: trueCounts ? matchBaseRate(trueCounts) : null,
  };
}
