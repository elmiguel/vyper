import { useEffect, useRef } from 'react';
import { DockviewReact, type DockviewApi, type DockviewReadyEvent } from 'dockview';
import 'dockview/dist/styles/dockview.css';
import { Toolbar } from '@/panels/Toolbar';
import { useShortcuts } from '@/input/useShortcuts';
import { ShortcutsOverlay } from '@/input/ShortcutsOverlay';
import { Onboarding } from '@/onboarding/Onboarding';
import { HistoryPanel } from '@/ui/HistoryPanel';
import { GoalsEditor } from '@/ui/GoalsEditor';
import { HudEditor } from '@/hud/HudEditor';
import { EffectsEditor } from '@/panels/EffectsEditor';
import { AssetBrowser } from '@/assets/AssetBrowser';
import { AssetViewer } from '@/assets/AssetViewer';
import { useEditorStore } from '@/store/editorStore';
import { dockComponents, PANELS } from './panels';
import { BUILTIN_PRESETS, DEFAULT_PRESET_ID, applyPreset } from './workspacePresets';
import { setDockApi, reactToPlayState } from './dockController';

const LAYOUT_SAVE_DEBOUNCE = 500; // ms after the last dock change before persisting

export function EditorLayout() {
  useShortcuts();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tear down the dock controller binding when the editor unmounts.
  useEffect(() => () => setDockApi(null), []);

  // Drive the Scene/Game dock tabs from the play transport (play→game, pause→split,
  // stop→scene). prevState starts at the current value so mount is a no-op.
  const playState = useEditorStore((s) => s.playState);
  const prevPlay = useRef(playState);
  useEffect(() => {
    reactToPlayState(prevPlay.current, playState);
    prevPlay.current = playState;
  }, [playState]);

  const onReady = (event: DockviewReadyEvent) => {
    const api: DockviewApi = event.api;
    setDockApi(api);

    // Restore the saved arrangement, else apply the active built-in preset.
    const ws = useEditorStore.getState().workspace;
    try {
      if (ws.layout) api.fromJSON(ws.layout);
      else applyPreset(api, BUILTIN_PRESETS[ws.activePresetId] ?? BUILTIN_PRESETS[DEFAULT_PRESET_ID]);
    } catch {
      applyPreset(api, BUILTIN_PRESETS[DEFAULT_PRESET_ID]);
    }
    // Migrate older saved layouts that predate a panel: add any missing registry panel so new
    // panels (e.g. Modeling) surface without forcing a layout reset. Tabbed with the Inspector.
    for (const key of ['modeling', 'gameStyle'] as const) {
      if (!api.getPanel(key)) {
        const ref = api.getPanel('inspector') ? 'inspector' : api.panels[0]?.id;
        api.addPanel({ id: key, component: key, title: PANELS[key].title, ...(ref ? { position: { referencePanel: ref, direction: 'within' as const } } : {}) });
      }
    }

    // Persist the live arrangement after changes settle (drag/resize/tab). Only
    // while editing — transient play/pause splits must not overwrite the layout.
    api.onDidLayoutChange(() => {
      if (useEditorStore.getState().playState !== 'editing') return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        useEditorStore.getState().setWorkspaceLayout(api.toJSON());
      }, LAYOUT_SAVE_DEBOUNCE);
    });
  };

  return (
    <div className="editor-root">
      <Toolbar />
      <ShortcutsOverlay />
      <Onboarding />
      <HistoryPanel />
      <GoalsEditor />
      <HudEditor />
      <EffectsEditor />
      <AssetBrowser />
      <AssetViewer />
      <div className="editor-body">
        <DockviewReact
          className="vyper-dock dockview-theme-abyss"
          components={dockComponents}
          defaultRenderer="always"
          onReady={onReady}
        />
      </div>
    </div>
  );
}
