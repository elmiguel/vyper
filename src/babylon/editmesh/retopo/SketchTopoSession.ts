import type { Scene } from '@babylonjs/core/scene';
import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { CreateLineSystem } from '@babylonjs/core/Meshes/Builders/linesBuilder';
import type { LinesMesh } from '@babylonjs/core/Meshes/linesMesh';
import type { V3 } from '@/kernel/HalfEdgeMesh';
import type { CustomGeometry } from '@/types';
import { simplifyPolyline, resampleCurve } from './stroke';
import { CurveNetwork, type Quad4 } from './curveNetwork';
import { coonsGrid, gridQuads } from './patchGrid';
import { closestPointOnSoup } from './surfaceProject';

/** Sketch-retopo handlers from the store: commit the generated quad cage, and the current
 *  global grid resolution R. */
export interface SketchTopoHandlers {
  commit: (verts: V3[], faces: number[][]) => void;
  resolution: () => number;
}

/** A 3D surface point picked under the cursor, or null on a miss. */
export type SurfacePick = () => V3 | null;

const CURVE_COLOR = new Color3(0.4, 1, 0.5);
const QUAD_COLOR = new Color3(0.3, 0.7, 1);
const STROKE_SAMPLES = 32; // stored smoothness per stroke (fill re-resamples to R)

/**
 * Interactive freehand sketch-retopology session for the Modeling Studio viewport. The user
 * drags strokes over the reference mesh; each stroke is projected onto the surface, smoothed
 * into a curve, and added to a {@link CurveNetwork}. When four curves close a 4-sided patch it
 * is auto-filled with an R×R quad grid fitted to the surface, accumulating a quad cage that
 * replaces the mesh on commit. Owned by {@link ModelerScene}, which feeds it pointer events,
 * surface picks, and camera control. Heavy geometry lives in the pure `retopo/` modules.
 */
export class SketchTopoSession {
  private handlers?: SketchTopoHandlers;
  private net = new CurveNetwork(0.05);
  private refGeo?: CustomGeometry;
  /** Welded cage: position-keyed vertex dedup so adjacent patches share boundary verts. */
  private verts: V3[] = [];
  private faces: number[][] = [];
  private vertIndex = new Map<string, number>();
  private drawing = false;
  private raw: V3[] = [];
  private curveLines?: LinesMesh;
  private quadLines?: LinesMesh;
  private strokeLine?: LinesMesh;

  constructor(
    private readonly scene: Scene,
    private readonly getRefGeo: () => CustomGeometry | undefined,
    private readonly pickSurface: SurfacePick,
    private readonly camera: ArcRotateCamera,
    private readonly canvas: HTMLCanvasElement,
  ) {}

  setHandlers(h: SketchTopoHandlers): void {
    this.handlers = h;
  }

  /** Enter/leave the tool: on enter, snapshot the reference surface + reset; on leave, clear. */
  setActive(on: boolean): void {
    this.clear();
    if (!on) return;
    this.refGeo = this.getRefGeo();
    this.net = new CurveNetwork(this.snapThreshold());
  }

  /** Forward a pointer event while the tool owns input. */
  route(type: number, e: PointerEvent): void {
    if (type === 1 /* DOWN */ && e.button === 0 && !e.altKey) {
      this.drawing = true;
      this.raw = [];
      this.camera.detachControl(); // left-drag draws, not orbits
      this.sample();
    } else if (type === 4 /* MOVE */ && this.drawing) {
      this.sample();
      this.drawStroke();
    } else if (type === 2 /* UP */ && this.drawing) {
      this.drawing = false;
      this.camera.attachControl(this.canvas, true);
      this.endStroke();
    }
  }

  /** Commit the cage as the new mesh, then reset to keep sketching on the committed surface. */
  finish(): void {
    if (this.faces.length) this.handlers?.commit(this.verts.map((v) => [...v]), this.faces.map((f) => [...f]));
    this.setActive(true); // re-snapshot the (now committed) surface
  }

  // --- stroke capture --------------------------------------------------------

  private sample(): void {
    const p = this.pickSurface();
    if (p) this.raw.push(p);
  }

