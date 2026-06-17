import type { MouseEvent } from 'react';
import { Clock, Layers, MoreHorizontal } from 'lucide-react';
import type { GameSummary } from '@/data';
import { coverBackground } from './coverImage';
import { kindOf } from './projectFilters';

/** Human-friendly "x ago" from an ISO timestamp. */
export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** One row in the project list: a cover-backed card with name, kind badge, meta,
 *  and a `…` options button. Clicking the row opens the project. */
export function ProjectCard({
  game,
  onOpen,
  onMenu,
}: {
  game: GameSummary;
  onOpen: (id: string) => void;
  onMenu: (e: MouseEvent, game: GameSummary) => void;
}) {
  const { isModel, mode } = kindOf(game);
  const kindKey = isModel ? 'model' : mode;
  const kindLabel = isModel ? 'MODEL' : mode.toUpperCase();
  const scenes = game.sceneCount ?? 0;

  return (
    <div className="proj-row" onClick={() => onOpen(game.id)} role="button" tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpen(game.id)}>
      <div className="proj-cover" style={{ background: coverBackground(game) }} aria-hidden />
      <div className="proj-body">
        <div className="proj-top">
          <span className="proj-name">{game.name}</span>
          <span className={`game-card-kind kind-${kindKey}`}>{kindLabel}</span>
        </div>
        {game.description && <div className="proj-desc">{game.description}</div>}
        <div className="game-card-meta">
          <span><Layers size={12} /> {scenes} scene{scenes === 1 ? '' : 's'}</span>
          <span><Clock size={12} /> {timeAgo(game.updatedAt)}</span>
        </div>
      </div>
      <button
        className="proj-menu-btn"
        title="Options"
        aria-label={`Options for ${game.name}`}
        onClick={(e) => { e.stopPropagation(); onMenu(e, game); }}
      >
        <MoreHorizontal size={16} />
      </button>
    </div>
  );
}
