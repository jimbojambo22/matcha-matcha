import { useState } from 'react';
import { MAX_NAME_LENGTH } from '../profiles.js';
import { defaultName, resolveNames } from '../names.js';

/**
 * Pre-game step: one name per seat. Seats assigned a profile use the
 * profile's name; guest seats can type one or leave it blank to play as
 * "Player N". Continue always works — nothing here is required.
 */
export default function NamesScreen({ numPlayers, seatProfiles, profiles, onContinue, onBack }) {
  const profileName = (seat) => profiles.find((p) => p.id === seatProfiles[seat])?.name ?? null;
  const [typed, setTyped] = useState(() => Array.from({ length: numPlayers }, () => ''));
  const firstGuest = Array.from({ length: numPlayers }, (_, i) => i).find((i) => !profileName(i));

  function submit(e) {
    e.preventDefault();
    onContinue(resolveNames(typed.map((t, i) => profileName(i) ?? t), numPlayers));
  }

  return (
    <div className="setup names-screen">
      <header className="setup-header">
        <h1 className="title">Who’s playing?</h1>
        <p className="subtitle">Type a name, or leave it blank to use the default.</p>
      </header>

      <form className="setup-section" onSubmit={submit}>
        <div className="seat-list">
          {typed.map((value, seat) => {
            const locked = profileName(seat);
            return (
              <label key={seat} className="seat-row">
                <span className="seat-label">{seat + 1}</span>
                {locked ? (
                  <span className="seat-locked">
                    {locked} <span className="seat-tag">profile</span>
                  </span>
                ) : (
                  <input
                    className="text-input name-input"
                    value={value}
                    maxLength={MAX_NAME_LENGTH}
                    placeholder={defaultName(seat)}
                    autoFocus={seat === firstGuest}
                    autoComplete="off"
                    autoCapitalize="words"
                    enterKeyHint={seat === numPlayers - 1 ? 'go' : 'next'}
                    aria-label={`Name for player ${seat + 1}`}
                    onChange={(e) => setTyped((prev) => prev.map((t, i) => (i === seat ? e.target.value : t)))}
                  />
                )}
              </label>
            );
          })}
        </div>

        <div className="setup-actions names-actions">
          <button type="submit" className="btn primary start-btn">
            Continue
          </button>
          <button type="button" className="btn subtle" onClick={onBack}>
            Back
          </button>
        </div>
      </form>
    </div>
  );
}
