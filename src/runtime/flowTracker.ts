/**
 * Live execution tracker for the node graph. The runtime calls `hit(id)` as each
 * node executes and `fail(msg)` when one throws; the node/edge components subscribe
 * to paint the "energy flow" and break the graph at the failed node.
 *
 * Kept deliberately OUTSIDE the editor store / React-Flow node data so transient
 * play-time visuals never pollute (or churn) the persisted, undoable graph.
 */

export type NodeFlowState = 'idle' | 'active' | 'error';

class FlowTracker {
  private listeners = new Set<() => void>();
  private lastHit = new Map<string, number>();
  private prevSig = '';
  private raf = 0;
  /** Most recently executed node — used to attribute a thrown error. */
  lastNode: string | null = null;
  erroredNode: string | null = null;
  errorMessage = '';
  errorScript = '';
  running = false;
  /** Bumped only on a visible state transition, so subscribers re-render rarely. */
  version = 0;

  /** A node counts as "active" if it executed within this window (ms). */
  private readonly WINDOW = 220;

  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  };
  getVersion = () => this.version;

  /** Called from instrumented generated code, potentially 60×/sec per node. Cheap. */
  hit(id: string) {
    this.lastHit.set(id, performance.now());
    this.lastNode = id;
  }

  fail(message: string, script = '', id?: string | null) {
    this.erroredNode = id ?? this.lastNode;
    this.errorMessage = message;
    this.errorScript = script;
    this.notify();
  }

  begin() {
    this.lastHit.clear();
    this.erroredNode = null;
    this.errorMessage = '';
    this.errorScript = '';
    this.lastNode = null;
    this.running = true;
    this.notify();
    this.startLoop();
  }

  end() {
    this.running = false;
    this.lastHit.clear();
    this.erroredNode = null;
    this.lastNode = null;
    this.stopLoop();
    this.notify();
  }

  stateOf(id: string): NodeFlowState {
    if (this.erroredNode === id) return 'error';
    const t = this.lastHit.get(id);
    if (t !== undefined && performance.now() - t < this.WINDOW) return 'active';
    return 'idle';
  }

  isErrorTarget(id: string) {
    return this.erroredNode === id;
  }

  private notify() {
    this.version++;
    for (const l of this.listeners) l();
  }

  // Poll active-set membership each frame; only notify React when it actually
  // changes (a node going idle, a new node lighting up, an error appearing).
  private startLoop() {
    const loop = () => {
      const now = performance.now();
      const ids: string[] = [];
      for (const [id, t] of this.lastHit) if (now - t < this.WINDOW) ids.push(id);
      ids.sort();
      const sig = `${this.erroredNode ?? ''}|${ids.join(',')}`;
      if (sig !== this.prevSig) {
        this.prevSig = sig;
        this.notify();
      }
      if (this.running) this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private stopLoop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.prevSig = '';
  }
}

export const flowTracker = new FlowTracker();
