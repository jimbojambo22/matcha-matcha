// The executable rulebook. Every ruling from the design Q&A is encoded here;
// if a test in this file fails, the game rules are broken.
import { describe, it, expect } from 'vitest';
import { buildDeck } from './cards.js';
import {
  createGame,
  applyAction,
  getLegalActions,
  peekNextTurn,
  evaluateBank,
  computeResults,
  tableCardCount,
  visibleSuits,
  visibleNumbers,
} from './engine.js';

// --- helpers ---------------------------------------------------------------

const N = (suit, number) => ({ id: `${suit}-${number}`, kind: 'number', suit, number });
const DS = (a, b) => ({ id: `ds-${a}-${b}`, kind: 'dualSuit', suits: [a, b] });
const DN = (a, b) => ({ id: `dn-${a}-${b}`, kind: 'dualNumber', numbers: [a, b] });
const LS = () => ({ id: 'special-lastSip', kind: 'special', name: 'lastSip' });
const FS = (i = 1) => ({ id: `special-freeSpace-${i}`, kind: 'special', name: 'freeSpace' });

// Filler cards that keep the draw pile >= 5 so the round never ends
// mid-test. They are only drawn if a test overruns its script.
const pad = (k = 10) => Array.from({ length: k }, (_, i) => N('blossom', (i % 8) + 1));

/** New game whose round-1 deck is exactly `cards` + padding, drawn in order. */
function game(cards, opts = {}) {
  return createGame({
    numPlayers: 1,
    scoringMode: 'free',
    deckFactory: (round) => (round === 1 ? [...cards, ...pad()] : buildDeck()),
    ...opts,
  });
}

/** Like game() but with NO padding — used to test round endings. */
function exactGame(round1, round2, opts = {}) {
  return createGame({
    deckFactory: (round) => (round === 1 ? [...round1] : [...round2]),
    ...opts,
  });
}

function step(snap, ...actions) {
  let { state } = snap;
  let events = [];
  for (const a of actions) {
    const r = applyAction(state, a);
    state = r.state;
    events = r.events;
  }
  return { state, events };
}

const guess = (g) => ({ type: 'GUESS', guess: g });
const place = (i = null) => ({ type: 'PLACE_FREE_SPACE', stackIndex: i });
const steep = () => ({ type: 'STEEP' });
const bank = () => ({ type: 'BANK' });
const advance = () => ({ type: 'ADVANCE_TURN' });

// --- matching --------------------------------------------------------------

describe('matching', () => {
  it('suit match: drawn card shares a suit with a table card', () => {
    const snap = game([N('leaf', 1), N('leaf', 5)]);
    const { state } = step(snap, guess('match'));
    expect(state.stacks).toHaveLength(2);
    expect(state.hasSuccessfulGuess).toBe(true);
    expect(state.phase).toBe('awaitingGuess');
  });

  it('number match: drawn card shares a number with a table card', () => {
    const snap = game([N('leaf', 1), N('cup', 1)]);
    const { state } = step(snap, guess('match'));
    expect(state.stacks).toHaveLength(2);
  });

  it('no match: neither suit nor number present', () => {
    const snap = game([N('leaf', 1), N('cup', 2)]);
    const { state } = step(snap, guess('nomatch'));
    expect(state.stacks).toHaveLength(2);
  });

  it('wrong guess busts and ends the turn', () => {
    const snap = game([N('leaf', 1), N('leaf', 5)]);
    const { state } = step(snap, guess('nomatch'));
    expect(state.phase).toBe('turnOver');
    expect(state.outcome).toMatchObject({ kind: 'bust', reason: 'wrong' });
    expect(state.players[0].score).toBe(0);
  });

  it('Matcha-Matcha is table-wide: suit from one stack + number from another', () => {
    // Table: leaf-1 and cup-5 (no single card matches leaf-5 on both).
    const snap = game([N('leaf', 1), N('cup', 5), N('leaf', 5)]);
    const s1 = step(snap, guess('nomatch')); // cup-5 vs leaf-1: no match
    const { state } = step(s1, guess('match')); // leaf-5: leaf suit + 5 number -> MATCHA
    expect(state.phase).toBe('turnOver');
    expect(state.outcome).toMatchObject({ kind: 'bust', reason: 'matcha' });
  });

  it('Matcha-Matcha busts regardless of which way the player guessed', () => {
    const snap = game([N('leaf', 1), N('cup', 5), N('leaf', 5)]);
    const s1 = step(snap, guess('nomatch'));
    const { state } = step(s1, guess('nomatch'));
    expect(state.outcome).toMatchObject({ kind: 'bust', reason: 'matcha' });
  });

  it('dual-suit cards match on either suit', () => {
    const snap = game([N('leaf', 1), DS('cup', 'leaf')]);
    const { state } = step(snap, guess('match'));
    expect(state.stacks).toHaveLength(2);
  });

  it('dual-number cards match on either number', () => {
    const snap = game([N('leaf', 1), DN(1, 2)]);
    const { state } = step(snap, guess('match'));
    expect(state.stacks).toHaveLength(2);
  });
});

