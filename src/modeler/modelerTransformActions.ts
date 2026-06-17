import type { HalfEdgeMesh } from '@/kernel/HalfEdgeMesh';
import type { ModelerState } from './modelerStore';
import type { EditActionsCtx } from './modelerEditActions';

/** Rotate a vector by a unit quaternion (kernel-local; avoids a Babylon dependency). */
function quatRotate(q: { x: number; y: number; z: number; w: number }, vx: number, vy: number, vz: number): [number, number, number] {
  const tx = 2 * (q.y * vz - q.z * vy);
  const ty = 2 * (q.z * vx - q.x * vz);
  const tz = 2 * (q.x * vy - q.y * vx);
  return [vx + q.w * tx + (q.y * tz - q.z * ty), vy + q.w * ty + (q.z * tx - q.x * tz), vz + q.w * tz + (q.x * ty - q.y * tx)];
}

/**
 * The live gizmo-drag transform actions for the Modeling Studio store: move/rotate/scale the
 * selected vertices with instant viewport feedback, registering the net change as a single
 * undoable command on release. Extracted from modelerStore (mirroring {@link createEditActions})
 * to keep that file focused. Drags mutate the kernel mesh in place and re-bake on each frame;
 * the pre-drag snapshot is held here and turned into one command in {@link endTransform}.
 */
export function createTransformActions(ctx: EditActionsCtx): Pick<
  ModelerState,
  'beginTransform' | 'translateSelectionLive' | 'rotateSelectionLive' | 'scaleSelectionLive' | 'endTransform'
> {
  const { stack, set, rebuild, sync } = ctx;
  let dragSnapshot: ReturnType<HalfEdgeMesh['serialize']> | null = null;

  return {
    beginTransform: () => {
      dragSnapshot = ctx.mesh().serialize();
    },

    translateSelectionLive: (dx, dy, dz) => {
      const mesh = ctx.mesh();
      for (const v of ctx.selectedVertices()) {
        const p = mesh.vertices[v].position;
        p[0] += dx;
        p[1] += dy;
        p[2] += dz;
      }
      rebuild(); // live preview; no command/sync until the drag ends
    },

    rotateSelectionLive: (q, pivot) => {
      const mesh = ctx.mesh();
      for (const v of ctx.selectedVertices()) {
        const p = mesh.vertices[v].position;
        const [x, y, z] = quatRotate(q, p[0] - pivot[0], p[1] - pivot[1], p[2] - pivot[2]);
        p[0] = pivot[0] + x;
        p[1] = pivot[1] + y;
        p[2] = pivot[2] + z;
      }
      rebuild();
    },

    scaleSelectionLive: (sx, sy, sz, pivot) => {
      const mesh = ctx.mesh();
      for (const v of ctx.selectedVertices()) {
        const p = mesh.vertices[v].position;
        p[0] = pivot[0] + (p[0] - pivot[0]) * sx;
        p[1] = pivot[1] + (p[1] - pivot[1]) * sy;
        p[2] = pivot[2] + (p[2] - pivot[2]) * sz;
      }
      rebuild();
    },

    endTransform: () => {
      if (!dragSnapshot) return;
      const before = dragSnapshot;
      const mesh = ctx.mesh();
      const after = mesh.serialize();
      dragSnapshot = null;
      // Register the net move as one undoable command (do() restores 'after' — a no-op since
      // the mesh is already there; undo() restores the pre-drag snapshot).
      stack.run({ label: 'Move', do: () => mesh.deserialize(after), undo: () => mesh.deserialize(before) });
      rebuild();
      sync();
      set((s) => ({ selRevision: s.selRevision + 1 })); // re-center the gizmo on the moved selection
    },
  };
}
