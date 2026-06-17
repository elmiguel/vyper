import { describe, it, expect, beforeEach } from 'vitest';
import type { SerializedDockview } from 'dockview';
import { useEditorStore } from '../editorStore';
import { defaultWorkspace } from './workspaceSlice';
import { DEFAULT_PRESET_ID } from '@/layout/workspacePresets';

// A minimal stand-in for a serialized dock arrangement (shape is opaque to the store).
const fakeLayout = (tag: string) => ({ grid: { root: tag } } as unknown as SerializedDockview);

beforeEach(() => useEditorStore.getState().hydrateWorkspace(defaultWorkspace()));

describe('workspace slice', () => {
  const ws = () => useEditorStore.getState().workspace;

  it('starts with the Default preset active and no saved layouts', () => {
    expect(ws().activePresetId).toBe(DEFAULT_PRESET_ID);
    expect(ws().custom).toEqual([]);
    expect(ws().layout).toBeNull();
  });

  it('setWorkspaceLayout persists the live arrangement without touching presets', () => {
    const layout = fakeLayout('live');
    useEditorStore.getState().setWorkspaceLayout(layout);
    expect(ws().layout).toBe(layout);
    expect(ws().activePresetId).toBe(DEFAULT_PRESET_ID);
  });

  it('setActivePreset marks the active preset', () => {
    useEditorStore.getState().setActivePreset('scripting');
    expect(ws().activePresetId).toBe('scripting');
  });

  it('saveCustomLayout stores a named layout, makes it active, and returns its id', () => {
    const id = useEditorStore.getState().saveCustomLayout('My Layout', fakeLayout('a'));
    expect(ws().custom).toHaveLength(1);
    expect(ws().custom[0]).toMatchObject({ id, label: 'My Layout' });
    expect(ws().activePresetId).toBe(id);
    expect(ws().layout).toEqual(fakeLayout('a'));
  });

  it('generates unique ids for layouts with the same label', () => {
    const a = useEditorStore.getState().saveCustomLayout('Dup', fakeLayout('1'));
    const b = useEditorStore.getState().saveCustomLayout('Dup', fakeLayout('2'));
    expect(a).not.toBe(b);
    expect(ws().custom).toHaveLength(2);
  });

  it('deleteCustomLayout removes the layout', () => {
    const id = useEditorStore.getState().saveCustomLayout('Temp', fakeLayout('x'));
    useEditorStore.getState().setActivePreset('default');
    useEditorStore.getState().deleteCustomLayout(id);
    expect(ws().custom).toHaveLength(0);
  });

  it('deleting the active custom layout falls back to the Default preset', () => {
    const id = useEditorStore.getState().saveCustomLayout('Active', fakeLayout('x'));
    expect(ws().activePresetId).toBe(id);
    useEditorStore.getState().deleteCustomLayout(id);
    expect(ws().activePresetId).toBe(DEFAULT_PRESET_ID);
  });

  it('hydrateWorkspace replaces the whole workspace', () => {
    useEditorStore.getState().saveCustomLayout('Old', fakeLayout('x'));
    const incoming = { layout: fakeLayout('y'), custom: [], activePresetId: 'compact' };
    useEditorStore.getState().hydrateWorkspace(incoming);
    expect(ws()).toEqual(incoming);
  });
});