// --- guess gating ----------------------------------------------------------

describe('bank/steep gating', () => {
  it('cannot bank or steep before a successful guess', () => {
    const snap = game([N('leaf', 1)]);
    expect(() => applyAction(snap.state, bank())).toThrow(/successful guess/);
    expect(() => applyAction(snap.state, steep())).toThrow(/successful guess/);
    expect(getLegalActions(snap.state)).toMatchObject({ bank: false, steep: false, guess: true });
  });

  it('can bank and steep after one successful guess', () => {
    const snap = game([N('leaf', 1), N('cup', 2)]);
    const { state } = step(snap, guess('nomatch'));
    expect(getLegalActions(state)).toMatchObject({ bank: true, steep: true });
  });
});

// --- banking and the steeped pot -------------------------------------------

describe('banking', () => {
  it('banks one point per table card (covered or not) plus hidden pot, then clears the pot', () => {
    const snap = game([N('leaf', 1), N('cup', 2), N('whisk', 3), N('teapot', 4)]);
    // guess, steep, come back, guess, bank
    const s1 = step(snap, guess('nomatch'), steep());
    expect(s1.state.players[0].potHidden).toHaveLength(1); // leaf-1 hidden
    expect(s1.state.players[0].potTop).toMatchObject({ id: 'cup-2' });

    const s2 = step(s1, advance());
    expect(s2.state.stacks).toEqual([[expect.objectContaining({ id: 'cup-2' })]]);

    const s3 = step(s2, guess('nomatch'), guess('nomatch'), bank());
    // table: cup-2, whisk-3, teapot-4 (3 cards) + 1 hidden = 4 points
    expect(s3.state.players[0].score).toBe(4);
    expect(s3.state.players[0].potHidden).toHaveLength(0); // pot converts exactly once
    expect(s3.state.players[0].biggestBank).toBe(4);
    expect(s3.state.outcome).toMatchObject({ kind: 'banked', points: 4 });
  });

  it('steeping empties the table and never leaves empty stacks behind', () => {
    // Regression: doSteep once left an empty stack husk in state.stacks,
    // which crashed any consumer reading each stack's top card.
    const snap = game([N('leaf', 1), N('cup', 2)]);
    const { state } = step(snap, guess('nomatch'), steep());
    expect(state.stacks).toEqual([]);
    expect(state.stacks.every((s) => s.length > 0)).toBe(true);
  });

  it('steeped start places the saved card without dealing from the deck', () => {
    const snap = game([N('leaf', 1), N('cup', 2)]);
    const s1 = step(snap, guess('nomatch'), steep());
    const before = s1.state.drawPile.length;
    const s2 = step(s1, advance());
    expect(s2.state.drawPile.length).toBe(before); // no deal
    expect(s2.state.stacks.flat()).toHaveLength(1);
  });

  it('chained steeps grow the pot', () => {
    const snap = game([N('leaf', 1), N('cup', 2), N('whisk', 3)]);
    const s1 = step(snap, guess('nomatch'), steep()); // hidden: [leaf-1], top: cup-2
    const s2 = step(s1, advance(), guess('nomatch'), steep()); // hidden: [leaf-1, cup-2], top: whisk-3
    expect(s2.state.players[0].potHidden).toHaveLength(2);
    expect(s2.state.players[0].potTop).toMatchObject({ id: 'whisk-3' });
  });

  it('a bust loses the steeped pot for zero points', () => {
    const snap = game([N('leaf', 1), N('cup', 2), N('whisk', 3), N('cup', 3)]);
    const s1 = step(snap, guess('nomatch'), steep(), advance());
    // table: cup-2. whisk-3 no-matches; then cup-3 = suit (cup) + number (3) -> MATCHA
    const { state } = step(s1, guess('nomatch'), guess('nomatch'));
    expect(state.outcome).toMatchObject({ kind: 'bust', reason: 'matcha', lostPot: 1 });
    expect(state.players[0].potHidden).toHaveLength(0);
    expect(state.players[0].score).toBe(0);
  });
});

