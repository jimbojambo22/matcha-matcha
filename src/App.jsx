import { useState } from 'react';
import SetupScreen from './ui/SetupScreen.jsx';
import GameScreen from './ui/GameScreen.jsx';
import ProfilesScreen from './ui/ProfilesScreen.jsx';
import { loadGame, clearSave } from './persist.js';

export default function App() {
  const [session, setSession] = useState(null);
  const [view, setView] = useState('setup'); // 'setup' | 'profiles'

  if (session) {
    return (
      <GameScreen
        key={session.id}
        config={session.config}
        resume={session.resume}
        onExit={() => setSession(null)}
        onPlayAgain={(config) => {
          clearSave();
          setSession({ config, id: Date.now() });
        }}
      />
    );
  }

  if (view === 'profiles') {
    return <ProfilesScreen onBack={() => setView('setup')} />;
  }

  return (
    <SetupScreen
      savedGame={loadGame()}
      onStart={(config) => {
        clearSave();
        setSession({ config, id: Date.now() });
      }}
      onResume={(saved) => setSession({ resume: saved, id: Date.now() })}
      onOpenProfiles={() => setView('profiles')}
    />
  );
}
