// Phase 3: local profiles, and resolving a profile's games out of history.
import { describe, it, expect, beforeEach } from 'vitest';
import { createGame, applyAction } from './game/engine.js';
import {
  loadProfiles,
  createProfile,
  renameProfile,
  deleteProfile,
  getProfile,
  normaliseName,
  MAX_NAME_LENGTH,
  PROFILES_KEY,
} from './profiles.js';
import { statsForProfile, gamesForProfile, seatOf, profileSummary } from './profile-stats.js';
import { newGameId } from './history.js';

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
  };
}

const N = (suit, number) => ({ id: `${suit}-${number}`, kind: 'number', suit, number });

let storage;
beforeEach(() => {
  storage = fakeStorage();
});

// --- the profile store ------------------------------------------------------

describe('profiles store', () => {
  it('starts empty and round-trips a created profile', () => {
    expect(loadProfiles(storage)).toEqual([]);

    const p = createProfile('Ana', storage);
    expect(p).toMatchObject({ name: 'Ana', kind: 'local' });
    expect(typeof p.id).toBe('string');
    expect(loadProfiles(storage)).toEqual([p]);
  });

  it('gives every profile a distinct id', () => {
    const a = createProfile('Ana', storage);
    const b = createProfile('Ben', storage);
    expect(a.id).not.toBe(b.id);
  });

  it('normalises names and rejects empty ones', () => {
    expect(normaliseName('  Ana   Lee  ')).toBe('Ana Lee');
    expect(normaliseName('')).toBe('');
    expect(normaliseName('   ')).toBe('');
    expect(normaliseName('x'.repeat(50))).toHaveLength(MAX_NAME_LENGTH);

    expect(createProfile('   ', storage)).toBeNull();
    expect(loadProfiles(storage)).toEqual([]);
  });

  it('rejects duplicate names case-insensitively', () => {
    createProfile('Ana', storage);
    expect(createProfile('ana', storage)).toBeNull();
    expect(createProfile('  ANA ', storage)).toBeNull();
    expect(loadProfiles(storage)).toHaveLength(1);
  });

  it('renames, keeping the id stable so past games still resolve', () => {
    const p = createProfile('Ana', storage);
    const renamed = renameProfile(p.id, 'Ana Lee', storage);

    expect(renamed.id).toBe(p.id);
    expect(renamed.name).toBe('Ana Lee');
    expect(getProfile(p.id, storage).name).toBe('Ana Lee');
  });

  it('refuses a rename that collides with another profile', () => {
    const a = createProfile('Ana', storage);
    createProfile('Ben', storage);

    expect(renameProfile(a.id, 'Ben', storage)).toBeNull();
    expect(getProfile(a.id, storage).name).toBe('Ana');
    // Renaming to its own name (different case) is fine.
    expect(renameProfile(a.id, 'ANA', storage).name).toBe('ANA');
  });

  it('deletes without touching the others', () => {
    const a = createProfile('Ana', storage);
    const b = createProfile('Ben', storage);

    deleteProfile(a.id, storage);
    expect(loadProfiles(storage)).toEqual([b]);
    expect(getProfile(a.id, storage)).toBeNull();
  });

  it('survives corrupt storage', () => {
    storage.setItem(PROFILES_KEY, 'not json{');
    expect(loadProfiles(storage)).toEqual([]);
    expect(createProfile('Ana', storage)).toMatchObject({ name: 'Ana' });
  });

  it('discards malformed entries', () => {
    storage.setItem(PROFILES_KEY, JSON.stringify([{ name: 'no id' }, null, { id: 'p1', name: 'ok' }]));
    expect(loadProfiles(storage)).toEqual([{ id: 'p1', name: 'ok' }]);
  });
});

// --- resolving a profile's games -------------------------------------------

/** A completed 2-player game with the given seat assignment. */
function playedGame(seatProfiles) {
  const created = createGame({
    numPlayers: 2,
    scoringMode: 'free',
    deckFactory: (round) =>
      round === 1
        ? [N('leaf', 1), N('cup', 2), N('teapot', 1), N('teapot', 2), N('teapot', 3), N('teapot', 6)]
        : [N('blossom', 8), N('leaf', 7), N('teapot', 7), N('teapot', 8), N('cup', 4)],
  });

  const actions = [
    { type: 'GUESS', guess: 'nomatch' }, // seat 0 guesses correctly
    { type: 'BANK' },
    { type: 'ADVANCE_TURN' }, // -> round 2, seat 1's turn
    { type: 'GUESS', guess: 'nomatch' }, // seat 1 guesses correctly
    { type: 'BANK' },
    { type: 'ADVANCE_TURN' }, // -> game over
  ];

  let state = created.state;
  for (const a of actions) state = applyAction(state, a).state;

  return {
    gameId: newGameId(),
    startedAt: 1000,
    endedAt: 2000,
    initialState: created.state,
    actions,
    seatProfiles,
  };
}