// --- token scoring ---------------------------------------------------------

describe('evaluateBank (token rules)', () => {
  it('free mode always allows banking, never takes a token', () => {
    expect(evaluateBank(3, 'free', [])).toEqual({ ok: true, token: null });
  });

  it('takes the exact token when available', () => {
    expect(evaluateBank(4, 'tokens', [3, 4, 5, 8])).toEqual({ ok: true, token: 4 });
  });

  it('overflow: bank 10 with all tokens available takes the 8', () => {
    expect(evaluateBank(10, 'tokens', [1, 2, 3, 4, 5, 6, 7, 8])).toEqual({ ok: true, token: 8 });
  });

  it('overflow: bank 6 with only 3,4,5 left takes the 5', () => {
    expect(evaluateBank(6, 'tokens', [3, 4, 5])).toEqual({ ok: true, token: 5 });
  });

  it('refused: bank 6 while the 8 token is still out there', () => {
    expect(evaluateBank(6, 'tokens', [3, 4, 5, 8])).toEqual({ ok: false, token: null });
  });

  it('all tokens collected: banking becomes unrestricted', () => {
    expect(evaluateBank(3, 'tokens', [])).toEqual({ ok: true, token: null });
    expect(evaluateBank(3, 'trade', [])).toEqual({ ok: true, token: null });
  });
});

describe('token mode integration', () => {
  it('banking takes the token out of the pool and awards the points', () => {
    const snap = game([N('leaf', 1), N('cup', 2)], { scoringMode: 'tokens' });
    const { state } = step(snap, guess('nomatch'), bank());
    expect(state.players[0].score).toBe(2);
    expect(state.players[0].tokens).toEqual([2]);
    expect(state.availableTokens).toEqual([1, 3, 4, 5, 6, 7, 8]);
  });

  it('a refused manual bank does not end the turn', () => {
    const snap = game([N('leaf', 1), N('cup', 2)], { scoringMode: 'tokens' });
    const s1 = step(snap, guess('nomatch'));
    // Rig the pool so a 2-point bank is refused (2 gone, 8 still out).
    s1.state.availableTokens = [3, 4, 5, 6, 7, 8];
    const { state, events } = step(s1, bank());
    expect(events.some((e) => e.type === 'BANK_REFUSED')).toBe(true);
    expect(state.phase).toBe('awaitingGuess');
    expect(state.players[0].score).toBe(0);
    expect(state.hasSuccessfulGuess).toBe(true); // can keep playing or steep
  });
});

// --- trade-in --------------------------------------------------------------

describe('trade-in (trade mode)', () => {
  it('trades exactly one pair, highest-value priority: {1,2,4} -> 6, not 3', () => {
    const snap = game([N('leaf', 1), N('cup', 2)], { scoringMode: 'trade' });
    const s1 = step(snap, guess('nomatch'));
    s1.state.players[0].tokens = [1, 4];
    s1.state.availableTokens = [2, 3, 5, 6, 7, 8];
    const { state, events } = step(s1, bank()); // banks 2, takes token 2 -> holds {1,2,4}
    const trade = events.find((e) => e.type === 'TRADE_IN');
    expect(trade).toMatchObject({ gave: [4, 2], got: 6 });
    expect(state.players[0].tokens).toEqual([1, 6]);
    // 6 left the pool; 2 and 4 went back
    expect(state.availableTokens).toEqual([2, 3, 4, 5, 7, 8]);
  });

  it('does not cascade: {1,6} does not immediately re-trade for the 7', () => {
    const snap = game([N('leaf', 1), N('cup', 2)], { scoringMode: 'trade' });
    const s1 = step(snap, guess('nomatch'));
    s1.state.players[0].tokens = [1, 4];
    s1.state.availableTokens = [2, 3, 5, 6, 7, 8];
    const { state } = step(s1, bank());
    // 7 is available and 1+6=7, but only one trade per turn
    expect(state.availableTokens).toContain(7);
    expect(state.players[0].tokens).toEqual([1, 6]);
  });

  it('priority within equal sums: {1,2,3,4} with 5 available trades 4+1, not 3+2', () => {
    const snap = game([N('leaf', 1), N('cup', 2)], { scoringMode: 'trade' });
    const s1 = step(snap, guess('nomatch'));
    s1.state.players[0].tokens = [1, 2, 3];
    // Player will bank 4 points: table 2 + hidden 2.
    s1.state.players[0].potHidden = [N('whisk', 7), N('teapot', 8)];
    // 6 and 7 must be unavailable so (4,3) and (4,2) fail; 5 is available.
    s1.state.availableTokens = [4, 5, 8];
    const { state, events } = step(s1, bank()); // banks 4, takes token 4 -> holds {1,2,3,4}
    const trade = events.find((e) => e.type === 'TRADE_IN');
    expect(trade).toMatchObject({ gave: [4, 1], got: 5 });
    expect(state.players[0].tokens).toEqual([2, 3, 5]);
    expect(state.availableTokens).toEqual([1, 4, 8]);
  });

  it('no trade-in on a turn without a new token', () => {
    // A bust ends the turn without a token gain -> no trade even if possible.
    const snap = game([N('leaf', 1), N('leaf', 5)], { scoringMode: 'trade' });
    snap.state.players[0].tokens = [1, 2];
    snap.state.availableTokens = [3, 4, 5, 6, 7, 8];
    const { state } = step(snap, guess('nomatch')); // wrong -> bust
    expect(state.outcome.kind).toBe('bust');
    expect(state.players[0].tokens).toEqual([1, 2]); // untouched
  });
});

