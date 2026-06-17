import { describe, it, expect, beforeEach } from 'vitest';
import type { Entity } from '@/types';
import { useEditorStore } from '@/store/editorStore';
import { useModelerStore } from './modelerStore';
import { buildModelerMenu } from './modelerMenu';
import { KEYMAPS } from '@/input/keymaps';

const s = () => useModelerStore.getState();

const meshEntity = (): Entity => ({
  id: 'model', name: 'Mesh', parentId: null,
  transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
  mesh: { kind: 'box', color: '#fff', visible: true },
  scriptIds: [], props: {},
});

/** Flatten a menu (incl. submenus) to a label→item map for assertions. */
function flatten(items: ReturnType<typeof buildModelerMenu>): Map<string, (typeof items)[number]> {
  const out = new Map<string, (typeof items)[number]>();
  for (const it of items) {
    out.set(it.label, it);
    for (const sub of it.submenu ?? []) out.set(`${it.label}/${sub.label}`, sub);
  }
  return out;
}

beforeEach(() => {
  useEditorStore.setState({ entities: [meshEntity()], past: [], future: [], sceneRevision: 0 });
  s().init();
});

describe('buildModelerMenu', () => {
  it('always offers New Mesh, Component Mode, Tools, Frame/Undo/Redo with shortcuts', () => {
    const m = flatten(buildModelerMenu(s(), KEYMAPS.maya));
    expect(m.has('New Mesh/Cube')).toBe(true);
    expect(m.has('Component Mode/Vertex')).toBe(true);
    expect(m.has('Tools/Loop Cut')).toBe(true);
    expect(m.has('Tools/Draw Poly')).toBe(true);
    expect(m.get('Undo')!.shortcut).toBeTruthy(); // ⌘Z
    expect(m.get('Frame')!.shortcut).toBeTruthy(); // F
  });

  it('shows face ops in face mode and labels Delete per mode', () => {
    s().setComponent('face');
    s().pickFace(0, false);
    const m = flatten(buildModelerMenu(s(), KEYMAPS.maya));
    expect(m.get('Extrude')!.disabled).toBeFalsy();
    expect(m.get('Extrude')!.shortcut).toBeTruthy(); // ⌘E / Ctrl+E
    expect(m.has('Triangulate')).toBe(true);
    expect(m.has('Quadrangulate')).toBe(true);
    expect(m.has('Reverse Normals')).toBe(true);
    expect(m.has('Extract')).toBe(true);
    expect(m.has('Select/Grow')).toBe(true);
    expect(m.has('Select/Convert → Vertices')).toBe(true);
    expect(m.has('Delete Face')).toBe(true);
    expect(m.get('Delete Face')!.shortcut).toBeTruthy(); // Del
  });

  it('shows Connect / Add Face / Merge in vertex mode', () => {
    s().setComponent('vertex');
    const m = flatten(buildModelerMenu(s(), KEYMAPS.maya));
    expect(m.has('Connect')).toBe(true);
    expect(m.has('Add Face')).toBe(true);
    expect(m.has('Merge Vertices')).toBe(true);
    expect(m.has('Average Vertices')).toBe(true);
    expect(m.has('Delete Vertex')).toBe(true);
  });

  it('shows Bridge / Add Vertex / Collapse + loop/ring in edge mode', () => {
    s().setComponent('edge');
    const m = flatten(buildModelerMenu(s(), KEYMAPS.maya));
    expect(m.has('Bridge')).toBe(true);
    expect(m.has('Add Vertex')).toBe(true);
    expect(m.has('Collapse Edge')).toBe(true);
    expect(m.has('Select/Edge Loop')).toBe(true);
    expect(m.has('Select/Edge Ring')).toBe(true);
    expect(m.has('Delete Edge')).toBe(true);
  });

  it('disables Paste until something is copied', () => {
    s().setComponent('face');
    expect(flatten(buildModelerMenu(s(), KEYMAPS.maya)).get('Paste')!.disabled).toBe(true);
    s().pickFace(0, false);
    s().copySelection();
    expect(flatten(buildModelerMenu(s(), KEYMAPS.maya)).get('Paste')!.disabled).toBe(false);
  });
});
