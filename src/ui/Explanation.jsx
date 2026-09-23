import { SUIT_ART } from './CardView.jsx';
import { suitName } from './messages.js';

/** Renders explanation parts from messages.js: text, with suits shown as icon + name. */
export default function Explanation({ parts, className = 'verdict-detail' }) {
  if (!parts) return null;
  return (
    <div className={className}>
      {parts.map((part, i) =>
        typeof part === 'string' ? (
          <span key={i}>{part}</span>
        ) : (
          <span key={i} className="suit-word">
            <img src={SUIT_ART[part.suit]} alt="" className="suit-inline" />
            {suitName(part.suit)}
          </span>
        ),
      )}
    </div>
  );
}
