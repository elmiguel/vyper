import { describe, it, expect, beforeEach } from 'vitest';
import type { Entity } from '@/types';
import { useEditorStore } from '@/store/editorStore';
import { useModelerStore } from './modelerStore';

const s = () => useModelerStore.getState();

/** Select the model in object mode so component edit modes are reachable (they lock to a
 *  focused object). The default model is a single cube, so any face focuses the whole thing. */
const selectObject = () => {
  s().setComponent('object');
  s().applyPick({ kind: 'object', face: 0 }, false);
};

const meshEntity = (): Entity => ({
  id: 'model', name: 'Mesh', parentId: null,
  transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
  mesh: { kind: 'box', color: '#fff', visible: true },
  scriptIds: [], props: {},
});

/** Centroid of every baked vertex (the whole-object centroid). */
function meshCentroidY(): number {
  const pv = s().geometry.polyVerts!;
  let y = 0;
  for (let i = 0; i < pv.length / 3; i++) y += pv[i * 3 + 1];
  return y / (pv.length / 3);
}

beforeEach(() => {
  useEditorStore.setState({ entities: [meshEntity()], past: [], future: [], sceneRevision: 0 });
  s().init();
  s().setComponent('object'); // reset shared singleton state between cases
});

describe('modeler — component modes', () => {
  it('defaults to object mode with nothing selected until you click an object', () => {
    expect(s().component).toBe('object');
    expect(s().objectSelected).toBe(false);
    // Nothing selected → no centroid / gizmo yet.
    expect(s().selectionCentroid()).toBeNull();
    // Clicking an object selects its island (here the only object = the whole cube).
    s().applyPick({ kind: 'object', face: 0 }, false);
    expect(s().objectSelected).toBe(true);
    expect(s().selectionPolygons()).toHaveLength(s().faceCount);
    expect(s().selectionCentroid()).not.toBeNull();
  });

  it('switching component mode clears the selection', () => {
    selectObject(); // an object must be focused before an edit mode is reachable
    s().setComponent('face');
    expect(s().component).toBe('face');
    expect(s().objectSelected).toBe(false);
    expect(s().selection).toEqual([]);
    expect(s().selectionPolygons()).toEqual([]);
  });

  it('object mode transforms the selected object, leaving topology intact', () => {
    s().applyPick({ kind: 'object', face: 0 }, false); // select the (only) object
    const before = meshCentroidY();
    const faces = s().faceCount;
    s().beginTransform();
    s().translateSelectionLive(0, 3, 0);
    s().endTransform();
    expect(meshCentroidY()).toBeCloseTo(before + 3, 5);
    expect(s().faceCount).toBe(faces); // moving the object doesn't change its topology
  });

  it('clearing the object selection removes the gizmo', () => {
    s().applyPick(null, false);
    expect(s().objectSelected).toBe(false);
    expect(s().selectionCentroid()).toBeNull();
  });

  it('picks a single vertex and centers the gizmo on it', () => {
    selectObject();
    s().setComponent('vertex');
    s().applyPick({ kind: 'vertex', vertex: 0 }, false);
    expect(s().selection).toHaveLength(1);
    expect(s().selectionVerticesCompact()).toEqual([0]);
    const pv = s().geometry.polyVerts!;
    const c = s().selectionCentroid()!;
    expect(c[0]).toBeCloseTo(pv[0], 5);
    expect(c[1]).toBeCloseTo(pv[1], 5);
    expect(c[2]).toBeCloseTo(pv[2], 5);
  });

  it('shift-adds to the selection and ctrl removes from it', () => {
    selectObject();
    s().setComponent('vertex');
    s().applyPick({ kind: 'vertex', vertex: 0 }, false);
    s().applyPick({ kind: 'vertex', vertex: 1 }, true); // Shift adds
    expect(s().selection).toHaveLength(2);
    s().applyPick({ kind: 'vertex', vertex: 0 }, false, true); // Ctrl removes vertex 0
    expect(s().selection).toHaveLength(1);
    expect(s().selectionVerticesCompact()).toEqual([1]); // vertex 1 remains
  });

  it('moving a vertex only moves that vertex (not the whole mesh)', () => {
    selectObject();
    s().setComponent('vertex');
    s().applyPick({ kind: 'vertex', vertex: 0 }, false);
    const before = meshCentroidY();
    const vertCount = s().geometry.polyVerts!.length / 3;
    s().beginTransform();
    s().translateSelectionLive(0, 6, 0);
    s().endTransform();
    // One vertex rose by 6 → mesh centroid rises by 6 / vertexCount.
    expect(meshCentroidY()).toBeCloseTo(before + 6 / vertCount, 4);
  });

  it('picks an edge and centers the gizmo on its midpoint', () => {
    selectObject();
    s().setComponent('edge');
    const loop = s().geometry.polygons![0];
    const a = loop[0];
    const b = loop[1];
    s().applyPick({ kind: 'edge', edge: [a, b] }, false);
    expect(s().selection).toHaveLength(1);
    const pv = s().geometry.polyVerts!;
    const mid = (i: number) => (pv[a * 3 + i] + pv[b * 3 + i]) / 2;
    const c = s().selectionCentroid()!;
    expect(c[0]).toBeCloseTo(mid(0), 5);
    expect(c[1]).toBeCloseTo(mid(1), 5);
    expect(c[2]).toBeCloseTo(mid(2), 5);
    expect(s().selectionEdgesCompact()).toHaveLength(1);
  });

  it('a pick whose kind mismatches the active mode is ignored', () => {
    selectObject();
    s().setComponent('vertex');
    s().applyPick({ kind: 'face', face: 0 }, false);
    expect(s().selection).toEqual([]);
  });
});

describe('modeler — edit modes require a selected object', () => {
  it('ignores switching to an edit mode while nothing is focused', () => {
    expect(s().hasActiveObject()).toBe(false);
    for (const mode of ['vertex', 'edge', 'face'] as const) {
      s().setComponent(mode);
      expect(s().component).toBe('object'); // gated — stayed in object mode
    }
  });

  it('allows edit modes once an object is selected, and locks back out when deselected', () => {
    selectObject();
    expect(s().hasActiveObject()).toBe(true);
    s().setComponent('face');
    expect(s().component).toBe('face');

    // Back to object mode, click empty space → focus drops, edit modes lock out again.
    s().setComponent('object');
    s().applyPick(null, false);
    expect(s().hasActiveObject()).toBe(false);
    s().setComponent('vertex');
    expect(s().component).toBe('object');
  });

  it('keeps component picks on the focused object and ignores other objects', () => {
    // Add a second object (a grid beside the cube) and focus the cube.
    s().addPrimitive('grid');
    const gridFace = s().geometry.polygons!.length - 1; // last polygon belongs to the new grid
    s().setComponent('object');
    s().applyPick({ kind: 'object', face: 0 }, false); // focus the cube
    s().setComponent('face');
    s().applyPick({ kind: 'face', face: 0 }, false); // a cube face
    expect(s().selection).toHaveLength(1);
    s().applyPick({ kind: 'face', face: gridFace }, false); // the grid (dimmed) is ignored
    expect(s().selection).toHaveLength(1); // unchanged — focus didn't jump to the grid
  });
});
