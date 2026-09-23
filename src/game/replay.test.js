// Phase 0: the assumptions the stats layer is built on, made executable.
//
// The first block pins down engine event semantics for the edge cards. If any
// of it fails, the stat definitions downstream are wrong, not just the test.
import { describe, it, expect } from 'vitest';
import { createGame, applyAction, visibleSuits, visibleNumbers } from './engine.js';
import { replayGame, pileMultiset, pileSize, pileCards } from './replay.js';

// --- helpers (mirroring engine.test.js) -------------------------------------

const N = (suit, number) => ({ id: `${suit}-${number}`, kind: 'number', suit, number });
const DS = (a, b) => ({ id: `ds-${a}-${b}`, kind: 'dualSuit', suits: [a, b] });
const DN = (a, b) => ({ id: `dn-${a}-${b}`, kind: 'dualNumber', numbers: [a, b] });
const LS = () => ({ id: 'special-lastSip', kind: 'special', name: 'lastSip' });
const FS = (i = 1) => ({ id: `special-freeSpace-${i}`, kind: 'special', name: 'freeSpace' });

/** Padding that is never drawn — only keeps the round from ending mid-script. */
const pad = () => [N('teapot', 1), N('teapot', 2), N('teapot', 3), N('teapot', 6), N('teapot', 7), N('teapot', 8)];

function game(cards, opts = {}) {
  return createGame({
    numPlayers: 1,
    scoringMode: 'free',
    deckFactory: (round) => (round === 1 ? [...cards, ...pad()] : pad()),
    ...opts,
  });
}

const guess = (g) => ({ type: 'GUESS', guess: g });
const place = (i = null) => ({ type: 'PLACE_FREE_SPACE', stackIndex: i });
const steep = () => ({ type: 'STEEP' });
const bank = () => ({ type: 'BANK' });
const advance = () => ({ type: 'ADVANCE_TURN' });

/** Apply actions in order, collecting every event. */
function run(snap, actions) {
  let state = snap.state;
  const eventsByAction = [];
  for (const a of actions) {
    const r = applyAction(state, a);
    state = r.state;
    eventsByAction.push(r.events);
  }
  return { state, eventsByAction };
}

// --- assumption checks ------------------------------------------------------

describe('engine event semantics the stats layer depends on', () => {
  it('Free Space: emits FREE_SPACE_DRAWN and NO GUESS_RESOLVED', () => {
    const snap = game([N('leaf', 1), FS()]);
    const { events } = applyAction(snap.state, guess('match'));
    const types = events.map((e) => e.type);

    expect(types).toContain('CARD_DRAWN');
    expect(types).toContain('FREE_SPACE_DRAWN');
    // The critical one: correctness is NOT reported by the engine.
    expect(types).not.toContain('GUESS_RESOLVED');
  });

  it('Free Space: counts as a successful guess whichever way the player guessed', () => {
    for (const g of ['match', 'nomatch']) {
      const snap = game([N('leaf', 1), FS()]);
      const { state } = applyAction(snap.state, guess(g));
      expect(state.hasSuccessfulGuess).toBe(true);
      expect(state.phase).toBe('placingFreeSpace');
    }
  });

  it('Last Sip: emits LAST_SIP and NO GUESS_RESOLVED — no prediction is resolved', () => {
    const snap = game([N('leaf', 1), LS()]);
    const { events } = applyAction(snap.state, guess('match'));
    const types = events.map((e) => e.type);

    expect(types).toContain('LAST_SIP');
    expect(types).toContain('BANKED');
    expect(types).not.toContain('GUESS_RESOLVED');
  });

  it('Matcha! Matcha!: actual is "matcha" and correct is false, even when the player guessed match', () => {
    // table: leaf-1, cup-2 -> suits {leaf,cup}, numbers {1,2}. leaf-2 hits both.
    const snap = game([N('leaf', 1), N('cup', 2), N('leaf', 2)]);
    const s1 = applyAction(snap.state, guess('nomatch')); // cup-2: no match, correct
    const { events } = applyAction(s1.state, guess('match'));

    const resolved = events.find((e) => e.type === 'GUESS_RESOLVED');
    expect(resolved.actual).toBe('matcha');
    expect(resolved.correct).toBe(false);
    expect(events.some((e) => e.type === 'BUST' && e.reason === 'matcha')).toBe(true);
  });

  it('visibleSuits/Numbers: a covered card contributes nothing', () => {
    const snap = game([N('leaf', 1), FS()]);
    const { state } = run(snap, [guess('match'), place(0)]); // cover leaf-1
    expect(visibleSuits(state)).toEqual([]);
    expect(visibleNumbers(state)).toEqual([]);
  });

  it('visibleSuits/Numbers: double cards contribute both suits / both numbers', () => {
    expect(visibleSuits(game([DS('leaf', 'cup')]).state)).toEqual(['leaf', 'cup']);
    expect(visibleNumbers(game([DN(1, 2)]).state)).toEqual([1, 2]);
  });

  it('visibleSuits/Numbers: after steeping only potTop contributes, hidden pot does not', () => {
    const snap = game([N('leaf', 1), N('cup', 2)]);
    const { state } = run(snap, [guess('nomatch'), steep(), advance()]);

    expect(state.players[0].potHidden).toHaveLength(1); // leaf-1 is hidden
    expect(visibleSuits(state)).toEqual(['cup']); // leaf contributes nothing
    expect(visibleNumbers(state)).toEqual([2]);
  });
});

