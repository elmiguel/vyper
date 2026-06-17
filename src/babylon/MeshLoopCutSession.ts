import type { PointerInfo } from '@babylonjs/core/Events/pointerEvents';
import { Vector3, Matrix } from '@babylonjs/core/Maths/math.vector';
import { Color4 } from '@babylonjs/core/Maths/math.color';
import { CreateLineSystem } from '@babylonjs/core/Meshes/Builders/linesBuilder';
import type { LinesMesh } from '@babylonjs/core/Meshes/linesMesh';
import { edgeKey, type EditableMesh, type EditVertex } from './editmesh/EditableMesh';
import { loopCut, loopCutSegments, type LoopSlide } from './editmesh/meshOps';
import type { MeshToolHost } from './MeshToolHost';

const GUIDE_COLOR = new Color4(1, 0.85, 0.2, 1);

/**
 * Interactive loop-cut tool. Hovering an edge previews the ring the cut would insert;
 * clicking inserts it at the edge midpoints and begins a slide; dragging slides the new
 * loop along its rails (uniform factor, like Blender); release commits. The geometry is
 * produced by the pure `loopCut`/`loopCutSegments` operators — this only drives them from
 * pointer input and draws the guide.
 */
export class MeshLoopCutSession {
  private guide?: LinesMesh;
  private sliding = false;
  private slides: LoopSlide[] = [];
  /** World-space endpoints of the clicked (seed) rail, for mapping the cursor to a factor. */
  private seedWorld?: [Vector3, Vector3];

  constructor(private readonly host: MeshToolHost) {}

  route(info: PointerInfo): boolean {
    const e = info.event as PointerEvent;
    if (info.type === 1 /* DOWN */ && e.button === 0) {
      this.begin();
    } else if (info.type === 4 /* MOVE */) {
      if (this.sliding) this.slide();
      else this.hover();
    } else if (info.type === 2 /* UP */) {
      if (this.sliding) this.finish();
    }
    return true;
  }

  /** Clear transient state (leaving the tool / Edit Mode). */
  reset(): void {
    if (this.sliding) this.host.camera.attachControl(this.host.canvas, true);
    this.sliding = false;
    this.slides = [];
    this.seedWorld = undefined;
    this.guide?.dispose();
    this.guide = undefined;
  }

  // ---- hover preview --------------------------------------------------------

  private hover(): void {
    const edit = this.host.getEdit();
    const seed = this.seedEdgeUnderCursor(edit);
    if (!edit || !seed) {
      this.guide?.dispose();
      this.guide = undefined;
      return;
    }
    const segs = loopCutSegments(edit, seed);
    this.drawGuide(segs);
  }

  private drawGuide(segs: Array<[EditVertex, EditVertex]>): void {
    this.guide?.dispose();
    this.guide = undefined;
    const root = this.host.getRoot();
    if (!root || segs.length === 0) return;
    const lines = segs.map(([a, b]) => [new Vector3(a.x, a.y, a.z), new Vector3(b.x, b.y, b.z)]);
    const colors = segs.map(() => [GUIDE_COLOR, GUIDE_COLOR]);
    const m = CreateLineSystem('meshedit-loopguide', { lines, colors }, this.host.scene);
    m.parent = root;
    m.isPickable = false;
    m.renderingGroupId = 1;
    this.guide = m;
  }

  /** The edge key the loop would seed from: nearest edge of the picked face to the cursor. */
  private seedEdgeUnderCursor(edit: EditableMesh | undefined): string | null {
    if (!edit) return null;
    const pick = this.host.pickFace();
    if (!pick) return null;
    const loop = edit.faces[pick.faceId];
    if (!loop) return null;
    let best: string | null = null;
    let bestDist = Infinity;
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i];
      const b = loop[(i + 1) % loop.length];
      const d = distToSegment(pick.local, edit.vertices[a], edit.vertices[b]);
      if (d < bestDist) {
        bestDist = d;
        best = edgeKey(a, b);
      }
    }
    return best;
  }

  // ---- cut + slide ----------------------------------------------------------

  private begin(): void {
    const edit = this.host.getEdit();
    const root = this.host.getRoot();
    const seed = this.seedEdgeUnderCursor(edit);
    if (!edit || !root || !seed) return;
    const res = loopCut(edit, seed);
    if (res.slides.length === 0) return;
    this.slides = res.slides;
    // The seed rail (the clicked edge) drives the slide factor.
    const [sa, sb] = seed.split('|').map(Number);
    const world = root.getWorldMatrix();
    this.seedWorld = [
      Vector3.TransformCoordinates(toV3(edit.vertices[sa]), world),
      Vector3.TransformCoordinates(toV3(edit.vertices[sb]), world),
    ];
    this.sliding = true;
    this.host.camera.detachControl();
    this.guide?.dispose();
    this.guide = undefined;
    this.host.rebuildPreview();
  }

  private slide(): void {
    const edit = this.host.getEdit();
    if (!edit || !this.seedWorld) return;
    const t = this.cursorFactor(this.seedWorld[0], this.seedWorld[1]);
    for (const s of this.slides) {
      const a = edit.vertices[s.a];
      const b = edit.vertices[s.b];
      const v = edit.vertices[s.vert];
      v.x = a.x + (b.x - a.x) * t;
      v.y = a.y + (b.y - a.y) * t;
      v.z = a.z + (b.z - a.z) * t;
    }
    this.host.rebuildPreview();
  }

  private finish(): void {
    this.sliding = false;
    this.slides = [];
    this.seedWorld = undefined;
    this.host.camera.attachControl(this.host.canvas, true);
    this.host.commit();
  }

  /** Closest parameter [0.02,0.98] of the world segment a→b to the cursor pick-ray. */
  private cursorFactor(a: Vector3, b: Vector3): number {
    const scene = this.host.scene;
    const ray = scene.createPickingRay(scene.pointerX, scene.pointerY, Matrix.Identity(), this.host.camera);
    const t = closestSegmentParam(ray.origin, ray.direction, a, b);
    return Math.max(0.02, Math.min(0.98, t));
  }
}

function toV3(v: EditVertex): Vector3 {
  return new Vector3(v.x, v.y, v.z);
}

/** Distance from point p to segment a→b (all local space). */
function distToSegment(p: Vector3, a: EditVertex, b: EditVertex): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const denom = abx * abx + aby * aby + abz * abz || 1;
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / denom;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + abx * t;
  const cy = a.y + aby * t;
  const cz = a.z + abz * t;
  return Math.hypot(p.x - cx, p.y - cy, p.z - cz);
}

/** Parameter along segment a→b of the closest point to the line (origin o, dir d). */
function closestSegmentParam(o: Vector3, d: Vector3, a: Vector3, b: Vector3): number {
  const u = b.subtract(a);
  const w0 = o.subtract(a);
  const aa = Vector3.Dot(d, d);
  const bb = Vector3.Dot(d, u);
  const cc = Vector3.Dot(u, u) || 1;
  const dd = Vector3.Dot(d, w0);
  const ee = Vector3.Dot(u, w0);
  const denom = aa * cc - bb * bb;
  if (Math.abs(denom) < 1e-9) return 0.5; // ray parallel to the rail
  return (aa * ee - bb * dd) / denom;
}
