import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const state = {
  design: { render: { environmentUrl: '', environmentIntensity: 1, skybox: false } },
  updateRenderSettings: vi.fn(),
};
vi.mock('@/store/editorStore', () => ({
  useEditorStore: (sel: (s: typeof state) => unknown) => sel(state),
}));

import { EnvironmentIBL } from './EnvironmentIBL';

describe('EnvironmentIBL', () => {
  beforeEach(() => {
    state.design = { render: { environmentUrl: '', environmentIntensity: 1, skybox: false } };
    vi.clearAllMocks();
  });

  it('prompts to import an HDRI when no environment is set', () => {
    render(<EnvironmentIBL />);
    expect(screen.getByText(/Import an environment/i)).toBeTruthy();
  });

  it('shows intensity + skybox + clear once an environment URL is set', () => {
    state.design = { render: { environmentUrl: 'studio.env', environmentIntensity: 1.5, skybox: true } };
    render(<EnvironmentIBL />);
    fireEvent.click(screen.getByText('Clear environment'));
    expect(state.updateRenderSettings).toHaveBeenCalledWith({ environmentUrl: '', skybox: false });
  });

  it('toggles the skybox flag', () => {
    state.design = { render: { environmentUrl: 'studio.env', environmentIntensity: 1, skybox: false } };
    render(<EnvironmentIBL />);
    fireEvent.click(screen.getByLabelText(/Show as skybox/i));
    expect(state.updateRenderSettings).toHaveBeenCalledWith({ skybox: true });
  });
});
