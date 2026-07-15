// Matcha! Matcha! — pure game engine.
//
// No UI, no DOM, no timers. State is plain serializable data; every rule
// lives here and only here. The UI (or a future server / AI opponent) drives
// the game exclusively through createGame() and applyAction().
//
// Actions:
//   { type: 'GUESS', guess: 'match' | 'nomatch' }
//   { type: 'PLACE_FREE_SPACE', stackIndex: number | null }  // null = new stack
//   { type: 'STEEP' }
//   { type: 'BANK' }
//   { type: 'ADVANCE_TURN' }
//
// Phases:
//   'awaitingGuess'     — current player may guess (and steep/bank once they
//                          have a successful guess this turn)
//   'placingFreeSpace'  — a drawn Free Space is waiting to be placed
//   'turnOver'          — turn ended; ADVANCE_TURN hands off to the next player
//   'gameOver'          — results are in state.results
//
// The table is an array of stacks (Card[][]). Only the top card of each stack
// is face-up: it alone contributes suits/numbers for matching. Every card in
// every stack counts one point. A Free Space placed "normally" starts a new
// stack; placed on an existing stack it covers that stack's top card.

import { buildDeck, cardSuits, cardNumbers, isSpecial } from './cards.js';

/** The round ends when fewer than this many cards remain at the start of a turn. */
export const ROUND_END_DECK_SIZE = 5;

export const TOKEN_VALUES = [1, 2, 3, 4, 5, 6, 7, 8];

