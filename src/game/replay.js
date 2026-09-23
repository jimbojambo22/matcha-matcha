// Matcha! Matcha! — pure replay harness.
//
// Re-runs a recorded game ({ initialState, actions }) through the engine and
// emits an ordered stream of records: one per prediction, one per turn-ending
// outcome. These records are the raw material the stats layer aggregates.
//
// Same discipline as the engine: pure, no DOM, no storage, no dependencies
// beyond ./engine.js. The whole game is deterministic from its initial state
// (both rounds' decks are fixed at createGame), so replaying an action log
// reproduces every intermediate state exactly — including the draw pile at
// each decision, which is what the "true odds" model needs.
//
// This module deliberately does NOT compute probabilities or aggregate
// anything. It only captures, in order, what was decided and what the decider
// could legitimately have known at that moment.

import { applyAction, visibleSuits, visibleNumbers, potentialPoints } from './engine.js';

// --- draw-pile accessors ----------------------------------------------------
//
// Never touch state.drawPile directly. Snapshots that crossed a network
// boundary may have had the pile redacted (order is secret), in which case
// only a count survives. These accessors keep stats code honest about that.

/** The remaining draw pile, or null when the snapshot is redacted. */
export function pileCards(state) {
  return Array.isArray(state.drawPile) ? state.drawPile : null;
}

/** How many cards remain, working on full and redacted snapshots alike. */
export function pileSize(state) {
  if (Array.isArray(state.drawPile)) return state.drawPile.length;
  return state.drawPileCount ?? 0;
}

/**
 * The remaining pile as a MULTISET: the same cards, sorted by id so the draw
 * order is destroyed. Sorting is the point — it makes it structurally
 * impossible for a consumer to peek at the next card, while preserving
 * exactly the knowledge a perfect card-counter has.
 *
 * Scoped to the current round for free: during round 1 this reads round 1's
 * pile and never round2Deck, which a counter genuinely cannot see.
 */
