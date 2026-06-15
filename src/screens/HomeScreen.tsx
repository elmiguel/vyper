import { useEffect, useState } from 'react';
import { Plus, Trash2, Clock, Layers, Loader2, AlertTriangle, Gamepad2, Box, Square } from 'lucide-react';
import { useProjectStore, gameModeOf } from '@/store/projectStore';
import type { GameMode } from '@/types';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function HomeScreen() {
  const { games, gamesLoading, error, view, refreshGames, newGame, openGame, deleteGame } = useProjectStore();
  const [name, setName] = useState('');
  const [mode, setMode] = useState<GameMode>('3d');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    void refreshGames();
  }, [refreshGames]);

  const create = () => {
    if (!name.trim()) return;
    void newGame(name.trim(), mode);
    setName('');
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
          <p className="home-sub">Open a saved game or start a new one.</p>
        </header>

        <div className="home-create">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && create()}
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
          <button className="home-create-btn" onClick={create} disabled={!name.trim()}>
            <Plus size={16} /> Create Game
          </button>
        </div>

        {error && (
          <div className="home-error">
            <AlertTriangle size={15} /> {error}
            <span className="home-error-hint">Is the Vyper API running and DATABASE_URL set? (npm run dev)</span>
          </div>
        )}

        <div className="home-section-label">Your Games {gamesLoading && <Loader2 className="spin" size={13} />}</div>

        <div className="home-grid">
          {games.map((g) => (
            <div key={g.id} className="game-card" onClick={() => openGame(g.id)}>
              <div className="game-card-top">
                <span className="game-card-name">{g.name}</span>
                <span className={`game-card-kind kind-${gameModeOf(g.settings)}`}>{gameModeOf(g.settings).toUpperCase()}</span>
                <button
                  className="game-card-del"
                  title="Delete game"
                  onClick={(e) => {
                    e.stopPropagation();
                    confirmDelete === g.id ? void deleteGame(g.id) : setConfirmDelete(g.id);
                  }}
                >
                  {confirmDelete === g.id ? 'Sure?' : <Trash2 size={14} />}
                </button>
              </div>
              {g.description && <div className="game-card-desc">{g.description}</div>}
              <div className="game-card-meta">
                <span><Layers size={12} /> {g.sceneCount ?? 0} scene{(g.sceneCount ?? 0) === 1 ? '' : 's'}</span>
                <span><Clock size={12} /> {timeAgo(g.updatedAt)}</span>
              </div>
            </div>
          ))}
          {!gamesLoading && games.length === 0 && (
            <div className="home-empty">No games yet — create your first one above.</div>
          )}
        </div>
      </div>
    </div>
  );
}
