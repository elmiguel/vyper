import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useProjectStore } from './projectStore';
import { useEditorStore } from './editorStore';
import { api } from '@/data';

/**
 * Regression: a debounced autosave armed while editing one project must NEVER fire against a
 * different project opened before the timer elapses. The editor store is shared across projects, so
 * a stale autosave would persist the previous project's entities into the newly-loaded scene
 * (observed: a Modeling-Studio mesh written into a game's scene, wiping its objects).
 */
describe('autosave cross-project guard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(api, 'patchScene').mockResolvedValue({} as never);
    vi.spyOn(api, 'putScripts').mockResolvedValue({} as never);
    vi.spyOn(api, 'patchGame').mockResolvedValue({} as never);
    vi.spyOn(api, 'createVersion').mockResolvedValue({} as never);
    useProjectStore.setState({ view: 'editor', gameId: 'A', sceneId: 'sceneA', saving: false, dirty: false, autosaveEnabled: true });
    useEditorStore.setState({ playState: 'editing', entities: [] });
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('does NOT autosave after navigating to a different project before the debounce fires', () => {
    // Editing project A arms the debounced autosave (editor subscription → scheduleAutosave).
    useEditorStore.setState({ entities: [{ id: 'x' } as never] });
    // Open project B before the debounce elapses (gameId/sceneId now point elsewhere).
    useProjectStore.setState({ gameId: 'B', sceneId: 'sceneB' });
    vi.advanceTimersByTime(5000);
    // The autosave for A must abort — it must not write A's stale entities to B's scene (or anywhere).
    expect(api.patchScene).not.toHaveBeenCalled();
  });

  it('still autosaves when the same project is loaded when the debounce fires', () => {
    useEditorStore.setState({ entities: [{ id: 'y' } as never] });
    vi.advanceTimersByTime(5000);
    expect(api.patchScene).toHaveBeenCalledWith('sceneA', expect.anything());
  });
});
