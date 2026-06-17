import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useModelerStore } from './modelerStore';
import { ModelerToolbar } from './ModelerToolbar';

beforeEach(() => {
  useModelerStore.setState({ tool: 'move', keymap: 'maya', showWireframe: true });
});

describe('ModelerToolbar', () => {
  it('shows the four transform tools with Maya shortcut hints', () => {
    render(<ModelerToolbar />);
    expect(screen.getByTitle(/Select \(Q\)/i)).toBeInTheDocument();
    expect(screen.getByTitle(/Move \(W\)/i)).toBeInTheDocument();
    expect(screen.getByTitle(/Rotate \(E\)/i)).toBeInTheDocument();
    expect(screen.getByTitle(/Scale \(R\)/i)).toBeInTheDocument();
  });

  it('switches the active tool on click', () => {
    render(<ModelerToolbar />);
    fireEvent.click(screen.getByTitle(/Rotate/i));
    expect(useModelerStore.getState().tool).toBe('rotate');
  });

  it('offers Maya / Blender / Unity in the keymap menu, defaulting to Maya', () => {
    render(<ModelerToolbar />);
    const trigger = screen.getByTitle('Keyboard layout');
    expect(trigger).toHaveTextContent('Maya');
    fireEvent.click(trigger); // open the menu
    expect(screen.getByRole('button', { name: /Blender/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Unity/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Blender/ }));
    expect(useModelerStore.getState().keymap).toBe('blender');
  });

  it('updates shortcut hints when the layout changes (Blender uses G to move)', () => {
    useModelerStore.setState({ keymap: 'blender' });
    render(<ModelerToolbar />);
    expect(screen.getByTitle(/Move \(G\)/i)).toBeInTheDocument();
  });

  it('toggles the wireframe overlay', () => {
    render(<ModelerToolbar />);
    expect(screen.getByTitle('Hide wireframe')).toBeInTheDocument(); // on by default
    fireEvent.click(screen.getByTitle('Hide wireframe'));
    expect(useModelerStore.getState().showWireframe).toBe(false);
  });
});
