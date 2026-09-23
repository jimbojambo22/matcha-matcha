// Archive of completed games.
//
// A finished game used to be deleted outright (clearSave on gameOver). It is
// now appended here instead, as { initialState, actions } — everything needed
// to replay it and recompute stats later, in a few KB per game.
//
// Storage is injectable so this is testable without a DOM; it falls back to
// localStorage in the browser.
//
// PRIVACY NOTE: initialState contains the full shuffled deck order for both
// rounds, i.e. a plaintext record of exactly what every game was going to
// deal. That is harmless on the player's own device, but this array must NOT
// be shipped as-is to a shared backend — a modified client could read a live
// game's future from it. Anything synced later should be stats recomputed
// server-side from an authoritative record, not this blob.

import { newId } from './ids.js';

export const HISTORY_KEY = 'matcha.history.v1';

/** Oldest games are evicted past this many. */
export const MAX_HISTORY_GAMES = 200;

function defaultStorage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null; // storage blocked (private mode, embedded webview)
  }
}

export function newGameId() {
  return newId('g');
}

/** Every archived game, oldest first. Returns [] if unreadable. */
export function loadHistory(storage = defaultStorage()) {
  if (!storage) return [];
  try {
    const raw = storage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Append a completed game, evicting the oldest past MAX_HISTORY_GAMES.
 * Returns the stored history. Writing is best-effort: a full quota must never
 * break the game that just ended.
 *
 * @param {object} game { gameId, startedAt, endedAt, initialState, actions, seatProfiles }
 */
export function appendGame(game, storage = defaultStorage()) {
  const history = loadHistory(storage);
  // Re-archiving the same game is a no-op — React StrictMode runs effects
  // twice in dev, and a resumed game can reach gameOver more than once.
  if (game.gameId && history.some((g) => g.gameId === game.gameId)) return history;

  const next = [...history, game].slice(-MAX_HISTORY_GAMES);
  if (!storage) return next;
  try {
    storage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    // Quota exceeded: drop the oldest half and try once more, so a long
    // history degrades gracefully instead of freezing at the cap forever.
    try {
      const trimmed = next.slice(Math.floor(next.length / 2));
      storage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
      return trimmed;
    } catch {
      return history;
    }
  }
  return next;
}

export function clearHistory(storage = defaultStorage()) {
  if (!storage) return;
  try {
    storage.removeItem(HISTORY_KEY);
  } catch {
    // ignore
  }
}
