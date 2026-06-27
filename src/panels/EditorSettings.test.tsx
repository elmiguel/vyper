import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEditorStore } from '@/store/editorStore';
import { defaultEditorPrefs } from '@/store/editorPrefs';
import { EditorSettings } from './EditorSettings';

beforeEach(() => {
  localStorage.clear();
  useEditorStore.setState({ editorPrefs: defaultEditorPrefs(), gridVisible: true });
});

describe('EditorSettings', () => {
  it('renders the Selection & Highlight controls', () => {
    render(<EditorSettings />);
    expect(screen.getByText(/Selection & Highlight/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/inner glow/i)).toBeInTheDocument();
    expect(screen.getByText(/Glow softness/i)).toBeInTheDocument();
  });

  it('renders the Grid controls', () => {
    render(<EditorSettings />);
    expect(screen.getByText('Grid', { exact: true })).toBeInTheDocument();
    expect(screen.getByText(/Cell size/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Show grid/i)).toBeInTheDocument();
  });

  it('writes a grid change back to the store', async () => {
    render(<EditorSettings />);
    await userEvent.click(screen.getByLabelText(/Show grid/i));
    // Default gridVisible is true; toggling flips it off.
    expect(useEditorStore.getState().gridVisible).toBe(false);
  });

  it('reflects the current prefs (inner glow off by default)', () => {
    render(<EditorSettings />);
    expect(screen.getByLabelText(/inner glow/i)).not.toBeChecked();
  });

  it('writes a toggle change back to the store', async () => {
    render(<EditorSettings />);
    await userEvent.click(screen.getByLabelText(/inner glow/i));
    expect(useEditorStore.getState().editorPrefs.selection.innerGlow).toBe(true);
  });

  it('reset restores defaults after an edit', async () => {
    useEditorStore.getState().updateSelectionPrefs({ innerGlow: true });
    render(<EditorSettings />);
    await userEvent.click(screen.getByRole('button', { name: /reset to defaults/i }));
    expect(useEditorStore.getState().editorPrefs.selection).toEqual(defaultEditorPrefs().selection);
  });
});
