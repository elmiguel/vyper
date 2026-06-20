import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Controllable store: useEditorStore(selector) applies the selector to `state`.
const state = {
  meshEdit: { active: true, selection: ['0'] as string[] },
};
vi.mock('@/store/editorStore', () => ({
  useEditorStore: (sel: (s: typeof state) => unknown) => sel(state),
}));

// Fake controller exposed via getManager(); hoisted so the mock factory can see it.
const { mec } = vi.hoisted(() => ({
  mec: {
    selectionBounds: vi.fn(() => ({ count: 4, center: [1, 0, 1], min: [0, 0, 0], max: [2, 0, 2], size: [2, 0, 2] })),
    setSelectionCenter: vi.fn(),
    setSelectionDimension: vi.fn(),
    nudgeSelectionRotation: vi.fn(),
  },
}));
vi.mock('@/babylon/engine', () => ({ getManager: () => ({ meshEditController: mec }) }));

import { ComponentTransform } from './ComponentTransform';

describe('ComponentTransform', () => {
  beforeEach(() => {
    state.meshEdit = { active: true, selection: ['0'] };
    vi.clearAllMocks();
  });

  it('renders nothing when not in Edit Mode', () => {
    state.meshEdit = { active: false, selection: [] };
    const { container } = render(<ComponentTransform />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when the selection is empty', () => {
    state.meshEdit = { active: true, selection: [] };
    const { container } = render(<ComponentTransform />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the selection bounds and writes position/dimension edits back to the controller', () => {
    render(<ComponentTransform />);
    expect(screen.getByText('Selection Transform')).toBeTruthy();
    const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
    // First three = Position (centroid), shown as 1 / 0 / 1.
    expect(inputs[0].value).toBe('1');
    fireEvent.change(inputs[0], { target: { value: '5' } });
    expect(mec.setSelectionCenter).toHaveBeenCalledWith(0, 5);
    // Next three = Dimensions (size), shown as 2 / 0 / 2.
    fireEvent.change(inputs[3], { target: { value: '4' } });
    expect(mec.setSelectionDimension).toHaveBeenCalledWith(0, 4);
  });

  it('applies an incremental rotation only when non-zero and via the Apply button', () => {
    render(<ComponentTransform />);
    const apply = screen.getByText('apply') as HTMLButtonElement;
    expect(apply.disabled).toBe(true); // 0,0,0 → disabled
    const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
    // Rotation fields are the last three textboxes.
    fireEvent.change(inputs[6], { target: { value: '90' } });
    expect(apply.disabled).toBe(false);
    fireEvent.click(apply);
    expect(mec.nudgeSelectionRotation).toHaveBeenCalledWith(90, 0, 0);
  });
});
