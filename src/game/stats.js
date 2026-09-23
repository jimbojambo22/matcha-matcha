// Matcha! Matcha! — pure stats aggregator.
//
// Takes the ordered record stream the replay harness produces and folds it
// into a player's profile numbers. Pure, DOM-free, dependency-free beyond
// ./probability.js, so the same aggregator runs in the browser, in Vitest, or
// server-side against an authoritative record.
//
// One aggregator serves both scopes: feed it one game's records for a single
// game, or every game a profile ever played (concatenated in chronological
// order) for all-time numbers. Filter to one player first — recordsForPlayer()
// does that while keeping the structural markers the walk depends on.
//
// Every denominator is guarded: a stat with no data to stand on is null, not
// NaN and not a misleading zero.

import { analyseDecision } from './probability.js';

// --- small helpers ----------------------------------------------------------

const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const mean = (xs) => (xs.length === 0 ? null : sum(xs) / xs.length);
const ratio = (a, b) => (b === 0 ? null : a / b);

/**
 * Narrow a record stream to one player, keeping the structural markers
 * (roundBoundary, gameEnd) that carry no player but drive steep survival and
 * per-game segmentation.
 */
export function recordsForPlayer(records, player) {
  return records.filter((r) => r.player === player || r.player === undefined);
}

// --- the aggregator ---------------------------------------------------------

/**
 * @param {object[]} records ordered records, already filtered to one player
 * @param {object} [options]
 * @param {number} [options.foreseeableBustThreshold=0.25] trueBustProb at or
 *   above which a bust counts as foreseeable rather than unlucky
 * @param {number} [options.calibrationBuckets=5] buckets across [0,1]
 */
