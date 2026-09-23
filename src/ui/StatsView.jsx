// Presentation only. Every number here comes from src/game/stats.js — this
// file formats and frames, it never computes a statistic.

const pct = (x) => (x === null || x === undefined ? '—' : `${Math.round(x * 100)}%`);
const num = (x, digits = 1) => (x === null || x === undefined ? '—' : Number(x).toFixed(digits));
const int = (x) => (x === null || x === undefined ? '—' : String(x));
const signedPct = (x) => (x === null || x === undefined ? '—' : `${x >= 0 ? '+' : ''}${Math.round(x * 100)}%`);

/** Card ids are structured (`leaf-3`, `ds-cup-whisk`); make them readable. */
function cardName(id) {
  if (!id) return null;
  if (id.startsWith('ds-')) {
    const [, a, b] = id.split('-');
    return `the ${a}/${b} double`;
  }
  if (id.startsWith('dn-')) {
    const [, a, b] = id.split('-');
    return `the ${a}/${b} double`;
  }
  if (id === 'special-lastSip') return 'the Last Sip';
  if (id.startsWith('special-freeSpace')) return 'a Free Space';
  const [suit, number] = id.split('-');
  return `the ${number} of ${suit}`;
}

function Section({ title, blurb, children }) {
  return (
    <section className="stat-section">
      <h3 className="stat-heading">{title}</h3>
      {blurb && <p className="stat-blurb">{blurb}</p>}
      <dl className="stat-grid">{children}</dl>
    </section>
  );
}

