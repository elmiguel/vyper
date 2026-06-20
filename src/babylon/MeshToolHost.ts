import type { Scene } from '@babylonjs/core/scene';
import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { EditableMesh } from './editmesh/EditableMesh';

/** A pick on the preview surface: the originating editable face + the local-space point. */
export interface FacePick {
  faceId: number;
  local: Vector3;
}

/** The accessors the interactive Edit-Mode tools (loop cut, knife) need from their owning
 *  {@link MeshEditController}. Mirrors {@link SculptHost} but adds surface picking. */
export interface MeshToolHost {
  scene: Scene;
  camera: ArcRotateCamera;
  canvas: HTMLCanvasElement;
  getEdit(): EditableMesh | undefined;
  getPreview(): Mesh | undefined;
  getRoot(): TransformNode | undefined;
  rebuildPreview(): void;
  commit(): void;
  /** Raycast the preview surface under the cursor → hit face id + local-space point. */
  pickFace(): FacePick | null;
  /** Re-attach camera controls after a tool drag, restoring the editor's pan defaults. */
  reattachCamera(): void;
}