// --- pile accessors ---------------------------------------------------------

describe('draw-pile accessors', () => {
  it('pileMultiset sorts by id, destroying draw order while keeping the cards', () => {
    // Deliberately drawn in an order that is not sorted order.
    const snap = game([N('leaf', 1), N('whisk', 3), N('cup', 2), N('blossom', 4)]);
    const drawOrderIds = snap.state.drawPile.map((c) => c.id);
    const multisetIds = pileMultiset(snap.state).map((c) => c.id);

    // Same cards...
    expect(multisetIds).toHaveLength(pileSize(snap.state));
    expect([...multisetIds].sort()).toEqual([...drawOrderIds].sort());
    // ...but the order is gone, so the next card cannot be read off the front.
    expect(multisetIds).not.toEqual(drawOrderIds);
    expect(multisetIds[0]).not.toBe(drawOrderIds[0]);
  });

  it('tolerates a redacted snapshot with no drawPile', () => {
    const redacted = { drawPileCount: 17 };
    expect(pileCards(redacted)).toBeNull();
    expect(pileMultiset(redacted)).toBeNull();
    expect(pileSize(redacted)).toBe(17);
  });

  it('never reads round2Deck while resolving a round-1 decision', () => {
    const snap = game([N('leaf', 1)]);
    const round2Ids = new Set(snap.state.round2Deck.map((c) => c.id));
    const multiset = pileMultiset(snap.state);
    // pad() is reused for both decks in this fixture, so compare by identity:
    // no object from round2Deck may appear in the round-1 multiset.
    for (const card of multiset) {
      expect(snap.state.round2Deck.includes(card)).toBe(false);
    }
    expect(round2Ids.size).toBeGreaterThan(0);
  });
});

// --- the replay harness -----------------------------------------------------

/**
 * A scripted single-player game exercising every edge case the stats layer
 * cares about: a plain correct guess, a steep, a Free Space (auto-correct),
 * a voluntary bank, a Last Sip (resolves nothing, force-banks), and a
 * Matcha! Matcha! bust.
 */
