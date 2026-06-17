import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Asset } from '@/types';
import { useEditorStore } from '@/store/editorStore';
import { AssetEditor } from './AssetEditor';

const model: Asset = { id: 'chicken', name: 'chicken', type: 'model', source: 'builtin', format: 'obj', textures: [] };
const get = () => useEditorStore.getState().assetLibrary.assets[0];

beforeEach(() => {
  useEditorStore.setState({ assetLibrary: { assets: [{ ...model }] }, past: [], future: [] });
});

describe('AssetEditor', () => {
  it('edits the name through the store', () => {
    render(<AssetEditor asset={model} />);
    fireEvent.change(screen.getByDisplayValue('chicken'), { target: { value: 'Chicken' } });
    expect(get().name).toBe('Chicken');
  });

  it('parses tags from a comma-separated string', () => {
    render(<AssetEditor asset={model} />);
    fireEvent.change(screen.getByPlaceholderText('comma, separated'), { target: { value: 'animal, farm ,  ' } });
    expect(get().tags).toEqual(['animal', 'farm']);
  });

  it('toggles normalize-size into the import transform', () => {
    render(<AssetEditor asset={model} />);
    fireEvent.click(screen.getByLabelText(/normalize size/i));
    expect(get().importTransform?.normalizeSize).toBe(true);
  });

  it('sets a material tint', () => {
    render(<AssetEditor asset={model} />);
    const color = document.querySelector('input[type="color"]') as HTMLInputElement;
    fireEvent.input(color, { target: { value: '#ff0000' } });
    expect(get().material?.colorHex).toBe('#ff0000');
  });

  it('toggles the double-sided geometry option', () => {
    render(<AssetEditor asset={model} />);
    fireEvent.click(screen.getByLabelText(/double-sided/i));
    expect(get().material?.doubleSided).toBe(true);
  });

  it('hides model-only controls for a texture asset', () => {
    const tex: Asset = { ...model, type: 'texture', format: 'png' };
    useEditorStore.setState({ assetLibrary: { assets: [tex] } });
    render(<AssetEditor asset={tex} />);
    expect(screen.queryByText(/Import transform/i)).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('chicken')).toBeInTheDocument(); // metadata still shown
  });
});
