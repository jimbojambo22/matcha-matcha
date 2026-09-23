// Player-facing copy for guess results and busts.
//
// Pure: no DOM, no React, no game rules. The engine decides WHAT happened
// (GUESS_RESOLVED carries `matched` — the drawn card's suits/numbers that
// were live on the table); this file only decides how to SAY it.
//
// An explanation is returned as a list of parts so the UI can render suit
// names with their icons: strings are plain text, { suit } is a suit token.

const SUIT_NAMES = { leaf: 'Leaf', cup: 'Cup', whisk: 'Whisk', teapot: 'Teapot', blossom: 'Blossom' };

export function suitName(suit) {
  return SUIT_NAMES[suit] ?? suit;
}

// Rotating headlines so a run of bad luck doesn't read the same every time.
export const WRONG_HEADLINES = ['Wrong!', 'Not quite!', 'Oops!', 'So close!', 'Nope!', 'Spilled it!', 'Bitter brew!', 'Unlucky!'];
export const BUST_TITLES = ['The pot spills!', 'Turn over!', 'Out of luck!', 'Back to the kettle!', 'Cold tea!'];

const lastPick = new Map();

/** Random pick from `pool`, never the same as the previous pick from that pool. */
export function pickFresh(pool, rng = Math.random) {
  const prev = lastPick.get(pool);
  const options = pool.length > 1 ? pool.filter((x) => x !== prev) : pool;
  const choice = options[Math.floor(rng() * options.length)];
  lastPick.set(pool, choice);
  return choice;
}

/** A card's own suits and numbers as parts: [{suit:'leaf'}, '5']. */
function cardValues(card) {
  if (!card) return [];
  if (card.kind === 'number') return [{ suit: card.suit }, String(card.number)];
  if (card.kind === 'dualSuit') return card.suits.map((s) => ({ suit: s }));
  if (card.kind === 'dualNumber') return card.numbers.map(String);
  return [];
}

/** Join value parts with a word: [a, b] -> [a, ' or ', b]. */
function joinParts(values, word) {
  const out = [];
  values.forEach((v, i) => {
    if (i > 0) out.push(i === values.length - 1 ? ` ${word} ` : ', ');
    out.push(v);
  });
  return out;
}

function matchedValues(matched) {
  if (!matched) return [];
  return [...matched.suits.map((s) => ({ suit: s })), ...matched.numbers.map(String)];
}

/**
 * Why a guess turned out the way it did, as parts, or null when there is
 * nothing useful to add.
 *   guessed No Match, it matched  -> "The [leaf] matched"
 *   guessed Match, it didn't      -> "No [whisk] or 5 on the table"
 *   Matcha-Matcha                 -> "The [leaf] and 5 both matched"
 *   correct Match                 -> "The [leaf] matched"
 */
export function explainResult({ card, actual, matched }) {
  const hits = matchedValues(matched);
  if (actual === 'matcha') {
    return ['The ', ...joinParts(hits, 'and'), ' both matched'];
  }
  if (actual === 'match') {
    if (hits.length === 0) return null; // old save without details
    return ['The ', ...joinParts(hits, 'and'), ' matched'];
  }
  // actual === 'nomatch'
  const own = cardValues(card);
  if (own.length === 0) return null;
  return ['No ', ...joinParts(own, 'or'), ' on the table'];
}

/**
 * Headline + explanation for the reveal popup, from a GUESS_RESOLVED event.
 * Correct No Match needs no explanation — nothing matched is the whole story.
 */
export function describeGuess(resolved, rng = Math.random) {
  const { actual, correct } = resolved;
  if (actual === 'matcha') {
    return { verdict: 'matcha', headline: 'MATCHA-MATCHA!!', detail: explainResult(resolved) };
  }
  if (correct) {
    return {
      verdict: 'correct',
      headline: actual === 'match' ? 'Match!' : 'No match!',
      detail: actual === 'match' ? explainResult(resolved) : null,
    };
  }
  return { verdict: 'wrong', headline: pickFresh(WRONG_HEADLINES, rng), detail: explainResult(resolved) };
}
