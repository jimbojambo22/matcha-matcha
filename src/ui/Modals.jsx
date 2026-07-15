import { peekNextTurn } from '../game/engine.js';
import CardView from './CardView.jsx';

export function TurnOverModal({ state, onAdvance }) {
  const o = state.outcome;
  const peek = peekNextTurn(state);
  const solo = state.numPlayers === 1;

  let title = 'Turn over';
  let body = null;
  let tone = '';

  if (o?.kind === 'banked') {
    tone = 'good';
    title = o.via === 'lastSip' ? 'Last Sip!' : 'Points banked!';
    body = (
      <>
        {o.via === 'lastSip' && <p>The Last Sip ends the turn and banks the pot automatically.</p>}
        <p className="big-points">
          +{o.points} point{o.points === 1 ? '' : 's'}
        </p>
        {o.token != null && (
          <p>
            Collected the <strong>{o.token}</strong>-point token{o.points > o.token ? ' (highest left)' : ''}.
          </p>
        )}
        {o.trade && (
          <p>
            Trade-in: gave {o.trade.gave.join(' + ')} for the <strong>{o.trade.got}</strong>-point token.
          </p>
        )}
      </>
    );
  } else if (o?.kind === 'bankFailed') {
    tone = 'bad';
    title = 'Last Sip!';
    body = (
      <p>
        The {o.attempted}-point token is gone — the pot is lost. <strong>0 points.</strong>
      </p>
    );
  } else if (o?.kind === 'bust') {
    tone = 'bad';
    title = o.reason === 'matcha' ? 'MATCHA-MATCHA!!' : 'Wrong guess!';
    const lost = o.lostTable + o.lostPot;
    body = (
      <p>
        The pot is lost — {lost} point{lost === 1 ? ' slips' : 's slip'} away.
      </p>
    );
  } else if (o?.kind === 'steeped') {
    tone = 'steep';
    title = 'The pot is steeping…';
    body = (
      <>
        <p>
          {o.potSize} card{o.potSize === 1 ? '' : 's'} hidden in your pot. This card stays face-up to start your next
          turn:
        </p>
        <div className="modal-card">
          <CardView card={o.topCard} />
        </div>
      </>
    );
  }

  let cta = 'Next turn';
  if (peek?.kind === 'turn' && !solo) cta = `Pass to Player ${peek.player + 1}`;
  else if (peek?.kind === 'roundTwo') cta = solo ? 'Start round 2' : `Round 2 — Player ${peek.player + 1} starts`;
  else if (peek?.kind === 'gameOver') cta = 'See final results';

  return (
    <div className="overlay">
      <div className={`modal turn-over ${tone}`}>
        <h2>{title}</h2>
        <div className="modal-body">{body}</div>
        <button className="btn primary" onClick={onAdvance} autoFocus>
          {cta}
        </button>
      </div>
    </div>
  );
}

export function GameOverModal({ state, onPlayAgain, onHome }) {
  const r = state.results;
  const solo = state.numPlayers === 1;
  const standings = state.players
    .map((p, i) => ({ ...p, index: i }))
    .sort((a, b) => b.score - a.score || b.biggestBank - a.biggestBank);

  return (
    <div className="overlay">
      <div className="modal game-over">
        <h2>Game over!</h2>
        {solo ? (
          <p className="winner-line">
            Final score: <strong>{state.players[0].score}</strong>
          </p>
        ) : r.winner !== null ? (
          <p className="winner-line">🏆 Player {r.winner + 1} wins with {r.maxScore} points!</p>
        ) : (
          <p className="winner-line">
            A tie! Players {r.tiedPlayers.map((i) => i + 1).join(' & ')} share the win — matcha for everyone 🍵
          </p>
        )}
        {!solo && r.tiebreakUsed && <p className="tiebreak-note">Tie broken by the biggest single banked turn.</p>}
        {!solo && (
          <table className="standings">
            <tbody>
              {standings.map((p) => (
                <tr key={p.index} className={r.winner === p.index ? 'winner' : ''}>
                  <td>Player {p.index + 1}</td>
                  <td className="score-cell">{p.score}</td>
                  <td className="dim">best turn: {p.biggestBank}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="modal-actions">
          <button className="btn primary" onClick={onPlayAgain}>
            Play again
          </button>
          <button className="btn subtle" onClick={onHome}>
            Menu
          </button>
        </div>
      </div>
    </div>
  );
}
