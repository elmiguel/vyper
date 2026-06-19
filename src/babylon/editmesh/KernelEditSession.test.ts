import { describe, it, expect, beforeEach } from 'vitest';
import { buildPrimitive } from '@/kernel/primitives';
import { toGeometry } from '@/kernel/render';
import { KernelEditSession } from './KernelEditSession';

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
