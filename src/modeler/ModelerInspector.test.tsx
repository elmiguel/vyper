import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Entity } from '@/types';
import { useEditorStore } from '@/store/editorStore';
import { useModelerStore } from './modelerStore';
import { ModelerInspector } from './ModelerInspector';

const s = () => useModelerStore.getState();

const meshEntity = (): Entity => ({
  id: 'model', name: 'Mesh', parentId: null,
  transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
  mesh: { kind: 'box', color: '#ffffff', visible: true },
  scriptIds: [], props: {},
});

beforeEach(() => {
  useEditorStore.setState({ mode: '3d', entities: [meshEntity()], assetLibrary: { assets: [] }, past: [], future: [], sceneRevision: 0 });
  s().init();
  s().setComponent('object');
  s().applyPick({ kind: 'object', face: 0 }, false); // focus the whole cube
});

describe('ModelerInspector', () => {
  it('renders Transform and Material sections', () => {
    render(<ModelerInspector />);
    expect(screen.getByText('Transform', { selector: '.studio-label' })).toBeInTheDocument();
    expect(screen.getByText('Material', { selector: '.studio-label' })).toBeInTheDocument();
  });

  it('carries the .inspector class so shared form theming (selects/inputs) applies', () => {
    const { container } = render(<ModelerInspector />);
    expect(container.querySelector('.panel.inspector')).not.toBeNull();
  });

  it('shows transform fields and the active-target readout when something is selected', () => {
    render(<ModelerInspector />);
    expect(screen.getByText('Position')).toBeInTheDocument();
    expect(screen.getByText('Size')).toBeInTheDocument();
    expect(screen.getByText(/Editing: Whole object/i)).toBeInTheDocument();
  });

  it('shows a hint instead of fields when nothing is selected', () => {
    s().setComponent('object');
    s().pickFace(null, false); // clear selection
    render(<ModelerInspector />);
    expect(screen.getByText(/Select an object/i)).toBeInTheDocument();
    expect(screen.queryByText('Position')).not.toBeInTheDocument();
  });

  it('editing the Position X field moves the selection centroid', () => {
    render(<ModelerInspector />);
    const inputs = screen.getAllByRole('textbox'); // Position[x,y,z], Rotate[x,y,z], Size[x,y,z]
    fireEvent.change(inputs[0], { target: { value: '3' } }); // Position X
    expect(s().selectionBounds().center[0]).toBeCloseTo(3);
  });

  it('editing the Size X field scales the selection to that absolute width', () => {
    render(<ModelerInspector />);
    const inputs = screen.getAllByRole('textbox');
    fireEvent.change(inputs[6], { target: { value: '4' } }); // Size X (cube starts 2 wide)
    expect(s().selectionBounds().size[0]).toBeCloseTo(4);
  });

  it('writes a colour change to the backing mesh entity', () => {
    const { container } = render(<ModelerInspector />);
    const color = container.querySelector('input[type="color"]') as HTMLInputElement;
    fireEvent.change(color, { target: { value: '#ff0000' } });
    expect(useEditorStore.getState().entities[0].mesh!.color).toBe('#ff0000');
  });

  it('embeds the PBR material editor (metallic/roughness)', () => {
    render(<ModelerInspector />);
    expect(screen.getByText('Metallic')).toBeInTheDocument();
    expect(screen.getByText('Roughness')).toBeInTheDocument();
  });
});