export function computeStats(records, options = {}) {
  const { foreseeableBustThreshold = 0.25, calibrationBuckets = 5 } = options;

  const predictions = records.filter((r) => r.kind === 'prediction');
  // Probability work happens once, here; nothing downstream re-replays.
  const decisions = predictions.map((p) => ({ ...p, ...analyseDecision(p.context, p.guess) }));

  const stops = records.filter((r) => r.kind === 'stop');
  const voluntaryStops = stops.filter((r) => r.voluntary);
  const forcedStops = stops.filter((r) => !r.voluntary);
  const busts = records.filter((r) => r.kind === 'bust');
  const refusedBanks = records.filter((r) => r.kind === 'bankRefused');
  const failedBanks = records.filter((r) => r.kind === 'bankFailed');
  const steeps = records.filter((r) => r.kind === 'steep');

  const walk = walkStream(records);

  // --- guessing -------------------------------------------------------------
  const correctGuesses = decisions.filter((d) => d.resolvedCorrect === true).length;
  const incorrectGuesses = decisions.filter((d) => d.resolvedCorrect === false).length;
  const matchaBusts = decisions.filter((d) => d.revealedCategory === 'MATCHA').length;
  const freeSpaceCount = decisions.filter((d) => d.revealedCategory === 'FREE_SPACE').length;

  // --- prediction distribution ---------------------------------------------
  const matchCalls = decisions.filter((d) => d.guess === 'match').length;
  const noMatchCalls = decisions.filter((d) => d.guess === 'nomatch').length;

  // --- alignment ------------------------------------------------------------
  // A Last Sip resolves nothing, so it cannot be aligned with anything. A Free
  // Space stays in: a real prediction was made against real odds.
  const aligned = decisions.filter((d) => d.revealedCategory !== 'LAST_SIP');
  const alignedTrue = aligned.filter((d) => d.trueAlignedPick !== null);

  const naiveHits = aligned.filter((d) => d.guess === d.naiveAlignedPick).length;
  const trueHits = alignedTrue.filter((d) => d.guess === d.trueAlignedPick).length;
  const naiveAlignmentRate = ratio(naiveHits, aligned.length);
  const trueAlignmentRate = ratio(trueHits, alignedTrue.length);

  // The sharp measure: only where gut and counting actually disagree.
  const divergent = alignedTrue.filter((d) => d.naiveAlignedPick !== d.trueAlignedPick);

  // Roughly a third of divergent spots are true-ties, where the count favours
  // neither side. No prediction can ever equal 'tie', so those are unwinnable
  // and must not sit in the denominator — with them in, simulated perfect
  // play scores 64.7% instead of 100%. Decidable-only is the canonical figure.
  const decidable = divergent.filter((d) => d.trueAlignedPick !== 'tie');
  const countingSkill = ratio(decidable.filter((d) => d.guess === d.trueAlignedPick).length, decidable.length);
  // Tie-inclusive, kept for debugging only. Never show this one.
  const countingSkillRaw = ratio(divergent.filter((d) => d.guess === d.trueAlignedPick).length, divergent.length);

  // --- risk & boldness ------------------------------------------------------
  // A press is choosing to continue; the forced first prediction of a turn is
  // not a decision to risk anything.
  const presses = decisions.filter((d) => !d.isFirstPredictionOfTurn);
  const totalPointsBanked = sum(stops.map((r) => r.points));
  const pointsLostToBusts = sum(busts.map((r) => r.potSize));

  // --- steeping -------------------------------------------------------------
  const cashedSteeps = walk.steepOutcomes.filter((o) => o === 'cashed').length;
  const rescuedBanks = stops.filter((r) => r.turnFromSteep);

  const stats = {
    // Guessing
    totalPredictions: decisions.length,
    correctGuesses,
    incorrectGuesses,
    accuracy: ratio(correctGuesses, correctGuesses + incorrectGuesses),
    matchaBusts,
    freeSpaceCount, // exposed so Free-Space accuracy inflation stays visible

    // Prediction distribution (over every prediction, Last Sip included —
    // the call was still made)
    pctMatch: ratio(matchCalls, decisions.length),
    pctNoMatch: ratio(noMatchCalls, decisions.length),

    // Alignment & card counting
    naiveAlignmentRate,
    trueAlignmentRate,
    intuitionScore: naiveAlignmentRate,
    countingScore: trueAlignmentRate,
    instinctVsCountingDelta:
      trueAlignmentRate === null || naiveAlignmentRate === null ? null : trueAlignmentRate - naiveAlignmentRate,
    countingSkill, // canonical: unwinnable ties excluded
    countingSkillRaw, // debugging only
    divergentDecisions: divergent.length,
    decidableDivergentDecisions: decidable.length,
    // Ties are counted as misaligned (no guess can match a dead heat);
    // surfaced so an unexpectedly low alignment rate is explainable.
    naiveTieCount: aligned.filter((d) => d.naiveAlignedPick === 'tie').length,
    trueTieCount: alignedTrue.filter((d) => d.trueAlignedPick === 'tie').length,

    // Risk & boldness
    pressCount: presses.length,
    avgPotAtRisk: mean(presses.map((d) => d.potSizeBefore)),
    totalWagered: sum(presses.map((d) => d.potSizeBefore)),
    totalPointsBanked,
    pointsLostToBusts, // busts only — a failed bank is variance, not boldness
    riskEfficiency: ratio(totalPointsBanked, pointsLostToBusts),
    boldnessIndex: mean(presses.filter((d) => d.trueBustProb !== null).map((d) => d.trueBustProb)),

    // Stopping discipline
    voluntaryBankCount: voluntaryStops.length,
    avgScoreAtStop: mean(voluntaryStops.map((r) => r.points)),
    avgScoreAtLastSip: mean(forcedStops.map((r) => r.points)),
    bustCount: busts.length,
    avgPotAtBust: mean(busts.map((r) => r.potSize)),
    refusedBankCount: refusedBanks.length,
    refusedBankRate: ratio(refusedBanks.length, voluntaryStops.length + refusedBanks.length),

    // Variance / luck — no decision to grade here
    failedBankCount: failedBanks.length,
    pointsLostToFailedBanks: sum(failedBanks.map((r) => r.potSize)),

    // Steeping
    turnsTaken: walk.turnsTaken,
    steepCount: steeps.length,
    steepRate: ratio(steeps.length, walk.turnsTaken),
    avgSteepedPotSize: mean(steeps.map((r) => r.potSize)), // total preserved, incl. kept top card
    steepSurvivalRate: ratio(cashedSteeps, walk.steepOutcomes.length),
    avgPointsRescued: mean(rescuedBanks.map((r) => r.points)),

    // Streaks
    longestCorrectStreak: walk.longestCorrect,
    longestIncorrectStreak: walk.longestIncorrect,
    bestGameCorrectStreak: walk.bestGameCorrect,
    bestGameIncorrectStreak: walk.bestGameIncorrect,
  };

  return { ...stats, ...niceToHave(decisions, busts, aligned, { foreseeableBustThreshold, calibrationBuckets }) };
}

