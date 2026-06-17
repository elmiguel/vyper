import { Camera } from '@babylonjs/core/Cameras/camera';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera';
import { Vector3 } from '@babylonjs/core/Maths/math';
import { Scene } from '@babylonjs/core/scene';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { GizmoManager } from '@babylonjs/core/Gizmos/gizmoManager';
import type { GameMode, Vec3 } from '@/types';
import { EDITOR_LAYER, DEFAULT_LAYER } from './editorObjects';

const DEG = Math.PI / 180;

/** Apply the store's game-camera transform to the game camera + its editor helper.
 *  2D pans in XY at a fixed -Z depth looking toward +Z; 3D uses full position +
 *  euler rotation. (Lives here with the camera rig rather than in SceneManager.) */
export function applyGameCameraTransform(
  camera: UniversalCamera,
  helper: Mesh | undefined,
  mode: GameMode,
  t: { position: Vec3; rotation: Vec3 },
  cam2dZ: number,
): void {
  const { position: p, rotation: r } = t;
  if (mode === '2d') {
    camera.position.set(p.x, p.y, cam2dZ);
    camera.setTarget(new Vector3(p.x, p.y, 0));
    if (helper) {
      helper.rotationQuaternion = null;
      helper.position.set(p.x, p.y, 0);
      helper.rotation.set(0, 0, 0);
    }
    return;
  }
  camera.position.set(p.x, p.y, p.z);
  camera.rotation.set(r.x * DEG, r.y * DEG, r.z * DEG);
  if (helper) {
    helper.rotationQuaternion = null;
    helper.position.set(p.x, p.y, p.z);
    helper.rotation.set(r.x * DEG, r.y * DEG, r.z * DEG);
  }
}

/** Mouse button indices (PointerEvent.button) used for scene panning. */
const MIDDLE_MOUSE = 1;
const LEFT_MOUSE = 0;

/** Tracks which gizmos have already had their drag-end handler wired. */
export interface WiredGizmos {
  move: boolean;
  rotate: boolean;
  scale: boolean;
}

/** Minimal shape of the editor camera that pan controls toggle. */
interface PanTarget {
  _panningMouseButton: number;
}

/** True when keyboard focus is in a text field, where space must type, not pan. */
function isTypingFocused(): boolean {
  const el = (typeof document !== 'undefined' ? document.activeElement : null) as HTMLElement | null;
  return !!el?.closest?.('input, textarea, select, [contenteditable="true"], .monaco-editor');
}

/**
 * Wire the two scene-panning gestures onto the editor canvas:
 *  - Middle-mouse drag pans (set up via attachControl); here we just suppress the
 *    browser's middle-click autoscroll affordance so the drag is clean.
 *  - Holding Space while the pointer is over the viewport switches the pan button
 *    to left-mouse, so left-drag pans; releasing Space restores middle-mouse panning.
 *
 * The Space keydown is handled in the capture phase and consumed so it can't also
 * fire a global shortcut (e.g. playToggle in the Blender keymap) while panning.
 * During Play, Space is a game input (jump), so the pan handler stands down and
 * lets the event reach the running scripts' InputState.
 * Returns a teardown that removes every listener.
 */
export function setupEditorPanControls(
  canvas: HTMLCanvasElement,
  camera: PanTarget,
  isPlaying: () => boolean = () => false,
): () => void {
  let hovering = false;
  let spaceHeld = false;

  const onEnter = () => {
    hovering = true;
  };
  const onLeave = () => {
    hovering = false;
  };
  // Middle-button mousedown opens the OS autoscroll cursor; prevent it so dragging pans.
  const onMouseDown = (e: MouseEvent) => {
    if (e.button === MIDDLE_MOUSE) e.preventDefault();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.code !== 'Space' || e.repeat || !hovering || isPlaying() || isTypingFocused()) return;
    spaceHeld = true;
    camera._panningMouseButton = LEFT_MOUSE; // left-drag pans while Space is held
    e.preventDefault();
    e.stopImmediatePropagation(); // don't also toggle play (Blender keymap binds Space)
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.code !== 'Space' || !spaceHeld) return;
    spaceHeld = false;
    camera._panningMouseButton = MIDDLE_MOUSE; // restore: middle-drag pans
    e.preventDefault();
    e.stopImmediatePropagation();
  };

  canvas.addEventListener('pointerenter', onEnter);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('mousedown', onMouseDown);
  // Capture phase: run before the global keyboard-shortcut handler on window.
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('keyup', onKeyUp, true);

  return () => {
    canvas.removeEventListener('pointerenter', onEnter);
    canvas.removeEventListener('pointerleave', onLeave);
    canvas.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('keyup', onKeyUp, true);
  };
}