// --- Last Sip ---------------------------------------------------------------

describe('Last Sip', () => {
  it('drawn mid-turn: ends the turn and auto-banks, counting itself as a point', () => {
    const snap = game([N('leaf', 1), N('cup', 2), LS()]);
    const { state } = step(snap, guess('nomatch'), guess('match'));
    expect(state.phase).toBe('turnOver');
    expect(state.outcome).toMatchObject({ kind: 'banked', points: 3, via: 'lastSip' });
    expect(state.players[0].score).toBe(3);
  });

  it('dealt as the opening card: scores 1 point, overriding the guess requirement', () => {
    const snap = game([LS()]);
    expect(snap.state.phase).toBe('turnOver');
    expect(snap.state.outcome).toMatchObject({ kind: 'banked', points: 1, via: 'lastSip' });
    expect(snap.state.players[0].score).toBe(1);
  });

  it('includes the steeped pot in the forced bank', () => {
    const snap = game([N('leaf', 1), N('cup', 2), N('whisk', 3), LS()]);
    const s1 = step(snap, guess('nomatch'), steep(), advance()); // hidden 1, table cup-2
    const { state } = step(s1, guess('nomatch'), guess('match'));
    // table: cup-2, whisk-3, LS (3) + hidden 1 = 4
    expect(state.outcome).toMatchObject({ kind: 'banked', points: 4, via: 'lastSip' });
    expect(state.players[0].score).toBe(4);
    expect(state.players[0].potHidden).toHaveLength(0);
  });

  it('token missing: the forced bank fails, pot is lost, zero points', () => {
    const snap = game([N('leaf', 1), N('cup', 2), LS()], { scoringMode: 'tokens' });
    const s1 = step(snap, guess('nomatch'));
    s1.state.availableTokens = [5, 6, 7, 8]; // a 3-point bank is now impossible
    const { state } = step(s1, guess('match'));
    expect(state.phase).toBe('turnOver');
    expect(state.outcome).toMatchObject({ kind: 'bankFailed', via: 'lastSip', attempted: 3 });
    expect(state.players[0].score).toBe(0);
    expect(state.players[0].potHidden).toHaveLength(0);
  });
});

// --- Free Space ---------------------------------------------------------------

