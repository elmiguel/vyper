import type { Scene } from '@babylonjs/core/scene';
import { Vector3, Matrix } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { CreateLineSystem } from '@babylonjs/core/Meshes/Builders/linesBuilder';
import type { LinesMesh } from '@babylonjs/core/Meshes/linesMesh';
import type { CustomGeometry } from '@/types';
import { nearestEdge, nearestEdgeWithT, nearestVertex, type Projector } from './modelerSceneGeom';
import { slideRatio, lineAngle, nearestAngleIndex } from './loopCutDrag';
import type { SketchTopoSession } from '@/babylon/editmesh/retopo/SketchTopoSession';

/** An interactive edit tool that takes over viewport pointer input, or 'none'. */
export type EditTool = 'none' | 'loopcut' | 'knife' | 'drawpoly' | 'sketchtopo';

/** A model-space line segment (two points) for tool guide overlays. */
type GuideSeg = [[number, number, number], [number, number, number]];

/** Which transform the loop-cut drag emulates: slide the ring (move) or swing the cut
 *  direction (rotate). Mirrors the Move/Rotate tool selection. */
export type LoopCutDragMode = 'move' | 'rotate';

/** Loop-cut tool callbacks: preview the ring for an edge at slide `t`, and commit the cut. */
export interface LoopCutHandlers {
  preview: (edge: [number, number] | null, t: number) => GuideSeg[];
  commit: (edge: [number, number], t: number) => void;
}

/** Host hooks for the indicator gizmo shown at the loop while dragging (the real Babylon
 *  Move/Rotate gizmo, anchored at the ring centroid), plus the current Move/Rotate mode and
 *  a camera freeze so the left-drag slides the loop instead of orbiting. */
export interface LoopCutGizmoHost {
  /** Current transform mode (driven by the toolbar's Move/Rotate selection). */
  mode: () => LoopCutDragMode;
  /** Show the gizmo at a model-space centroid and freeze the camera. */
  begin: (mode: LoopCutDragMode, centroid: [number, number, number]) => void;
  /** Move the gizmo to a new centroid during the drag. */
  move: (centroid: [number, number, number]) => void;
  /** Hide the gizmo and restore camera control. */
  end: () => void;
}

/** Knife tool callback: commit a path of compacted edge points. Returns true if a cut was
 *  actually made (so the tool can flag an incomplete path instead of silently clearing). */
export interface KnifeHandlers {
  commit: (path: Array<{ a: number; b: number; t: number }>) => boolean;
}

/** Draw-poly tool callback: commit a ground-plane point path as a new face. Returns true if
 *  a valid face was created (false if degenerate/incomplete). */
export interface DrawPolyHandlers {
  commit: (points: Array<[number, number, number]>) => boolean;
}

const LOOPCUT_COLOR = new Color3(1, 0.85, 0.2);
const KNIFE_COLOR = new Color3(1, 0.3, 0.3);
const DRAWPOLY_COLOR = new Color3(0.4, 1, 0.5);
/** Drawn in red over the leftover path when a commit couldn't complete. */
const ERROR_COLOR = new Color3(1, 0.2, 0.2);
const CLICK_PX = 4;
/** Cursor-to-first-point pixel radius that closes a draw-poly loop. */
const CLOSE_PX = 12;

/**
 * Pointer-driven interactive tools for the Modeling Studio viewport: **loop cut** (hover an
 * edge to preview the ring, click to commit) and **knife** (click along edges to trace a
 * path, right-click to cut). Owned by {@link ModelerScene}, which forwards pointer events
 * here while a tool is active; the geometry work happens in the store/kernel via the
 * injected handlers. Commits fire on pointer-up-without-drag so left-drag still orbits.
 */
