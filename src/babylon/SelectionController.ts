import { Color3 } from '@babylonjs/core/Maths/math';
import { GizmoManager } from '@babylonjs/core/Gizmos/gizmoManager';
import { HighlightLayer } from '@babylonjs/core/Layers/highlightLayer';
import type { Scene } from '@babylonjs/core/scene';
import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Entity, GameMode, GizmoMode, Vec3 } from '@/types';
import { isPickable, nextPick, pickIdsFromHits } from './meshPicking';
import { focusCameraOn, readGizmoTransform } from './sceneViewHelpers';
import { configureGizmos, type WiredGizmos } from './cameraRig';
import { CAM_HELPER_COLOR, GAME_CAMERA_ID } from './sceneBuilders';
import type { MeshEditController } from './MeshEditController';
import type { Tracked } from './sceneSync';
import type { SelectionPrefs } from '@/store/editorPrefs';

/** What the controller needs from its owning SceneManager. Functions are late-bound
 *  getters so the controller can be created before gameCamHelper / meshEdit exist. */
export interface SelectionCtx {
  scene: Scene;
  editorCamera: ArcRotateCamera;
  mode: GameMode;
  /** Fixed -Z distance of the 2D orthographic game camera from the play plane. */
  cam2dZ: number;
  /** Shared (live) tracked-mesh map, mutated by scene reconciliation. */
  tracked: Map<string, Tracked>;
  gameCamHelper: () => AbstractMesh | undefined;
  meshEdit: () => MeshEditController | undefined;
}

/**
 * Owns the viewport's selection visuals and transform tooling: the HighlightLayer
 * (selection outline/fill), the GizmoManager (move/rotate/scale handles), grid
 * snapping, picking, and reporting gizmo-driven transforms back to the store.
 * Extracted from SceneManager to keep that class focused on scene lifecycle.
 */
export class SelectionController {
  readonly gizmos: GizmoManager;
  readonly highlight: HighlightLayer;
  /** Selection-highlight colors, driven by the user's editor prefs (see applySelectionPrefs). */
  private selectionColor = '#ffcc44';
  private cameraSelectionColor = CAM_HELPER_COLOR;
  /** Overlay strength (0–1) — scales the highlight color so the texture shows through. */
  private selectionOpacity = 1;
  private selectedId: string | null = null;
  private gizmoMode: GizmoMode = 'move';
  private wiredGizmos: WiredGizmos = { move: false, rotate: false, scale: false };
  /** Grid snapping for gizmo drags (toggled from the viewport magnet button). */
  private snapOn = false;
  /** Last click position, so repeated clicks at the same spot cycle through stacked objects. */
  private lastPick = { x: -1, y: -1 };
  private onTransform?: (id: string, patch: Partial<Entity['transform']>) => void;
  private onCameraTransform?: (patch: { position: Vec3; rotation: Vec3 }) => void;

  constructor(private readonly ctx: SelectionCtx) {
    this.highlight = new HighlightLayer('hl', ctx.scene);
    // Default to outline-only (no interior flood); the user's editor prefs override
    // this via applySelectionPrefs once the engine wires up the store subscription.
    this.highlight.innerGlow = false;

    this.gizmos = new GizmoManager(ctx.scene);
    this.gizmos.usePointerToAttachGizmos = false;
    this.setGizmoMode('move');
  }

  /** Hook to write gizmo-driven transform changes back to the store. */
  setOnTransform(cb: (id: string, patch: Partial<Entity['transform']>) => void) {
    this.onTransform = cb;
  }
  /** Hook to write game-camera moves (via its editor helper) back to the store. */
  setOnCameraTransform(cb: (patch: { position: Vec3; rotation: Vec3 }) => void) {
    this.onCameraTransform = cb;
  }

  private meshForSelection(id: string | null): AbstractMesh | undefined {
    if (!id) return undefined;
    if (id === GAME_CAMERA_ID) return this.ctx.gameCamHelper();
    return this.ctx.tracked.get(id)?.mesh;
  }

