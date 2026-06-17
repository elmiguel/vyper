import type { MenuItem } from '@/ui/ContextMenu';
import { describeBinding, comboTokens, type Keymap } from '@/input/keymaps';
import type { useModelerStore } from './modelerStore';
import type { KernelPrimitive } from '@/kernel/primitives';

type Store = ReturnType<typeof useModelerStore.getState>;

const PRIMS: KernelPrimitive[] = ['cube', 'plane', 'grid', 'cylinder', 'sphere', 'cone', 'torus'];
/** Maya component-mode keys (shown as hints; the viewport also accepts 1–4). */
const MODE_KEYS = { object: 'F8 · 1', vertex: 'F9 · 2', edge: 'F10 · 3', face: 'F11 · 4' } as const;

/**
 * Build the Modeling Studio's right-click menu, adapted to the active component mode.
 * Every entry is wired to a store action and carries its keyboard-shortcut hint (resolved
 * from the active keymap where one exists). Pure — takes the store snapshot + keymap and
 * returns {@link MenuItem}s, so it's easy to unit-test and keeps the viewport thin.
 */
export function buildModelerMenu(s: Store, km: Keymap): MenuItem[] {
  const key = (a: Parameters<typeof describeBinding>[1]) => describeBinding(km, a);
  const combo = (c: string) => { const t = comboTokens(c); return t.join(t[0] === '⌘' ? '' : '+'); };
  const { component, selection } = s;
  const has = selection.length > 0 || s.objectSelected;
  const items: MenuItem[] = [];

  // New mesh + component mode + tools (always available).
  items.push({
    label: 'New Mesh',
    submenu: PRIMS.map((p) => ({ label: p[0].toUpperCase() + p.slice(1), onClick: () => s.addPrimitive(p) })),
  });
  items.push({
    label: 'Component Mode',
    submenu: (['object', 'vertex', 'edge', 'face'] as const).map((m) => ({
      label: m[0].toUpperCase() + m.slice(1),
      shortcut: MODE_KEYS[m],
      checked: component === m,
      onClick: () => s.setComponent(m),
    })),
  });
  items.push({
    label: 'Tools',
    submenu: [
      { label: 'Loop Cut', checked: s.editTool === 'loopcut', onClick: () => s.setEditTool('loopcut') },
      { label: 'Knife', checked: s.editTool === 'knife', onClick: () => s.setEditTool('knife') },
      { label: 'Draw Poly', checked: s.editTool === 'drawpoly', onClick: () => s.setEditTool('drawpoly') },
    ],
  });

  // Contextual modeling operators for the active component mode.
  if (component === 'face' || component === 'object') {
    const noFaces = component !== 'face' || selection.length === 0;
    items.push({ label: 'Extrude', separator: true, shortcut: combo('mod+e'), disabled: noFaces, onClick: () => s.extrude(0.5) });
    items.push({ label: 'Poke', disabled: noFaces, onClick: () => s.poke() });
    items.push({ label: 'Triangulate', onClick: () => s.triangulate() });
    items.push({ label: 'Quadrangulate', onClick: () => s.quadrangulate() });
    items.push({ label: 'Reverse Normals', onClick: () => s.reverseNormals() });
    items.push({ label: 'Extract', disabled: noFaces, onClick: () => s.extract() });
  }
  if (component === 'vertex') {
    items.push({ label: 'Connect', separator: true, disabled: selection.length < 2, onClick: () => s.connect() });
    items.push({ label: 'Add Face', disabled: selection.length < 3, onClick: () => s.addFaceFromSelection() });
    items.push({ label: 'Merge Vertices', disabled: selection.length < 2, onClick: () => s.mergeVerts() });
    items.push({ label: 'Average Vertices', disabled: selection.length === 0, onClick: () => s.average() });
  }
  if (component === 'edge') {
    items.push({ label: 'Bridge', separator: true, disabled: selection.length < 2, onClick: () => s.bridge() });
    items.push({ label: 'Add Vertex', disabled: selection.length === 0, onClick: () => s.addVertexOnEdges() });
    items.push({ label: 'Collapse Edge', disabled: selection.length === 0, onClick: () => s.collapse() });
    items.push({ label: 'Loop Cut', onClick: () => s.setEditTool('loopcut') });
  }

  // Selection ops (grow/shrink, loop/ring, convert) for any component mode.
  if (component !== 'object') {
    const selSub: MenuItem[] = [
      { label: 'Grow', shortcut: '>', disabled: !selection.length, onClick: () => s.grow() },
      { label: 'Shrink', shortcut: '<', disabled: !selection.length, onClick: () => s.shrink() },
    ];
    if (component === 'edge') {
      selSub.push({ label: 'Edge Loop', disabled: !selection.length, onClick: () => s.selectEdgeLoop() });
      selSub.push({ label: 'Edge Ring', disabled: !selection.length, onClick: () => s.selectEdgeRing() });
    }
    selSub.push({ label: 'Convert → Vertices', disabled: !selection.length, onClick: () => s.convertTo('vertex') });
    selSub.push({ label: 'Convert → Edges', disabled: !selection.length, onClick: () => s.convertTo('edge') });
    selSub.push({ label: 'Convert → Faces', disabled: !selection.length, onClick: () => s.convertTo('face') });
    items.push({ label: 'Select', separator: true, submenu: selSub });
  }

  // Clipboard + duplicate (faces / object).
  const faceish = component === 'face' || component === 'object';
  items.push({ label: 'Duplicate', separator: true, shortcut: key('duplicate'), disabled: !faceish || !has, onClick: () => s.duplicateSelection() });
  items.push({ label: 'Copy', shortcut: key('copy'), disabled: !faceish || !has, onClick: () => s.copySelection() });
  items.push({ label: 'Paste', shortcut: key('paste'), disabled: !s.canPaste(), onClick: () => s.paste() });

  // Delete — labelled per mode, destructive styling.
  const delLabel = component === 'vertex' ? 'Delete Vertex' : component === 'edge' ? 'Delete Edge' : component === 'face' ? 'Delete Face' : 'Delete Object';
  items.push({ label: delLabel, separator: true, danger: true, shortcut: key('delete'), disabled: !has, onClick: () => s.deleteSelection() });

  // View / history.
  items.push({ label: 'Frame', separator: true, shortcut: key('focus'), onClick: () => s.requestFrame() });
  items.push({ label: 'Undo', shortcut: key('undo'), disabled: !s.canUndo, onClick: () => s.undo() });
  items.push({ label: 'Redo', shortcut: key('redo'), disabled: !s.canRedo, onClick: () => s.redo() });
  return items;
}