describe('Free Space', () => {
  it('drawn mid-turn counts as a successful guess; placing normally starts a new stack', () => {
    const snap = game([N('leaf', 1), FS()]);
    const s1 = step(snap, guess('match')); // guess direction is irrelevant
    expect(s1.state.phase).toBe('placingFreeSpace');
    expect(s1.state.hasSuccessfulGuess).toBe(true);
    const s2 = step(s1, place(null));
    expect(s2.state.stacks).toHaveLength(2);
    const { state } = step(s2, bank()); // "first card normal, second FS -> CAN bank 2"
    expect(state.players[0].score).toBe(2);
  });

  it('covering a card removes its suits/numbers from matching but keeps its point', () => {
    const snap = game([N('leaf', 1), FS(), N('leaf', 5)]);
    const s1 = step(snap, guess('match'), place(0)); // cover leaf-1
    expect(visibleSuits(s1.state)).toEqual([]);
    expect(visibleNumbers(s1.state)).toEqual([]);
    // leaf-5 would match leaf-1, but leaf-1 is covered -> no match
    const s2 = step(s1, guess('nomatch'));
    expect(s2.state.stacks).toHaveLength(2);
    const { state } = step(s2, bank());
    expect(state.players[0].score).toBe(3); // covered card still counts
  });

  it('can cover an already-covered stack', () => {
    const snap = game([N('leaf', 1), FS(1), FS(2)]);
    const s1 = step(snap, guess('match'), place(0), guess('match'), place(0));
    expect(s1.state.stacks).toEqual([
      [
        expect.objectContaining({ id: 'leaf-1' }),
        expect.objectContaining({ name: 'freeSpace' }),
        expect.objectContaining({ name: 'freeSpace' }),
      ],
    ]);
    expect(tableCardCount(s1.state)).toBe(3);
  });

  it('dealt as the opening card: stays in play, deals a bonus card, does NOT count as a guess', () => {
    const snap = game([FS(), N('leaf', 1)]);
    expect(snap.state.stacks).toHaveLength(2);
    expect(snap.state.hasSuccessfulGuess).toBe(false);
    expect(() => applyAction(snap.state, bank())).toThrow(/successful guess/);
  });

  it('Free Space then Free Space on the deal: a third card is dealt', () => {
    const snap = game([FS(1), FS(2), N('leaf', 1)]);
    expect(snap.state.stacks).toHaveLength(3);
    expect(snap.state.hasSuccessfulGuess).toBe(false);
  });

  it('Free Space then Last Sip on the deal: turn ends, 2 points banked', () => {
    const snap = game([FS(), LS()]);
    expect(snap.state.phase).toBe('turnOver');
    expect(snap.state.outcome).toMatchObject({ kind: 'banked', points: 2, via: 'lastSip' });
    expect(snap.state.players[0].score).toBe(2);
  });

  it('a steeped Free Space starts the next turn alone; no-match is then guaranteed', () => {
    const snap = game([N('leaf', 1), FS(), N('cup', 1)]);
    const s1 = step(snap, guess('match'), place(null), steep());
    expect(s1.state.players[0].potTop).toMatchObject({ name: 'freeSpace' });
    expect(s1.state.players[0].potHidden).toHaveLength(1);
    const s2 = step(s1, advance());
    expect(visibleSuits(s2.state)).toEqual([]); // lone Free Space: nothing to match
    const { state } = step(s2, guess('nomatch')); // cup-1 cannot match anything
    expect(state.hasSuccessfulGuess).toBe(true);
    expect(tableCardCount(state)).toBe(2);
  });
});

// --- rounds, direction, game over -------------------------------------------

describe('rounds and game over', () => {
  // 4 players A(0) B(1) C(2) D(3). Round 1 goes A,B; the deck runs low at the
  // start of C's turn; round 2 starts with C and runs counterclockwise C,B,A,D.
  const round1 = [
    N('leaf', 1), N('cup', 2), // A: deal + 1 draw, banks 2
    N('teapot', 3), N('blossom', 4), // B: deal + 1 draw, steeps
    N('whisk', 5), N('whisk', 6), N('whisk', 7), N('whisk', 8), // never drawn: 4 left
  ];
  const round2 = [
    N('whisk', 5), N('leaf', 8), N('teapot', 2), // C: deal + 2 draws, banks 3
    N('cup', 4), N('cup', 6), N('blossom', 7), // 3 left at B's turn -> game over
  ];

  function playToRoundTwo() {
    const snap = exactGame(round1, round2, { numPlayers: 4 });
    const a = step(snap, guess('nomatch'), bank(), advance()); // A banks 2 -> B
    expect(a.state.currentPlayer).toBe(1);
    return step(a, guess('nomatch'), steep(), advance()); // B steeps -> C's turn starts
  }

  it('round 1 ends at the start of a turn when fewer than 5 cards remain', () => {
    const s = playToRoundTwo();
    expect(s.state.round).toBe(2);
    expect(s.state.direction).toBe(-1);
    expect(s.state.currentPlayer).toBe(2); // C, the player whose turn was starting
    expect(s.events.some((e) => e.type === 'ROUND_TWO_STARTED')).toBe(true);
  });

  it('steeped pots are lost at the round boundary', () => {
    const s = playToRoundTwo();
    expect(s.state.players[1].potHidden).toHaveLength(0); // B's steep is gone
    expect(s.state.players[1].potTop).toBeNull();
    expect(s.state.players[1].score).toBe(0);
  });

  it('round 2 runs counterclockwise from the same player: C -> B', () => {
    const s = playToRoundTwo();
    const s2 = step(s, guess('nomatch'), guess('nomatch'), bank()); // C banks 3
    expect(s2.state.players[2].score).toBe(3);
    expect(peekNextTurn(s2.state)).toEqual({ kind: 'gameOver' }); // 3 cards left
  });

  it('game ends when round 2 runs out; highest score wins', () => {
    const s = playToRoundTwo();
    const s2 = step(s, guess('nomatch'), guess('nomatch'), bank(), advance());
    expect(s2.state.phase).toBe('gameOver');
    expect(s2.state.results).toMatchObject({ winner: 2, maxScore: 3 });
    expect(s2.events.some((e) => e.type === 'GAME_OVER')).toBe(true);
  });
});

