import { describe, it, expect, beforeEach } from 'vitest';
import type { Entity } from '@/types';
import { useEditorStore } from '@/store/editorStore';
import { useModelerStore } from './modelerStore';

const s = () => useModelerStore.getState();

/** Y components of a flat xyz array (for checking vertical moves). */
const chunk = (a: number[]): number[] => a.filter((_, i) => i % 3 === 1);

const meshEntity = (): Entity => ({
  id: 'model', name: 'Mesh', parentId: null,
  transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
  mesh: { kind: 'box', color: '#fff', visible: true },
  scriptIds: [], props: {},
});

beforeEach(() => {
  useEditorStore.setState({ entities: [meshEntity()], past: [], future: [], sceneRevision: 0 });
  s().init();
  s().setComponent('face'); // these cases exercise the face-component editing path
});

describe('modelerStore — kernel-driven', () => {
  it('initializes a cube model with baked render geometry', () => {
    expect(s().faceCount).toBe(6);
    expect(s().geometry.polygons).toHaveLength(6);
    expect(s().geometry.indices.length).toBe(36); // 6 quads → 12 tris
    expect(s().selection).toEqual([]);
  });

  it('adds a primitive beside the model instead of replacing it', () => {
    expect(s().faceCount).toBe(6); // starting cube
    s().addPrimitive('cylinder');
    expect(s().faceCount).toBe(6 + (16 + 2)); // cube kept + cylinder (16 sides + 2 caps)
    expect(s().selection).toEqual([]);
  });

  it('picks faces (by polygon index) with shift to add', () => {
    s().pickFace(0, false);
    expect(s().selection).toHaveLength(1);
    s().pickFace(1, true);
    expect(s().selection).toHaveLength(2);
    s().pickFace(0, true); // toggles 0 back off
    expect(s().selection).toHaveLength(1);
  });

  it('clicking empty space clears the selection', () => {
    s().pickFace(0, false);
    s().pickFace(null, false);
    expect(s().selection).toEqual([]);
  });

  it('extrudes selected faces (kernel op) and grows the mesh', () => {
    s().pickFace(0, false);
    const before = s().faceCount;
    s().extrude(1);
    expect(s().faceCount).toBe(before + 4); // 4 wall quads
    // The extruded cap is re-selected.
    expect(s().selection.length).toBeGreaterThan(0);
  });

  it('undoes and redoes an extrude through the command stack', () => {
    s().pickFace(0, false);
    s().extrude(1);
    const extruded = s().faceCount;
    s().undo();
    expect(s().faceCount).toBe(6);
    expect(s().canRedo).toBe(true);
    s().redo();
    expect(s().faceCount).toBe(extruded);
  });

  it('moves selected faces via the gizmo transform and undoes as one step', () => {
    s().pickFace(0, false);
    const c0 = s().selectionCentroid();
    expect(c0).not.toBeNull();
    const minYBefore = Math.min(...chunk(s().geometry.polyVerts!));
    s().beginTransform();
    s().translateSelectionLive(0, 2, 0);
    s().endTransform();
    // The selected faces' centroid rose by 2 (selection survives the commit).
    expect(s().selectionCentroid()![1]).toBeCloseTo(c0![1] + 2, 5);
    s().undo();
    // Undo restores the pre-drag geometry as a single step.
    expect(Math.min(...chunk(s().geometry.polyVerts!))).toBeCloseTo(minYBefore, 5);
  });

  it('defaults to the Move tool and Maya layout, and switches both', () => {
    expect(s().tool).toBe('move');
    expect(s().keymap).toBe('maya');
    s().setTool('rotate');
    s().setKeymap('blender');
    expect(s().tool).toBe('rotate');
    expect(s().keymap).toBe('blender');
  });

  it('defaults the wireframe overlay on and toggles it', () => {
    expect(s().showWireframe).toBe(true);
    s().toggleWireframe();
    expect(s().showWireframe).toBe(false);
    s().toggleWireframe();
    expect(s().showWireframe).toBe(true);
  });

  it('scales selected faces about their centroid and undoes', () => {
    s().pickFace(0, false);
    const maxAbs = (a: number[]) => Math.max(...a.map(Math.abs));
    const before = maxAbs(s().geometry.polyVerts!);
    const c = s().selectionCentroid()!;
    s().beginTransform();
    s().scaleSelectionLive(2, 2, 2, c);
    s().endTransform();
    expect(maxAbs(s().geometry.polyVerts!)).toBeCloseTo(before * 2, 5);
    s().undo();
    expect(maxAbs(s().geometry.polyVerts!)).toBeCloseTo(before, 5);
  });

  it('connects two vertices of a face into a new edge (vertex mode)', () => {
    s().setComponent('vertex');
    const loop = s().geometry.polygons![0]; // a quad face
    s().applyPick({ kind: 'vertex', vertex: loop[0] }, false);
    s().applyPick({ kind: 'vertex', vertex: loop[2] }, true); // opposite corner
    const before = s().faceCount;
    s().connect();
    expect(s().faceCount).toBe(before + 1); // the face splits in two
  });

  it('loop-cuts a quad strip into clean quads (no triangulation) and undoes', () => {
    s().setComponent('edge');
    const loop = s().geometry.polygons![0];
    const before = s().faceCount;
    s().loopCutCommit([loop[0], loop[1]]);
    expect(s().faceCount).toBeGreaterThan(before);
    // Every baked polygon stays a quad — the cut must not triangulate the mesh.
    expect(s().geometry.polygons!.every((p) => p.length === 4)).toBe(true);
    s().undo();
    expect(s().faceCount).toBe(before);
  });

  it('previews a loop cut without mutating the mesh', () => {
    s().setComponent('edge');
    const loop = s().geometry.polygons![0];
    const before = s().faceCount;
    expect(s().loopCutPreview([loop[0], loop[1]]).length).toBeGreaterThan(0);
    expect(s().faceCount).toBe(before); // preview is non-destructive
  });

  it('double-click selects an edge loop; shift adds it, ctrl removes it (edge mode)', () => {
    s().addPrimitive('grid'); // 8×8 quads → valence-4 interior, so loops actually extend
    s().setComponent('edge');
    const polys = s().geometry.polygons!;
    // Find a compacted edge whose loop has more than one edge (an interior edge).
    let seed: [number, number] | null = null;
    let loopLen = 0;
    outer: for (const loop of polys) {
      for (let i = 0; i < loop.length; i++) {
        const e: [number, number] = [loop[i], loop[(i + 1) % loop.length]];
        s().applyPick({ kind: 'edge', edge: e }, false, false, true); // double-click (loop)
        if (s().selection.length > 1) {
          seed = e;
          loopLen = s().selection.length;
          break outer;
        }
      }
    }
    expect(seed).not.toBeNull();
    expect(loopLen).toBeGreaterThan(1); // the loop spans the grid, not just one edge
    // Ctrl double-click deselects the whole loop.
    s().applyPick({ kind: 'edge', edge: seed!, }, false, true, true);
    expect(s().selection).toHaveLength(0);
    // Shift double-click adds the loop back.
    s().applyPick({ kind: 'edge', edge: seed! }, true, false, true);
    expect(s().selection).toHaveLength(loopLen);
    // A plain single-click (no loop) on one of its edges replaces with just that edge.
    s().applyPick({ kind: 'edge', edge: seed! }, false, false, false);
    expect(s().selection).toHaveLength(1);
  });

  it('sketch-retopo commit replaces the mesh with the quad cage and undoes', () => {
    const before = s().faceCount; // starting cube = 6
    const verts: [number, number, number][] = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [2, 0, 0], [2, 1, 0]];
    const faces = [[0, 1, 2, 3], [1, 4, 5, 2]]; // two quads sharing an edge
    s().sketchTopoCommit(verts, faces);
    expect(s().faceCount).toBe(2);
    expect(s().geometry.polygons!.every((p) => p.length === 4)).toBe(true);
    s().undo();
    expect(s().faceCount).toBe(before); // original mesh restored
  });

  it('loop-cuts a cone (triangle fan) and slides the ring with t', () => {
    s().addPrimitive('cone');
    s().setComponent('edge');
    // The apex is the vertex shared by every side triangle; a spoke runs apex→rim.
    const tris = s().geometry.polygons!.filter((p) => p.length === 3);
    const count = new Map<number, number>();
    for (const t of tris) for (const v of t) count.set(v, (count.get(v) ?? 0) + 1);
    const apex = [...count.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const other = tris.find((t) => t.includes(apex))!.find((v) => v !== apex)!;
    const spoke: [number, number] = [apex, other];

    const before = s().faceCount;
    s().loopCutCommit(spoke);
    expect(s().faceCount).toBeGreaterThan(before); // the fan got cut (was a no-op before)
    s().undo();
    expect(s().faceCount).toBe(before);

    // The slide ratio moves the ring along the spokes (different heights).
    const low = s().loopCutPreview(spoke, 0.25)[0][0][1];
    const high = s().loopCutPreview(spoke, 0.75)[0][0][1];
    expect(low).not.toBeCloseTo(high, 3);
  });

  it('knife-cuts a face edge-to-edge', () => {
    const loop = s().geometry.polygons![0];
    const before = s().faceCount;
    s().knifeCommit([
      { a: loop[0], b: loop[1], t: 0.5 },
      { a: loop[2], b: loop[3], t: 0.5 },
    ]);
    expect(s().faceCount).toBeGreaterThan(before);
  });

  it('toggles interactive edit tools and clears the selection', () => {
    s().pickFace(0, false);
    expect(s().editTool).toBe('none');
    s().setEditTool('loopcut');
    expect(s().editTool).toBe('loopcut');
    expect(s().selection).toEqual([]);
    s().setEditTool('loopcut'); // toggling the active tool returns to none
    expect(s().editTool).toBe('none');
  });

  it('deletes the selected faces in face mode', () => {
    s().pickFace(0, false);
    const before = s().faceCount;
    s().deleteSelection();
    expect(s().faceCount).toBe(before - 1);
    expect(s().selection).toEqual([]);
  });

  it('dissolves the selected edge in edge mode', () => {
    s().setComponent('edge');
    const loop = s().geometry.polygons![0];
    s().applyPick({ kind: 'edge', edge: [loop[0], loop[1]] }, false);
    const before = s().faceCount;
    s().deleteSelection();
    expect(s().faceCount).toBe(before - 1); // two faces merged into one
  });

  it('duplicates the selected faces', () => {
    s().pickFace(0, false);
    const before = s().faceCount;
    s().duplicateSelection();
    expect(s().faceCount).toBe(before + 1);
  });

  it('copies and pastes faces, growing the mesh', () => {
    s().pickFace(0, false);
    expect(s().canPaste()).toBe(false);
    s().copySelection();
    expect(s().canPaste()).toBe(true);
    const before = s().faceCount;
    s().paste();
    expect(s().faceCount).toBe(before + 1);
  });

  it('draws a polygon from ground-plane points (oriented up), rejecting degenerate ones', () => {
    const before = s().faceCount;
    expect(s().drawPolyCommit([[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]])).toBe(true);
    expect(s().faceCount).toBe(before + 1);
    // Collinear points form no face → rejected, count unchanged.
    expect(s().drawPolyCommit([[0, 0, 0], [1, 0, 0], [2, 0, 0]])).toBe(false);
    expect(s().faceCount).toBe(before + 1);
  });

  it('adds a vertex on a selected edge (edge mode)', () => {
    s().setComponent('edge');
    const loop = s().geometry.polygons![0];
    s().applyPick({ kind: 'edge', edge: [loop[0], loop[1]] }, false);
    const beforeVerts = s().geometry.polyVerts!.length;
    s().addVertexOnEdges();
    expect(s().geometry.polyVerts!.length).toBeGreaterThan(beforeVerts);
  });

  it('triangulates and re-quadrangulates the whole mesh', () => {
    s().setComponent('face');
    s().triangulate();
    expect(s().geometry.polygons!.every((p) => p.length === 3)).toBe(true);
    s().quadrangulate();
    expect(s().geometry.polygons!.some((p) => p.length === 4)).toBe(true);
  });

  it('merges selected vertices (vertex mode)', () => {
    s().setComponent('vertex');
    const loop = s().geometry.polygons![0];
    s().applyPick({ kind: 'vertex', vertex: loop[0] }, false);
    s().applyPick({ kind: 'vertex', vertex: loop[1] }, true);
    const before = s().geometry.polyVerts!.length / 3;
    s().mergeVerts();
    expect(s().geometry.polyVerts!.length / 3).toBe(before - 1);
  });

  it('grows a face selection', () => {
    s().setComponent('face');
    s().pickFace(0, false);
    s().grow();
    expect(s().selection.length).toBeGreaterThan(1);
  });

  it('converts a face selection to vertices and switches mode', () => {
    s().setComponent('face');
    s().pickFace(0, false);
    s().convertTo('vertex');
    expect(s().component).toBe('vertex');
    expect(s().selection.length).toBe(4);
  });

  it('mirrors baked geometry into the project entity for persistence', () => {
    s().pickFace(0, false);
    s().extrude(1);
    const ent = useEditorStore.getState().entities.find((e) => e.id === 'model')!;
    expect(ent.mesh!.kind).toBe('custom');
    expect(ent.mesh!.custom!.polygons!.length).toBe(s().faceCount);
  });
});
