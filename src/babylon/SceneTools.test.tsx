import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SceneTools } from './SceneTools';
import { useEditorStore } from '@/store/editorStore';

describe('SceneTools', () => {
  it('switches the transform gizmo when a tool is clicked', async () => {
    render(<SceneTools />);
    // Tool tooltips read "<Label> (<key>)"; the parenthesis avoids matching the
    // FX button's "Select an object first" title.
    await userEvent.click(screen.getByTitle(/^Rotate \(/));
    expect(useEditorStore.getState().gizmoMode).toBe('rotate');
    await userEvent.click(screen.getByTitle(/^Select \(/));
    expect(useEditorStore.getState().gizmoMode).toBe('select');
  });

  it('adds a primitive from the Mesh menu', async () => {
    render(<SceneTools />);
    const before = useEditorStore.getState().entities.length;
    await userEvent.click(screen.getByRole('button', { name: /Mesh/ }));
    // The menu lists the mode's primitives; pick the box.
    await userEvent.click(screen.getByRole('button', { name: 'box' }));
    expect(useEditorStore.getState().entities.length).toBe(before + 1);
  });

  it('disables FX until an object is selected', () => {
    useEditorStore.setState({ selectedId: null });
    render(<SceneTools />);
    expect(screen.getByRole('button', { name: /FX/ })).toBeDisabled();
  });

  it('shows the Surfaces toggle only in Edit Mode and flips showSurfaces', async () => {
    useEditorStore.setState({
      mode: '3d',
      showSurfaces: true,
      meshEdit: { active: false, entityId: null, component: 'face', selection: [], sculpt: null, tool: 'select' },
    });
    const { rerender } = render(<SceneTools />);
    // Hidden outside Edit Mode.
    expect(screen.queryByTitle(/^Surfaces:/)).toBeNull();

    act(() => {
      useEditorStore.setState({
        meshEdit: { active: true, entityId: 'e1', component: 'face', selection: [], sculpt: null, tool: 'select' },
      });
    });
    rerender(<SceneTools />);
    await userEvent.click(screen.getByTitle(/^Surfaces:/));
    expect(useEditorStore.getState().showSurfaces).toBe(false);
  });
});
