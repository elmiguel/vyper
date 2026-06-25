import { describe, it, expect, beforeEach } from 'vitest';
import type { CustomGeometry, Entity } from '@/types';
import { useEditorStore } from '../editorStore';

const s = () => useEditorStore.getState();
const geo: CustomGeometry = { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2], normals: [] };
const geo2: CustomGeometry = { positions: [0, 0, 0, 2, 0, 0, 0, 2, 0], indices: [0, 1, 2], normals: [] };

const boxEntity = (): Entity => ({
  id: 'e1',
  name: 'Box',
  parentId: null,
  transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
  mesh: { kind: 'box', color: '#fff', visible: true },
  scriptIds: [],
  props: {},
});

beforeEach(() => {
  useEditorStore.setState({
    entities: [boxEntity()],
    past: [],
    future: [],
    sceneRevision: 0,
    assetLibrary: { assets: [] },
    meshEdit: { active: false, entityId: null, component: 'face', selection: [], sculpt: null, tool: 'select' },
    selectedId: null,
  });
});

describe('beginMeshEdit / endMeshEdit', () => {
  it('enters Edit Mode for an entity in face mode and selects it', () => {
    s().beginMeshEdit('e1');
    expect(s().meshEdit).toMatchObject({ active: true, entityId: 'e1', component: 'face', selection: [] });
    expect(s().selectedId).toBe('e1');
  });

  it('exits Edit Mode and clears the selection', () => {
    s().beginMeshEdit('e1');
    s().setMeshSelection('face', ['0', '1']);
    s().endMeshEdit();
    expect(s().meshEdit.active).toBe(false);
    expect(s().meshEdit.selection).toEqual([]);
  });

  it('pressing Play exits Edit Mode (so the edited entity re-enables + plays normally)', () => {
    s().beginMeshEdit('e1');
    expect(s().meshEdit.active).toBe(true);
    s().play();
    expect(s().playState).toBe('playing');
    expect(s().meshEdit.active).toBe(false); // controller re-enables the source mesh on exit
    expect(s().rig.active).toBe(false);
    expect(s().sculpting).toBe(false);
    s().stop();
  });
});

describe('setMeshComponent / setMeshSelection', () => {
  it('switching component clears the selection', () => {
    s().beginMeshEdit('e1');
    s().setMeshSelection('face', ['2']);
    s().setMeshComponent('vertex');
    expect(s().meshEdit.component).toBe('vertex');
    expect(s().meshEdit.selection).toEqual([]);
  });

  it('records the live selection from the controller', () => {
    s().beginMeshEdit('e1');
    s().setMeshSelection('edge', ['0|1', '1|2']);
    expect(s().meshEdit).toMatchObject({ component: 'edge', selection: ['0|1', '1|2'] });
  });
});

describe('setMeshSculptBrush', () => {
  it('sets a sculpt brush and switching component clears it', () => {
    s().beginMeshEdit('e1');
    s().setMeshSculptBrush({ radius: 2, strength: 0.5, mode: 'draw' });
    expect(s().meshEdit.sculpt).toMatchObject({ mode: 'draw', radius: 2 });
    s().setMeshComponent('vertex');
    expect(s().meshEdit.sculpt).toBeNull();
  });

  it('clears the brush (returns to select mode) when set to null', () => {
    s().beginMeshEdit('e1');
    s().setMeshSculptBrush({ radius: 1, strength: 0.5, mode: 'inflate' });
    s().setMeshSculptBrush(null);
    expect(s().meshEdit.sculpt).toBeNull();
  });
});

describe('setMeshTool', () => {
  it('activates an interactive tool and clears the selection + brush', () => {
    s().beginMeshEdit('e1');
    s().setMeshSelection('edge', ['0|1']);
    s().setMeshSculptBrush({ radius: 1, strength: 0.5, mode: 'draw' });
    s().setMeshTool('loopcut');
    expect(s().meshEdit.tool).toBe('loopcut');
    expect(s().meshEdit.sculpt).toBeNull();
    expect(s().meshEdit.selection).toEqual([]);
  });

  it('switching component resets the tool to select', () => {
    s().beginMeshEdit('e1');
    s().setMeshTool('knife');
    s().setMeshComponent('vertex');
    expect(s().meshEdit.tool).toBe('select');
  });

  it('picking a sculpt brush leaves the tool', () => {
    s().beginMeshEdit('e1');
    s().setMeshTool('loopcut');
    s().setMeshSculptBrush({ radius: 1, strength: 0.5, mode: 'draw' });
    expect(s().meshEdit.tool).toBe('select');
  });
});

describe('commitMeshGeometry', () => {
  it('writes custom geometry and records undo without rebuilding while active', () => {
    s().beginMeshEdit('e1');
    const rev = s().sceneRevision;
    const past = s().past.length;
    s().commitMeshGeometry('e1', geo);
    const e = s().entities.find((x) => x.id === 'e1')!;
    expect(e.mesh).toMatchObject({ kind: 'custom' });
    expect(e.mesh!.custom).toBe(geo);
    expect(s().sceneRevision).toBe(rev); // no rebuild mid-edit
    expect(s().past.length).toBe(past + 1); // undoable
  });

  it('bumps the scene revision on the final (inactive) commit', () => {
    const rev = s().sceneRevision;
    s().commitMeshGeometry('e1', geo2);
    expect(s().sceneRevision).toBeGreaterThan(rev);
    expect(s().entities[0].mesh!.custom).toBe(geo2);
  });
});

describe('saveMeshToLibrary', () => {
  it('adds a generated asset carrying the geometry inline', () => {
    const id = s().saveMeshToLibrary('My Mesh', geo);
    const asset = s().assetLibrary.assets.find((a) => a.id === id)!;
    expect(asset).toMatchObject({ name: 'My Mesh', type: 'model', source: 'generated', format: 'mesh' });
    expect(asset.geometry).toBe(geo);
  });

  it('instantiates a generated asset as an editable custom mesh', () => {
    const id = s().saveMeshToLibrary('Lib Mesh', geo);
    const entId = s().addModelEntity(id);
    const e = s().entities.find((x) => x.id === entId)!;
    expect(e.mesh).toMatchObject({ kind: 'custom' });
    expect(e.mesh!.custom).toBe(geo);
  });
});
