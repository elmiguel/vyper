import { useEffect, useState } from 'react';
import { Plus, Loader2, AlertTriangle, Gamepad2, Box, Square, Boxes } from 'lucide-react';
import { useProjectStore } from '@/store/projectStore';
import type { GameMode } from '@/types';
import { ProjectList } from './ProjectList';

export function HomeScreen() {
  const { error, view, refreshGames, newGame, newModel } = useProjectStore();
  const [name, setName] = useState('');
  const [modelName, setModelName] = useState('');
  const [mode, setMode] = useState<GameMode>('3d');

  useEffect(() => {
    void refreshGames();
  }, [refreshGames]);

  const createGame = () => {
    if (!name.trim()) return;
    void newGame(name.trim(), mode);
    setName('');
  };
  const createModel = () => {
    if (!modelName.trim()) return;
    void newModel(modelName.trim());
    setModelName('');
  };

  return (
    <div className="home-root">
      {view === 'loading' && (
        <div className="home-loading">
          <Loader2 className="spin" size={26} /> Loading project…
        </div>
      )}

      <div className="home-inner">
        <header className="home-head">
          <div className="home-brand">
            <Gamepad2 size={26} />
            <h1>VYPER</h1>
          </div>
          <p className="home-sub">Build a game, or model in 3D.</p>
        </header>

        <div className="home-choices">
          <div className="home-choice">
            <div className="home-choice-head"><Gamepad2 size={18} /> Create a Game</div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createGame()}
              placeholder="New game name…"
            />
            <div className="home-mode" role="group" aria-label="Game type">
              <button className={mode === '3d' ? 'on' : ''} onClick={() => setMode('3d')} title="3D game">
                <Box size={15} /> 3D
              </button>
              <button className={mode === '2d' ? 'on' : ''} onClick={() => setMode('2d')} title="2D game">
                <Square size={15} /> 2D
              </button>
            </div>
            <button className="home-create-btn" onClick={createGame} disabled={!name.trim()}>
              <Plus size={16} /> Create Game
            </button>
          </div>

          <div className="home-choice accent">
            <div className="home-choice-head"><Boxes size={18} /> 3D Modeling Studio</div>
            <input
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createModel()}
              placeholder="New model name…"
            />
            <p className="home-choice-blurb">Box-model, sculpt, UV, rig &amp; animate — then drop creations into any game.</p>
            <button className="home-create-btn alt" onClick={createModel} disabled={!modelName.trim()}>
              <Plus size={16} /> Start 3D Modeling
            </button>
          </div>
        </div>

        {error && (
          <div className="home-error">
            <AlertTriangle size={15} /> {error}
            <span className="home-error-hint">Is the Vyper API running and DATABASE_URL set? (npm run dev)</span>
          </div>
        )}

        <div className="home-section-label">Your Projects</div>
        <ProjectList />
      </div>
    </div>
  );
}
