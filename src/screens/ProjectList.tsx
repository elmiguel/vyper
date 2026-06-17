import { useMemo, useState, type MouseEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { useProjectStore } from '@/store/projectStore';
import type { GameSummary } from '@/data';
import { ContextMenu, type MenuItem } from '@/ui/ContextMenu';
import { ProjectCard } from './ProjectCard';
import { CoverUploadModal } from './CoverUploadModal';
import { FILTERS, filterProjects, toggleFilter, type ProjectFilter } from './projectFilters';
import { hasCustomCover } from './coverImage';
import { kindOf } from './projectFilters';

/** The unified, filterable project list (games + models in one place). */
export function ProjectList() {
  const { games, gamesLoading, openGame, deleteGame, setGameCover } = useProjectStore();
  const [active, setActive] = useState<Set<ProjectFilter>>(new Set(['all']));
  const [menu, setMenu] = useState<{ x: number; y: number; game: GameSummary } | null>(null);
  const [uploadFor, setUploadFor] = useState<GameSummary | null>(null);
  const [confirmDel, setConfirmDel] = useState<GameSummary | null>(null);

  const shown = useMemo(() => filterProjects(games, active), [games, active]);

  const openMenu = (e: MouseEvent, game: GameSummary) => setMenu({ x: e.clientX, y: e.clientY, game });

  const menuItems = (game: GameSummary): MenuItem[] => {
    const noun = kindOf(game).isModel ? 'model' : 'game';
    const items: MenuItem[] = [{ label: 'Upload image…', onClick: () => setUploadFor(game) }];
    if (hasCustomCover(game)) items.push({ label: 'Remove image', onClick: () => void setGameCover(game.id, null) });
    items.push({ label: `Delete ${noun}`, danger: true, separator: true, onClick: () => setConfirmDel(game) });
    return items;
  };

  return (
    <div className="proj-list-wrap">
      <div className="proj-filters" role="group" aria-label="Filter projects">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            className={`proj-chip ${active.has(f.id) ? 'on' : ''}`}
            aria-pressed={active.has(f.id)}
            onClick={() => setActive((cur) => toggleFilter(cur, f.id))}
          >
            {f.label}
          </button>
        ))}
        {gamesLoading && <Loader2 className="spin" size={14} />}
      </div>

      <div className="proj-list">
        {shown.map((g) => (
          <ProjectCard key={g.id} game={g} onOpen={openGame} onMenu={openMenu} />
        ))}
        {!gamesLoading && shown.length === 0 && (
          <div className="proj-empty">
            {games.length === 0 ? 'No projects yet — create one above.' : 'No projects match these filters.'}
          </div>
        )}
      </div>

      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.game)} onClose={() => setMenu(null)} />
      )}

      {uploadFor && (
        <CoverUploadModal
          projectName={uploadFor.name}
          onClose={() => setUploadFor(null)}
          onPick={(dataUrl) => { void setGameCover(uploadFor.id, dataUrl); setUploadFor(null); }}
        />
      )}

      {confirmDel && (
        <div className="modal-scrim" onClick={() => setConfirmDel(null)}>
          <div className="cover-modal confirm-modal" onClick={(e) => e.stopPropagation()}>
            <p>Delete “{confirmDel.name}”? This can’t be undone.</p>
            <div className="confirm-actions">
              <button className="btn-ghost" onClick={() => setConfirmDel(null)}>Cancel</button>
              <button className="btn-danger" onClick={() => { void deleteGame(confirmDel.id); setConfirmDel(null); }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