// --- sequential walk --------------------------------------------------------
//
// Anything order-dependent — streaks, steep survival, turn counting — is done
// in one pass so the ordering rules live in exactly one place.

function walkStream(records) {
  // Games are identified by the gameId the harness stamps on every record.
  // gameSeq is the fallback for hand-built streams that carry no id, and is
  // advanced by gameEnd markers.
  let gameSeq = 0;
  let lastGameId;
  const turnKeys = new Set();

  // Streaks run continuously across turns, rounds AND games (all-time); the
  // per-game trackers reset at each gameEnd so a best-game figure survives.
  let runCorrect = 0;
  let runIncorrect = 0;
  let longestCorrect = 0;
  let longestIncorrect = 0;
  let gameCorrect = 0;
  let gameIncorrect = 0;
  let bestGameCorrect = 0;
  let bestGameIncorrect = 0;

  // Steeped pots stay pending until something settles them. Consecutive
  // steeps chain: the pot is still alive, so they all settle together.
  let pending = 0;
  const steepOutcomes = [];
  const settle = (outcome) => {
    for (let i = 0; i < pending; i++) steepOutcomes.push(outcome);
    pending = 0;
  };

  for (const r of records) {
    // A new gameId means a new game, even with no gameEnd marker between them
    // (an abandoned or partial record). Without this, turn 0 of the next game
    // would merge into turn 0 of the last one.
    if (r.gameId !== undefined && lastGameId !== undefined && r.gameId !== lastGameId) {
      settle('lost'); // pots never carry from one game into another
      gameSeq += 1;
      gameCorrect = 0;
      gameIncorrect = 0;
    }
    if (r.gameId !== undefined) lastGameId = r.gameId;

    if (r.player !== undefined && r.turnIndex !== undefined) {
      // turnIndex restarts per game, so scope it by game.
      turnKeys.add(`${r.gameId ?? gameSeq}:${r.turnIndex}`);
    }

    switch (r.kind) {
      case 'prediction':
        if (r.resolvedCorrect === true) {
          runCorrect += 1;
          gameCorrect += 1;
          runIncorrect = 0;
          gameIncorrect = 0;
          longestCorrect = Math.max(longestCorrect, runCorrect);
          bestGameCorrect = Math.max(bestGameCorrect, gameCorrect);
        } else if (r.resolvedCorrect === false) {
          runIncorrect += 1;
          gameIncorrect += 1;
          runCorrect = 0;
          gameCorrect = 0;
          longestIncorrect = Math.max(longestIncorrect, runIncorrect);
          bestGameIncorrect = Math.max(bestGameIncorrect, gameIncorrect);
        }
        // resolvedCorrect === null (Last Sip): neutral, skipped entirely.
        break;

      case 'steep':
        pending += 1;
        break;

      case 'stop':
        settle('cashed');
        break;

      case 'bust':
      case 'bankFailed':
        settle('lost');
        break;

      // A refused bank is non-terminal: the turn continues and the pot is
      // untouched, so it settles nothing.
      case 'bankRefused':
        break;

      // The round-2 reshuffle wipes every steeped pot.
      case 'roundBoundary':
        settle('lost');
        break;

      case 'gameEnd':
        settle('lost'); // still steeping when the game ended = never cashed
        gameSeq += 1;
        gameCorrect = 0;
        gameIncorrect = 0;
        break;

      default:
        break;
    }
  }

  settle('lost'); // stream ended mid-steep

  return {
    turnsTaken: turnKeys.size,
    longestCorrect,
    longestIncorrect,
    bestGameCorrect,
    bestGameIncorrect,
    steepOutcomes,
  };
}

// --- nice-to-have -----------------------------------------------------------

