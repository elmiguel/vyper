import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useEditorStore } from '@/store/editorStore';
import type { Entity } from '@/types';
import { MaterialEditor, materialOf } from './MaterialEditor';

const box = (over: Partial<Entity['mesh']> = {}): Entity =>
  ({
    id: 'e1', name: 'Box', parentId: null,
    transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
    mesh: { kind: 'box', color: '#ffffff', visible: true, ...over },
    scriptIds: [], props: {},
  } as Entity);

beforeEach(() => {
  useEditorStore.setState({ mode: '3d', entities: [], assetLibrary: { assets: [] }, past: [], future: [] });
});

describe('materialOf', () => {
  it('returns the mesh material, or a PBR default when absent', () => {
    expect(materialOf(box())).toEqual({ shading: 'pbr', metallic: 0, roughness: 1 });
    expect(materialOf(box({ material: { shading: 'standard', metallic: 0.5, roughness: 0.5 } })).shading).toBe('standard');
  });
});

describe('MaterialEditor', () => {
  it('shows a hint instead of controls in 2D', () => {
    useEditorStore.setState({ mode: '2d' });
    render(<MaterialEditor entity={box()} />);
    expect(screen.getByText(/apply to lit 3D meshes/i)).toBeInTheDocument();
  });

  it('shows a hint for trigger volumes', () => {
    render(<MaterialEditor entity={box()} />);
    // Re-render as a trigger.
    const e = { ...box(), trigger: { enabled: true, once: false, filter: [] } } as Entity;
    render(<MaterialEditor entity={e} />);
    expect(screen.getAllByText(/apply to lit 3D meshes/i).length).toBeGreaterThan(0);
  });

  it('renders metallic/roughness controls for a PBR mesh', () => {
    render(<MaterialEditor entity={box()} />);
    expect(screen.getByText('Metallic')).toBeInTheDocument();
    expect(screen.getByText('Roughness')).toBeInTheDocument();
  });

  it('writes a shading change to the store', () => {
    const e = box();
    useEditorStore.setState({ entities: [e] });
    render(<MaterialEditor entity={e} />);
    fireEvent.change(screen.getByDisplayValue(/PBR/i), { target: { value: 'standard' } });
    expect(useEditorStore.getState().entities[0].mesh!.material!.shading).toBe('standard');
  });

  it('hides PBR sliders when shading is standard', () => {
    render(<MaterialEditor entity={box({ material: { shading: 'standard', metallic: 0, roughness: 1 } })} />);
    expect(screen.queryByText('Metallic')).not.toBeInTheDocument();
  });

  it('offers an "Import textures…" option in map slots that opens the asset browser', () => {
    useEditorStore.setState({ showAssetBrowser: false });
    render(<MaterialEditor entity={box()} />);
    // Base map slot is the first map <select>; its last option opens the library.
    expect(screen.getAllByRole('option', { name: 'Import textures…' }).length).toBeGreaterThan(0);
    const baseMap = screen.getByText('Base map').parentElement!.querySelector('select')!;
    fireEvent.change(baseMap, { target: { value: '__browse__' } });
    expect(useEditorStore.getState().showAssetBrowser).toBe(true);
    // ...and it did NOT set the map to the sentinel value.
    expect(useEditorStore.getState().entities[0]?.mesh?.material?.baseColorMap).toBeUndefined();
  });
});