function scriptedGame() {
  const deck = [
    N('leaf', 1), //     turn 0 opening deal
    N('cup', 2), //      turn 0 guess -> NOMATCH, correct
    FS(1), //            turn 1 guess -> FREE_SPACE (turn 1 opens from the steeped pot)
    N('whisk', 3), //    turn 1 guess -> NOMATCH, correct
    N('teapot', 4), //   turn 2 opening deal
    LS(), //             turn 2 guess -> LAST_SIP, force-bank
    N('blossom', 5), //  turn 3 opening deal
    N('cup', 6), //      turn 3 guess -> NOMATCH, correct
    N('cup', 5), //      turn 3 guess -> MATCHA (cup in suits, 5 in numbers) -> bust
  ];
  const snap = createGame({
    numPlayers: 1,
    scoringMode: 'free',
    deckFactory: (round) => (round === 1 ? [...deck, ...pad()] : pad()),
  });
  const actions = [
    guess('nomatch'), // cup-2, correct
    steep(),
    advance(), // turn 1 opens from the steeped pot
    guess('match'), // FS -> auto-correct
    place(null),
    guess('nomatch'), // whisk-3, correct
    bank(), // voluntary
    advance(), // turn 2
    guess('match'), // LS -> resolves nothing, force-banks
    advance(), // turn 3
    guess('nomatch'), // cup-6, correct
    guess('match'), // cup-5 -> MATCHA, bust
  ];
  return { initialState: snap.state, actions };
}

