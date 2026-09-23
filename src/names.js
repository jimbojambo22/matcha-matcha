// Display names for the seats in one game.
//
// Names are presentation, not rules: the engine only knows player indexes.
// They travel with the game session (save + history) alongside seatProfiles,
// so a resumed or archived game still shows who sat where.

import { normaliseName } from './profiles.js';

export function defaultName(seat) {
  return `Player ${seat + 1}`;
}

/**
 * One clean name per seat. Blank or missing entries fall back to
 * "Player N", so callers can pass raw form input or an old save's
 * (absent) names alike.
 */
export function resolveNames(names, numPlayers) {
  return Array.from({ length: numPlayers }, (_, i) => normaliseName(names?.[i]) || defaultName(i));
}
