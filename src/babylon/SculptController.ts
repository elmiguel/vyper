import type { Scene } from '@babylonjs/core/scene';
import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { PointerInfo } from '@babylonjs/core/Events/pointerEvents';
import { Vector3, Matrix } from '@babylonjs/core/Maths/math.vector';
import type { BrushParams, TerrainConfig } from '@/types';
import { applyBrush, gridSize, flatHeights, resolveBrushMode } from './terrainBrush';
import { applyHeightsToMesh } from './terrainMesh';

/**
 * Pointer-driven terrain sculpting. While active, a left-drag over the target
 * terrain mesh raises/lowers/smooths/flattens its heightfield live, and the final
 * heightfield is committed to the store on pointer-up (so it persists + undoes as
 * one edit). The owner (SceneManager) detaches camera rotation while active so the
 * drag sculpts instead of orbiting.
 */
export class SculptController {
  private active = false;
  private painting = false;
  private heights: number[] = [];
  private terrain?: TerrainConfig;
  private mesh?: Mesh;
  private entityId?: string;
  private brush?: BrushParams;
  /** Modifier-key overrides, sampled from each pointer event during a stroke:
   *  Ctrl → flatten, Shift → smooth, Cmd (mac) / Alt (win) → lower/dig, else brush mode. */
  private ctrlDown = false;
  private shiftDown = false;
  private invertDown = false;

  constructor(
    private readonly scene: Scene,
    private readonly camera: ArcRotateCamera,
    private readonly canvas: HTMLCanvasElement,
    private readonly getMesh: (entityId: string) => Mesh | undefined,
    private readonly onCommit: (entityId: string, heights: number[]) => void,
  ) {}

  isActive(): boolean {
    return this.active;
  }

  /** Activate/deactivate sculpting for a terrain entity. Detaches camera rotation
   *  while active (so left-drag sculpts) and restores it on deactivate. */
  setTarget(active: boolean, entityId: string | null, terrain: TerrainConfig | null, brush: BrushParams): void {
    const mesh = active && entityId ? this.getMesh(entityId) : undefined;
    if (active && mesh && terrain && entityId) {
      this.camera.detachControl();
      this.begin(entityId, mesh, terrain, brush);
    } else {
      this.end();
      this.camera.attachControl(this.canvas, true);
    }
  }

  /** Route a scene pointer event to the brush while active. Returns true if it
   *  consumed the event (so the caller skips its own picking/selection). */
  routePointer(info: PointerInfo): boolean {
    if (!this.active) return false;
    const e = info.event as PointerEvent;
    // Sample modifiers every event so the user can switch flatten/dig mid-stroke.
    this.ctrlDown = e.ctrlKey;
    this.shiftDown = e.shiftKey;
    this.invertDown = e.metaKey || e.altKey; // Cmd on macOS, Alt on Windows/Linux
    if (info.type === 1 /* DOWN */ && e.button === 0) this.onDown();
    else if (info.type === 4 /* MOVE */) this.onMove();
    else if (info.type === 2 /* UP */) this.onUp();
    return true;
  }

  private begin(entityId: string, mesh: Mesh, terrain: TerrainConfig, brush: BrushParams): void {
    this.active = true;
    this.painting = false;
    this.entityId = entityId;
    this.mesh = mesh;
    this.terrain = terrain;
    this.brush = brush;
    const n = gridSize(terrain.subdivisions);
    this.heights = terrain.heights.length === n * n ? terrain.heights.slice() : flatHeights(terrain.subdivisions);
  }

  setBrush(brush: BrushParams): void {
    this.brush = brush;
  }

  private end(): void {
    if (this.painting) this.commit();
    this.active = false;
    this.painting = false;
    this.mesh = undefined;
  }

  private onDown(): void {
    this.painting = true;
    this.paint();
  }
  private onMove(): void {
    if (this.painting) this.paint();
  }
  private onUp(): void {
    if (this.painting) this.commit();
    this.painting = false;
  }

  private paint(): void {
    const mesh = this.mesh;
    const terrain = this.terrain;
    const brush = this.brush;
    if (!mesh || !terrain || !brush) return;
    const pick = this.scene.pick(this.scene.pointerX, this.scene.pointerY, (m) => m === mesh, false, this.camera);
    if (!pick?.hit || !pick.pickedPoint) return;
    // World hit → terrain-local coordinates (respects the entity transform).
    const inv = Matrix.Invert(mesh.getWorldMatrix());
    const local = Vector3.TransformCoordinates(pick.pickedPoint, inv);
    // Modifier keys override the brush mode for the stroke (see resolveBrushMode).
    const mode = resolveBrushMode(brush.mode, { ctrl: this.ctrlDown, shift: this.shiftDown, invert: this.invertDown });
    this.heights = applyBrush(this.heights, terrain.subdivisions, terrain.size, local.x, local.z, { ...brush, mode });
    applyHeightsToMesh(mesh, { ...terrain, heights: this.heights });
  }

  private commit(): void {
    if (this.entityId) this.onCommit(this.entityId, this.heights);
  }
}