describe('replayGame', () => {
  it('reproduces the exact final state of a directly-played game', () => {
    const record = scriptedGame();
    const direct = run({ state: record.initialState }, record.actions);
    const { finalState } = replayGame(record);

    expect(finalState).toEqual(direct.state);
    expect(finalState.players[0].score).toBe(6); // 4 banked + 2 from the Last Sip
  });

  it('does not mutate the record it replays, and is deterministic', () => {
    const record = scriptedGame();
    const snapshot = structuredClone(record);

    const first = replayGame(record);
    const second = replayGame(record);

    expect(record).toEqual(snapshot);
    expect(first.finalState).toEqual(second.finalState);
    expect(first.records).toEqual(second.records);
  });

  it('emits one prediction record per guess, in order, correctly categorised', () => {
    const { records } = replayGame(scriptedGame());
    const predictions = records.filter((r) => r.kind === 'prediction');

    expect(predictions.map((p) => p.revealedCategory)).toEqual([
      'NOMATCH',
      'FREE_SPACE',
      'NOMATCH',
      'LAST_SIP',
      'NOMATCH',
      'MATCHA',
    ]);
    expect(predictions.map((p) => p.resolvedCorrect)).toEqual([
      true,
      true, // Free Space is synthesized as correct
      true,
      null, // Last Sip resolves nothing
      true,
      false, // Matcha! Matcha!
    ]);
    expect(predictions.map((p) => p.guess)).toEqual([
      'nomatch',
      'match',
      'nomatch',
      'match',
      'nomatch',
      'match',
    ]);
  });

  it('tracks turn boundaries, first-of-turn predictions, and steeped starts', () => {
    const { records } = replayGame(scriptedGame());
    const predictions = records.filter((r) => r.kind === 'prediction');

    expect(predictions.map((p) => p.turnIndex)).toEqual([0, 1, 1, 2, 3, 3]);
    expect(predictions.map((p) => p.isFirstPredictionOfTurn)).toEqual([
      true,
      true,
      false, // the press decision on turn 1
      true,
      true,
      false, // the press decision that busted
    ]);
    // Only turn 1 opened from a steeped pot.
    expect(predictions.map((p) => p.turnFromSteep)).toEqual([false, true, true, false, false, false]);
  });

  it('records the pot at risk before each prediction', () => {
    const { records } = replayGame(scriptedGame());
    const predictions = records.filter((r) => r.kind === 'prediction');

    expect(predictions.map((p) => p.potSizeBefore)).toEqual([
      1, // table: leaf-1
      2, // table: cup-2 (steeped top) + 1 hidden
      3, // table: cup-2, FS + 1 hidden
      1, // table: teapot-4
      1, // table: blossom-5
      2, // table: blossom-5, cup-6
    ]);
  });

  it('captures the decision context: visible suits/numbers and the remaining multiset', () => {
    const { records } = replayGame(scriptedGame());
    const predictions = records.filter((r) => r.kind === 'prediction');

    // Before the very first guess the table holds only leaf-1.
    expect(predictions[0].context.visibleSuits).toEqual(['leaf']);
    expect(predictions[0].context.visibleNumbers).toEqual([1]);
    // ownPot is the player's WHOLE pile, so the face-up table card counts.
    expect(predictions[0].context.ownPot.map((c) => c.id)).toEqual(['leaf-1']);

    // The busting decision: cup and 5 are both live, which is why cup-5 kills.
    const busting = predictions[5];
    expect(busting.context.visibleSuits).toEqual(expect.arrayContaining(['blossom', 'cup']));
    expect(busting.context.visibleNumbers).toEqual(expect.arrayContaining([5, 6]));
    // The card about to be drawn is still in the candidate set.
    expect(busting.context.remaining.map((c) => c.id)).toContain('cup-5');

    // On turn 1 the naive model sees the steeped top card now on the table
    // (cup-2) AND the card buried in the hidden pot (leaf-1).
    expect(predictions[1].context.ownPot.map((c) => c.id).sort()).toEqual(['cup-2', 'leaf-1']);
  });

  it('ownPot includes cards buried under a Free Space', () => {
    // leaf-1 is covered by a Free Space: it scores nothing for matching but is
    // still a card the player holds, so the naive model must discount it.
    const snap = game([N('leaf', 1), FS(), N('cup', 2)]);
    const record = {
      initialState: snap.state,
      actions: [guess('match'), place(0), guess('nomatch')],
    };
    const { records } = replayGame(record);
    const last = records.filter((r) => r.kind === 'prediction').at(-1);

    expect(last.context.visibleSuits).toEqual([]); // leaf-1 is covered
    expect(last.context.ownPot.map((c) => c.id).sort()).toEqual(['leaf-1', 'special-freeSpace-1']);
  });

  it('emits outcome records for steep, voluntary stop, forced stop, and bust', () => {
    const { records } = replayGame(scriptedGame());
    const outcomes = records.filter((r) => r.kind !== 'prediction');

    expect(outcomes.map((o) => o.kind)).toEqual(['steep', 'stop', 'stop', 'bust']);

    const [steeped, voluntary, forced, busted] = outcomes;
    expect(steeped).toMatchObject({ potSize: 2, hiddenPotSize: 1, turnIndex: 0 });
    expect(voluntary).toMatchObject({ voluntary: true, via: null, points: 4, turnIndex: 1 });
    expect(forced).toMatchObject({ voluntary: false, via: 'lastSip', points: 2, turnIndex: 2 });
    expect(busted).toMatchObject({ bustReason: 'matcha', potSize: 2, turnIndex: 3 });
  });

  it('replays a game that ends, emitting a roundBoundary and a gameEnd record', () => {
    // Decks sized so each round drops below the 5-card threshold after one turn.
    const snap = createGame({
      numPlayers: 1,
      scoringMode: 'free',
      deckFactory: (round) =>
        round === 1
          ? [N('leaf', 1), N('cup', 2), N('teapot', 1), N('teapot', 2), N('teapot', 3), N('teapot', 6)]
          : [N('blossom', 8), N('leaf', 7), N('teapot', 7), N('teapot', 8), N('cup', 4)],
    });
    // Turn 0 banks 2. ADVANCE then finds 4 cards left -> round 2 (fresh deck).
    // Turn 1 banks 2 more. The final ADVANCE finds 3 left in round 2 -> game over.
    const record = {
      initialState: snap.state,
      actions: [guess('nomatch'), bank(), advance(), guess('nomatch'), bank(), advance()],
    };
    const { finalState, records } = replayGame(record);

    expect(finalState.phase).toBe('gameOver');
    expect(records.some((r) => r.kind === 'roundBoundary' && r.round === 2)).toBe(true);
    expect(records.at(-1)).toMatchObject({ kind: 'gameEnd' });
  });

  it('handles an empty action list', () => {
    const snap = game([N('leaf', 1)]);
    const { finalState, records } = replayGame({ initialState: snap.state, actions: [] });
    expect(finalState).toEqual(snap.state);
    expect(records).toEqual([]);
  });
});