function niceToHave(decisions, busts, aligned, { foreseeableBustThreshold, calibrationBuckets }) {
  const withTrue = aligned.filter((d) => d.trueCorrectProb !== null);

  // Calibration: bucket by modelled P(correct), compare to what happened.
  const buckets = Array.from({ length: calibrationBuckets }, (_, i) => ({
    from: i / calibrationBuckets,
    to: (i + 1) / calibrationBuckets,
    count: 0,
    expected: 0,
    correct: 0,
  }));
  for (const d of withTrue) {
    const idx = Math.min(calibrationBuckets - 1, Math.floor(d.trueCorrectProb * calibrationBuckets));
    buckets[idx].count += 1;
    buckets[idx].expected += d.trueCorrectProb;
    if (d.resolvedCorrect === true) buckets[idx].correct += 1;
  }
  const calibration = buckets.map((b) => ({
    from: b.from,
    to: b.to,
    count: b.count,
    expectedRate: ratio(b.expected, b.count),
    actualRate: ratio(b.correct, b.count),
  }));

  // Bust avoidability: was the risk visible at the moment of the press?
  // Each bust is caused by the prediction immediately preceding it.
  const bustCauses = [];
  for (const d of decisions) {
    if (d.resolvedCorrect === false) bustCauses.push(d);
  }
  const scoredCauses = bustCauses.filter((d) => d.trueBustProb !== null);
  const foreseeable = scoredCauses.filter((d) => d.trueBustProb >= foreseeableBustThreshold).length;

  // Nemesis: the card that has ended this player's turns most often.
  const bustsByCard = new Map();
  for (const d of bustCauses) {
    const id = d.revealedCard?.id;
    if (id) bustsByCard.set(id, (bustsByCard.get(id) ?? 0) + 1);
  }
  let nemesisCard = null;
  for (const [id, count] of bustsByCard) {
    if (!nemesisCard || count > nemesisCard.count) nemesisCard = { cardId: id, count };
  }

  // Signature bias: how far the player's leaning sits from reality.
  const withBase = aligned.filter((d) => d.trueMatchBaseRate !== null);
  const predictedMatchRate = ratio(aligned.filter((d) => d.guess === 'match').length, aligned.length);
  const expectedMatchRate = mean(withBase.map((d) => d.trueMatchBaseRate));
  const bias =
    predictedMatchRate === null || expectedMatchRate === null ? null : predictedMatchRate - expectedMatchRate;

  // Clutch: does accuracy hold up when the second round's stakes land?
  const accuracyForRound = (round) => {
    const inRound = decisions.filter((d) => d.round === round && d.resolvedCorrect !== null);
    return ratio(inRound.filter((d) => d.resolvedCorrect).length, inRound.length);
  };
  const round1Accuracy = accuracyForRound(1);
  const round2Accuracy = accuracyForRound(2);

  return {
    calibration,
    bustAvoidability: {
      threshold: foreseeableBustThreshold,
      scored: scoredCauses.length,
      foreseeable,
      unlucky: scoredCauses.length - foreseeable,
      foreseeableRate: ratio(foreseeable, scoredCauses.length),
    },
    nemesisCard,
    signatureBias:
      bias === null
        ? null
        : {
            predictedMatchRate,
            expectedMatchRate,
            bias,
            leaning: Math.abs(bias) < 0.05 ? 'balanced' : bias > 0 ? 'match' : 'nomatch',
          },
    clutchFactor: {
      round1Accuracy,
      round2Accuracy,
      delta: round1Accuracy === null || round2Accuracy === null ? null : round2Accuracy - round1Accuracy,
    },
  };
}

// --- LATER ------------------------------------------------------------------
//
// Deliberately not built yet:
//
// * EV-lost per decision — needs a stop/press expected-value model: at each
//   decision, EV(press) = P(survive) * (pot + 1) - P(bust) * pot, compared
//   against EV(stop) = pot. Summing (best EV - chosen EV) gives points thrown
//   away by decision-making rather than by luck. Blocked on deciding how
//   steeping is valued, since it is neither pressing nor banking.
//
// * Left-on-the-table / regret — counterfactual replay past the stop point.
//   Feasible because the deck is deterministic: re-run from the stop decision
//   with the real remaining pile and see what pressing on would have paid.
//   Needs a policy for what the counterfactual player would have done next.
//
// * Tilt indicator — accuracy over the N predictions following a bust versus
//   the player's baseline. The record stream already carries everything
//   needed (busts and predictions are ordered); it is only a question of
//   choosing N and a significance floor so small samples do not scream tilt.
