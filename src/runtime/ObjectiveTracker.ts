import type { Objective } from '@/types';
import { gameConsole } from '@/store/consoleStore';

/** Live snapshot of one objective, for the runtime HUD / debug readouts. */
export interface ObjectiveState {
  id: string;
  title: string;
  progress: number;
  target: number;
  done: boolean;
  priority: Objective['priority'];
}

/**
 * Tracks the game's objectives during a play session: progress, completion, and
 * the win condition (all `primary` objectives done). Scripts drive it through the
 * `world` objective API; the editor reads `states()` for a live readout.
 */
export class ObjectiveTracker {
  private state = new Map<string, { def: Objective; progress: number; done: boolean }>();
  private won = false;

  constructor(objectives: Objective[]) {
    for (const o of objectives) this.state.set(o.id, { def: o, progress: 0, done: false });
  }

  private needed(def: Objective) {
    return def.metric === 'counter' ? Math.max(1, def.target) : 1;
  }

  isComplete(id: unknown) {
    return this.state.get(String(id ?? ''))?.done ?? false;
  }
  progress(id: unknown) {
    return this.state.get(String(id ?? ''))?.progress ?? 0;
  }
  addProgress(id: unknown, n: unknown) {
    const s = this.state.get(String(id ?? ''));
    if (!s || s.done) return;
    s.progress += Number(n) || 0;
    if (s.progress >= this.needed(s.def)) this.markDone(s);
  }
  completeObjective(id: unknown) {
    const s = this.state.get(String(id ?? ''));
    if (!s) return;
    s.progress = this.needed(s.def);
    this.markDone(s);
  }

  private markDone(s: { def: Objective; progress: number; done: boolean }) {
    if (s.done) return;
    s.done = true;
    gameConsole.info('objectives', `✓ ${s.def.title || 'Objective'} complete${s.def.reward ? ` — ${s.def.reward}` : ''}`);
  }

  /** Run each frame: announce the win the first time every primary objective is done. */
  checkWin() {
    if (this.won) return;
    const primaries = [...this.state.values()].filter((s) => s.def.priority === 'primary');
    if (primaries.length > 0 && primaries.every((s) => s.done)) {
      this.won = true;
      gameConsole.info('objectives', '🏆 You win! All primary objectives complete.');
    }
  }

  states(): ObjectiveState[] {
    return [...this.state.values()].map((s) => ({
      id: s.def.id,
      title: s.def.title,
      progress: s.progress,
      target: this.needed(s.def),
      done: s.done,
      priority: s.def.priority,
    }));
  }
}
