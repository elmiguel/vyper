import { useEffect } from 'react';
import { DockviewReact, type DockviewApi, type DockviewReadyEvent } from 'dockview';
import 'dockview/dist/styles/dockview.css';
import { Home, Save, Loader2, Boxes, Image } from 'lucide-react';
import { useProjectStore } from '@/store/projectStore';
import { useEditorStore } from '@/store/editorStore';
import { AssetBrowser } from '@/assets/AssetBrowser';
import { AssetViewer } from '@/assets/AssetViewer';
import { modelerDockComponents, buildModelerLayout } from './modelerPanels';

/**
 * The standalone 3D Modeling area — a dedicated workspace separate from the game editor.
 * It runs its own Babylon viewport ({@link ModelerViewport}) driven by the half-edge
 * kernel, with no scene/game-editor machinery, and persists through the project save
 * system (the kernel mirrors its baked geometry into the project's mesh entity).
 */
export function ModelerLayout() {
  const gameName = useProjectStore((s) => s.gameName);
  const saving = useProjectStore((s) => s.saving);
  const dirty = useProjectStore((s) => s.dirty);
  const save = useProjectStore((s) => s.save);
  const goHome = useProjectStore((s) => s.goHome);
  const openAssets = useEditorStore((s) => s.setShowAssetBrowser);

  // Cmd/Ctrl+S → save the model.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void save({ snapshot: 'manual' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save]);

  const onReady = (event: DockviewReadyEvent) => {
    const api: DockviewApi = event.api;
    try {
      buildModelerLayout(api);
    } catch {
      /* dock build failed — leave empty */
    }
  };

  return (
    <div className="editor-root modeler-root">
      <div className="modeler-bar">
        <button className="tb-icon" onClick={() => void goHome()} title="Save & back to home">
          <Home size={16} />
        </button>
        <span className="modeler-brand"><Boxes size={15} /> Modeling Studio</span>
        <span className="tb-game-name" title={gameName}>{gameName || 'Untitled Model'}</span>
        <div className="modeler-bar-spacer" />
        <button className="tb-btn" onClick={() => openAssets(true)} title="Asset library: textures & models (for materials)">
          <Image size={14} /> Assets
        </button>
        <button
          className={`tb-btn save-btn ${dirty ? 'dirty' : ''}`}
          onClick={() => void save({ snapshot: 'manual' })}
          disabled={saving}
          title="Save model (Cmd/Ctrl+S)"
        >
          {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
          {saving ? 'Saving' : dirty ? 'Save *' : 'Saved'}
        </button>
      </div>
      <div className="editor-body">
        <DockviewReact
          className="vyper-dock dockview-theme-abyss"
          components={modelerDockComponents}
          defaultRenderer="always"
          onReady={onReady}
        />
      </div>
      {/* Shared asset library overlays — same components the game editor uses, so textures
          imported here flow straight into the Inspector's material maps. */}
      <AssetBrowser />
      <AssetViewer />
    </div>
  );
}
