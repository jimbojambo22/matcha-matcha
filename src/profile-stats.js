// Glue between the history archive and the Phase 2 stats modules.
//
// Pure given a history array: takes no storage and no DOM, so it is testable
// on its own and the UI stays a formatter. All real computation happens in
// src/game/ — nothing here knows a rule of the game.

import { replayGame } from './game/replay.js';
import { computeStats, recordsForPlayer } from './game/stats.js';

/** Which seat a profile occupied, or -1 if it did not play in this game. */
export function seatOf(game, profileId) {
  return (game.seatProfiles ?? []).indexOf(profileId);
}

/** Every archived game this profile played, oldest first. */
export function gamesForProfile(history, profileId) {
  return history.filter((g) => seatOf(g, profileId) >= 0);
}

/**
 * Replay every game a profile played and aggregate them into one set of
 * stats. Games are replayed in stored (chronological) order so all-time
 * streaks run in the right direction.
 *
 * @returns {{ gameCount:number, stats:object, records:object[] }}
 *   `stats` is always a full object; with no games every figure is null,
 *   which is the empty state rather than an error.
 */
export function statsForProfile(history, profileId) {
  const games = gamesForProfile(history, profileId);
  const records = [];

  for (const game of games) {
    const seat = seatOf(game, profileId);
    // Each game is replayed from its own initialState, so a corrupt or
    // half-written record cannot take the whole profile down with it.
    let replayed;
    try {
      replayed = replayGame(game);
    } catch {
      continue;
    }
    records.push(...recordsForPlayer(replayed.records, seat));
  }

  return { gameCount: games.length, stats: computeStats(records), records };
}

/**
 * Headline numbers for a profile list row — cheap enough to show for every
 * profile at once without replaying anything.
 */
export function profileSummary(history, profileId) {
  const games = gamesForProfile(history, profileId);
  const lastPlayed = games.length ? Math.max(...games.map((g) => g.endedAt ?? g.startedAt ?? 0)) : null;
  return { gameCount: games.length, lastPlayed };
}
