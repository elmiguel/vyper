import type { GameSummary } from '@/data';

/** The toggleable chips shown above the project list. */
export type ProjectFilter = 'all' | 'games' | 'models' | '2d' | '3d';

/** Display order + labels for the filter bar. */
export const FILTERS: { id: ProjectFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'games', label: 'Games' },
  { id: 'models', label: 'Models' },
  { id: '2d', label: '2D' },
  { id: '3d', label: '3D' },
];

export interface ProjectKind {
  isModel: boolean;
  mode: '2d' | '3d';
}

/** Read a project's kind (model vs game) and 2D/3D mode off its settings blob.
 *  Mirrors `gameModeOf`/`isModelProject` but stays dependency-free so it's cheap
 *  to import and unit-test. Models are always 3D. */
export function kindOf(g: GameSummary): ProjectKind {
  const kind = g.settings?.kind;
  return { isModel: kind === 'model', mode: kind === '2d' ? '2d' : '3d' };
}

/** Toggle a filter chip. `all` is exclusive — selecting it clears the rest. The
 *  other chips form an additive union; turning the last one off falls back to `all`. */
export function toggleFilter(active: Set<ProjectFilter>, f: ProjectFilter): Set<ProjectFilter> {
  if (f === 'all') return new Set(['all']);
  const next = new Set(active);
  next.delete('all');
  if (next.has(f)) next.delete(f);
  else next.add(f);
  return next.size === 0 ? new Set(['all']) : next;
}

/** True when a project matches the active filter set (union of the enabled chips). */
export function matchesFilter(g: GameSummary, active: Set<ProjectFilter>): boolean {
  if (active.has('all') || active.size === 0) return true;
  const { isModel, mode } = kindOf(g);
  if (active.has('games') && !isModel) return true;
  if (active.has('models') && isModel) return true;
  if (active.has('2d') && mode === '2d') return true;
  if (active.has('3d') && mode === '3d') return true;
  return false;
}

/** Filter a list of projects by the active chips, preserving input order. */
export function filterProjects(games: GameSummary[], active: Set<ProjectFilter>): GameSummary[] {
  return games.filter((g) => matchesFilter(g, active));
}
