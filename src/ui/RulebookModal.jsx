// The canonical rulebook. These rules match the engine (src/game/engine.js)
// and its test suite exactly — if you change a rule, change all three.
import { SUIT_ART } from './CardView.jsx';
import { SUITS } from '../game/cards.js';

export default function RulebookModal({ onClose }) {
  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal rulebook">
        <button className="close-btn" onClick={onClose} aria-label="Close rulebook">
          ✕
        </button>
        <h2>Matcha! Matcha!</h2>
        <div className="rulebook-body">
          <h3>Overview</h3>
          <p>
            A fast, push-your-luck matching game for 1–6 players. Predict whether the next card will{' '}
            <strong>Match</strong> or <strong>No Match</strong>, grow your pot, and bank points before your luck runs
            out. Highest total after two rounds wins.
          </p>

          <h3>The deck — 52 cards</h3>
          <ul>
            <li>
              <strong>Number cards</strong> (1–8 in each of five suits):{' '}
              {SUITS.map((s) => (
                <img key={s} src={SUIT_ART[s]} alt={s} className="rule-icon" />
              ))}{' '}
              Leaf, Cup, Whisk, Teapot, Blossom
            </li>
            <li>
              <strong>Two-suit cards</strong> (5) — count as BOTH suits; they have no number.
            </li>
            <li>
              <strong>Two-number cards</strong> (4) — count as BOTH numbers; they have no suit.
            </li>
            <li>
              <strong>Last Sip</strong> (1) and <strong>Free Space</strong> (2) — special cards with no suit or number.
            </li>
          </ul>

          <h3>Your turn</h3>
          <ol>
            <li>A starting card is dealt to the table (or your steeped card from last turn opens it).</li>
            <li>
              Guess <strong>Match</strong> or <strong>No Match</strong>, then flip the next card.
            </li>
            <li>
              Guessed right? The card joins the table and you choose: keep guessing, <strong>Steep</strong>, or{' '}
              <strong>Bank</strong>.
            </li>
            <li>Guessed wrong — or hit a Matcha-Matcha — and your turn ends with nothing.</li>
          </ol>
          <p>
            You may only Steep or Bank after at least one <em>successful</em> guess this turn.
          </p>

          <h3>Matching — the whole table counts</h3>
          <p>Compare the flipped card against ALL face-up cards at once:</p>
          <ul>
            <li>
              <strong>Match</strong> — its suit OR its number appears somewhere on the table.
            </li>
            <li>
              <strong>No Match</strong> — neither appears.
            </li>
            <li>
              <strong>MATCHA-MATCHA!!</strong> — its suit AND its number both appear, even on two different cards.
              Instant bust: table and steeped pot are lost, turn over. (No single card can trigger it — it takes a
              table.)
            </li>
          </ul>
          <p>Covered cards don't count for matching. Two-suit and two-number cards count as both of their values.</p>

          <h3>Banking</h3>
          <p>
            Banking scores <strong>1 point per card on the table</strong> (covered cards included) plus{' '}
            <strong>1 per hidden steeped card</strong>, then ends your turn. Your steeped pot converts to points
            exactly once — when you bank it.
          </p>

          <h3>Steeping</h3>
          <p>
            Steeping saves your progress for a bigger future bank: every table card except the most recently played
            one goes face-down into your pot; that last card stays face-up to open your next turn. Steep repeatedly to
            brew a monster pot — but a bust or the end of the round loses it all.
          </p>

          <h3>Special cards</h3>
          <ul>
            <li>
              <strong>Last Sip</strong> — the turn ends immediately and your pot is banked automatically (the Last Sip
              itself counts as a point). It even overrides the successful-guess requirement. In token modes, if the
              exact token you'd need is gone, the pot is lost for zero points. Ugly head, indeed.
            </li>
            <li>
              <strong>Free Space</strong> — counts as an automatic successful guess. Place it as its own card, or
              cover any face-up card: a covered card keeps its point but its suit and number leave the table. If a
              Free Space is dealt at the start of a turn it stays in play and a bonus card is dealt (the freebies
              don't count as your guess).
            </li>
          </ul>

          <h3>Scoring modes</h3>
          <ul>
            <li>
              <strong>Free Scoring</strong> — bank anything, any time.
            </li>
            <li>
              <strong>Score Tokens</strong> — one token per value 1–8; banking a total claims its token, and once a
              token is gone nobody can bank that total again. Banking MORE than the highest remaining token is always
              allowed (you take the highest token and score your full total) — tokens punish small banks, never big
              ones.
            </li>
            <li>
              <strong>Tokens + Trade-In</strong> — as above, plus: whenever your turn ends with a newly collected
              token, you must trade exactly two of your tokens for the available token matching their sum, if
              possible. Higher-value tokens trade first (holding 1-2-4, you trade 4+2 for the 6 — even if the 3 is
              free). One trade per turn.
            </li>
          </ul>

          <h3>Rounds</h3>
          <p>
            When fewer than <strong>5 cards</strong> remain at the start of a turn, the round ends: all steeped pots
            are shuffled back into the deck (lost!), play reverses direction, and the same player opens round 2. After
            round 2 ends the same way, the game is over.
          </p>

          <h3>Winning</h3>
          <p>
            Highest total score wins. Ties go to the player with the biggest single banked turn. Still tied? Everyone
            shares the win and a delicious cup of matcha. 🍵
          </p>
        </div>
      </div>
    </div>
  );
}
