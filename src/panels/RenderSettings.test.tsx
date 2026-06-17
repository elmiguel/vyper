import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEditorStore } from '@/store/editorStore';
import { emptyDesign } from '@/types';
import { RenderSettings } from './RenderSettings';

beforeEach(() => {
  useEditorStore.setState({ mode: '3d', design: emptyDesign() });
});

describe('RenderSettings', () => {
  it('shows a 2D hint and no controls in 2D mode', () => {
    useEditorStore.setState({ mode: '2d' });
    render(<RenderSettings />);
    expect(screen.getByText(/applies to 3D games/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Bloom/i)).not.toBeInTheDocument();
  });

  it('renders the effect/shadow controls in 3D mode', () => {
    render(<RenderSettings />);
    expect(screen.getByText(/High-quality rendering/i)).toBeInTheDocument();
    expect(screen.getByText('Bloom', { exact: true })).toBeInTheDocument();
    expect(screen.getByText(/Dynamic shadows/)).toBeInTheDocument();
  });

  it('collapses sub-sections when the master toggle is off', async () => {
    useEditorStore.getState().updateRenderSettings({ enabled: false });
    render(<RenderSettings />);
    expect(screen.queryByText(/Dynamic shadows/)).not.toBeInTheDocument();
  });

  it('writes a setting change back to the store', async () => {
    render(<RenderSettings />);
    await userEvent.click(screen.getByLabelText(/Film grain/i));
    expect(useEditorStore.getState().design.render.grain).toBe(true);
  });
});