  private endStroke(): void {
    this.strokeLine?.dispose();
    this.strokeLine = undefined;
    if (this.raw.length < 2) return;
    const smooth = resampleCurve(simplifyPolyline(this.raw, this.snapThreshold() * 0.4), STROKE_SAMPLES);
    const cycles = this.net.addCurve(smooth);
    for (const cycle of cycles) this.fillPatch(cycle);
    this.drawNetwork();
    this.drawQuads();
  }

  // --- patch filling ---------------------------------------------------------

  private fillPatch(cycle: Quad4): void {
    const R = Math.max(1, this.handlers?.resolution() ?? 4);
    const [n0, n1, n2, n3] = cycle;
    const bottom = this.boundary(n0, n1, R);
    const right = this.boundary(n1, n2, R);
    const top = this.boundary(n3, n2, R);
    const left = this.boundary(n0, n3, R);
    if (!bottom || !right || !top || !left) return;
    const grid = coonsGrid(bottom, right, top, left);
    const rows = grid.length;
    const cols = grid[0].length;
    const ids: number[] = [];
    for (const row of grid) for (const p of row) ids.push(this.weld(this.project(p)));
    for (const f of gridQuads(rows, cols)) this.faces.push(f.map((i) => ids[i]));
  }

  /** A patch boundary curve resampled to R+1 points, oriented `from`→`to`. */
  private boundary(from: number, to: number, R: number): V3[] | null {
    const c = this.net.curveBetween(from, to);
    return c ? resampleCurve(c, R) : null;
  }

  /** Snap a generated point onto the reference surface (keeps the cage hugging the mesh). */
  private project(p: V3): V3 {
    const g = this.refGeo;
    return g && g.positions.length ? closestPointOnSoup(p, g.positions, g.indices) : p;
  }

  /** Get-or-add a welded vertex by quantized position so shared boundaries merge. */
  private weld(p: V3): number {
    const key = `${Math.round(p[0] * 1e4)},${Math.round(p[1] * 1e4)},${Math.round(p[2] * 1e4)}`;
    const hit = this.vertIndex.get(key);
    if (hit !== undefined) return hit;
    const id = this.verts.length;
    this.verts.push(p);
    this.vertIndex.set(key, id);
    return id;
  }

  // --- preview rendering -----------------------------------------------------

  private drawStroke(): void {
    this.strokeLine?.dispose();
    if (this.raw.length < 2) return;
    this.strokeLine = this.line(
      [this.raw.map((p) => new Vector3(p[0], p[1], p[2]))],
      CURVE_COLOR,
    );
  }

  private drawNetwork(): void {
    this.curveLines?.dispose();
    const lines = this.net.curves.map((c) => c.samples.map((p) => new Vector3(p[0], p[1], p[2])));
    this.curveLines = lines.length ? this.line(lines, CURVE_COLOR) : undefined;
  }

  private drawQuads(): void {
    this.quadLines?.dispose();
    const lines: Vector3[][] = [];
    for (const f of this.faces) {
      for (let i = 0; i < f.length; i++) {
        const a = this.verts[f[i]];
        const b = this.verts[f[(i + 1) % f.length]];
        lines.push([new Vector3(a[0], a[1], a[2]), new Vector3(b[0], b[1], b[2])]);
      }
    }
    this.quadLines = lines.length ? this.line(lines, QUAD_COLOR) : undefined;
  }

  private line(lines: Vector3[][], color: Color3): LinesMesh {
    const m = CreateLineSystem('sketchGuide', { lines }, this.scene);
    m.color = color;
    m.isPickable = false;
    m.renderingGroupId = 1;
    return m;
  }

  // --- lifecycle -------------------------------------------------------------

  private clear(): void {
    this.curveLines?.dispose();
    this.quadLines?.dispose();
    this.strokeLine?.dispose();
    this.curveLines = this.quadLines = this.strokeLine = undefined;
    this.verts = [];
    this.faces = [];
    this.vertIndex.clear();
    this.raw = [];
    this.drawing = false;
  }

  /** Snap radius scaled to the reference mesh size (~3% of its bounding diagonal). */
  private snapThreshold(): number {
    const g = this.refGeo;
    if (!g || !g.positions.length) return 0.05;
    let min = [Infinity, Infinity, Infinity];
    let max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < g.positions.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], g.positions[i + k]);
        max[k] = Math.max(max[k], g.positions[i + k]);
      }
    }
    const diag = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
    return Math.max(diag * 0.03, 1e-3);
  }
}