/** Build the editor (orbit/ortho) camera, attach controls, and gate it to all layers. */
export function createEditorCamera(scene: Scene, mode: GameMode, canvas: HTMLCanvasElement): ArcRotateCamera {
  const is2D = mode === '2d';
  let cam: ArcRotateCamera;
  if (is2D) {
    // 2D: orthographic editor camera facing the XY plane head-on from -Z (looking
    // toward +Z, up = +Y) so +X is screen-right — the standard 2D orientation.
    // Orbit is locked; pan with middle/ctrl-drag, zoom with the wheel (drives ortho bounds).
    cam = new ArcRotateCamera('editorCam', -Math.PI / 2, Math.PI / 2, 16, new Vector3(0, 0, 0), scene);
    cam.mode = Camera.ORTHOGRAPHIC_CAMERA;
    cam.angularSensibilityX = 1e12; // effectively no rotation
    cam.angularSensibilityY = 1e12;
  } else {
    cam = new ArcRotateCamera('editorCam', -Math.PI / 3, Math.PI / 3, 16, new Vector3(0, 1, 0), scene);
  }
  cam.wheelPrecision = is2D ? 18 : 30;
  cam.lowerRadiusLimit = 2;
  cam.attachControl(canvas, true);
  // Middle-mouse drag pans the scene (Babylon's default pan button is right-mouse);
  // ctrl+left-drag also pans (attachControl leaves _useCtrlForPanning on by default).
  cam._panningMouseButton = MIDDLE_MOUSE;
  // The editor camera sees everything, including editor-only helpers.
  cam.layerMask = DEFAULT_LAYER | EDITOR_LAYER;
  // Reserve the right mouse button for context menus (ArcRotate orbits with it by default).
  const ptr = cam.inputs.attached.pointers as unknown as { buttons?: number[] } | undefined;
  if (ptr) ptr.buttons = [0, 1];
  return cam;
}

/** Build the game-play camera (perspective in 3D, orthographic in 2D). */
export function createGameCamera(scene: Scene, mode: GameMode, cam2dZ: number): UniversalCamera {
  let cam: UniversalCamera;
  if (mode === '2d') {
    // 2D game camera: orthographic, viewing the XY plane from -Z (same side as the
    // editor camera) so the preview matches the editor and +X is screen-right.
    cam = new UniversalCamera('gameCam', new Vector3(0, 0, cam2dZ), scene);
    cam.setTarget(new Vector3(0, 0, 0));
    cam.mode = Camera.ORTHOGRAPHIC_CAMERA;
  } else {
    cam = new UniversalCamera('gameCam', new Vector3(0, 4, -10), scene);
    cam.setTarget(new Vector3(0, 1, 0));
  }
  // The game camera renders only the game — never editor helpers (grid, camera rig).
  cam.layerMask = DEFAULT_LAYER;
  return cam;
}

/**
 * Configure + wire each enabled gizmo once (they are created lazily on first enable).
 * onDragEndObservable on each parent gizmo aggregates ALL of its sub-handles
 * (axes, plane handles, uniform box), so one handler covers every drag.
 */
export function configureGizmos(
  gizmos: GizmoManager,
  mode: GameMode,
  wired: WiredGizmos,
  onDragEnd: () => void,
) {
  const g = gizmos.gizmos;
  const is2D = mode === '2d';
  if (g.positionGizmo && !wired.move) {
    wired.move = true;
    const pg = g.positionGizmo;
    // 2D moves in XY only; 3D gets two-axis plane handles (XY / YZ / XZ).
    pg.planarGizmoEnabled = !is2D;
    if (is2D) pg.zGizmo.isEnabled = false;
    pg.scaleRatio = 1.1;
    pg.updateGizmoRotationToMatchAttachedMesh = false; // world-aligned axes
    pg.onDragEndObservable.add(onDragEnd);
  }
  if (g.rotationGizmo && !wired.rotate) {
    wired.rotate = true;
    const rg = g.rotationGizmo;
    // 2D rotates only around Z (the axis facing the camera).
    if (is2D) {
      rg.xGizmo.isEnabled = false;
      rg.yGizmo.isEnabled = false;
    }
    rg.scaleRatio = 1.05;
    rg.updateGizmoRotationToMatchAttachedMesh = true; // rings follow the object's orientation
    rg.onDragEndObservable.add(onDragEnd);
  }
  if (g.scaleGizmo && !wired.scale) {
    wired.scale = true;
    const sg = g.scaleGizmo;
    if (is2D) sg.zGizmo.isEnabled = false; // no depth in 2D
    sg.scaleRatio = 1.1;
    sg.sensitivity = 1;
    sg.onDragEndObservable.add(onDragEnd);
  }
}
