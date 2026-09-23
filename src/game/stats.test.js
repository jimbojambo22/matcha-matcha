// Phase 2: the stats aggregator. Each CORE stat gets a hand-built fixture
// where the right answer is obvious by inspection, then two real scripted
// games are replayed end-to-end to prove the same numbers survive the harness.
import { describe, it, expect } from 'vitest';
import { createGame, applyAction, getLegalActions, visibleSuits, visibleNumbers } from './engine.js';
import { replayGame } from './replay.js';
import { computeStats, recordsForPlayer } from './stats.js';
import { classifyAll, alignedPick } from './probability.js';

/** Deterministic RNG so the perfect-counter fixture is reproducible. */
function seededRng(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const N = (suit, number) => ({ id: `${suit}-${number}`, kind: 'number', suit, number });
const LS = () => ({ id: 'special-lastSip', kind: 'special', name: 'lastSip' });
const FS = (i = 1) => ({ id: `special-freeSpace-${i}`, kind: 'special', name: 'freeSpace' });

// --- fixture builders -------------------------------------------------------

/**
 * A prediction record. `remaining` drives the true model; leaving it empty
 * makes the true model degenerate, so tests that care pass a real pile.
 */
function pred(over = {}) {
  const {
    player = 0,
    round = 1,
    turnIndex = 0,
    isFirst = true,
    potSizeBefore = 1,
    guess = 'match',
    category = 'MATCH',
    correct = true,
    card = N('leaf', 1),
    suits = ['leaf'],
    numbers = [1],
    remaining = [N('leaf', 2)],
    ownPot = [],
    turnFromSteep = false,
  } = over;
  return {
    kind: 'prediction',
    player,
    round,
    turnIndex,
    isFirstPredictionOfTurn: isFirst,
    turnFromSteep,
    potSizeBefore,
    guess,
    revealedCard: card,
    revealedCategory: category,
    resolvedCorrect: correct,
    context: { visibleSuits: suits, visibleNumbers: numbers, remaining, ownPot },
  };
}

const stop = (o = {}) => ({
  kind: 'stop',
  player: 0,
  round: 1,
  turnIndex: 0,
  turnFromSteep: false,
  via: null,
  voluntary: true,
  points: 3,
  potSize: 3,
  token: null,
  ...o,
});
const steep = (o = {}) => ({
  kind: 'steep',
  player: 0,
  round: 1,
  turnIndex: 0,
  turnFromSteep: false,
  potSize: 3,
  hiddenPotSize: 2,
  ...o,
});
const bust = (o = {}) => ({
  kind: 'bust',
  player: 0,
  round: 1,
  turnIndex: 0,
  turnFromSteep: false,
  bustReason: 'wrong',
  potSize: 4,
  ...o,
});
const refused = (o = {}) => ({ kind: 'bankRefused', player: 0, round: 1, turnIndex: 0, potSize: 2, ...o });
const failed = (o = {}) => ({ kind: 'bankFailed', player: 0, round: 1, turnIndex: 0, potSize: 5, ...o });
const roundBoundary = () => ({ kind: 'roundBoundary', round: 2, turnIndex: 0 });
const gameEnd = () => ({ kind: 'gameEnd', round: 2, turnIndex: 0, results: null });

// --- guessing ---------------------------------------------------------------

describe('guessing stats', () => {
  it('counts correct, incorrect, accuracy, matcha busts and free spaces', () => {
    const s = computeStats([
      pred({ correct: true, category: 'MATCH' }),
      pred({ correct: true, category: 'NOMATCH' }),
      pred({ correct: false, category: 'MATCHA' }),
      pred({ correct: false, category: 'NOMATCH' }),
      pred({ correct: true, category: 'FREE_SPACE' }),
    ]);

    expect(s.correctGuesses).toBe(3); // includes the Free Space
    expect(s.incorrectGuesses).toBe(2); // includes the Matcha
    expect(s.accuracy).toBeCloseTo(3 / 5);
    expect(s.matchaBusts).toBe(1);
    expect(s.freeSpaceCount).toBe(1);
  });

  it('excludes Last Sip reveals from accuracy entirely', () => {
    const s = computeStats([
      pred({ correct: true }),
      pred({ correct: false }),
      pred({ correct: null, category: 'LAST_SIP' }),
      pred({ correct: null, category: 'LAST_SIP' }),
    ]);

    expect(s.totalPredictions).toBe(4);
    expect(s.correctGuesses).toBe(1);
    expect(s.incorrectGuesses).toBe(1);
    expect(s.accuracy).toBeCloseTo(0.5); // 2 Last Sips ignored
  });

  it('accuracy is null rather than NaN with nothing to score', () => {
    expect(computeStats([]).accuracy).toBeNull();
    expect(computeStats([pred({ correct: null, category: 'LAST_SIP' })]).accuracy).toBeNull();
  });
});

describe('prediction distribution', () => {
  it('splits match vs no-match over every prediction', () => {
    const s = computeStats([
      pred({ guess: 'match' }),
      pred({ guess: 'match' }),
      pred({ guess: 'match' }),
      pred({ guess: 'nomatch' }),
    ]);
    expect(s.pctMatch).toBeCloseTo(0.75);
    expect(s.pctNoMatch).toBeCloseTo(0.25);
  });

  it('is null with no predictions', () => {
    expect(computeStats([]).pctMatch).toBeNull();
  });
});

// --- alignment --------------------------------------------------------------

describe('alignment and card counting', () => {
  // A pile that is overwhelmingly NOMATCH against suits {leaf}, numbers {1}.
  const nomatchPile = [N('whisk', 7), N('whisk', 8), N('teapot', 7), N('teapot', 8)];
  // A pile that is overwhelmingly MATCH (all share the live suit).
  const matchPile = [N('leaf', 5), N('leaf', 6), N('leaf', 7), N('leaf', 8)];

  it('scores a guess against the true pile', () => {
    const s = computeStats([
      pred({ guess: 'nomatch', remaining: nomatchPile }), // aligned
      pred({ guess: 'match', remaining: nomatchPile }), // misaligned
    ]);
    expect(s.trueAlignmentRate).toBeCloseTo(0.5);
    expect(s.countingScore).toBe(s.trueAlignmentRate);
  });

  it('includes Free Space predictions but excludes Last Sip ones', () => {
    const s = computeStats([
      pred({ guess: 'nomatch', remaining: nomatchPile, category: 'FREE_SPACE', correct: true }),
      pred({ guess: 'nomatch', remaining: nomatchPile, category: 'LAST_SIP', correct: null }),
    ]);
    // Only the Free Space counts: 1 of 1 aligned.
    expect(s.trueAlignmentRate).toBe(1);
  });

  it('isolates genuine counting where gut and pile disagree', () => {
    // Own pile empty -> naive sees a full deck -> naive says 'nomatch'.
    // True pile is all leaf -> true says 'match'. They diverge.
    const divergent = { remaining: matchPile, ownPot: [] };
    const s = computeStats([
      pred({ guess: 'match', ...divergent }), // followed the count
      pred({ guess: 'match', ...divergent }), // followed the count
      pred({ guess: 'nomatch', ...divergent }), // followed the gut
    ]);

    expect(s.divergentDecisions).toBe(3);
    expect(s.countingSkill).toBeCloseTo(2 / 3);
    expect(s.instinctVsCountingDelta).toBeCloseTo(s.countingScore - s.intuitionScore);
  });

  it('countingSkill excludes unwinnable ties; countingSkillRaw keeps them', () => {
    const matchPileLocal = [N('leaf', 5), N('leaf', 6)]; // both MATCH -> 'match'
    const tiePile = [N('leaf', 5), N('whisk', 7)]; // 1 MATCH, 1 NOMATCH -> 'tie'

    const s = computeStats([
      pred({ guess: 'match', remaining: matchPileLocal }), // divergent, decidable, correct
      pred({ guess: 'match', remaining: tiePile }), // divergent but a tie: unwinnable
    ]);

    expect(s.divergentDecisions).toBe(2);
    expect(s.decidableDivergentDecisions).toBe(1);
    expect(s.countingSkill).toBe(1); // played every decidable spot right
    expect(s.countingSkillRaw).toBeCloseTo(0.5); // dragged down by the tie
  });

  it('reports ties, which no guess can align with', () => {
    const evenPile = [N('leaf', 5), N('whisk', 7)]; // 1 MATCH, 1 NOMATCH
    const s = computeStats([pred({ guess: 'match', remaining: evenPile })]);

    expect(s.trueTieCount).toBe(1);
    expect(s.trueAlignmentRate).toBe(0); // a tie can never be matched
  });

  it('falls back to naive-only when the pile was redacted', () => {
    const s = computeStats([pred({ guess: 'nomatch', remaining: null })]);
    expect(s.intuitionScore).not.toBeNull();
    expect(s.countingScore).toBeNull();
    expect(s.instinctVsCountingDelta).toBeNull();
    expect(s.countingSkill).toBeNull();
  });
});

// --- risk & boldness --------------------------------------------------------

describe('risk and boldness', () => {
  it('counts only presses, never the forced first prediction of a turn', () => {
    const s = computeStats([
      pred({ isFirst: true, potSizeBefore: 1 }),
      pred({ isFirst: false, potSizeBefore: 3 }),
      pred({ isFirst: false, potSizeBefore: 5 }),
    ]);

    expect(s.pressCount).toBe(2);
    expect(s.avgPotAtRisk).toBeCloseTo(4);
    expect(s.totalWagered).toBe(8);
  });

  it('riskEfficiency weighs points banked against points lost to busts', () => {
    const s = computeStats([stop({ points: 10 }), stop({ points: 5 }), bust({ potSize: 3 })]);
    expect(s.totalPointsBanked).toBe(15);
    expect(s.pointsLostToBusts).toBe(3);
    expect(s.riskEfficiency).toBeCloseTo(5);
  });

  it('riskEfficiency is null, not Infinity, when nothing was ever lost', () => {
    expect(computeStats([stop({ points: 10 })]).riskEfficiency).toBeNull();
  });

  it('a failed bank is variance and never counts as a bust loss', () => {
    const s = computeStats([failed({ potSize: 7 }), bust({ potSize: 2 })]);
    expect(s.pointsLostToBusts).toBe(2); // the 7 is excluded
    expect(s.failedBankCount).toBe(1);
    expect(s.pointsLostToFailedBanks).toBe(7);
  });

  it('boldnessIndex averages the real bust risk accepted on presses', () => {
    // 2 of 4 cards are an instant bust against suits {leaf} numbers {1}.
    const risky = [N('leaf', 1), N('leaf', 1), N('whisk', 7), N('whisk', 8)];
    const s = computeStats([
      pred({ isFirst: true, remaining: risky }), // ignored: not a press
      pred({ isFirst: false, remaining: risky }),
      pred({ isFirst: false, remaining: [N('whisk', 7)] }), // zero risk
    ]);
    expect(s.boldnessIndex).toBeCloseTo((0.5 + 0) / 2);
  });
});

// --- stopping discipline ----------------------------------------------------

describe('stopping discipline', () => {
  it('averages voluntary stops separately from forced Last Sip banks', () => {
    const s = computeStats([
      stop({ points: 4, voluntary: true, via: null }),
      stop({ points: 8, voluntary: true, via: null }),
      stop({ points: 2, voluntary: false, via: 'lastSip' }),
    ]);

    expect(s.voluntaryBankCount).toBe(2);
    expect(s.avgScoreAtStop).toBeCloseTo(6); // forced bank excluded
    expect(s.avgScoreAtLastSip).toBeCloseTo(2);
  });

  it('contrasts average stop with average bust', () => {
    const s = computeStats([stop({ points: 3 }), bust({ potSize: 9 }), bust({ potSize: 7 })]);
    expect(s.avgScoreAtStop).toBeCloseTo(3);
    expect(s.avgPotAtBust).toBeCloseTo(8);
  });

  it('refused banks are a discipline signal and do not end the turn', () => {
    const s = computeStats([refused(), refused(), refused(), stop({ points: 5 })]);
    expect(s.refusedBankCount).toBe(3);
    expect(s.refusedBankRate).toBeCloseTo(3 / 4); // 3 refused of 4 stop attempts
  });

  it('refusedBankRate is null when the player never tried to bank', () => {
    expect(computeStats([pred()]).refusedBankRate).toBeNull();
  });
});

// --- steeping ---------------------------------------------------------------

describe('steeping', () => {
  it('rates steeps against every turn taken, including zero-prediction turns', () => {
    const s = computeStats([
      pred({ turnIndex: 0 }),
      steep({ turnIndex: 0 }),
      // A turn with no prediction at all (opening-deal Last Sip).
      stop({ turnIndex: 1, points: 1, voluntary: false, via: 'lastSip' }),
      pred({ turnIndex: 2 }),
      stop({ turnIndex: 2 }),
    ]);

    expect(s.turnsTaken).toBe(3);
    expect(s.steepCount).toBe(1);
    expect(s.steepRate).toBeCloseTo(1 / 3);
  });

  it('uses the total preserved pot, not the hidden-only count', () => {
    const s = computeStats([steep({ potSize: 4, hiddenPotSize: 3 }), steep({ potSize: 2, hiddenPotSize: 1 })]);
    expect(s.avgSteepedPotSize).toBeCloseTo(3); // (4 + 2) / 2, not (3 + 1) / 2
  });

  it('counts a steep as survived when it is later banked', () => {
    const s = computeStats([steep(), stop({ turnFromSteep: true, points: 6 })]);
    expect(s.steepSurvivalRate).toBe(1);
    expect(s.avgPointsRescued).toBeCloseTo(6);
  });

  it('counts a steep as lost to a bust', () => {
    const s = computeStats([steep(), bust()]);
    expect(s.steepSurvivalRate).toBe(0);
  });

  it('counts a steep as lost at the round-2 reshuffle', () => {
    const s = computeStats([steep(), roundBoundary()]);
    expect(s.steepSurvivalRate).toBe(0);
  });

  it('counts a steep still pending at game end as lost', () => {
    const s = computeStats([steep(), gameEnd()]);
    expect(s.steepSurvivalRate).toBe(0);
  });

  it('a failed bank destroys the steeped pot', () => {
    const s = computeStats([steep(), failed()]);
    expect(s.steepSurvivalRate).toBe(0);
  });

  it('chained steeps settle together on the eventual outcome', () => {
    const s = computeStats([steep(), steep(), stop({ turnFromSteep: true })]);
    expect(s.steepSurvivalRate).toBe(1); // both pots ultimately cashed
    const lost = computeStats([steep(), steep(), bust()]);
    expect(lost.steepSurvivalRate).toBe(0);
  });

  it('mixes survived and lost steeps into a rate', () => {
    const s = computeStats([steep(), stop(), steep(), bust(), steep(), roundBoundary(), steep(), stop()]);
    expect(s.steepSurvivalRate).toBeCloseTo(0.5); // 2 cashed of 4
  });

  it('a refused bank settles nothing — the pot is still steeping', () => {
    const s = computeStats([steep(), refused(), bust()]);
    expect(s.steepSurvivalRate).toBe(0);
  });
});

// --- streaks ----------------------------------------------------------------

describe('streaks', () => {
  it('tracks the longest correct and incorrect runs', () => {
    const s = computeStats([
      pred({ correct: true }),
      pred({ correct: true }),
      pred({ correct: true }),
      pred({ correct: false }),
      pred({ correct: false }),
      pred({ correct: true }),
    ]);
    expect(s.longestCorrectStreak).toBe(3);
    expect(s.longestIncorrectStreak).toBe(2);
  });

  it('treats a Last Sip as neutral: it neither extends nor breaks a run', () => {
    const s = computeStats([
      pred({ correct: true }),
      pred({ correct: null, category: 'LAST_SIP' }),
      pred({ correct: true }),
    ]);
    expect(s.longestCorrectStreak).toBe(2); // the Last Sip is skipped over
  });

  it('spans turns and rounds', () => {
    const s = computeStats([
      pred({ correct: true, round: 1, turnIndex: 0 }),
      stop({ turnIndex: 0 }),
      pred({ correct: true, round: 2, turnIndex: 1 }),
    ]);
    expect(s.longestCorrectStreak).toBe(2);
  });

  it('reports all-time and best-single-game streaks from one stream', () => {
    const s = computeStats([
      // game 1: a run of 2
      pred({ correct: true }),
      pred({ correct: true }),
      gameEnd(),
      // game 2: a run of 3
      pred({ correct: true }),
      pred({ correct: true }),
      pred({ correct: true }),
      gameEnd(),
    ]);
    expect(s.bestGameCorrectStreak).toBe(3); // best within any single game
    expect(s.longestCorrectStreak).toBe(5); // all-time, spanning games
  });
});

// --- filtering --------------------------------------------------------------

describe('recordsForPlayer', () => {
  it('keeps one player plus the structural markers', () => {
    const records = [
      pred({ player: 0 }),
      pred({ player: 1 }),
      steep({ player: 1 }),
      roundBoundary(),
      gameEnd(),
    ];
    const mine = recordsForPlayer(records, 1);

    expect(mine.filter((r) => r.kind === 'prediction')).toHaveLength(1);
    expect(mine.some((r) => r.kind === 'roundBoundary')).toBe(true);
    expect(mine.some((r) => r.kind === 'gameEnd')).toBe(true);
  });

  it('lets one player see their reshuffle loss without the other player', () => {
    const records = [steep({ player: 0 }), stop({ player: 1 }), roundBoundary()];
    // Player 1's stop must NOT cash player 0's steeped pot.
    const s = computeStats(recordsForPlayer(records, 0));
    expect(s.steepSurvivalRate).toBe(0);
  });
});

// --- full-game replays ------------------------------------------------------

/**
 * Free-scoring game exercising: a plain correct guess, a steep that survives,
 * a Free Space (auto-correct), a voluntary bank, a steep lost at the round-2
 * reshuffle, and a Matcha! Matcha! bust.
 */
function gameWithSteepsAndMatcha() {
  const snap = createGame({
    numPlayers: 1,
    scoringMode: 'free',
    deckFactory: (round) =>
      round === 1
        ? [
            N('leaf', 1), //   t0 deal
            N('cup', 2), //    t0 guess -> NOMATCH, correct
            FS(1), //          t1 guess -> FREE_SPACE
            N('whisk', 3), //  t2 deal
            N('teapot', 4), // t2 guess -> NOMATCH, correct
            N('teapot', 5),
            N('teapot', 6),
            N('teapot', 7),
            N('teapot', 8), // 4 spare -> next turn triggers round 2
          ]
        : [
            N('blossom', 5), // t3 deal
            N('cup', 6), //     t3 guess -> NOMATCH, correct
            N('cup', 5), //     t3 guess -> MATCHA (cup live, 5 live) -> bust
            N('leaf', 2),
            N('leaf', 3),
            N('leaf', 4),
            N('leaf', 7),
          ],
  });
  return {
    gameId: 'game-steeps',
    initialState: snap.state,
    actions: [
      { type: 'GUESS', guess: 'nomatch' }, // cup-2 correct
      { type: 'STEEP' }, // pot preserved
      { type: 'ADVANCE_TURN' }, // t1 opens from the steeped pot
      { type: 'GUESS', guess: 'match' }, // Free Space
      { type: 'PLACE_FREE_SPACE', stackIndex: null },
      { type: 'BANK' }, // cashes the steeped pot
      { type: 'ADVANCE_TURN' }, // t2
      { type: 'GUESS', guess: 'nomatch' }, // teapot-4 correct
      { type: 'STEEP' }, // this pot will die at the reshuffle
      { type: 'ADVANCE_TURN' }, // round 2 -> pots wiped
      { type: 'GUESS', guess: 'nomatch' }, // cup-6 correct
      { type: 'GUESS', guess: 'match' }, // cup-5 -> MATCHA -> bust
    ],
  };
}

/** Token-mode game exercising BANK_REFUSED and BANK_FAILED. */
function gameWithBankProblems() {
  const snap = createGame({
    numPlayers: 1,
    scoringMode: 'tokens',
    deckFactory: () => [N('leaf', 1), N('cup', 2), LS(), N('teapot', 6), N('teapot', 7), N('teapot', 8)],
  });
  // Only high tokens remain, so small banks are impossible.
  const initialState = { ...snap.state, availableTokens: [5, 6, 7, 8] };
  return {
    gameId: 'game-banks',
    initialState,
    actions: [
      { type: 'GUESS', guess: 'nomatch' }, // cup-2 correct, pot = 2
      { type: 'BANK' }, // 2 points, no 2-token -> REFUSED, turn continues
      { type: 'GUESS', guess: 'match' }, // Last Sip -> forced bank of 3 -> FAILED
    ],
  };
}

describe('full-game replays', () => {
  it('produces coherent stats for a game with steeps, a Free Space and a Matcha bust', () => {
    const { records } = replayGame(gameWithSteepsAndMatcha());
    const s = computeStats(recordsForPlayer(records, 0));

    // 5 predictions: cup-2, FS, teapot-4, cup-6, cup-5.
    expect(s.totalPredictions).toBe(5);
    expect(s.correctGuesses).toBe(4); // incl. the Free Space
    expect(s.incorrectGuesses).toBe(1); // the Matcha
    expect(s.freeSpaceCount).toBe(1);
    expect(s.matchaBusts).toBe(1);
    expect(s.accuracy).toBeCloseTo(0.8);

    // One steep cashed (banked on turn 1), one lost at the reshuffle.
    expect(s.steepCount).toBe(2);
    expect(s.steepSurvivalRate).toBeCloseTo(0.5);
    expect(s.avgPointsRescued).toBeCloseTo(3); // cup-2 + FS + 1 hidden

    expect(s.voluntaryBankCount).toBe(1);
    expect(s.avgScoreAtStop).toBeCloseTo(3);
    expect(s.bustCount).toBe(1);
    expect(s.pointsLostToBusts).toBe(2); // blossom-5 + cup-6 on the table

    // The bust came on a press; the first guess of each turn is not one.
    expect(s.pressCount).toBe(1);
    expect(s.boldnessIndex).toBeGreaterThan(0);

    // Every rate is a real number, never NaN.
    for (const key of ['accuracy', 'pctMatch', 'steepRate', 'intuitionScore', 'countingScore']) {
      expect(Number.isNaN(s[key])).toBe(false);
      expect(s[key]).not.toBeUndefined();
    }
  });

  it('separates a refused bank from a failed bank', () => {
    const { records } = replayGame(gameWithBankProblems());
    const s = computeStats(recordsForPlayer(records, 0));

    // Refused: tried to stop at 2 with no 2-token. Turn continued.
    expect(s.refusedBankCount).toBe(1);
    expect(s.voluntaryBankCount).toBe(0);
    expect(s.refusedBankRate).toBe(1);

    // Failed: Last Sip forced a 3-point bank that no token could satisfy.
    expect(s.failedBankCount).toBe(1);
    expect(s.pointsLostToFailedBanks).toBe(3);

    // Neither is a bust.
    expect(s.bustCount).toBe(0);
    expect(s.pointsLostToBusts).toBe(0);
    expect(s.riskEfficiency).toBeNull();
  });

  it('aggregates two games the way a profile would', () => {
    const a = replayGame(gameWithSteepsAndMatcha()).records;
    const b = replayGame(gameWithBankProblems()).records;
    const combined = [...recordsForPlayer(a, 0), ...recordsForPlayer(b, 0)];

    const s = computeStats(combined);
    const first = computeStats(recordsForPlayer(a, 0));
    const second = computeStats(recordsForPlayer(b, 0));

    expect(s.totalPredictions).toBe(first.totalPredictions + second.totalPredictions);
    expect(s.steepCount).toBe(first.steepCount + second.steepCount);
    expect(s.refusedBankCount).toBe(1);
    expect(s.failedBankCount).toBe(1);
    // Turn counting must not collide across games despite turnIndex resetting.
    expect(s.turnsTaken).toBe(first.turnsTaken + second.turnsTaken);
  });

  it('keeps games apart by gameId even with no gameEnd marker between them', () => {
    // Both games have a turn 0; neither reached gameOver, so there is no
    // gameEnd to split on. Only the gameId keeps them from merging.
    const one = [
      { ...pred({ turnIndex: 0 }), gameId: 'a' },
      { ...steep({ turnIndex: 0 }), gameId: 'a' },
    ];
    const two = [
      { ...pred({ turnIndex: 0 }), gameId: 'b' },
      { ...stop({ turnIndex: 0 }), gameId: 'b' },
    ];

    const s = computeStats([...one, ...two]);
    expect(s.turnsTaken).toBe(2); // not 1
    // Game a's steep never cashed; game b's bank must not rescue it.
    expect(s.steepSurvivalRate).toBe(0);
  });

  it('computes the nice-to-have stats without blowing up', () => {
    const { records } = replayGame(gameWithSteepsAndMatcha());
    const s = computeStats(recordsForPlayer(records, 0));

    expect(s.calibration).toHaveLength(5);
    // All 5 predictions are scoreable — this game contains no Last Sip.
    expect(sumBy(s.calibration, 'count')).toBe(5);
    expect(s.bustAvoidability.scored).toBe(1);
    expect(s.nemesisCard).toEqual({ cardId: 'cup-5', count: 1 });
    expect(s.signatureBias).not.toBeNull();
    expect(s.clutchFactor.round1Accuracy).toBeCloseTo(1);
    expect(s.clutchFactor.round2Accuracy).toBeCloseTo(0.5);
    expect(s.clutchFactor.delta).toBeCloseTo(-0.5);
  });

  it('a flawless card-counter scores ~100% on the canonical countingSkill', () => {
    // Plays the true pile perfectly: always takes the larger of MATCH /
    // NOMATCH, coin-flipping only when the count is a genuine tie. The
    // canonical figure must reward that with a perfect score; the
    // tie-inclusive raw figure cannot, which is exactly why it is not shown.
    const records = [];
    const rng = seededRng(4242);

    for (let g = 0; g < 15; g++) {
      const created = createGame({ numPlayers: 1, scoringMode: 'free', rng });
      let state = created.state;
      const actions = [];

      for (let guard = 0; state.phase !== 'gameOver' && guard < 2000; guard++) {
        const legal = getLegalActions(state);
        let action;
        if (legal.placeFreeSpace) action = { type: 'PLACE_FREE_SPACE', stackIndex: null };
        else if (legal.advance) action = { type: 'ADVANCE_TURN' };
        else if (legal.guess) {
          const pick = alignedPick(classifyAll(state.drawPile, visibleSuits(state), visibleNumbers(state)));
          action = { type: 'GUESS', guess: pick === 'tie' ? 'match' : pick };
        } else break;
        actions.push(action);
        state = applyAction(state, action).state;
      }

      const replayed = replayGame({ gameId: `perfect-${g}`, initialState: created.state, actions });
      records.push(...recordsForPlayer(replayed.records, 0));
    }

    const s = computeStats(records);

    expect(s.totalPredictions).toBeGreaterThan(200); // a real sample, not a fluke
    expect(s.decidableDivergentDecisions).toBeGreaterThan(20);
    expect(s.countingSkill).toBe(1); // canonical: flawless counting reads as flawless
    expect(s.countingSkillRaw).toBeLessThan(1); // raw is dragged down by ties
    expect(s.trueAlignmentRate).toBeGreaterThan(0.9);
  });

  it('an empty stream yields nulls, not NaN', () => {
    const s = computeStats([]);
    for (const [key, value] of Object.entries(s)) {
      if (typeof value === 'number') expect(Number.isNaN(value)).toBe(false);
    }
    expect(s.accuracy).toBeNull();
    expect(s.steepSurvivalRate).toBeNull();
    expect(s.turnsTaken).toBe(0);
    expect(s.nemesisCard).toBeNull();
  });
});

function sumBy(rows, key) {
  return rows.reduce((a, r) => a + r[key], 0);
}
