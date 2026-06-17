import { HalfEdgeMesh } from './HalfEdgeMesh';

/** A reversible editor action. Every mesh edit goes through one (undo/redo from day one). */
export interface Command {
  label: string;
  do(): void;
  undo(): void;
}

/** Undo/redo history of {@link Command}s. */
export class CommandStack {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];

  /** Execute a command and push it onto the undo stack (clearing the redo stack). */
  run(cmd: Command): void {
    cmd.do();
    this.undoStack.push(cmd);
    this.redoStack = [];
  }

  undo(): void {
    const cmd = this.undoStack.pop();
    if (!cmd) return;
    cmd.undo();
    this.redoStack.push(cmd);
  }

  redo(): void {
    const cmd = this.redoStack.pop();
    if (!cmd) return;
    cmd.do();
    this.undoStack.push(cmd);
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}

/**
 * Wrap a mesh mutation as a snapshot-based {@link Command}: it captures the topology
 * before and after `mutate` runs, and replays by restoring whichever snapshot. This makes
 * any operation reversible without hand-writing an inverse — the pragmatic default the
 * kernel guidance calls for; hot paths can later supply explicit inverse commands.
 */
export function snapshotCommand(mesh: HalfEdgeMesh, label: string, mutate: () => void): Command {
  const before = mesh.serialize();
  mutate();
  const after = mesh.serialize();
  return {
    label,
    do: () => mesh.deserialize(after),
    undo: () => mesh.deserialize(before),
  };
}
