import type { Scene } from '@babylonjs/core/scene';
import type { Camera } from '@babylonjs/core/Cameras/camera';
import { Vector3, Matrix } from '@babylonjs/core/Maths/math.vector';
import { Viewport } from '@babylonjs/core/Maths/math.viewport';
import type { EditableMesh, ComponentMode } from './editmesh/EditableMesh';

export interface ScreenRect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * A drag-rectangle (marquee) overlay for box-selecting components in the viewport. It
 * draws an absolutely-positioned div over the canvas in client pixels and reports the
 * rectangle in canvas-relative client coordinates, matching {@link projectToClient}.
 */
export class MeshMarquee {
  private el?: HTMLDivElement;
  private startX = 0;
  private startY = 0;
  private curX = 0;
  private curY = 0;
  private on = false;

  constructor(private readonly canvas: HTMLCanvasElement) {}

  isActive(): boolean {
    return this.on;
  }

  begin(clientX: number, clientY: number): void {
    this.on = true;
    this.startX = clientX;
    this.startY = clientY;
    this.curX = clientX;
    this.curY = clientY;
    const el = document.createElement('div');
    el.className = 'mesh-marquee';
    this.canvas.parentElement?.appendChild(el);
    this.el = el;
    this.layout();
  }

  update(clientX: number, clientY: number): void {
    if (!this.on) return;
    this.curX = clientX;
    this.curY = clientY;
    this.layout();
  }

  /** How far the cursor has moved from the press point (to distinguish click vs drag). */
  travel(): number {
    return Math.hypot(this.curX - this.startX, this.curY - this.startY);
  }

  /** Canvas-relative rectangle (client px), or null if not dragging. */
  rect(): ScreenRect | null {
    if (!this.on) return null;
    const r = this.canvas.getBoundingClientRect();
    const x1 = this.startX - r.left;
    const y1 = this.startY - r.top;
    const x2 = this.curX - r.left;
    const y2 = this.curY - r.top;
    return { minX: Math.min(x1, x2), minY: Math.min(y1, y2), maxX: Math.max(x1, x2), maxY: Math.max(y1, y2) };
  }

  end(): void {
    this.on = false;
    this.el?.remove();
    this.el = undefined;
  }

  private layout(): void {
    if (!this.el) return;
    const r = this.canvas.getBoundingClientRect();
    const x = Math.min(this.startX, this.curX) - r.left;
    const y = Math.min(this.startY, this.curY) - r.top;
    this.el.style.left = `${x}px`;
    this.el.style.top = `${y}px`;
    this.el.style.width = `${Math.abs(this.curX - this.startX)}px`;
    this.el.style.height = `${Math.abs(this.curY - this.startY)}px`;
  }
}

/**
 * Project a local-space point (in `worldMatrix`'s frame) to canvas-relative client
 * pixels, matching {@link MeshMarquee.rect}. Returns null if behind the camera.
 */
export function projectToClient(
  local: { x: number; y: number; z: number },
  worldMatrix: Matrix,
  scene: Scene,
  camera: Camera,
  canvas: HTMLCanvasElement,
): { x: number; y: number } | null {
  const r = canvas.getBoundingClientRect();
  const p = Vector3.Project(
    new Vector3(local.x, local.y, local.z),
    worldMatrix,
    scene.getTransformMatrix(),
    new Viewport(0, 0, r.width, r.height),
  );
  if (p.z < 0 || p.z > 1) return null; // outside the depth range / behind camera
  return { x: p.x, y: p.y };
}

export function inRect(p: { x: number; y: number }, rect: ScreenRect): boolean {
  return p.x >= rect.minX && p.x <= rect.maxX && p.y >= rect.minY && p.y <= rect.maxY;
}

/**
 * Component keys (vertices/edges/faces, per `component`) whose screen projection falls
 * inside `rect`. Each component is tested at its representative point (vertex position,
 * edge midpoint, or face centroid) in `world` space.
 */
export function componentsInRect(
  edit: EditableMesh,
  component: ComponentMode,
  rect: ScreenRect,
  world: Matrix,
  scene: Scene,
  camera: Camera,
  canvas: HTMLCanvasElement,
): string[] {
  const keys: string[] = [];
  const test = (key: string, local: { x: number; y: number; z: number }) => {
    const p = projectToClient(local, world, scene, camera, canvas);
    if (p && inRect(p, rect)) keys.push(key);
  };
  if (component === 'vertex') {
    edit.vertices.forEach((v, i) => test(String(i), v));
  } else if (component === 'face') {
    edit.faces.forEach((_, i) => test(String(i), edit.faceCentroid(i)));
  } else {
    for (const e of edit.computeEdges().values()) {
      const a = edit.vertices[e.a];
      const b = edit.vertices[e.b];
      test(e.key, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 });
    }
  }
  return keys;
}