export function pileMultiset(state) {
  const pile = pileCards(state);
  if (!pile) return null;
  return [...pile].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Every card the deciding player currently holds: the face-up active pile on
 * the table (including cards buried under a Free Space — they still score),
 * plus any steeped cards hidden in their pot, plus a saved face-up top card
 * if one is waiting.
 *
 * This is what the "naive" odds model discounts: a human always knows the
 * cards in front of them. It deliberately does NOT include the card about to
 * be revealed (still in the pile, unseen), nor other players' cards.
 *
 * Note `potTop` is normally null mid-turn — beginTurn moves the steeped top
 * card onto the table and clears the field — but it is included for states
 * captured between turns.
 */
export function ownPotCards(state) {
  const p = state.players[state.currentPlayer];
  return [...state.stacks.flat(), ...p.potHidden, ...(p.potTop ? [p.potTop] : [])];
}

// --- categories -------------------------------------------------------------

/** engine `actual` string -> record category. */
const CATEGORY_BY_ACTUAL = { match: 'MATCH', nomatch: 'NOMATCH', matcha: 'MATCHA' };

// --- replay -----------------------------------------------------------------

/**
 * Replay a recorded game.
 *
 * @param {{ initialState: object, actions: object[] }} record
 * @returns {{ finalState: object, records: object[] }}
 *
 * Does not mutate `record` or anything inside it.
 */
export function replayGame({ gameId, initialState, actions = [] }) {
  let state = structuredClone(initialState);
  const all = [];
  // Every record carries its game's identity, so a caller can concatenate
  // many games and still tell their turns apart — turnIndex restarts at 0 in
  // each game, and not every game ends with a gameEnd marker to split on.
  const records = {
    push: (rec) => all.push(gameId === undefined ? rec : { ...rec, gameId }),
  };

  // The opening turn is already underway in initialState (createGame runs
  // beginTurn before returning), so turn 0 is live before the first action.
  let turnIndex = 0;
  let predictionsThisTurn = 0;
  let turnFromSteep = false;

  for (const action of actions) {
    const before = state;
    const { state: after, events } = applyAction(before, action);

    // The prediction record describes the action itself, so it is built from
    // the pre-action state and lands before any outcome the action triggered.
    if (action.type === 'GUESS') {
      records.push(
        buildPrediction(before, action, events, {
          turnIndex,
          isFirstPredictionOfTurn: predictionsThisTurn === 0,
          turnFromSteep,
        }),
      );
      predictionsThisTurn += 1;
    }

    for (const ev of events) {
      switch (ev.type) {
        // TURN_STARTED always precedes anything else that turn, so bumping
        // the counter here correctly attributes same-action outcomes (an
        // opening-deal Last Sip force-bank) to the new turn.
        case 'TURN_STARTED':
          turnIndex += 1;
          predictionsThisTurn = 0;
          turnFromSteep = false;
          break;
        case 'STEEPED_CARD_PLACED':
          turnFromSteep = true;
          break;
        case 'BANKED':
          records.push({
            kind: 'stop',
            player: ev.player,
            round: after.round,
            turnIndex,
            turnFromSteep,
            // A Last Sip bank is forced, not a decision to stop. Stats that
            // measure stopping discipline must filter on this.
            via: ev.via, // null = voluntary, 'lastSip' = forced
            voluntary: ev.via === null,
            potSize: ev.points,
            points: ev.points,
            token: ev.token,
          });
          break;
        case 'STEEPED':
          records.push({
            kind: 'steep',
            player: ev.player,
            round: after.round,
            turnIndex,
            turnFromSteep,
            // Total cards preserved: the hidden pile plus the face-up card
            // kept back to open the next turn (which also scores a point).
            potSize: after.outcome.potSize + 1,
            hiddenPotSize: after.outcome.potSize,
          });
          break;
        case 'BUST':
          records.push({
            kind: 'bust',
            player: ev.player,
            round: after.round,
            turnIndex,
            turnFromSteep,
            bustReason: ev.reason, // 'wrong' | 'matcha'
            potSize: after.outcome.lostTable + after.outcome.lostPot,
          });
          break;
        // A voluntary bank rejected because that score's token is gone. The
        // turn continues and nothing is lost — this is a *stopping-discipline*
        // signal (misread which tokens are still live), not a loss event.
        case 'BANK_REFUSED':
          records.push({
            kind: 'bankRefused',
            // The event carries no player; a refusal never changes state, so
            // the current player is still the one who tried to bank.
            player: after.currentPlayer,
            round: after.round,
            turnIndex,
            turnFromSteep,
            potSize: ev.points,
          });
          break;
        // A forced Last Sip bank that no token could satisfy: the pot is lost
        // outright. Not a bust (no wrong prediction), not a stop (no points).
        case 'BANK_FAILED':
          records.push({
            kind: 'bankFailed',
            player: ev.player,
            round: after.round,
            turnIndex,
            turnFromSteep,
            potSize: ev.attempted,
          });
          break;
        // Round 2 reshuffles and wipes every steeped pot. Recorded so steep
        // survival can tell "cashed later" from "lost at the boundary".
        case 'ROUND_TWO_STARTED':
          records.push({ kind: 'roundBoundary', round: 2, turnIndex });
          break;
        case 'GAME_OVER':
          records.push({ kind: 'gameEnd', round: after.round, turnIndex, results: ev.results });
          break;
        default:
          break;
      }
    }

    state = after;
  }

  return { finalState: state, records: all };
}

function buildPrediction(before, action, events, ctx) {
  const drawn = events.find((e) => e.type === 'CARD_DRAWN');
  const resolved = events.find((e) => e.type === 'GUESS_RESOLVED');
  const isFreeSpace = events.some((e) => e.type === 'FREE_SPACE_DRAWN');
  const isLastSip = events.some((e) => e.type === 'LAST_SIP');

  let revealedCategory;
  let resolvedCorrect;
  if (isFreeSpace) {
    // The engine emits no GUESS_RESOLVED for a Free Space — it just sets
    // hasSuccessfulGuess. "Automatically correct" is synthesized here.
    revealedCategory = 'FREE_SPACE';
    resolvedCorrect = true;
  } else if (isLastSip) {
    // Likewise no GUESS_RESOLVED: a Last Sip resolves no prediction at all.
    revealedCategory = 'LAST_SIP';
    resolvedCorrect = null;
  } else {
    revealedCategory = CATEGORY_BY_ACTUAL[resolved.actual];
    resolvedCorrect = resolved.correct;
  }

  return {
    kind: 'prediction',
    player: before.currentPlayer,
    round: before.round,
    turnIndex: ctx.turnIndex,
    isFirstPredictionOfTurn: ctx.isFirstPredictionOfTurn,
    turnFromSteep: ctx.turnFromSteep,
    potSizeBefore: potentialPoints(before),
    guess: action.guess,
    revealedCard: drawn.card,
    revealedCategory,
    resolvedCorrect,
    // Everything the probability layer needs, captured at the exact moment of
    // the decision and before the card left the pile.
    context: {
      visibleSuits: visibleSuits(before),
      visibleNumbers: visibleNumbers(before),
      remaining: pileMultiset(before),
      ownPot: ownPotCards(before),
    },
  };
}
