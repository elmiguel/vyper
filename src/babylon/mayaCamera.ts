import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { setupEditorPanControls } from './cameraRig';

/** Teardowns for whichever navigation scheme is currently installed. */
export interface NavHandles {
  pan?: () => void;
  maya?: () => void;
}

/**
 * Switch the editor camera between the default editor navigation (orbit + middle/Space
 * pan) and the Maya alt-drag scheme, tearing down the previous handlers. Returns the new
 * handles to store. Keeps SceneManager free of the input-swap bookkeeping.
 */
export function applyNavigation(
  on: boolean,
  camera: ArcRotateCamera,
  canvas: HTMLCanvasElement,
  isPlaying: () => boolean,
  prev: NavHandles,
): NavHandles {
  prev.pan?.();
  prev.maya?.();
  if (on) {
    // Keep the camera's control attached — the scene's pointer observation (which drives
    // selection, gizmo dragging, and marquee) is wired through it, so detaching would
    // kill all viewport interaction. setupMayaCameraControls removes only the
    // orbit-on-drag pointer input, leaving wheel/keyboard and scene picking intact.
    return { maya: setupMayaCameraControls(canvas, camera) };
  }
  // Restore default navigation: re-add the orbit pointer input and re-attach.
  camera.detachControl();
  camera.inputs.addPointers();
  camera.attachControl(canvas, true);
  return { pan: setupEditorPanControls(canvas, camera, isPlaying) };
}

/**
 * Install Maya-style viewport navigation on an ArcRotateCamera and return a teardown.
 * All navigation requires the **Alt** key held (so plain clicks stay free for selection):
 *
 *   Alt + Left   → tumble/orbit       (alpha/beta)
 *   Alt + Middle → track/pan          (moves the target on the camera plane)
 *   Alt + Right  → dolly/zoom         (radius; horizontal drag)
 *
 * The wheel always zooms. Babylon's built-in pointer input is detached so it can't
 * fight these handlers; the wheel input is kept.
 */
export function setupMayaCameraControls(canvas: HTMLCanvasElement, camera: ArcRotateCamera): () => void {
  // Drop the default pointer behaviour (LMB orbit etc.); keep keyboard/wheel.
  camera.inputs.removeByType('ArcRotateCameraPointersInput');

  const ORBIT_SPEED = 0.008;
  const ZOOM_SPEED = 0.01;

  let active: 'orbit' | 'pan' | 'dolly' | null = null;
  let lastX = 0;
  let lastY = 0;

  const onDown = (e: PointerEvent) => {
    if (!e.altKey) return; // Alt gates all navigation
    if (e.button === 0) active = 'orbit';
    else if (e.button === 1) active = 'pan';
    else if (e.button === 2) active = 'dolly';
    else return;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  };

  const onMove = (e: PointerEvent) => {
    if (!active) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    if (active === 'orbit') {
      camera.alpha -= dx * ORBIT_SPEED;
      camera.beta -= dy * ORBIT_SPEED;
    } else if (active === 'dolly') {
      camera.radius = Math.max(camera.lowerRadiusLimit ?? 0.1, camera.radius * (1 + (dx + dy) * ZOOM_SPEED));
    } else {
      panTarget(camera, dx, dy);
    }
    e.preventDefault();
  };

  const onUp = (e: PointerEvent) => {
    active = null;
    canvas.releasePointerCapture?.(e.pointerId);
  };

  // Suppress the browser context menu so Alt+Right can dolly.
  const onContext = (e: Event) => e.preventDefault();

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('contextmenu', onContext);

  return () => {
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('contextmenu', onContext);
  };
}

/** Pan the camera target on the screen plane (right/up vectors scaled by distance). */
function panTarget(camera: ArcRotateCamera, dx: number, dy: number): void {
  const m = camera.getWorldMatrix();
  const right = new Vector3(m.m[0], m.m[1], m.m[2]);
  const up = new Vector3(m.m[4], m.m[5], m.m[6]);
  const scale = camera.radius * 0.0015;
  const move = right.scale(-dx * scale).add(up.scale(dy * scale));
  camera.target.addInPlace(move);
}
