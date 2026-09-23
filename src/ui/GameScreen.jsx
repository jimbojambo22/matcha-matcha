import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createGame,
  applyAction,
  getLegalActions,
  potentialPoints,
  TOKEN_VALUES,
} from '../game/engine.js';
import CardView from './CardView.jsx';
import { TurnOverModal, GameOverModal } from './Modals.jsx';
import RulebookModal from './RulebookModal.jsx';
import { saveGame, clearSave } from '../persist.js';
import { appendGame, newGameId } from '../history.js';
import cardback from '../assets/cardback.svg';
import { resolveNames } from '../names.js';
import { describeGuess } from './messages.js';
import Explanation from './Explanation.jsx';

export default function GameScreen({ config, resume, onExit, onPlayAgain }) {
  // One lazy boot so the engine is created exactly once, and the recording
  // metadata is captured alongside it (initialState must be the *exact*
  // object createGame returned — the deck order in it is the whole game).
  const [boot] = useState(() => {
    if (resume) {
      return {
        snap: { state: resume.state, events: [] },
        meta: {
          gameId: resume.gameId,
          startedAt: resume.startedAt,
          initialState: resume.initialState,
          actions: [...resume.actions],
          seatProfiles: resume.seatProfiles ?? [],
          playerNames: resolveNames(resume.playerNames, resume.state.numPlayers),
        },
      };
    }
    const created = createGame(config);
    return {
      snap: created,
      meta: {
        gameId: newGameId(),
        startedAt: Date.now(),
        initialState: created.state,
        actions: [],
        // Seat -> profile id, chosen at setup. A null seat is a guest, whose
        // play is recorded but belongs to nobody's profile.
        seatProfiles:
          config.seatProfiles ?? Array.from({ length: config.numPlayers ?? 1 }, () => null),
        // Seat -> display name, chosen on the names step ("Player N" if blank).
        playerNames: resolveNames(config.playerNames, created.state.numPlayers),
      },
    };
  });

  const [snap, setSnap] = useState(boot.snap);
  const meta = useRef(boot.meta);
  const archived = useRef(false);
  const [reveal, setReveal] = useState(null); // { card, verdict, message, detail }
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [banner, setBanner] = useState(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const timers = useRef([]);

  const state = snap.state;
  const names = meta.current.playerNames;
  const legal = getLegalActions(state);
  const isTokenMode = state.scoringMode !== 'free';
  const placing = state.phase === 'placingFreeSpace';
  const pot = potentialPoints(state);

  const reducedMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  // Persist after every committed state so a closed tab can resume, and
  // archive the finished game instead of dropping it on the floor.
  useEffect(() => {
    if (state.phase === 'gameOver') {
      if (!archived.current) {
        archived.current = true;
        appendGame({ ...meta.current, endedAt: Date.now() });
      }
      clearSave();
    } else {
      saveGame({ ...meta.current, state });
    }
  }, [state]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  function later(fn, ms) {
    timers.current.push(setTimeout(fn, ms));
  }

  /** Commit an applied action: log it, then swap in the new snapshot. */
  function commit(action, next) {
    meta.current.actions.push(action);
    setSnap(next);
  }

  function flash(msg) {
    setToast(msg);
    later(() => setToast(null), 2600);
  }

  function announce(msg) {
    setBanner(msg);
    later(() => setBanner(null), 2600);
  }

  function onGuess(g) {
    if (busy || !legal.guess) return;
    const action = { type: 'GUESS', guess: g };
    const next = applyAction(state, action);
    const drawn = next.events.find((e) => e.type === 'CARD_DRAWN');
    const resolved = next.events.find((e) => e.type === 'GUESS_RESOLVED');
    let verdict;
    let message;
    let detail = null;
    if (next.events.some((e) => e.type === 'LAST_SIP')) {
      verdict = 'lastsip';
      message = 'Last Sip!';
    } else if (next.events.some((e) => e.type === 'FREE_SPACE_DRAWN')) {
      verdict = 'freespace';
      message = 'Free Space!';
    } else {
      ({ verdict, headline: message, detail } = describeGuess(resolved));
    }
    // Show the drawn card over the old table for a beat, then commit.
    setReveal({ card: drawn.card, verdict, message, detail });
    setBusy(true);
    later(
      () => {
        commit(action, next);
        setReveal(null);
        setBusy(false);
      },
      reducedMotion ? 350 : 1400,
    );
  }

  function onBank() {
    if (busy || !legal.bank) return;
    const action = { type: 'BANK' };
    const next = applyAction(state, action);
    const refused = next.events.find((e) => e.type === 'BANK_REFUSED');
    if (refused) {
      // A refused bank leaves the state untouched, but the *attempt* is real
      // player behaviour worth replaying, so it still joins the log.
      meta.current.actions.push(action);
      flash(`The ${refused.points}-point token isn't available — keep guessing or steep!`);
      return;
    }
    commit(action, next);
  }

  function onSteep() {
    if (busy || !legal.steep) return;
    const action = { type: 'STEEP' };
    commit(action, applyAction(state, action));
  }

  function onPlace(i) {
    if (busy || !placing) return;
    const action = { type: 'PLACE_FREE_SPACE', stackIndex: i };
    commit(action, applyAction(state, action));
  }

  function onAdvance() {
    if (busy || !legal.advance) return;
    const action = { type: 'ADVANCE_TURN' };
    const next = applyAction(state, action);
    if (next.events.some((e) => e.type === 'ROUND_TWO_STARTED')) {
      announce('Round 2 — direction reverses!');
    }
    const deals = next.events.filter((e) => e.type === 'CARD_DEALT');
    if (deals.length > 1 && next.state.phase === 'awaitingGuess') {
      flash('Free Space on the deal — bonus card dealt!');
    }
    commit(action, next);
  }

  return (
    <div className="game">
      <header className="game-header">
        <button className="chip-btn" onClick={onExit}>
          Menu
        </button>
        <div className="round-chip">Round {state.round} / 2</div>
        <button className="chip-btn" onClick={() => setRulesOpen(true)}>
          Rules
        </button>
      </header>

      {isTokenMode && (
        <div className="token-pool" aria-label="Score tokens still available">
          {TOKEN_VALUES.map((v) => (
            <div key={v} className={`token ${state.availableTokens.includes(v) ? '' : 'taken'}`}>
              {v}
            </div>
          ))}
        </div>
      )}

      <div className="turn-line">
        <span className="player-chip">{names[state.currentPlayer]}</span>
        <span className="pot-line">
          Pot: {pot} point{pot === 1 ? '' : 's'}
        </span>
      </div>

      <main className="table-zone">
        {placing && (
          <div className="placing-hint">
            Free Space! Tap a card to cover it, or the dashed slot to play it on its own.
          </div>
        )}
        <div className="table-cards">
          <div className="table-first-col">
            {state.stacks.length > 0 &&
              (() => {
                const stack = state.stacks[0];
                const top = stack[stack.length - 1];
                return (
                  <CardView
                    key={`0-${top.id}`}
                    card={top}
                    covered={stack.length - 1}
                    selectable={placing}
                    onClick={placing ? () => onPlace(0) : undefined}
                  />
                );
              })()}
            <div className="deck-card" aria-label={`${state.drawPile.length} cards left in the deck`}>
              <img src={cardback} alt="" className="deck-card-img" />
              <span className="deck-count">{state.drawPile.length}</span>
            </div>
          </div>
          {state.stacks.slice(1).map((stack, idx) => {
            const i = idx + 1;
            const top = stack[stack.length - 1];
            return (
              <CardView
                key={`${i}-${top.id}`}
                card={top}
                covered={stack.length - 1}
                selectable={placing}
                onClick={placing ? () => onPlace(i) : undefined}
              />
            );
          })}
          {placing && (
            <button type="button" className="card ghost" onClick={() => onPlace(null)}>
              Play
              <br />
              Here
            </button>
          )}
        </div>

        {reveal && (
          <div className="reveal-overlay">
            <CardView card={reveal.card} className="flip" />
            <div className={`verdict ${reveal.verdict}`} role="status">
              <div className="verdict-headline">{reveal.message}</div>
              <Explanation parts={reveal.detail} />
            </div>
          </div>
        )}
      </main>

      <section className="players">
        {state.players.map((p, i) => (
          <div
            key={i}
            className={`player-panel ${i === state.currentPlayer && state.phase !== 'gameOver' ? 'active' : ''}`}
          >
            <div className="player-name" title={names[i]}>
              {names[i]}
            </div>
            <div className="player-score">{p.score}</div>
            {isTokenMode && (
              <div className="player-tokens">
                {p.tokens.map((t) => (
                  <span key={t} className="token small">
                    {t}
                  </span>
                ))}
              </div>
            )}
            <div className="player-pot">
              {p.potTop ? (
                <>
                  <CardView card={p.potTop} mini />
                  <span className="pot-count">+{p.potHidden.length}</span>
                </>
              ) : p.potHidden.length > 0 ? (
                <span className="pot-count">pot {p.potHidden.length}</span>
              ) : null}
            </div>
          </div>
        ))}
      </section>

      <nav className="controls">
        <div className="control-group guess-group">
          <span className="group-label">Next card will be…</span>
          <div className="group-buttons">
            <button className="btn match" disabled={busy || !legal.guess} onClick={() => onGuess('match')}>
              Match
            </button>
            <button className="btn nomatch" disabled={busy || !legal.guess} onClick={() => onGuess('nomatch')}>
              No Match
            </button>
          </div>
        </div>
        <div className="control-group action-group">
          <span className="group-label">Or end your turn</span>
          <div className="group-buttons">
            <button className="btn steep" disabled={busy || !legal.steep} onClick={onSteep}>
              Steep
            </button>
            <button className="btn bank" disabled={busy || !legal.bank} onClick={onBank}>
              Bank{legal.bank && !busy ? ` ${pot}` : ''}
            </button>
          </div>
        </div>
      </nav>

      {toast && <div className="toast">{toast}</div>}
      {banner && <div className="banner">{banner}</div>}

      {state.phase === 'turnOver' && !busy && <TurnOverModal state={state} names={names} onAdvance={onAdvance} />}
      {state.phase === 'gameOver' && (
        <GameOverModal
          state={state}
          names={names}
          onPlayAgain={() =>
            onPlayAgain({
              numPlayers: state.numPlayers,
              scoringMode: state.scoringMode,
              // A rematch keeps the same people in the same seats.
              seatProfiles: meta.current.seatProfiles,
              playerNames: names,
            })
          }
          onHome={onExit}
        />
      )}
      {rulesOpen && <RulebookModal onClose={() => setRulesOpen(false)} />}
    </div>
  );
}