export class ModelerEditTools {
  private tool: EditTool = 'none';
  private loopCutH?: LoopCutHandlers;
  private knifeH?: KnifeHandlers;
  private guide?: LinesMesh;
  private drawPolyH?: DrawPolyHandlers;
  private knifePath: Array<{ a: number; b: number; t: number }> = [];
  private knifeHover: [number, number, number] | null = null;
  /** Draw-poly placed points + the current ground-plane hover, both model space. */
  private drawPath: Array<[number, number, number]> = [];
  private drawHover: [number, number, number] | null = null;
  private toolDown: { x: number; y: number } | null = null;
  /** Active loop-cut drag: the seed edge, current slide ratio, press point + mode, and the
   *  candidate loop directions (rotate mode). Null when not dragging. */
  private lcDrag: {
    seed: [number, number];
    t: number;
    start: { x: number; y: number };
    mode: LoopCutDragMode;
    candidates: Array<{ edge: [number, number]; angle: number }>;
  } | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly getGeo: () => CustomGeometry | undefined,
    private readonly project: Projector,
    private readonly gizmo: LoopCutGizmoHost,
    private readonly sketch: SketchTopoSession,
  ) {}

  get active(): boolean {
    return this.tool !== 'none';
  }

  setLoopCutHandlers(h: LoopCutHandlers): void {
    this.loopCutH = h;
  }

  setKnifeHandlers(h: KnifeHandlers): void {
    this.knifeH = h;
  }

  setDrawPolyHandlers(h: DrawPolyHandlers): void {
    this.drawPolyH = h;
  }

  /** Activate/clear a tool, dropping any in-progress path + guide. */
  setEditTool(tool: EditTool): void {
    const wasSketch = this.tool === 'sketchtopo';
    this.tool = tool;
    this.knifePath = [];
    this.knifeHover = null;
    this.drawPath = [];
    this.drawHover = null;
    if (this.lcDrag) this.gizmo.end();
    this.lcDrag = null;
    this.clearGuide();
    if (tool === 'sketchtopo') this.sketch.setActive(true);
    else if (wasSketch) this.sketch.setActive(false);
  }

  /** Forward a pointer event; returns true when a tool consumed it. */
  route(type: number, e: PointerEvent): boolean {
    if (this.tool === 'loopcut') {
      this.routeLoopCut(type, e);
      return true;
    }
    if (this.tool === 'knife') {
      this.routeKnife(type, e);
      return true;
    }
    if (this.tool === 'drawpoly') {
      this.routeDrawPoly(type, e);
      return true;
    }
    if (this.tool === 'sketchtopo') {
      this.sketch.route(type, e);
      return true;
    }
    return false;
  }

  /** Finish the active tool's in-progress path (the Enter key / double-action). Loop cut has
   *  no path to finish. Returns true if a tool handled it. */
  finish(): boolean {
    if (this.tool === 'knife') {
      this.commitKnife();
      return true;
    }
    if (this.tool === 'drawpoly') {
      this.commitDrawPoly();
      return true;
    }
    if (this.tool === 'sketchtopo') {
      this.sketch.finish();
      return true;
    }
    return false;
  }

  // ---- loop cut -------------------------------------------------------------

  /**
   * Loop cut is a press-drag-release interaction (mirroring the Move/Rotate tools): hover an
   * edge to preview its ring, left-press to grab it (a Move/Rotate gizmo appears at the ring
   * and the camera freezes), drag to slide the ring (move) or swing the cut direction
   * (rotate), and release to commit. A press-release without dragging still cuts at the
   * midpoint.
   */
  private routeLoopCut(type: number, e: PointerEvent): void {
    if (type === 4 /* MOVE */) {
      if (this.lcDrag) this.dragLoopCut();
      else this.drawGuide(this.loopCutH?.preview(this.pickEdge(), 0.5) ?? [], LOOPCUT_COLOR);
    } else if (type === 1 /* DOWN */ && e.button === 0 && !e.altKey) {
      this.beginLoopCut();
    } else if (type === 2 /* UP */ && e.button === 0 && this.lcDrag) {
      const { seed, t, mode } = this.lcDrag;
      this.endLoopCut();
      this.loopCutH?.commit(seed, mode === 'move' ? t : 0.5);
    }
  }

  /** Grab the hovered edge's loop: show the gizmo at its centroid and start a drag. No-op if
   *  the cursor isn't over an edge that forms a valid loop. */
  private beginLoopCut(): void {
    const seed = this.pickEdge();
    const segs = seed ? this.loopCutH?.preview(seed, 0.5) ?? [] : [];
    if (!seed || segs.length === 0) return;
    const mode = this.gizmo.mode();
    this.lcDrag = {
      seed,
      t: 0.5,
      start: { x: this.scene.pointerX, y: this.scene.pointerY },
      mode,
      candidates: mode === 'rotate' ? this.loopCandidates() : [],
    };
    this.drawGuide(segs, LOOPCUT_COLOR);
    this.gizmo.begin(mode, centroidOf(segs));
  }

  /** Live drag: slide the ring (move) or re-pick the loop direction by drag angle (rotate). */
  private dragLoopCut(): void {
    const d = this.lcDrag!;
    if (d.mode === 'move') {
      const pv = this.getGeo()?.polyVerts;
      if (!pv) return;
      const a = this.project(pv[d.seed[0] * 3], pv[d.seed[0] * 3 + 1], pv[d.seed[0] * 3 + 2]);
      const b = this.project(pv[d.seed[1] * 3], pv[d.seed[1] * 3 + 1], pv[d.seed[1] * 3 + 2]);
      d.t = slideRatio(this.scene.pointerX, this.scene.pointerY, a.x, a.y, b.x, b.y);
    } else if (d.candidates.length > 1) {
      const target = lineAngle(this.scene.pointerX - d.start.x, this.scene.pointerY - d.start.y);
      const i = nearestAngleIndex(d.candidates.map((c) => c.angle), target);
      if (i >= 0) d.seed = d.candidates[i].edge;
    }
    const segs = this.loopCutH?.preview(d.seed, d.mode === 'move' ? d.t : 0.5) ?? [];
    this.drawGuide(segs, LOOPCUT_COLOR);
    if (segs.length) this.gizmo.move(centroidOf(segs));
  }

  /** End the drag: hide the gizmo, restore the camera, drop the guide. */
  private endLoopCut(): void {
    this.gizmo.end();
    this.lcDrag = null;
    this.clearGuide();
  }

  /** Candidate loop directions at the press: every edge incident to the nearest vertex that
   *  forms a real loop, with its screen-line angle (for rotate-mode angular selection). */
  private loopCandidates(): Array<{ edge: [number, number]; angle: number }> {
    const geo = this.getGeo();
    const pv = geo?.polyVerts;
    const polys = geo?.polygons;
    if (!pv || !polys) return [];
    const v = nearestVertex(geo!, this.project, this.scene.pointerX, this.scene.pointerY, 20);
    if (v === null) return [];
    const others = new Set<number>();
    for (const loop of polys) {
      for (let i = 0; i < loop.length; i++) {
        const a = loop[i];
        const b = loop[(i + 1) % loop.length];
        if (a === v) others.add(b);
        else if (b === v) others.add(a);
      }
    }
    const sv = this.project(pv[v * 3], pv[v * 3 + 1], pv[v * 3 + 2]);
    const out: Array<{ edge: [number, number]; angle: number }> = [];
    for (const o of others) {
      const edge: [number, number] = v < o ? [v, o] : [o, v];
      if ((this.loopCutH?.preview(edge, 0.5) ?? []).length === 0) continue; // not a real loop
      const so = this.project(pv[o * 3], pv[o * 3 + 1], pv[o * 3 + 2]);
      out.push({ edge, angle: lineAngle(so.x - sv.x, so.y - sv.y) });
    }
    return out;
  }

  // ---- knife ----------------------------------------------------------------

  private routeKnife(type: number, e: PointerEvent): void {
    if (type === 4 /* MOVE */) {
      const hit = this.pickEdgePoint();
      this.knifeHover = hit ? this.edgePoint(hit.edge[0], hit.edge[1], hit.t) : null;
      this.drawKnifeGuide();
    } else if (type === 1 /* DOWN */ && e.button === 2 && !e.altKey) {
      this.commitKnife(); // right-click finishes
    } else if (type === 1 /* DOWN */ && e.button === 0 && !e.altKey) {
      this.toolDown = { x: this.scene.pointerX, y: this.scene.pointerY };
    } else if (type === 2 /* UP */ && e.button === 0 && this.toolDown) {
      const click = this.isClick();
      this.toolDown = null;
      if (click) {
        const hit = this.pickEdgePoint();
        if (hit) {
          this.knifePath.push({ a: hit.edge[0], b: hit.edge[1], t: hit.t });
          this.drawKnifeGuide();
        }
      }
    }
  }

  /** Commit the knife path; on a no-op cut, leave the path drawn in red so the user sees
   *  which trace didn't land on the surface. */
  private commitKnife(): void {
    if (this.knifePath.length >= 2 && this.knifeH?.commit(this.knifePath)) {
      this.knifePath = [];
      this.knifeHover = null;
      this.clearGuide();
    } else if (this.knifePath.length >= 1) {
      this.knifeHover = null;
      this.drawKnifeGuide(ERROR_COLOR); // incomplete — highlight the offending trace
    } else {
      this.clearGuide();
    }
  }

  // ---- draw poly ------------------------------------------------------------

  /** Left-click drops ground-plane points (clicking the first point closes the loop);
   *  right-click closes them into a new face. */
  private routeDrawPoly(type: number, e: PointerEvent): void {
    if (type === 4 /* MOVE */) {
      this.drawHover = this.groundPoint();
      this.drawDrawPolyGuide();
    } else if (type === 1 /* DOWN */ && e.button === 2 && !e.altKey) {
      this.commitDrawPoly(); // right-click finishes
    } else if (type === 1 /* DOWN */ && e.button === 0 && !e.altKey) {
      this.toolDown = { x: this.scene.pointerX, y: this.scene.pointerY };
    } else if (type === 2 /* UP */ && e.button === 0 && this.toolDown) {
      const click = this.isClick();
      this.toolDown = null;
      if (!click) return;
      // Clicking on (near) the first point closes the polygon.
      if (this.drawPath.length >= 3 && this.nearFirstPoint()) {
        this.commitDrawPoly();
        return;
      }
      const p = this.groundPoint();
      if (p) {
        this.drawPath.push(p);
        this.drawDrawPolyGuide();
      }
    }
  }

  /** Whether the cursor is within CLOSE_PX of the first placed point (screen space). */
  private nearFirstPoint(): boolean {
    if (this.drawPath.length === 0) return false;
    const [x, y, z] = this.drawPath[0];
    const s = this.project(x, y, z);
    return Math.hypot(s.x - this.scene.pointerX, s.y - this.scene.pointerY) < CLOSE_PX;
  }

  /** Commit the drawn polygon; on failure (too few points / degenerate) leave the path in
   *  red so the user sees the incomplete outline. */
  private commitDrawPoly(): void {
    if (this.drawPath.length >= 3 && this.drawPolyH?.commit(this.drawPath)) {
      this.drawPath = [];
      this.drawHover = null;
      this.clearGuide();
    } else if (this.drawPath.length >= 1) {
      this.drawHover = null;
      this.drawDrawPolyGuide(ERROR_COLOR); // incomplete outline highlighted
    } else {
      this.clearGuide();
    }
  }

  /** Cursor ray intersected with the ground plane (y=0), in model space, or null. */
  private groundPoint(): [number, number, number] | null {
    const ray = this.scene.createPickingRay(this.scene.pointerX, this.scene.pointerY, Matrix.Identity(), this.scene.activeCamera);
    if (Math.abs(ray.direction.y) < 1e-6) return null;
    const t = -ray.origin.y / ray.direction.y;
    if (t < 0) return null;
    const p = ray.origin.add(ray.direction.scale(t));
    return [p.x, 0, p.z];
  }

  private drawDrawPolyGuide(color: Color3 = DRAWPOLY_COLOR): void {
    const pts = this.drawPath.map((p) => p);
    if (this.drawHover) pts.push(this.drawHover);
    const segs: GuideSeg[] = [];
    for (let i = 0; i + 1 < pts.length; i++) segs.push([pts[i], pts[i + 1]]);
    if (pts.length >= 3) segs.push([pts[pts.length - 1], pts[0]]); // closing edge preview
    this.drawGuide(segs, color);
  }

  // ---- shared helpers -------------------------------------------------------

  private isClick(): boolean {
    if (!this.toolDown) return false;
    return Math.hypot(this.scene.pointerX - this.toolDown.x, this.scene.pointerY - this.toolDown.y) < CLICK_PX;
  }

  private pickEdge(): [number, number] | null {
    const geo = this.getGeo();
    return geo ? nearestEdge(geo, this.project, this.scene.pointerX, this.scene.pointerY, 14) : null;
  }

  private pickEdgePoint(): { edge: [number, number]; t: number } | null {
    const geo = this.getGeo();
    return geo ? nearestEdgeWithT(geo, this.project, this.scene.pointerX, this.scene.pointerY, 14) : null;
  }

  /** Model-space point at parameter t along the compacted edge a→b. */
  private edgePoint(a: number, b: number, t: number): [number, number, number] {
    const pv = this.getGeo()!.polyVerts!;
    return [
      pv[a * 3] + (pv[b * 3] - pv[a * 3]) * t,
      pv[a * 3 + 1] + (pv[b * 3 + 1] - pv[a * 3 + 1]) * t,
      pv[a * 3 + 2] + (pv[b * 3 + 2] - pv[a * 3 + 2]) * t,
    ];
  }

  private drawKnifeGuide(color: Color3 = KNIFE_COLOR): void {
    const pts = this.knifePath.map((p) => this.edgePoint(p.a, p.b, p.t));
    if (this.knifeHover) pts.push(this.knifeHover);
    const segs: GuideSeg[] = [];
    for (let i = 0; i + 1 < pts.length; i++) segs.push([pts[i], pts[i + 1]]);
    this.drawGuide(segs, color);
  }

  private drawGuide(segs: GuideSeg[], color: Color3): void {
    this.clearGuide();
    if (segs.length === 0) return;
    const lines = segs.map(([a, b]) => [new Vector3(a[0], a[1], a[2]), new Vector3(b[0], b[1], b[2])]);
    const g = CreateLineSystem('toolGuide', { lines }, this.scene);
    g.color = color;
    g.isPickable = false;
    g.renderingGroupId = 1;
    this.guide = g;
  }

  private clearGuide(): void {
    this.guide?.dispose();
    this.guide = undefined;
  }
}

/** Mean of all endpoints of the guide segments — the loop's centroid, where the gizmo sits. */
function centroidOf(segs: GuideSeg[]): [number, number, number] {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const [a, b] of segs) {
    x += a[0] + b[0];
    y += a[1] + b[1];
    z += a[2] + b[2];
  }
  const n = segs.length * 2 || 1;
  return [x / n, y / n, z / n];
}