describe('resolving profile games out of history', () => {
  it('finds which seat a profile occupied', () => {
    const game = playedGame(['pa', 'pb']);
    expect(seatOf(game, 'pa')).toBe(0);
    expect(seatOf(game, 'pb')).toBe(1);
    expect(seatOf(game, 'nobody')).toBe(-1);
  });

  it('picks out only the games a profile played', () => {
    const history = [playedGame(['pa', 'pb']), playedGame(['pb', null]), playedGame([null, null])];

    expect(gamesForProfile(history, 'pa')).toHaveLength(1);
    expect(gamesForProfile(history, 'pb')).toHaveLength(2);
    expect(gamesForProfile(history, 'ghost')).toHaveLength(0);
  });

  it('attributes each seat its own records, not the whole table', () => {
    const history = [playedGame(['pa', 'pb'])];

    const a = statsForProfile(history, 'pa');
    const b = statsForProfile(history, 'pb');

    expect(a.gameCount).toBe(1);
    expect(b.gameCount).toBe(1);
    // Each player made exactly one prediction and banked once.
    expect(a.stats.totalPredictions).toBe(1);
    expect(b.stats.totalPredictions).toBe(1);
    expect(a.stats.voluntaryBankCount).toBe(1);
    expect(b.stats.voluntaryBankCount).toBe(1);
    // Seat 0 played in round 1, seat 1 in round 2.
    expect(a.stats.clutchFactor.round1Accuracy).toBe(1);
    expect(a.stats.clutchFactor.round2Accuracy).toBeNull();
    expect(b.stats.clutchFactor.round1Accuracy).toBeNull();
    expect(b.stats.clutchFactor.round2Accuracy).toBe(1);
  });

  it('aggregates a profile across several games', () => {
    const history = [playedGame(['pa', 'pb']), playedGame(['pa', null]), playedGame([null, 'pa'])];
    const { gameCount, stats } = statsForProfile(history, 'pa');

    expect(gameCount).toBe(3);
    expect(stats.totalPredictions).toBe(3);
    expect(stats.turnsTaken).toBe(3); // one turn each, ids keep them apart
  });

  it('gives a graceful empty state for a profile that has never played', () => {
    const { gameCount, stats } = statsForProfile([], 'brand-new');

    expect(gameCount).toBe(0);
    expect(stats.totalPredictions).toBe(0);
    expect(stats.accuracy).toBeNull();
    expect(stats.countingSkill).toBeNull();
    expect(stats.steepSurvivalRate).toBeNull();
    expect(stats.nemesisCard).toBeNull();
    // Nothing is NaN — the UI can format straight from this.
    for (const value of Object.values(stats)) {
      if (typeof value === 'number') expect(Number.isNaN(value)).toBe(false);
    }
  });

  it('keeps a deleted profile’s history intact under its raw id', () => {
    const p = createProfile('Ana', storage);
    const history = [playedGame([p.id, null])];
    deleteProfile(p.id, storage);

    // The name is gone, but the records still resolve by id.
    expect(getProfile(p.id, storage)).toBeNull();
    expect(statsForProfile(history, p.id).gameCount).toBe(1);
  });

  it('skips a corrupt game instead of losing the whole profile', () => {
    const good = playedGame(['pa', null]);
    const broken = { ...playedGame(['pa', null]), initialState: null };
    const { gameCount, stats } = statsForProfile([good, broken], 'pa');

    expect(gameCount).toBe(2); // both claim the profile
    expect(stats.totalPredictions).toBe(1); // only the readable one contributed
  });

  it('summarises a profile without replaying anything', () => {
    const history = [playedGame(['pa', null]), { ...playedGame(['pa', null]), endedAt: 9999 }];
    expect(profileSummary(history, 'pa')).toEqual({ gameCount: 2, lastPlayed: 9999 });
    expect(profileSummary(history, 'ghost')).toEqual({ gameCount: 0, lastPlayed: null });
  });
});