/** Fisher-Yates shuffle (non-mutating). */
export function shuffle(cards, rng = Math.random) {
  const a = [...cards];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Create a new game. Returns { state, events }.
 *
 * options:
 *   numPlayers   1–6 (default 1)
 *   scoringMode  'free' | 'tokens' | 'trade' (default 'free')
 *   rng          random source, () => [0,1) (default Math.random)
 *   deckFactory  (round: 1|2) => Card[]  — override deck order, used by tests
 *
 * Both rounds' decks are generated up front and stored in state, so the
 * whole game is determined by its initial state (replayable, serializable).
 */
export function createGame(options = {}) {
  const {
    numPlayers = 1,
    scoringMode = 'free',
    rng = Math.random,
    deckFactory = null,
  } = options;
  if (!Number.isInteger(numPlayers) || numPlayers < 1 || numPlayers > 6) {
    throw new Error(`numPlayers must be 1-6, got ${numPlayers}`);
  }
  if (!['free', 'tokens', 'trade'].includes(scoringMode)) {
    throw new Error(`Unknown scoring mode: ${scoringMode}`);
  }
  const makeDeck = deckFactory ?? (() => shuffle(buildDeck(), rng));

  const state = {
    numPlayers,
    scoringMode,
    round: 1,
    direction: 1, // 1 = clockwise (round 1), -1 = counterclockwise (round 2)
    currentPlayer: 0,
    drawPile: makeDeck(1),
    round2Deck: makeDeck(2),
    stacks: [],
    lastPlayedStack: -1,
    players: Array.from({ length: numPlayers }, () => ({
      score: 0,
      tokens: [],
      potHidden: [],
      potTop: null,
      biggestBank: 0, // largest single banked turn — tiebreaker
    })),
    availableTokens: scoringMode === 'free' ? [] : [...TOKEN_VALUES],
    hasSuccessfulGuess: false,
    phase: 'awaitingGuess',
    pendingCard: null, // Free Space waiting for placement
    outcome: null, // how the last turn ended (for turnOver display)
    results: null, // final standings (set at gameOver)
  };

  const events = [];
  beginTurn(state, events);
  return { state, events };
}

/**
 * Apply an action to a state. Pure: returns { state, events } without
 * mutating the input. Throws on actions that are illegal in the current
 * phase — the UI should consult getLegalActions() to prevent that.
 */
export function applyAction(prevState, action) {
  const state = structuredClone(prevState);
  const events = [];
  switch (action.type) {
    case 'GUESS':
      doGuess(state, events, action.guess);
      break;
    case 'PLACE_FREE_SPACE':
      doPlaceFreeSpace(state, events, action.stackIndex);
      break;
    case 'STEEP':
      doSteep(state, events);
      break;
    case 'BANK':
      doBank(state, events);
      break;
    case 'ADVANCE_TURN':
      doAdvanceTurn(state, events);
      break;
    default:
      throw new Error(`Unknown action type: ${action.type}`);
  }
  return { state, events };
}

// ---------------------------------------------------------------------------
// Selectors (also useful to the UI and future AI)
// ---------------------------------------------------------------------------

export function visibleTopCards(state) {
  return state.stacks.map((s) => s[s.length - 1]);
}

/** Suits present on the table right now (covered cards excluded). */
export function visibleSuits(state) {
  const suits = new Set();
  for (const card of visibleTopCards(state)) {
    for (const s of cardSuits(card)) suits.add(s);
  }
  return [...suits];
}

/** Numbers present on the table right now (covered cards excluded). */
export function visibleNumbers(state) {
  const numbers = new Set();
  for (const card of visibleTopCards(state)) {
    for (const n of cardNumbers(card)) numbers.add(n);
  }
  return [...numbers];
}

/** Every card on the table is worth a point, covered or not. */
export function tableCardCount(state) {
  return state.stacks.reduce((n, s) => n + s.length, 0);
}

/** Points the current player would bank right now (table + hidden pot). */
export function potentialPoints(state) {
  return tableCardCount(state) + state.players[state.currentPlayer].potHidden.length;
}

export function getLegalActions(state) {
  const none = { guess: false, bank: false, steep: false, placeFreeSpace: false, advance: false };
  switch (state.phase) {
    case 'awaitingGuess':
      return {
        ...none,
        guess: state.drawPile.length > 0,
        bank: state.hasSuccessfulGuess,
        steep: state.hasSuccessfulGuess,
      };
    case 'placingFreeSpace':
      return { ...none, placeFreeSpace: true };
    case 'turnOver':
      return { ...none, advance: true };
    default:
      return none;
  }
}

/** What ADVANCE_TURN would lead to. Null unless phase is 'turnOver'. */
export function peekNextTurn(state) {
  if (state.phase !== 'turnOver') return null;
  const next = (state.currentPlayer + state.direction + state.numPlayers) % state.numPlayers;
  if (state.drawPile.length < ROUND_END_DECK_SIZE) {
    return state.round === 1 ? { kind: 'roundTwo', player: next } : { kind: 'gameOver' };
  }
  return { kind: 'turn', player: next };
}

/**
 * Token-mode banking rule.
 *   - The exact token for the banked total may be taken.
 *   - A total LARGER than every remaining token may be banked by taking the
 *     highest remaining token (tokens discourage small banks, never big ones).
 *   - A total that is neither available nor above the maximum is refused.
 *   - Once every token is collected, banking is unrestricted.
 * Returns { ok, token } where token is null when no token changes hands.
 */
export function evaluateBank(points, scoringMode, availableTokens) {
  if (scoringMode === 'free') return { ok: true, token: null };
  if (availableTokens.length === 0) return { ok: true, token: null };
  if (availableTokens.includes(points)) return { ok: true, token: points };
  const max = Math.max(...availableTokens);
  if (points > max) return { ok: true, token: max };
  return { ok: false, token: null };
}

/** Final standings: highest score wins; ties broken by biggest single bank. */
export function computeResults(state) {
  const scores = state.players.map((p) => p.score);
  const maxScore = Math.max(...scores);
  let leaders = scores.map((_, i) => i).filter((i) => scores[i] === maxScore);
  let tiebreakUsed = false;
  if (leaders.length > 1) {
    const maxBank = Math.max(...leaders.map((i) => state.players[i].biggestBank));
    const filtered = leaders.filter((i) => state.players[i].biggestBank === maxBank);
    if (filtered.length < leaders.length) tiebreakUsed = true;
    leaders = filtered;
  }
  return {
    winner: leaders.length === 1 ? leaders[0] : null,
    tiedPlayers: leaders,
    maxScore,
    tiebreakUsed,
  };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function currentP(state) {
  return state.players[state.currentPlayer];
}

function addCardToTable(state, card, stackIndex = null) {
  if (stackIndex === null) {
    state.stacks.push([card]);
    state.lastPlayedStack = state.stacks.length - 1;
  } else {
    state.stacks[stackIndex].push(card);
    state.lastPlayedStack = stackIndex;
  }
}

/**
 * Start the current player's turn. Handles, in order:
 *   1. Round end — the dealer counts the deck at the start of every turn;
 *      fewer than 5 cards ends the round. Round 1 → reshuffle the full deck,
 *      reverse direction, all steeped pots are lost, the SAME player starts
 *      round 2. Round 2 → game over.
 *   2. Steeped start — the player's saved top card opens their table
 *      (no card is dealt from the deck).
 *   3. Normal deal — one card from the deck. A dealt Free Space stays and
 *      deals a bonus card (repeat as needed); neither counts as a guess.
 *      A dealt Last Sip immediately force-banks.
 */
function beginTurn(state, events) {
  if (state.drawPile.length < ROUND_END_DECK_SIZE) {
    if (state.round === 1) {
      state.round = 2;
      state.direction = -1;
      state.drawPile = state.round2Deck;
      state.round2Deck = [];
      for (const p of state.players) {
        p.potHidden = [];
        p.potTop = null;
      }
      events.push({ type: 'ROUND_TWO_STARTED', startingPlayer: state.currentPlayer });
    } else {
      state.stacks = [];
      state.lastPlayedStack = -1;
      state.outcome = null;
      state.phase = 'gameOver';
      state.results = computeResults(state);
      events.push({ type: 'GAME_OVER', results: state.results });
      return;
    }
  }

  state.stacks = [];
  state.lastPlayedStack = -1;
  state.hasSuccessfulGuess = false;
  state.pendingCard = null;
  state.outcome = null;
  state.phase = 'awaitingGuess';
  events.push({ type: 'TURN_STARTED', player: state.currentPlayer, round: state.round });

  const p = currentP(state);
  if (p.potTop) {
    // Steeped start: saved card opens the table; nothing is dealt.
    addCardToTable(state, p.potTop);
    events.push({ type: 'STEEPED_CARD_PLACED', card: p.potTop });
    p.potTop = null;
    return;
  }
  dealOpeningCards(state, events);
}

function dealOpeningCards(state, events) {
  // The round-end check guarantees >= 5 cards here, and this loop deals at
  // most 3 (two Free Spaces exist), so the pile cannot run dry mid-deal.
  for (;;) {
    const card = state.drawPile.shift();
    addCardToTable(state, card);
    events.push({ type: 'CARD_DEALT', card });
    if (isSpecial(card, 'lastSip')) {
      events.push({ type: 'LAST_SIP' });
      resolveForcedBank(state, events);
      return;
    }
    if (isSpecial(card, 'freeSpace')) {
      continue; // Free Space stays in play; deal a bonus card
    }
    return;
  }
}

function doGuess(state, events, guess) {
  if (state.phase !== 'awaitingGuess') {
    throw new Error(`Cannot guess during phase '${state.phase}'`);
  }
  if (guess !== 'match' && guess !== 'nomatch') {
    throw new Error(`Guess must be 'match' or 'nomatch', got '${guess}'`);
  }
  if (state.drawPile.length === 0) {
    throw new Error('Draw pile is empty — you must steep or bank');
  }

  const card = state.drawPile.shift();
  events.push({ type: 'CARD_DRAWN', card, guess });

  if (isSpecial(card, 'lastSip')) {
    // Last Sip ends the turn immediately and force-banks the pot. It joins
    // the table first, so it is itself worth a point. It overrides the
    // successful-guess requirement.
    addCardToTable(state, card);
    events.push({ type: 'LAST_SIP' });
    resolveForcedBank(state, events);
    return;
  }

  if (isSpecial(card, 'freeSpace')) {
    // Revealing a Free Space counts as a successful guess (whatever was
    // guessed). The player now chooses where to place it.
    state.hasSuccessfulGuess = true;
    state.pendingCard = card;
    state.phase = 'placingFreeSpace';
    events.push({ type: 'FREE_SPACE_DRAWN', card });
    return;
  }

  // Table-wide matching: the drawn card is compared against ALL face-up
  // cards at once. Suit anywhere AND number anywhere — possibly on two
  // different cards — is a Matcha-Matcha.
  const suits = visibleSuits(state);
  const numbers = visibleNumbers(state);
  const suitMatch = cardSuits(card).some((s) => suits.includes(s));
  const numberMatch = cardNumbers(card).some((n) => numbers.includes(n));
  const actual = suitMatch && numberMatch ? 'matcha' : suitMatch || numberMatch ? 'match' : 'nomatch';

  if (actual === 'matcha') {
    events.push({ type: 'GUESS_RESOLVED', card, guess, actual, correct: false });
    bust(state, events, 'matcha');
  } else if (actual === guess) {
    addCardToTable(state, card);
    state.hasSuccessfulGuess = true;
    events.push({ type: 'GUESS_RESOLVED', card, guess, actual, correct: true });
  } else {
    events.push({ type: 'GUESS_RESOLVED', card, guess, actual, correct: false });
    bust(state, events, 'wrong');
  }
}

function doPlaceFreeSpace(state, events, stackIndex) {
  if (state.phase !== 'placingFreeSpace') {
    throw new Error(`No Free Space to place during phase '${state.phase}'`);
  }
  const card = state.pendingCard;
  if (stackIndex === null || stackIndex === undefined) {
    addCardToTable(state, card);
    events.push({ type: 'FREE_SPACE_PLACED', card, covered: null });
  } else {
    if (!Number.isInteger(stackIndex) || stackIndex < 0 || stackIndex >= state.stacks.length) {
      throw new Error(`Invalid stack index: ${stackIndex}`);
    }
    const stack = state.stacks[stackIndex];
    const covered = stack[stack.length - 1];
    addCardToTable(state, card, stackIndex);
    events.push({ type: 'FREE_SPACE_PLACED', card, covered });
  }
  state.pendingCard = null;
  state.phase = 'awaitingGuess';
}

function doSteep(state, events) {
  if (state.phase !== 'awaitingGuess') {
    throw new Error(`Cannot steep during phase '${state.phase}'`);
  }
  if (!state.hasSuccessfulGuess) {
    throw new Error('You must make a successful guess before steeping');
  }
  const p = currentP(state);
  // The most recently played card stays face-up for the player's next turn;
  // every other table card goes face-down into their hidden pot.
  const keep = state.stacks[state.lastPlayedStack].pop();
  const hidden = state.stacks.flat();
  p.potHidden.push(...hidden);
  p.potTop = keep;
  state.stacks = []; // the whole table has moved into the pot
  state.lastPlayedStack = -1;
  state.outcome = {
    kind: 'steeped',
    hiddenAdded: hidden.length,
    potSize: p.potHidden.length,
    topCard: keep,
  };
  events.push({ type: 'STEEPED', player: state.currentPlayer, potSize: p.potHidden.length, topCard: keep });
  state.phase = 'turnOver';
}

function doBank(state, events) {
  if (state.phase !== 'awaitingGuess') {
    throw new Error(`Cannot bank during phase '${state.phase}'`);
  }
  if (!state.hasSuccessfulGuess) {
    throw new Error('You must make a successful guess before banking');
  }
  const p = currentP(state);
  const points = tableCardCount(state) + p.potHidden.length;
  const { ok, token } = evaluateBank(points, state.scoringMode, state.availableTokens);
  if (!ok) {
    // A refused manual bank does not end the turn — keep playing or steep.
    events.push({ type: 'BANK_REFUSED', points, reason: 'tokenUnavailable' });
    return;
  }
  awardBank(state, events, points, token, null);
}

/** Last Sip: mandatory bank attempt; failure loses the pot for zero points. */
function resolveForcedBank(state, events) {
  const p = currentP(state);
  const points = tableCardCount(state) + p.potHidden.length;
  const { ok, token } = evaluateBank(points, state.scoringMode, state.availableTokens);
  if (ok) {
    awardBank(state, events, points, token, 'lastSip');
  } else {
    p.potHidden = [];
    state.outcome = { kind: 'bankFailed', via: 'lastSip', attempted: points, reason: 'tokenUnavailable' };
    events.push({ type: 'BANK_FAILED', player: state.currentPlayer, attempted: points });
    state.phase = 'turnOver';
  }
}

function awardBank(state, events, points, token, via) {
  const p = currentP(state);
  p.score += points;
  if (points > p.biggestBank) p.biggestBank = points;
  if (token !== null) {
    state.availableTokens = state.availableTokens.filter((t) => t !== token);
    p.tokens.push(token);
    p.tokens.sort((a, b) => a - b);
  }
  events.push({ type: 'BANKED', player: state.currentPlayer, points, token, via });
  // Trade-in only triggers on a turn where a new token was collected.
  let trade = null;
  if (token !== null && state.scoringMode === 'trade') {
    trade = tryTradeIn(state, events);
  }
  p.potHidden = []; // steeped cards convert to points exactly once
  state.outcome = { kind: 'banked', points, token, via, trade };
  state.phase = 'turnOver';
}

/**
 * Mandatory end-of-turn trade-in (trade mode): exactly two tokens for one of
 * their combined value, if that token is available. Never more than one trade
 * per turn, no cascading. Priority: pairs containing the highest-value tokens
 * first — [4,3,2,1] tries (4,3), (4,2), (4,1), (3,2), (3,1), (2,1).
 */
function tryTradeIn(state, events) {
  const p = currentP(state);
  const sorted = [...p.tokens].sort((a, b) => b - a);
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const sum = sorted[i] + sorted[j];
      if (state.availableTokens.includes(sum)) {
        const gave = [sorted[i], sorted[j]];
        for (const g of gave) {
          p.tokens.splice(p.tokens.indexOf(g), 1);
        }
        state.availableTokens = state.availableTokens.filter((t) => t !== sum);
        state.availableTokens.push(...gave);
        state.availableTokens.sort((a, b) => a - b);
        p.tokens.push(sum);
        p.tokens.sort((a, b) => a - b);
        events.push({ type: 'TRADE_IN', player: state.currentPlayer, gave, got: sum });
        return { gave, got: sum };
      }
    }
  }
  return null;
}

function bust(state, events, reason) {
  const p = currentP(state);
  state.outcome = {
    kind: 'bust',
    reason, // 'wrong' | 'matcha'
    lostTable: tableCardCount(state),
    lostPot: p.potHidden.length,
  };
  p.potHidden = [];
  events.push({ type: 'BUST', player: state.currentPlayer, reason });
  state.phase = 'turnOver';
}

function doAdvanceTurn(state, events) {
  if (state.phase !== 'turnOver') {
    throw new Error(`Cannot advance turn during phase '${state.phase}'`);
  }
  state.currentPlayer = (state.currentPlayer + state.direction + state.numPlayers) % state.numPlayers;
  beginTurn(state, events);
}
