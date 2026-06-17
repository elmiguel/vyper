import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Scene } from '@babylonjs/core/scene';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { LinesMesh } from '@babylonjs/core/Meshes/linesMesh';
import type { CustomGeometry } from '@/types';
import { buildEdgeHighlight, buildVertexHighlight, buildFaceHighlight } from './modelerSceneGeom';

/** The hover tint — distinct from the yellow selection so hover reads apart. */
const HOVER = Color3.FromHexString('#ff2e97');

/**
 * The component-under-the-cursor highlight for the Modeling Studio (vertex / edge / face),
 * shown as the mouse moves so the user sees what a click will grab. One overlay at a time;
 * each `vertex`/`edge`/`face` call replaces the previous. Kept apart from {@link ModelerScene}
 * (which does the picking) so the scene file stays within the size budget.
 */
export class HoverHighlight {
  private overlay?: Mesh | LinesMesh;
  private readonly vertMat: StandardMaterial;
  private readonly faceMat: StandardMaterial;

  constructor(private readonly scene: Scene) {
    this.vertMat = new StandardMaterial('hoverVert', scene);
    this.vertMat.emissiveColor = HOVER;
    this.vertMat.disableLighting = true;
    this.vertMat.pointsCloud = true;
    this.vertMat.pointSize = 13;
    this.faceMat = new StandardMaterial('hoverFace', scene);
    this.faceMat.emissiveColor = HOVER;
    this.faceMat.disableLighting = true;
    this.faceMat.alpha = 0.35;
    this.faceMat.backFaceCulling = false;
  }

  vertex(geo: CustomGeometry, v: number): void {
    this.set(buildVertexHighlight(this.scene, geo, [v], this.vertMat));
  }

  edge(geo: CustomGeometry, edge: [number, number]): void {
    this.set(buildEdgeHighlight(this.scene, geo, [edge], HOVER));
  }

  face(geo: CustomGeometry, faceIndex: number): void {
    this.set(buildFaceHighlight(this.scene, geo, [faceIndex], this.faceMat));
  }

  clear(): void {
    this.overlay?.dispose();
    this.overlay = undefined;
  }

  private set(overlay?: Mesh | LinesMesh): void {
    this.clear();
    this.overlay = overlay;
  }
}
