import { describe, it, expect, beforeEach } from 'vitest';
import type { Entity } from '@/types';
import { useEditorStore } from '@/store/editorStore';
import { useModelerStore } from './modelerStore';

const s = () => useModelerStore.getState();

const meshEntity = (): Entity => ({
  id: 'model', name: 'Mesh', parentId: null,
  transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
  mesh: { kind: 'box', color: '#fff', visible: true },
  scriptIds: [], props: {},
});

beforeEach(() => {
  useEditorStore.setState({ entities: [meshEntity()], past: [], future: [], sceneRevision: 0 });
  s().init();
  // Focus the whole cube in object mode (a single island) so the selection = all 8 verts.
  s().setComponent('object');
  s().applyPick({ kind: 'object', face: 0 }, false);
});

describe('modeler inspector actions', () => {
  it('reports zeroed bounds with nothing selected, full cube bounds when focused', () => {
    s().setComponent('object');
    s().pickFace(null, false); // clear selection
    expect(s().selectionBounds().count).toBe(0);

    s().applyPick({ kind: 'object', face: 0 }, false); // re-focus the cube
    const b = s().selectionBounds();
    expect(b.count).toBe(8);
    expect(b.center.map((n) => Math.round(n))).toEqual([0, 0, 0]);
    expect(b.size.map((n) => Math.round(n))).toEqual([2, 2, 2]); // cube spans ±1
  });

  it('setSelectionCenter moves the centroid to an absolute value (one undo step)', () => {
    s().setSelectionCenter('y', 5);
    expect(s().selectionBounds().center[1]).toBeCloseTo(5);
    expect(s().canUndo).toBe(true);
    s().undo();
    expect(s().selectionBounds().center[1]).toBeCloseTo(0);
  });

  it('setSelectionDimension scales the selection to an absolute size about its centroid', () => {
    const before = s().selectionBounds();
    s().setSelectionDimension('x', 4); // cube was 2 wide → expect 4
    const after = s().selectionBounds();
    expect(after.size[0]).toBeCloseTo(4);
    expect(after.center[0]).toBeCloseTo(before.center[0]); // centroid preserved
    expect(after.size[1]).toBeCloseTo(before.size[1]); // other axes untouched
  });

  it('setSelectionDimension is a no-op on a zero-extent axis', () => {
    // Select a single vertex (vertex mode): every axis extent is 0.
    s().setComponent('vertex');
    useModelerStore.setState({ selection: [0] });
    const before = s().geometry.positions.slice();
    s().setSelectionDimension('x', 3);
    expect(s().geometry.positions).toEqual(before); // unchanged
  });

  it('nudgeSelectionRotation rotates about the centroid and is undoable', () => {
    const before = s().selectionBounds().center.slice();
    s().nudgeSelectionRotation({ x: 0, y: 90, z: 0 });
    const after = s().selectionBounds();
    // A rotation about the centroid leaves the centroid fixed (cube stays centered).
    expect(after.center[0]).toBeCloseTo(before[0]);
    expect(after.center[2]).toBeCloseTo(before[2]);
    expect(s().canUndo).toBe(true);
  });

  it('ignores numeric transforms when nothing is selected', () => {
    s().setComponent('object');
    s().pickFace(null, false);
    const before = s().geometry.positions.slice();
    s().setSelectionCenter('x', 9);
    s().nudgeSelectionRotation({ x: 45, y: 0, z: 0 });
    expect(s().geometry.positions).toEqual(before);
  });
});
