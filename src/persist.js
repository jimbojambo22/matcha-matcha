// Save/resume for pass-and-play sessions.
//
// The save now carries the whole recording session, not just the live state:
// { gameId, startedAt, initialState, state, actions }. `state` is redundant
// (replaying initialState + actions reproduces it) but keeping it makes resume
// instant and keeps the engine out of the load path.
//
// Key bumped to v2: v1 saves held a bare state with no action log, so a game
// resumed from one could never be archived. Those are dropped on sight.
const KEY = 'matcha.save.v2';
const LEGACY_KEYS = ['matcha.save.v1'];

/** @param {object} session { gameId, startedAt, initialState, state, actions } */
export function saveGame(session) {
  try {
    localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // storage full or blocked — resume simply won't be offered
  }
}

/** The saved session, or null when there is nothing resumable. */
export function loadGame() {
  try {
    for (const stale of LEGACY_KEYS) localStorage.removeItem(stale);
  } catch {
    // ignore
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (!isResumable(session)) return null;
    return session;
  } catch {
    return null;
  }
}

/** A session is only resumable if it can also be archived when it ends. */
function isResumable(session) {
  return Boolean(
    session &&
      session.state &&
      session.state.phase &&
      session.state.phase !== 'gameOver' &&
      session.initialState &&
      Array.isArray(session.actions),
  );
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