  /** Pick whatever the cursor is over (selection + context menu). Returns the
   *  nearest object; clicking the same spot again cycles to the next object behind
   *  it, so overlapping objects can each be selected (and moved aside). */
  pickAtPointer(): string | null {
    const { scene, editorCamera, tracked } = this.ctx;
    const x = scene.pointerX;
    const y = scene.pointerY;
    const ids = pickIdsFromHits(scene.multiPick(x, y, (m) => isPickable(m, tracked), editorCamera) ?? []);
    const samePoint = Math.abs(x - this.lastPick.x) < 4 && Math.abs(y - this.lastPick.y) < 4;
    this.lastPick = { x, y };
    return nextPick(ids, this.selectedId, samePoint);
  }

  /** Switch the active transform gizmo (move / rotate / scale / select). */
  setGizmoMode(mode: GizmoMode) {
    this.gizmoMode = mode;
    this.gizmos.positionGizmoEnabled = mode === 'move';
    this.gizmos.rotationGizmoEnabled = mode === 'rotate';
    this.gizmos.scaleGizmoEnabled = mode === 'scale';
    configureGizmos(this.gizmos, this.ctx.mode, this.wiredGizmos, this.reportTransform);
    this.applySnap(); // a newly-enabled gizmo must pick up the current snap setting
    this.reattachGizmo();
    // In Edit Mode the entity gizmo has nothing to attach to (the mesh is disabled); the same
    // move/rotate/scale choice drives the component gizmo instead.
    this.ctx.meshEdit()?.setGizmoMode(mode);
  }

  /** Toggle grid snapping for the transform gizmos: drags snap to fixed increments
   *  (1 unit move, 15° rotate, 0.25 scale) when on, free movement when off. */
  setSnapping(on: boolean): void {
    this.snapOn = on;
    this.applySnap();
  }

  /** Push the current snap increments onto whichever gizmos exist (they're created
   *  lazily when their mode is first enabled, so re-apply on mode change too). */
  private applySnap(): void {
    const g = this.gizmos.gizmos;
    if (g.positionGizmo) g.positionGizmo.snapDistance = this.snapOn ? 1 : 0;
    if (g.rotationGizmo) g.rotationGizmo.snapDistance = this.snapOn ? Math.PI / 12 : 0; // 15°
    if (g.scaleGizmo) g.scaleGizmo.snapDistance = this.snapOn ? 0.25 : 0;
  }

  private reattachGizmo() {
    const mesh = this.meshForSelection(this.selectedId);
    this.gizmos.attachToMesh((mesh as Mesh) ?? null);
  }

  /** Read the attached mesh's full transform and report it to the store. */
  private reportTransform = () => {
    const mesh = this.gizmos.attachedMesh;
    if (!mesh) return;
    const t = readGizmoTransform(mesh, this.ctx.mode, this.ctx.cam2dZ);
    if (t.kind === 'camera') this.onCameraTransform?.({ position: t.position, rotation: t.rotation });
    else this.onTransform?.(mesh.name, { position: t.position, rotation: t.rotation, scale: t.scale });
  };

  /** Frame the editor camera on an entity/editor object (or reset if none). */
  focusOn(id: string | null) {
    focusCameraOn(this.ctx.editorCamera, this.meshForSelection(id) as AbstractMesh | undefined);
  }

  highlightSelection(id: string | null) {
    this.selectedId = id;
    this.highlight.removeAllMeshes();
    this.gizmos.attachToMesh(null);
    if (!id) return;
    const mesh = this.meshForSelection(id);
    if (mesh && 'addMesh' in this.highlight) {
      const color = id === GAME_CAMERA_ID ? this.cameraSelectionColor : this.selectionColor;
      // Scaling the color dims the additive highlight composite, so lower opacity
      // lets the object's own texture/material read through the overlay.
      this.highlight.addMesh(mesh as never, Color3.FromHexString(color).scale(this.selectionOpacity));
      if (this.gizmoMode !== 'select') this.gizmos.attachToMesh(mesh as never);
    }
  }

  /** Apply the user's selection-highlight prefs to the live HighlightLayer and re-tint
   *  the current selection. `innerGlow` off gives an outline-only look (no interior flood). */
  applySelectionPrefs(p: SelectionPrefs) {
    this.highlight.innerGlow = p.innerGlow;
    this.highlight.blurHorizontalSize = p.glow;
    this.highlight.blurVerticalSize = p.glow;
    this.selectionColor = p.outlineColor;
    this.cameraSelectionColor = p.cameraColor;
    this.selectionOpacity = p.opacity;
    this.highlightSelection(this.selectedId); // re-draw with the new color/glow/opacity
  }
}
