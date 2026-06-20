import { describe, it, expect, beforeEach } from 'vitest';
import { buildPrimitive } from '@/kernel/primitives';
import { toGeometry } from '@/kernel/render';
import { KernelEditSession, cageGeometry } from './KernelEditSession';

/** A baked cube geometry to load into the session (6 quad faces). */
const cubeGeo = () => toGeometry(buildPrimitive('cube', 2));
const faceCount = (s: KernelEditSession) => s.geometry.polygons!.length;

describe('KernelEditSession', () => {
  let s: KernelEditSession;
  beforeEach(() => {
    s = new KernelEditSession();
    s.load(cubeGeo());
  });

  it('loads a cube and starts in object mode with nothing selected', () => {
    expect(faceCount(s)).toBe(6);
    expect(s.component).toBe('object');
    expect(s.selection).toEqual([]);
    expect(s.selectionCentroid()).toBeNull();
  });

  it('object-picks the whole island', () => {
    s.applyPick({ kind: 'object', face: 0 });
    expect(s.selection).toHaveLength(6); // the cube is one connected island
    expect(s.selectionPolygons()).toHaveLength(6);
    expect(s.selectionCentroid()).not.toBeNull();
  });

  it('extrudes a selected face and grows the mesh, then undoes', () => {
    s.setComponent('face');
    s.applyPick({ kind: 'face', face: 0 });
    expect(s.selection).toHaveLength(1);
    s.extrude(1);
    expect(faceCount(s)).toBe(6 + 4); // 4 new wall quads
    expect(s.selection.length).toBeGreaterThan(0); // cap re-selected
    expect(s.canUndo()).toBe(true);

    s.undo();
    expect(faceCount(s)).toBe(6);
  });

  it('moves only the selected vertex when transforming in vertex mode', () => {
    s.setComponent('vertex');
    s.applyPick({ kind: 'vertex', vertex: 0 });
    const before = s.selectionCentroid()!;
    s.beginTransform();
    s.translateSelection(0, 5, 0);
    s.endTransform();
    const after = s.selectionCentroid()!;
    expect(after[1]).toBeCloseTo(before[1] + 5, 5);
    expect(faceCount(s)).toBe(6); // topology unchanged
  });

  it('rotates the selected vertex about a pivot (90° about Y)', () => {
    s.setComponent('vertex');
    s.applyPick({ kind: 'vertex', vertex: 0 });
    const before = s.selectionCentroid()!;
    const pivot: [number, number, number] = [0, before[1], 0];
    s.beginTransform();
    // 90° about +Y: (x,z) -> (z,-x). Quaternion = (0, sin45, 0, cos45).
    const h = Math.SQRT1_2;
    s.rotateSelection({ x: 0, y: h, z: 0, w: h }, pivot);
    s.endTransform();
    const after = s.selectionCentroid()!;
    expect(after[0]).toBeCloseTo(before[2], 4);
    expect(after[2]).toBeCloseTo(-before[0], 4);
    expect(after[1]).toBeCloseTo(before[1], 4); // Y unchanged
  });

  it('scales the selected vertex about a pivot', () => {
    s.setComponent('vertex');
    s.applyPick({ kind: 'vertex', vertex: 0 });
    const before = s.selectionCentroid()!;
    const pivot: [number, number, number] = [0, 0, 0];
    s.beginTransform();
    s.scaleSelection(2, 2, 2, pivot);
    s.endTransform();
    const after = s.selectionCentroid()!;
    expect(after[0]).toBeCloseTo(before[0] * 2, 4);
    expect(after[1]).toBeCloseTo(before[1] * 2, 4);
    expect(after[2]).toBeCloseTo(before[2] * 2, 4);
    s.undo();
    expect(s.selectionCentroid()).toBeNull(); // undo clears selection + restores positions
  });

  it('reports selection bounds and sets the centroid to an absolute position', () => {
    s.setComponent('face');
    s.applyPick({ kind: 'face', face: 0 });
    const b0 = s.selectionBounds();
    expect(b0.count).toBeGreaterThan(0);
    const changed = s.setSelectionCenter(1, b0.center[1] + 3);
    expect(changed).toBe(true);
    expect(s.selectionBounds().center[1]).toBeCloseTo(b0.center[1] + 3, 4);
    expect(s.setSelectionCenter(1, s.selectionBounds().center[1])).toBe(false); // no-op when unchanged
  });

  it('sets a selection dimension by scaling about its centroid', () => {
    s.setComponent('face');
    s.applyPick({ kind: 'face', face: 0 });
    const before = s.selectionBounds();
    const axis = before.size[0] > 1e-6 ? 0 : 1; // pick a non-flat axis of the quad
    s.setSelectionDimension(axis, before.size[axis] * 2);
    expect(s.selectionBounds().size[axis]).toBeCloseTo(before.size[axis] * 2, 4);
  });

  it('nudges selection rotation about its centroid (centroid preserved)', () => {
    s.setComponent('face');
    s.applyPick({ kind: 'face', face: 0 });
    const before = s.selectionBounds();
    const changed = s.nudgeSelectionRotation(0, 90, 0);
    expect(changed).toBe(true);
    const after = s.selectionBounds();
    expect(after.center[0]).toBeCloseTo(before.center[0], 4);
    expect(after.center[2]).toBeCloseTo(before.center[2], 4);
    expect(s.nudgeSelectionRotation(0, 0, 0)).toBe(false); // zero euler → no-op
  });

  it('shift-adds and ctrl-removes faces', () => {
    s.setComponent('face');
    s.applyPick({ kind: 'face', face: 0 });
    s.applyPick({ kind: 'face', face: 1 }, 'add');
    expect(s.selection).toHaveLength(2);
    s.applyPick({ kind: 'face', face: 0 }, 'remove');
    expect(s.selection).toHaveLength(1);
  });

  it('converts a face selection to its vertices', () => {
    s.setComponent('face');
    s.applyPick({ kind: 'face', face: 0 });
    s.convertTo('vertex');
    expect(s.component).toBe('vertex');
    expect(s.selection).toHaveLength(4); // a quad's four corners
    expect(s.selectionVerticesCompact()).toHaveLength(4);
  });

  it('switching component mode clears the selection', () => {
    s.setComponent('face');
    s.applyPick({ kind: 'face', face: 0 });
    s.setComponent('edge');
    expect(s.selection).toEqual([]);
    expect(s.selectionPolygons()).toEqual([]);
  });

  it('pokes a face (adds a center vertex + fan), undoable', () => {
    s.setComponent('face');
    s.applyPick({ kind: 'face', face: 0 });
    s.poke();
    expect(faceCount(s)).toBe(6 - 1 + 4); // the quad becomes a 4-triangle fan
    s.undo();
    expect(faceCount(s)).toBe(6);
  });

  it('adds a vertex on a selected edge (edge mode)', () => {
    s.setComponent('edge');
    const before = s.geometry.polyVerts!.length / 3;
    // Select one edge by picking its two dense endpoints' pair via the first polygon's edge.
    const loop = s.geometry.polygons![0];
    s.applyPick({ kind: 'edge', edge: [loop[0], loop[1]] });
    expect(s.selection).toHaveLength(1);
    s.addVertexOnEdges();
    expect(s.geometry.polyVerts!.length / 3).toBeGreaterThan(before);
  });

  it('selectRing / selectLoop keep a valid edge selection (delegate to kernel selectionOps)', () => {
    // Loop/ring topology is covered in kernel/selectionOps.test.ts; here we only confirm the
    // session delegates without clearing the selection. (A cube's valence-3 corners stop a loop
    // from extending, so length stays ≥1 rather than wrapping.)
    s.setComponent('edge');
    const loop = s.geometry.polygons![0];
    s.applyPick({ kind: 'edge', edge: [loop[0], loop[1]] });
    s.selectLoop();
    expect(s.selection.length).toBeGreaterThanOrEqual(1);
    s.selectRing();
    expect(s.selection.length).toBeGreaterThanOrEqual(1);
  });

  it('extract detaches selected faces and re-selects them', () => {
    s.setComponent('face');
    s.applyPick({ kind: 'face', face: 0 });
    s.extract();
    expect(s.selection.length).toBeGreaterThan(0);
    expect(faceCount(s)).toBe(6); // same face count, now a detached shell
  });

  it('groups islands so clicking one selects the whole group; ungroup splits them', () => {
    // Two disjoint triangles = two islands (fromGeometry uses the polygon topology).
    s.load({
      positions: [], indices: [], normals: [],
      polyVerts: [0, 0, 0, 1, 0, 0, 0, 1, 0, 5, 0, 0, 6, 0, 0, 5, 1, 0],
      polygons: [[0, 1, 2], [3, 4, 5]],
    });
    s.setComponent('face');
    s.applyPick({ kind: 'face', face: 0 });
    s.applyPick({ kind: 'face', face: 1 }, 'add');
    expect(s.selection).toHaveLength(2);

    s.group();
    expect(s.isSelectionGrouped()).toBe(true);
    s.applyPick({ kind: 'face', face: 0 }); // replace-click one island → whole group selects
    expect(s.selection).toHaveLength(2);

    s.ungroup();
    s.applyPick({ kind: 'face', face: 0 });
    expect(s.selection).toHaveLength(1); // back to a single island
  });

  it('duplicates the selected faces in place (face count grows, copies re-selected)', () => {
    s.setComponent('face');
    s.applyPick({ kind: 'face', face: 0 });
    s.duplicateSelection();
    expect(faceCount(s)).toBe(6 + 1); // one extra coincident quad
    expect(s.component).toBe('face');
    expect(s.selection).toHaveLength(1); // the new copy is selected
    s.undo();
    expect(faceCount(s)).toBe(6);
  });

  it('copies a face selection and pastes it as new offset faces', () => {
    s.setComponent('face');
    expect(s.canPaste()).toBe(false);
    s.applyPick({ kind: 'face', face: 0 });
    s.copySelection();
    expect(s.canPaste()).toBe(true);
    s.paste();
    expect(faceCount(s)).toBe(6 + 1);
    expect(s.component).toBe('face');
    expect(s.selection).toHaveLength(1); // the pasted face is selected
  });

  it('copy with nothing selected leaves the clipboard empty', () => {
    s.setComponent('face');
    s.copySelection();
    expect(s.canPaste()).toBe(false);
    s.paste(); // no-op
    expect(faceCount(s)).toBe(6);
  });

  it('draw-poly commits a new face from local points', () => {
    const before = faceCount(s);
    expect(s.drawPolyCommit([[0, 2, 0], [1, 2, 0], [1, 2, 1]])).toBe(true);
    expect(faceCount(s)).toBe(before + 1);
    expect(s.drawPolyCommit([[0, 0, 0], [1, 0, 0]])).toBe(false); // <3 points → rejected
  });

  it('sketch-retopo commit replaces the mesh with the quad cage', () => {
    s.sketchTopoCommit([[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], [[0, 1, 2, 3]]);
    expect(faceCount(s)).toBe(1); // the whole mesh is now the single cage quad
  });

  it('cageGeometry bakes a standalone cage (for retopo → new object)', () => {
    const geo = cageGeometry([[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], [[0, 1, 2, 3]]);
    expect(geo.polygons).toHaveLength(1); // one quad, independent of any session
    expect(geo.positions.length).toBeGreaterThan(0);
  });

  it('bakes geometry that round-trips back into a session', () => {
    s.setComponent('face');
    s.applyPick({ kind: 'face', face: 0 });
    s.extrude(0.5);
    const baked = s.bakeGeometry();
    const s2 = new KernelEditSession();
    s2.load(baked);
    expect(s2.geometry.polygons!.length).toBe(10); // extruded cube survives the round-trip
  });
});
