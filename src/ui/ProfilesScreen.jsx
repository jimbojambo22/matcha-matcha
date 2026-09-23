import { useMemo, useState } from 'react';
import { loadProfiles, createProfile, renameProfile, deleteProfile, MAX_NAME_LENGTH } from '../profiles.js';
import { loadHistory } from '../history.js';
import { statsForProfile, profileSummary } from '../profile-stats.js';
import StatsView from './StatsView.jsx';

export default function ProfilesScreen({ onBack }) {
  const [profiles, setProfiles] = useState(() => loadProfiles());
  const [selectedId, setSelectedId] = useState(null);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [error, setError] = useState(null);

  // History is read once per visit; games only land in it when one ends.
  const history = useMemo(() => loadHistory(), []);
  const selected = profiles.find((p) => p.id === selectedId) ?? null;

  const report = useMemo(
    () => (selected ? statsForProfile(history, selected.id) : null),
    [history, selected],
  );

  function add(e) {
    e.preventDefault();
    const created = createProfile(newName);
    if (!created) {
      setError(newName.trim() ? 'That name is already taken.' : 'Give the profile a name.');
      return;
    }
    setProfiles(loadProfiles());
    setNewName('');
    setError(null);
  }

  function saveRename(id) {
    if (!renameProfile(id, editName)) {
      setError('That name is empty or already taken.');
      return;
    }
    setProfiles(loadProfiles());
    setEditingId(null);
    setError(null);
  }

  function remove(profile) {
    const { gameCount } = profileSummary(history, profile.id);
    const warning =
      gameCount > 0
        ? `Delete “${profile.name}”? Their ${gameCount} recorded game${gameCount === 1 ? '' : 's'} stay saved, but the stats will no longer be shown.`
        : `Delete “${profile.name}”?`;
    if (!window.confirm(warning)) return;
    deleteProfile(profile.id);
    setProfiles(loadProfiles());
    if (selectedId === profile.id) setSelectedId(null);
  }

  if (selected) {
    return (
      <div className="profiles">
        <header className="profiles-header">
          <button className="chip-btn" onClick={() => setSelectedId(null)}>
            ← Profiles
          </button>
          <h2 className="profile-title">{selected.name}</h2>
        </header>
        <StatsView report={report} name={selected.name} />
      </div>
    );
  }

  return (
    <div className="profiles">
      <header className="profiles-header">
        <button className="chip-btn" onClick={onBack}>
          ← Menu
        </button>
        <h2 className="profile-title">Players</h2>
      </header>

      <p className="hint profiles-blurb">
        Profiles are saved on this device. Assign one to a seat before a game and your stats build up over time.
      </p>

      {profiles.length === 0 ? (
        <p className="empty-note">No profiles yet — add one below to start tracking stats.</p>
      ) : (
        <ul className="profile-list">
          {profiles.map((p) => {
            const { gameCount } = profileSummary(history, p.id);
            return (
              <li key={p.id} className="profile-row">
                {editingId === p.id ? (
                  <div className="profile-edit">
                    <input
                      className="text-input"
                      value={editName}
                      maxLength={MAX_NAME_LENGTH}
                      onChange={(e) => setEditName(e.target.value)}
                      aria-label={`New name for ${p.name}`}
                      autoFocus
                    />
                    <button className="chip-btn" onClick={() => saveRename(p.id)}>
                      Save
                    </button>
                    <button className="chip-btn" onClick={() => setEditingId(null)}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <button className="profile-open" onClick={() => setSelectedId(p.id)}>
                      <span className="profile-name">{p.name}</span>
                      <span className="profile-games">
                        {gameCount} game{gameCount === 1 ? '' : 's'}
                      </span>
                    </button>
                    <div className="profile-actions">
                      <button
                        className="chip-btn"
                        onClick={() => {
                          setEditingId(p.id);
                          setEditName(p.name);
                          setError(null);
                        }}
                      >
                        Rename
                      </button>
                      <button className="chip-btn danger" onClick={() => remove(p)}>
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <form className="profile-add" onSubmit={add}>
        <input
          className="text-input"
          placeholder="New player name"
          value={newName}
          maxLength={MAX_NAME_LENGTH}
          onChange={(e) => {
            setNewName(e.target.value);
            setError(null);
          }}
          aria-label="New player name"
        />
        <button className="btn primary" type="submit">
          Add
        </button>
      </form>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
