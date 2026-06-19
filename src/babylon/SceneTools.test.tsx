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

  it('drives Edit Mode from the component-mode buttons (object/vertex/edge/face)', async () => {
    useEditorStore.setState({
      mode: '3d', entities: [],
      meshEdit: { active: false, entityId: null, component: 'face', selection: [], sculpt: null, tool: 'select' },
    });
    const id = useEditorStore.getState().addPrimitive('box'); // selects it
    render(<SceneTools />);

    // Object mode is "active" while not editing.
    expect(screen.getByTitle(/^Object mode/)).toHaveAttribute('aria-pressed', 'true');

    // Vertex enters Edit Mode on the selected mesh and sets the component.
    await userEvent.click(screen.getByTitle(/^Vertex mode/));
    let me = useEditorStore.getState().meshEdit;
    expect(me.active).toBe(true);
    expect(me.entityId).toBe(id);
    expect(me.component).toBe('vertex');

    // Edge switches the component while staying in Edit Mode.
    await userEvent.click(screen.getByTitle(/^Edge mode/));
    expect(useEditorStore.getState().meshEdit.component).toBe('edge');

    // Object leaves Edit Mode.
    await userEvent.click(screen.getByTitle(/^Object mode/));
    expect(useEditorStore.getState().meshEdit.active).toBe(false);
  });

  it('disables vertex/edge/face when no mesh is selected', () => {
    useEditorStore.setState({
      mode: '3d', entities: [], selectedId: null,
      meshEdit: { active: false, entityId: null, component: 'face', selection: [], sculpt: null, tool: 'select' },
    });
    render(<SceneTools />);
    expect(screen.getByTitle(/^Vertex mode/)).toBeDisabled();
    expect(screen.getByTitle(/^Object mode/)).toBeEnabled(); // object is always available
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
