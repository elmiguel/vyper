import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DockviewApi } from 'dockview';
import { setDockApi, activatePreset } from './dockController';
import { useEditorStore } from '@/store/editorStore';

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r(null)));

/**
 * Regression: switching the layout preset rebuilds every dock panel, which can mount before
 * dockview sizes them — leaving the editor blank until the user resizes the window. activatePreset
 * must force a reflow (re-layout at the current size + a window resize event) on the next frame.
 */
describe('activatePreset reflow', () => {
  beforeEach(() => setDockApi(null));

  it('forces a dock re-layout and emits a resize after applying a layout', async () => {
    const layout = vi.fn();
    const fromJSON = vi.fn();
    const api = {
      get width() { return 1200; },
      get height() { return 800; },
      layout,
      fromJSON,
    } as unknown as DockviewApi;
    setDockApi(api);
    // Use a saved custom layout so we exercise the fromJSON path (no real panel building needed).
    useEditorStore.setState((s) => ({
      workspace: { ...s.workspace, custom: [{ id: 'c1', label: 'Mine', layout: { grid: {} } }] as never },
    }));

    const resizeSpy = vi.fn();
    window.addEventListener('resize', resizeSpy);

    activatePreset('c1');
    expect(fromJSON).toHaveBeenCalledWith({ grid: {} });

    // Reflow is deferred to the next animation frame.
    expect(layout).not.toHaveBeenCalled();
    await nextFrame();
    expect(layout).toHaveBeenCalledWith(1200, 800, true);
    expect(resizeSpy).toHaveBeenCalled();

    window.removeEventListener('resize', resizeSpy);
  });
});