describe('winner and tiebreak', () => {
  const fake = (pairs) => ({
    players: pairs.map(([score, biggestBank]) => ({ score, biggestBank })),
  });

  it('highest score wins outright', () => {
    expect(computeResults(fake([[5, 5], [3, 3]]))).toMatchObject({ winner: 0, tiebreakUsed: false });
  });

  it('tie broken by biggest single banked turn', () => {
    const r = computeResults(fake([[5, 2], [5, 4], [3, 3]]));
    expect(r).toMatchObject({ winner: 1, tiebreakUsed: true });
  });

  it('still tied: shared victory (matcha for everyone)', () => {
    const r = computeResults(fake([[5, 4], [5, 4], [3, 3]]));
    expect(r.winner).toBeNull();
    expect(r.tiedPlayers).toEqual([0, 1]);
  });
});

// --- edge cases ---------------------------------------------------------------

describe('edge cases', () => {
  it('empty draw pile mid-turn: guessing is illegal, banking still works', () => {
    // Exactly 5 cards, all mutually non-matching: deal 1, then 4 correct guesses.
    const deck = [N('leaf', 1), N('cup', 2), N('whisk', 3), N('teapot', 4), N('blossom', 5)];
    const snap = exactGame(deck, buildDeck());
    const s = step(snap, guess('nomatch'), guess('nomatch'), guess('nomatch'), guess('nomatch'));
    expect(s.state.drawPile).toHaveLength(0);
    expect(getLegalActions(s.state)).toMatchObject({ guess: false, bank: true, steep: true });
    expect(() => applyAction(s.state, guess('nomatch'))).toThrow(/empty/);
    const { state } = step(s, bank());
    expect(state.players[0].score).toBe(5);
  });

  it('applyAction never mutates its input state', () => {
    const snap = game([N('leaf', 1), N('cup', 2)]);
    const before = JSON.stringify(snap.state);
    applyAction(snap.state, guess('nomatch'));
    expect(JSON.stringify(snap.state)).toBe(before);
  });

  it('actions are rejected in the wrong phase', () => {
    const snap = game([N('leaf', 1), N('leaf', 5)]);
    const s = step(snap, guess('nomatch')); // bust -> turnOver
    expect(() => applyAction(s.state, guess('match'))).toThrow(/phase/);
    expect(() => applyAction(s.state, bank())).toThrow(/phase/);
    expect(() => applyAction(snap.state, advance())).toThrow(/phase/);
  });

  it('single-player games run both rounds and finish', () => {
    // Tiny decks: one bankable turn per round.
    const r1 = [N('leaf', 1), N('cup', 2), N('whisk', 3), N('teapot', 4), N('blossom', 5)];
    const r2 = [N('leaf', 8), N('cup', 7), N('whisk', 6), N('teapot', 5), N('blossom', 4)];
    const snap = exactGame(r1, r2);
    const s1 = step(snap, guess('nomatch'), bank(), advance()); // banks 2; 3 left -> round 2
    expect(s1.state.round).toBe(2);
    const s2 = step(s1, guess('nomatch'), bank(), advance()); // banks 2; 3 left -> game over
    expect(s2.state.phase).toBe('gameOver');
    expect(s2.state.players[0].score).toBe(4);
  });
});
