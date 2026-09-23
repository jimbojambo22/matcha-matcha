// Phase 1: a finished game must land in history as a faithful, replayable
// record — not be deleted the moment it ends.
import { describe, it, expect, beforeEach } from 'vitest';
import { createGame, applyAction } from './game/engine.js';
import { replayGame } from './game/replay.js';
import { loadHistory, appendGame, clearHistory, newGameId, HISTORY_KEY, MAX_HISTORY_GAMES } from './history.js';

/** Minimal in-memory localStorage stand-in (tests run in the node env). */
function fakeStorage(overrides = {}) {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
    _map: map,
    ...overrides,
  };
}

const N = (suit, number) => ({ id: `${suit}-${number}`, kind: 'number', suit, number });

let storage;
beforeEach(() => {
  storage = fakeStorage();
});

// --- store mechanics --------------------------------------------------------

describe('history store', () => {
  it('starts empty and round-trips an appended game', () => {
    expect(loadHistory(storage)).toEqual([]);

    const game = { gameId: 'g1', startedAt: 1, endedAt: 2, initialState: {}, actions: [], seatProfiles: [null] };
    appendGame(game, storage);

    expect(loadHistory(storage)).toEqual([game]);
  });

  it('keeps games in chronological order', () => {
    appendGame({ gameId: 'g1', actions: [] }, storage);
    appendGame({ gameId: 'g2', actions: [] }, storage);
    appendGame({ gameId: 'g3', actions: [] }, storage);

    expect(loadHistory(storage).map((g) => g.gameId)).toEqual(['g1', 'g2', 'g3']);
  });

  it('caps at MAX_HISTORY_GAMES, evicting oldest first', () => {
    for (let i = 0; i < MAX_HISTORY_GAMES + 25; i++) {
      appendGame({ gameId: `g${i}`, actions: [] }, storage);
    }
    const stored = loadHistory(storage);

    expect(stored).toHaveLength(MAX_HISTORY_GAMES);
    expect(stored[0].gameId).toBe('g25'); // the first 25 were evicted
    expect(stored.at(-1).gameId).toBe(`g${MAX_HISTORY_GAMES + 24}`);
  });

  it('ignores a duplicate gameId (StrictMode runs effects twice in dev)', () => {
    appendGame({ gameId: 'same', actions: [] }, storage);
    appendGame({ gameId: 'same', actions: [] }, storage);

    expect(loadHistory(storage)).toHaveLength(1);
  });

  it('clearHistory empties the store', () => {
    appendGame({ gameId: 'g1', actions: [] }, storage);
    clearHistory(storage);
    expect(loadHistory(storage)).toEqual([]);
  });

  it('survives unreadable or corrupt storage without throwing', () => {
    const corrupt = fakeStorage();
    corrupt.setItem(HISTORY_KEY, 'not json{');
    expect(loadHistory(corrupt)).toEqual([]);

    const blocked = fakeStorage({
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(loadHistory(blocked)).toEqual([]);
    expect(() => appendGame({ gameId: 'g1', actions: [] }, blocked)).not.toThrow();
    expect(() => clearHistory(blocked)).not.toThrow();
  });

  it('degrades gracefully when the quota is exceeded', () => {
    // Accept small writes, reject large ones — mimics a full quota.
    let allowBig = false;
    const tight = fakeStorage();
    const realSet = tight.setItem;
    tight.setItem = (k, v) => {
      if (!allowBig && v.length > 400) throw new Error('QuotaExceededError');
      realSet(k, v);
    };

    for (let i = 0; i < 40; i++) appendGame({ gameId: `g${i}`, actions: [] }, tight);

    const stored = loadHistory(tight);
    expect(stored.length).toBeGreaterThan(0);
    expect(stored.length).toBeLessThan(40); // trimmed rather than lost
    allowBig = true;
  });

  it('newGameId returns distinct ids', () => {
    const ids = new Set(Array.from({ length: 100 }, newGameId));
    expect(ids.size).toBe(100);
  });
});

// --- the real thing ---------------------------------------------------------

describe('archiving a completed game', () => {
  /**
   * Plays a full game to gameOver the same way GameScreen does: dispatch an
   * action, log it, repeat. Returns the record GameScreen would archive.
   */
  function playToGameOver() {
    const created = createGame({
      numPlayers: 2,
      scoringMode: 'free',
      deckFactory: (round) =>
        round === 1
          ? [N('leaf', 1), N('cup', 2), N('teapot', 1), N('teapot', 2), N('teapot', 3), N('teapot', 6)]
          : [N('blossom', 8), N('leaf', 7), N('teapot', 7), N('teapot', 8), N('cup', 4)],
    });

    const meta = {
      gameId: newGameId(),
      startedAt: Date.now(),
      initialState: created.state,
      actions: [],
    };

    let state = created.state;
    const dispatch = (action) => {
      const next = applyAction(state, action);
      meta.actions.push(action);
      state = next.state;
    };

    dispatch({ type: 'GUESS', guess: 'nomatch' }); // cup-2: correct
    dispatch({ type: 'BANK' });
    dispatch({ type: 'ADVANCE_TURN' }); // deck runs low -> round 2
    dispatch({ type: 'GUESS', guess: 'nomatch' }); // leaf-7: correct
    dispatch({ type: 'BANK' });
    dispatch({ type: 'ADVANCE_TURN' }); // round 2 runs out -> game over

    expect(state.phase).toBe('gameOver');
    return {
      finalState: state,
      record: { ...meta, endedAt: Date.now(), seatProfiles: state.players.map(() => null) },
    };
  }

  it('lands a well-formed record in history', () => {
    const { record } = playToGameOver();
    appendGame(record, storage);

    const [stored] = loadHistory(storage);
    expect(stored).toBeDefined();
    expect(typeof stored.gameId).toBe('string');
    expect(typeof stored.startedAt).toBe('number');
    expect(typeof stored.endedAt).toBe('number');
    expect(stored.initialState).toBeTruthy();
    expect(Array.isArray(stored.actions)).toBe(true);
    expect(stored.actions.length).toBeGreaterThan(0);
    // seatProfiles is a real seat map, stubbed with nulls until Phase 3.
    expect(stored.seatProfiles).toEqual([null, null]);
  });

  it('the archived record survives JSON and still replays to the same final state', () => {
    const { finalState, record } = playToGameOver();
    appendGame(record, storage);

    // Read back through storage, i.e. after a genuine JSON round-trip.
    const [stored] = loadHistory(storage);
    const { finalState: replayed, records } = replayGame(stored);

    expect(replayed).toEqual(finalState);
    expect(replayed.phase).toBe('gameOver');
    // And it yields usable decision records for the stats layer.
    expect(records.filter((r) => r.kind === 'prediction')).toHaveLength(2);
    expect(records.some((r) => r.kind === 'roundBoundary')).toBe(true);
    expect(records.at(-1).kind).toBe('gameEnd');
  });

  it('records enough to recover the draw pile at each decision', () => {
    const { record } = playToGameOver();
    appendGame(record, storage);

    const [stored] = loadHistory(storage);
    const { records } = replayGame(stored);
    const predictions = records.filter((r) => r.kind === 'prediction');

    for (const p of predictions) {
      expect(Array.isArray(p.context.remaining)).toBe(true);
      expect(p.context.remaining.length).toBeGreaterThan(0);
      expect(Array.isArray(p.context.ownPot)).toBe(true);
    }
  });
});