function Stat({ label, value, wide = false }) {
  return (
    <div className={`stat-cell ${wide ? 'wide' : ''}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export default function StatsView({ report, name }) {
  if (!report || report.gameCount === 0) {
    return (
      <div className="stats-empty">
        <p className="empty-note">No finished games yet for {name}.</p>
        <p className="hint">
          Assign this profile to a seat on the setup screen, then play a game through to the end — stats appear here
          once it finishes.
        </p>
      </div>
    );
  }

  const s = report.stats;

  // --- plain-language framing ------------------------------------------------
  //
  // The numbers above are always shown as measured. These sentences are not:
  // calling someone a "gut player" off one split call would be a slur dressed
  // up as analysis, so each line waits for enough hands to mean anything.
  const MIN_SPLIT_CALLS = 10;
  const MIN_PREDICTIONS = 15;

  const countingLine = (() => {
    if (s.countingSkill === null || s.decidableDivergentDecisions < MIN_SPLIT_CALLS) {
      const n = s.decidableDivergentDecisions;
      return `Only ${n} hand${n === 1 ? '' : 's'} so far where the deck disagreed with instinct — too few to call yet.`;
    }
    const p = Math.round(s.countingSkill * 100);
    if (p >= 70) return `Strong counter — when the deck disagrees with gut instinct, ${name} follows the deck.`;
    if (p >= 45) return `Mixed — ${name} sometimes reads the deck, sometimes goes with the gut.`;
    return `Gut player — ${name} tends to trust instinct even when the deck says otherwise.`;
  })();

  const stoppingLine = (() => {
    if (s.avgScoreAtStop === null || s.avgPotAtBust === null) return null;
    const gap = s.avgPotAtBust - s.avgScoreAtStop;
    if (Math.abs(gap) < 0.5) return 'Banking and busting at about the same pot size — evenly matched.';
    return gap > 0
      ? 'Pots lost to busts run bigger than pots banked — a little more caution would pay.'
      : 'Banking earlier than the busts land — disciplined, maybe leaving a bit on the table.';
  })();

  const biasLine = (() => {
    if (!s.signatureBias || s.totalPredictions < MIN_PREDICTIONS) return null;
    const { leaning, bias } = s.signatureBias;
    if (leaning === 'balanced') return 'Calls match and no-match about as often as the deck warrants.';
    return `Leans ${leaning === 'match' ? '“Match”' : '“No Match”'} — ${pct(Math.abs(bias))} more than the deck justifies.`;
  })();

  const usefulBuckets = s.calibration.filter((b) => b.count > 0);

  return (
    <div className="stats-view">
      <p className="stats-summary">
        <strong>{report.gameCount}</strong> game{report.gameCount === 1 ? '' : 's'} ·{' '}
        <strong>{s.totalPredictions}</strong> prediction{s.totalPredictions === 1 ? '' : 's'} ·{' '}
        <strong>{s.turnsTaken}</strong> turn{s.turnsTaken === 1 ? '' : 's'}
      </p>

      <Section title="Guessing">
        <Stat label="Accuracy" value={pct(s.accuracy)} />
        <Stat label="Correct" value={int(s.correctGuesses)} />
        <Stat label="Wrong" value={int(s.incorrectGuesses)} />
        <Stat label="Matcha-Matchas" value={int(s.matchaBusts)} />
        <Stat label="Free Spaces" value={int(s.freeSpaceCount)} />
      </Section>

      <Section title="Prediction style" blurb={biasLine}>
        <Stat label="Called “Match”" value={pct(s.pctMatch)} />
        <Stat label="Called “No Match”" value={pct(s.pctNoMatch)} />
      </Section>

      <Section title="Card counting" blurb={countingLine}>
        <Stat label="Intuition" value={pct(s.intuitionScore)} />
        <Stat label="Counting" value={pct(s.countingScore)} />
        <Stat label="Difference" value={signedPct(s.instinctVsCountingDelta)} />
        <Stat label="Counting skill" value={pct(s.countingSkill)} />
        <Stat
          label="Judged over"
          value={`${int(s.decidableDivergentDecisions)} split call${s.decidableDivergentDecisions === 1 ? '' : 's'}`}
          wide
        />
      </Section>

      <Section
        title="Risk & boldness"
        blurb={
          s.boldnessIndex === null
            ? null
            : `Pressed on with an average ${pct(s.boldnessIndex)} chance of an instant bust.`
        }
      >
        <Stat label="Pushes" value={int(s.pressCount)} />
        <Stat label="Avg pot at risk" value={num(s.avgPotAtRisk)} />
        <Stat label="Total wagered" value={int(s.totalWagered)} />
        <Stat label="Boldness" value={pct(s.boldnessIndex)} />
        <Stat label="Banked" value={int(s.totalPointsBanked)} />
        <Stat label="Lost to busts" value={int(s.pointsLostToBusts)} />
        <Stat label="Risk payoff" value={s.riskEfficiency === null ? '—' : `${num(s.riskEfficiency, 2)}×`} wide />
      </Section>

      <Section title="Stopping" blurb={stoppingLine}>
        <Stat label="Banks" value={int(s.voluntaryBankCount)} />
        <Stat label="Avg score banked" value={num(s.avgScoreAtStop)} />
        <Stat label="Busts" value={int(s.bustCount)} />
        <Stat label="Avg pot lost" value={num(s.avgPotAtBust)} />
        <Stat label="Banks refused" value={int(s.refusedBankCount)} />
        <Stat label="Refusal rate" value={pct(s.refusedBankRate)} />
      </Section>

      <Section title="Steeping">
        <Stat label="Steeps" value={int(s.steepCount)} />
        <Stat label="Steep rate" value={pct(s.steepRate)} />
        <Stat label="Avg pot steeped" value={num(s.avgSteepedPotSize)} />
        <Stat label="Survived" value={pct(s.steepSurvivalRate)} />
        <Stat label="Avg rescued" value={num(s.avgPointsRescued)} />
      </Section>

      <Section title="Luck" blurb="Nothing to learn from these — the deck simply did this.">
        <Stat label="Last Sip wipeouts" value={int(s.failedBankCount)} />
        <Stat label="Points lost to them" value={int(s.pointsLostToFailedBanks)} />
        <Stat label="Avg Last Sip bank" value={num(s.avgScoreAtLastSip)} />
      </Section>

      <Section title="Streaks">
        <Stat label="Best run" value={int(s.longestCorrectStreak)} />
        <Stat label="Worst run" value={int(s.longestIncorrectStreak)} />
        <Stat label="Best in one game" value={int(s.bestGameCorrectStreak)} />
      </Section>

      {s.nemesisCard && (
        <p className="flavour-line">
          Nemesis: <strong>{cardName(s.nemesisCard.cardId)}</strong> has ended {name}&rsquo;s turn{' '}
          {s.nemesisCard.count} time{s.nemesisCard.count === 1 ? '' : 's'}.
        </p>
      )}

      {usefulBuckets.length > 0 && (
        <section className="stat-section">
          <h3 className="stat-heading">Calibration</h3>
          <p className="stat-blurb">
            How often the guess came in, against how often the deck said it should. Close bars mean a good read on the
            odds.
          </p>
          <div className="calibration">
            {usefulBuckets.map((b) => (
              <div key={b.from} className="calib-row">
                <span className="calib-label">
                  {Math.round(b.from * 100)}–{Math.round(b.to * 100)}%
                </span>
                <div className="calib-bars">
                  <div className="calib-bar expected" style={{ width: `${(b.expectedRate ?? 0) * 100}%` }} />
                  <div className="calib-bar actual" style={{ width: `${(b.actualRate ?? 0) * 100}%` }} />
                </div>
                <span className="calib-value">
                  {pct(b.actualRate)} <span className="dim">vs {pct(b.expectedRate)}</span>
                </span>
              </div>
            ))}
          </div>
          <p className="calib-key">
            <span className="swatch expected" /> deck says <span className="swatch actual" /> actually happened
          </p>
        </section>
      )}
    </div>
  );
}
