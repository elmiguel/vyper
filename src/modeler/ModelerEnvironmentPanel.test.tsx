import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useEditorStore } from '@/store/editorStore';
import { useModelerStore } from './modelerStore';
import { defaultStudioEnv } from './modelerEnvironment';
import { ModelerEnvironmentPanel } from './ModelerEnvironmentPanel';

const env = () => useModelerStore.getState().studioEnv;

beforeEach(() => {
  useEditorStore.setState({ assetLibrary: { assets: [] } });
  useModelerStore.setState({ studioEnv: defaultStudioEnv() });
});

describe('studioEnv store', () => {
  it('defaults to flat, no-environment, no lit preview', () => {
    expect(env().url).toBe('');
    expect(env().litPreview).toBe(false);
    expect(env().tone).toBe('aces');
  });

  it('setStudioEnv patches only the given keys', () => {
    useModelerStore.getState().setStudioEnv({ exposure: 1.5 });
    expect(env().exposure).toBe(1.5);
    expect(env().key).toBe(defaultStudioEnv().key); // untouched
  });
});

describe('ModelerEnvironmentPanel', () => {
  it('renders Environment / Lighting / Render sections', () => {
    render(<ModelerEnvironmentPanel />);
    expect(screen.getByText('Environment (IBL)')).toBeInTheDocument();
    expect(screen.getByText('Lighting')).toBeInTheDocument();
    expect(screen.getByText('Render')).toBeInTheDocument();
  });

  it('hints to upload an HDR when no environment assets exist', () => {
    render(<ModelerEnvironmentPanel />);
    expect(screen.getByText(/Upload an .hdr/i)).toBeInTheDocument();
  });

  it('toggling Lit preview writes to the store', () => {
    render(<ModelerEnvironmentPanel />);
    fireEvent.click(screen.getByLabelText(/Lit preview/i));
    expect(env().litPreview).toBe(true);
  });

  it('changing Tone writes to the store', () => {
    render(<ModelerEnvironmentPanel />);
    fireEvent.change(screen.getByDisplayValue(/ACES/i), { target: { value: 'none' } });
    expect(env().tone).toBe('none');
  });

  it('carries the .inspector class for shared form theming', () => {
    const { container } = render(<ModelerEnvironmentPanel />);
    expect(container.querySelector('.panel.inspector')).not.toBeNull();
  });
});
