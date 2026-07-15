// Save/resume for pass-and-play sessions. The whole game state is plain
// serializable data, so persistence is just JSON in localStorage.
const KEY = 'matcha.save.v1';

export function saveGame(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // storage full or blocked — resume simply won't be offered
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const state = JSON.parse(raw);
    return state && state.phase && state.phase !== 'gameOver' ? state : null;
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
