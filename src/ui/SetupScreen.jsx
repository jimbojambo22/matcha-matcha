import { useEffect, useState } from 'react';
import RulebookModal from './RulebookModal.jsx';
import NamesScreen from './NamesScreen.jsx';
import { clearSave } from '../persist.js';
import { loadProfiles } from '../profiles.js';
import { resolveNames } from '../names.js';

const MODES = [
  { id: 'free', name: 'Free Scoring', blurb: 'Bank any total, any number of times.' },
  { id: 'tokens', name: 'Score Tokens', blurb: 'Each bank total (1–8) can only be claimed once per game.' },
  { id: 'trade', name: 'Tokens + Trade-In', blurb: 'Score tokens, plus trade two tokens for one bigger one.' },
];

function readPref(key, fallback) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export default function SetupScreen({ savedGame, onStart, onResume, onOpenProfiles }) {
  const [numPlayers, setNumPlayers] = useState(() => {
    const n = Number(readPref('matcha.players', '2'));
    return n >= 1 && n <= 6 ? n : 2;
  });
  const [scoringMode, setScoringMode] = useState(() => {
    const m = readPref('matcha.mode', 'free');
    return MODES.some((x) => x.id === m) ? m : 'free';
  });
  const [rulesOpen, setRulesOpen] = useState(false);
  const [askingNames, setAskingNames] = useState(false);
  const [saved, setSaved] = useState(savedGame);
  const [profiles] = useState(() => loadProfiles());
  // Seat -> profile id; null means a guest, whose play is recorded but is not
  // attributed to any profile.
  const [seatProfiles, setSeatProfiles] = useState(() => Array.from({ length: numPlayers }, () => null));

  // Keep one entry per seat as the player count changes, preserving choices.
  useEffect(() => {
    setSeatProfiles((prev) => Array.from({ length: numPlayers }, (_, i) => prev[i] ?? null));
  }, [numPlayers]);

  function assignSeat(seat, profileId) {
    setSeatProfiles((prev) =>
      prev.map((current, i) => {
        if (i === seat) return profileId;
        // A profile can only hold one seat, or its stats would double-count.
        return profileId !== null && current === profileId ? null : current;
      }),
    );
  }

  function start() {
    try {
      localStorage.setItem('matcha.players', String(numPlayers));
      localStorage.setItem('matcha.mode', scoringMode);
    } catch {
      // preferences just won't persist
    }
    setAskingNames(true);
  }

  if (askingNames) {
    return (
      <NamesScreen
        numPlayers={numPlayers}
        seatProfiles={seatProfiles}
        profiles={profiles}
        onBack={() => setAskingNames(false)}
        onContinue={(playerNames) => onStart({ numPlayers, scoringMode, seatProfiles, playerNames })}
      />
    );
  }

  return (
    <div className="setup">
      <header className="setup-header">
        <h1 className="title">Matcha! Matcha!</h1>
        <p className="subtitle">A push-your-luck matching game</p>
      </header>

      {saved && (
        <div className="resume-box">
          <p>
            Game in progress — round {saved.state.round},{' '}
            {resolveNames(saved.playerNames, saved.state.numPlayers)[saved.state.currentPlayer]}’s turn
          </p>
          <div className="resume-actions">
            <button className="btn primary" onClick={() => onResume(saved)}>
              Resume
            </button>
            <button
              className="btn subtle"
              onClick={() => {
                clearSave();
                setSaved(null);
              }}
            >
              Discard
            </button>
          </div>
        </div>
      )}

      <section className="setup-section">
        <h3>Players</h3>
        <div className="player-picker" role="radiogroup" aria-label="Number of players">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <button
              key={n}
              className={`picker-btn ${numPlayers === n ? 'selected' : ''}`}
              onClick={() => setNumPlayers(n)}
              aria-pressed={numPlayers === n}
            >
              {n}
            </button>
          ))}
        </div>
        <p className="hint">{numPlayers === 1 ? 'Solo — chase your best score.' : 'Pass-and-play on one device.'}</p>

        <div className="seat-list">
          {seatProfiles.map((assigned, seat) => (
            <label key={seat} className="seat-row">
              <span className="seat-label">Player {seat + 1}</span>
              <select
                className="seat-select"
                value={assigned ?? ''}
                onChange={(e) => assignSeat(seat, e.target.value || null)}
              >
                <option value="">Guest</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <p className="hint">
          {profiles.length === 0
            ? 'Add a player profile to start tracking stats across games.'
            : 'Assign a profile to a seat to record that seat’s stats.'}
        </p>
      </section>

      <section className="setup-section">
        <h3>Scoring</h3>
        <div className="mode-list">
          {MODES.map((m) => (
            <button
              key={m.id}
              className={`mode-card ${scoringMode === m.id ? 'selected' : ''}`}
              onClick={() => setScoringMode(m.id)}
              aria-pressed={scoringMode === m.id}
            >
              <span className="mode-name">{m.name}</span>
              <span className="mode-blurb">{m.blurb}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="setup-actions">
        <button className="btn primary start-btn" onClick={start}>
          Start game
        </button>
        <button className="btn subtle" onClick={onOpenProfiles}>
          Players &amp; stats
        </button>
        <button className="btn subtle" onClick={() => setRulesOpen(true)}>
          Rulebook
        </button>
      </div>

      {rulesOpen && <RulebookModal onClose={() => setRulesOpen(false)} />}
    </div>
  );
}
