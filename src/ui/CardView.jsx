import { cardSuits, cardNumbers } from '../game/cards.js';
import leaf from '../assets/leaf.svg';
import cup from '../assets/cup.svg';
import whisk from '../assets/whisk.svg';
import teapot from '../assets/teapot.svg';
import blossom from '../assets/blossom.svg';

export const SUIT_ART = { leaf, cup, whisk, teapot, blossom };

export function describeCard(card) {
  if (card.kind === 'number') return `${card.number} of ${card.suit}`;
  if (card.kind === 'dualSuit') return `${card.suits[0]} and ${card.suits[1]} dual-suit card`;
  if (card.kind === 'dualNumber') return `${card.numbers[0]} and ${card.numbers[1]} dual-number card`;
  return card.name === 'lastSip' ? 'Last Sip' : 'Free Space';
}

export default function CardView({ card, mini = false, covered = 0, selectable = false, onClick, className = '' }) {
  const classes = ['card'];
  if (mini) classes.push('mini');
  if (selectable) classes.push('selectable');
  if (className) classes.push(className);

  let inner;
  if (card.kind === 'special') {
    classes.push('special', card.name === 'lastSip' ? 'last-sip' : 'free-space');
    inner = card.name === 'lastSip' ? (
      <span className="special-label">Last<br />Sip</span>
    ) : (
      <span className="special-label">Free<br />Space</span>
    );
  } else {
    const suits = cardSuits(card);
    const numbers = cardNumbers(card);
    if (suits.length > 0) classes.push(`suit-${suits[0]}`);
    if (card.kind === 'dualNumber') classes.push('dual-number');
    inner = (
      <>
        {numbers.length > 0 ? (
          <span className="corner top">{numbers[0]}</span>
        ) : (
          <img className="corner top icon" src={SUIT_ART[suits[0]]} alt="" />
        )}
        {numbers.length > 1 && <span className="corner bottom">{numbers[1]}</span>}
        {suits.length > 1 && <img className="corner bottom icon" src={SUIT_ART[suits[1]]} alt="" />}
        {suits.length === 1 && <img className="center-suit" src={SUIT_ART[suits[0]]} alt="" />}
      </>
    );
  }

  const label = describeCard(card) + (covered > 0 ? `, covering ${covered} card${covered === 1 ? '' : 's'}` : '');

  if (onClick) {
    return (
      <button type="button" className={classes.join(' ')} onClick={onClick} aria-label={label}>
        {inner}
        {covered > 0 && <span className="stack-badge">+{covered}</span>}
      </button>
    );
  }
  return (
    <div className={classes.join(' ')} role="img" aria-label={label}>
      {inner}
      {covered > 0 && <span className="stack-badge">+{covered}</span>}
    </div>
  );
}
