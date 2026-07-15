import { useState } from 'react';
import RulebookModal from './RulebookModal.jsx';
import { clearSave } from '../persist.js';

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

export default function SetupScreen({ savedGame, onStart, onResume }) {
  const [numPlayers, setNumPlayers] = useState(() => {
    const n = Number(readPref('matcha.players', '2'));
    return n >= 1 && n <= 6 ? n : 2;
  });
  const [scoringMode, setScoringMode] = useState(() => {
    const m = readPref('matcha.mode', 'free');
    return MODES.some((x) => x.id === m) ? m : 'free';
  });
  const [rulesOpen, setRulesOpen] = useState(false);
  const [saved, setSaved] = useState(savedGame);

  function start() {
    try {
      localStorage.setItem('matcha.players', String(numPlayers));
      localStorage.setItem('matcha.mode', scoringMode);
    } catch {
      // preferences just won't persist
    }
    onStart({ numPlayers, scoringMode });
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
            Game in progress — round {saved.round}, Player {saved.currentPlayer + 1}
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
        <button className="btn subtle" onClick={() => setRulesOpen(true)}>
          Rulebook
        </button>
      </div>

      {rulesOpen && <RulebookModal onClose={() => setRulesOpen(false)} />}
    </div>
  );
}
