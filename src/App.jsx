import { useState } from 'react';
import SetupScreen from './ui/SetupScreen.jsx';
import GameScreen from './ui/GameScreen.jsx';
import { loadGame, clearSave } from './persist.js';

export default function App() {
  const [session, setSession] = useState(null);

  if (!session) {
    return (
      <SetupScreen
        savedGame={loadGame()}
        onStart={(config) => {
          clearSave();
          setSession({ config, id: Date.now() });
        }}
        onResume={(state) => setSession({ resume: state, id: Date.now() })}
      />
    );
  }

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
