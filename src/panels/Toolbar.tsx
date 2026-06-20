import { useEffect, useMemo, useState } from 'react';
import {
  Play, Pause, Square, Plus, Undo2, Redo2, Keyboard, ChevronDown, Compass, BookOpen,
  Home, Save, Layers, Loader2, X, History, Pencil, Columns3,
  Image as ImageIcon, Check, PanelsTopLeft,
} from 'lucide-react';
import { useEditorStore } from '@/store/editorStore';
import { useProjectStore } from '@/store/projectStore';
import { KEYMAPS, describeBinding, type EditorAction, type KeymapId } from '@/input/keymaps';
import { BUILTIN_PRESETS } from '@/layout/workspacePresets';
import { PANELS, PANEL_KEYS } from '@/layout/panels';
import { activatePreset, resetWorkspace, saveCurrentLayout, togglePanel, openPanelIds } from '@/layout/dockController';

export function Toolbar() {
  const {
    playState, play, pause, stop, toggleInspector3D, showInspector3D,
    keymap, setKeymap, undo, redo, past, future, setShowShortcuts, setRunTour, setShowDesign, setShowHud,
    setShowAssetBrowser, workspace, deleteCustomLayout,
    showDesign, showHud, showAssetBrowser,
  } = useEditorStore();
  const [menu, setMenu] = useState<null | 'keymap' | 'scene' | 'layout' | 'panels'>(null);
  // Dock panel open/closed state lives in dockview (not the store), so re-read it whenever the
  // Panels menu opens or a toggle bumps this tick.
  const [panelsTick, setPanelsTick] = useState(0);
  const openPanels = useMemo(() => (menu === 'panels' ? openPanelIds() : []), [menu, panelsTick]);
  const activeLayout =
    BUILTIN_PRESETS[workspace.activePresetId]?.label ??
    workspace.custom.find((c) => c.id === workspace.activePresetId)?.label ??
    'Layout';

  const saveLayout = () => {
    const label = window.prompt('Save layout as:')?.trim();
    if (label) saveCurrentLayout(label);
    setMenu(null);
  };
  const km = KEYMAPS[keymap];
  const tip = (a: EditorAction) => `${describeBinding(km, a)}`;

  const { gameName, scenes, sceneId, saving, dirty, save, switchScene, addScene, deleteScene, renameScene, goHome, setShowHistory, captureCover } =
    useProjectStore();
  const activeScene = scenes.find((s) => s.id === sceneId);
  const [editScene, setEditScene] = useState<string | null>(null);
  const [sceneDraft, setSceneDraft] = useState('');
  const [coverSaved, setCoverSaved] = useState(false);

  const setThumbnail = async () => {
    if (await captureCover()) {
      setCoverSaved(true);
      setTimeout(() => setCoverSaved(false), 1500);
    }
  };

  const startRename = (id: string, name: string) => {
    setEditScene(id);
    setSceneDraft(name);
  };
  const commitRename = (id: string) => {
    const name = sceneDraft.trim();
    const current = scenes.find((s) => s.id === id);
    if (name && name !== current?.name) void renameScene(id, name);
    setEditScene(null);
  };

  // Cmd/Ctrl+S → save the project (with a manual revert snapshot).
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

  return (
    <div className="toolbar" onMouseLeave={() => { if (!editScene) setMenu(null); }}>
      <div className="brand">
        <span className="brand-dot" /> Vyper
      </div>

      {/* Project: home, game name, scene switcher, save */}
      <div className="tb-group" data-tour="project">
        <button className="tb-icon" onClick={() => void goHome()} title="Save & back to projects">
          <Home size={15} />
        </button>
        <span className="tb-game-name" title={gameName}>{gameName || 'Untitled'}</span>
        <div className="tb-menu-wrap">
          <button className="tb-btn" onClick={() => setMenu(menu === 'scene' ? null : 'scene')} title="Scenes">
            <Layers size={14} /> {activeScene?.name ?? 'Scene'} <ChevronDown size={12} />
          </button>
          {menu === 'scene' && (
            <div className="tb-menu scene-menu">
              {scenes.map((sc) => (
                <div key={sc.id} className={`scene-row ${sc.id === sceneId ? 'on' : ''}`}>
                  {editScene === sc.id ? (
                    <input
                      className="scene-edit"
                      autoFocus
                      value={sceneDraft}
                      onChange={(e) => setSceneDraft(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename(sc.id);
                        if (e.key === 'Escape') setEditScene(null);
                      }}
                      onBlur={() => commitRename(sc.id)}
                    />
                  ) : (
                    <button
                      className="scene-pick"
                      onClick={() => { void switchScene(sc.id); setMenu(null); }}
                      onDoubleClick={() => startRename(sc.id, sc.name)}
                      title="Click to switch · double-click to rename"
                    >
                      {sc.name}
                    </button>
                  )}
                  {editScene !== sc.id && (
                    <>
                      <button className="scene-rename" title="Rename scene" onClick={(e) => { e.stopPropagation(); startRename(sc.id, sc.name); }}>
                        <Pencil size={11} />
                      </button>
                      {scenes.length > 1 && (
                        <button className="scene-del" title="Delete scene" onClick={() => void deleteScene(sc.id)}>
                          <X size={12} />
                        </button>
                      )}
                    </>
                  )}
                </div>
              ))}
              <button className="scene-add" onClick={() => { void addScene(); setMenu(null); }}>
                <Plus size={13} /> New Scene
              </button>
            </div>
          )}
        </div>
        <button
          className={`tb-btn save-btn ${dirty ? 'dirty' : ''}`}
          onClick={() => void save({ snapshot: 'manual' })}
          disabled={saving}
          title="Save (Cmd/Ctrl+S)"
        >
          {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
          {saving ? 'Saving' : dirty ? 'Save *' : 'Saved'}
        </button>
        <button className="tb-icon" onClick={() => setShowHistory(true)} title="Version history / revert">
          <History size={15} />
        </button>
        <button
          className={`tb-icon ${coverSaved ? 'ok' : ''}`}
          onClick={() => void setThumbnail()}
          title="Set project thumbnail from the current view"
        >
          {coverSaved ? <Check size={15} /> : <ImageIcon size={15} />}
        </button>
      </div>

      <span className="tb-divider" />

      {/* Undo / redo */}
      <div className="tb-tools" data-tour="history">
        <button className="tb-icon" onClick={undo} disabled={!past.length} title={`Undo (${tip('undo')})`}>
          <Undo2 size={16} />
        </button>
        <button className="tb-icon" onClick={redo} disabled={!future.length} title={`Redo (${tip('redo')})`}>
          <Redo2 size={16} />
        </button>
      </div>

      <div className="tb-spacer" />

      <div className="tb-transport" data-tour="transport">
        <button className={`tb-btn play ${playState === 'playing' ? 'active' : ''}`} onClick={play} disabled={playState === 'playing'} title={`Play (${tip('playToggle')})`}>
          <Play size={15} />
        </button>
        <button className={`tb-btn ${playState === 'paused' ? 'active' : ''}`} onClick={pause} disabled={playState === 'editing'} title="Pause / Resume">
          <Pause size={15} />
        </button>
        <button className="tb-btn" onClick={stop} disabled={playState === 'editing'} title={`Stop (${tip('stop')})`}>
          <Square size={15} />
        </button>
        <span className={`state-pill ${playState}`}>{playState}</span>
      </div>

      <span className="tb-divider" />

      {/* Keyboard layout selector */}
      <div className="tb-menu-wrap" data-tour="keymap">
        <button className="tb-btn" onClick={() => setMenu(menu === 'keymap' ? null : 'keymap')} title="Keyboard layout">
          <Keyboard size={15} /> {km.label} <ChevronDown size={12} />
        </button>
        {menu === 'keymap' && (
          <div className="tb-menu km-menu">
            {(Object.keys(KEYMAPS) as KeymapId[]).map((id) => (
              <button key={id} className={keymap === id ? 'on' : ''} onClick={() => { setKeymap(id); setMenu(null); }}>
                {KEYMAPS[id].label}
                <span className="km-hint">{describeBinding(KEYMAPS[id], 'tool.move')} / {describeBinding(KEYMAPS[id], 'tool.rotate')} / {describeBinding(KEYMAPS[id], 'tool.scale')}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Workspace layout selector */}
      <div className="tb-menu-wrap" data-tour="layout">
        <button className="tb-btn" onClick={() => setMenu(menu === 'layout' ? null : 'layout')} title="Workspace layout">
          <Columns3 size={15} /> {activeLayout} <ChevronDown size={12} />
        </button>
        {menu === 'layout' && (
          <div className="tb-menu layout-menu">
            {Object.values(BUILTIN_PRESETS).map((p) => (
              <button
                key={p.id}
                className={workspace.activePresetId === p.id ? 'on' : ''}
                onClick={() => { activatePreset(p.id); setMenu(null); }}
              >
                {p.label}
              </button>
            ))}
            {workspace.custom.length > 0 && <div className="layout-sep" />}
            {workspace.custom.map((c) => (
              <div key={c.id} className={`layout-row ${workspace.activePresetId === c.id ? 'on' : ''}`}>
                <button className="layout-pick" onClick={() => { activatePreset(c.id); setMenu(null); }}>
                  {c.label}
                </button>
                <button className="layout-del" title="Delete layout" onClick={(e) => { e.stopPropagation(); deleteCustomLayout(c.id); }}>
                  <X size={12} />
                </button>
              </div>
            ))}
            <div className="layout-sep" />
            <button className="layout-action" onClick={saveLayout}>
              <Save size={12} /> Save current layout…
            </button>
            <button className="layout-action" onClick={() => { resetWorkspace(); setMenu(null); }}>
              Reset to Default
            </button>
          </div>
        )}
      </div>

      {/* Panels: one menu to show/hide dockable panels + editors, keeping the nav clean. Each row
          is a toggle switch reflecting whether the panel/overlay is currently open. */}
      <div className="tb-menu-wrap" data-tour="panels">
        <button className="tb-btn" onClick={() => setMenu(menu === 'panels' ? null : 'panels')} title="Show / hide panels">
          <PanelsTopLeft size={15} /> Panels <ChevronDown size={12} />
        </button>
        {menu === 'panels' && (
          <div className="tb-menu panels-menu" onMouseLeave={() => setMenu(null)}>
            <div className="panels-head">Panels</div>
            {PANEL_KEYS.map((key) => (
              <label className="panel-toggle" key={key}>
                <span>{PANELS[key].title}</span>
                <input
                  type="checkbox"
                  className="tb-toggle"
                  checked={openPanels.includes(key)}
                  onChange={() => { togglePanel(key); setPanelsTick((n) => n + 1); }}
                />
              </label>
            ))}
            <div className="panels-sep" />
            <div className="panels-head">Editors</div>
            <label className="panel-toggle">
              <span>Design</span>
              <input type="checkbox" className="tb-toggle" checked={showDesign} onChange={() => setShowDesign(!showDesign)} />
            </label>
            <label className="panel-toggle">
              <span>HUD</span>
              <input type="checkbox" className="tb-toggle" checked={showHud} onChange={() => setShowHud(!showHud)} />
            </label>
            <label className="panel-toggle">
              <span>Assets</span>
              <input type="checkbox" className="tb-toggle" checked={showAssetBrowser} onChange={() => setShowAssetBrowser(!showAssetBrowser)} />
            </label>
            <label className="panel-toggle">
              <span>Babylon Inspector</span>
              <input type="checkbox" className="tb-toggle" checked={showInspector3D} onChange={toggleInspector3D} />
            </label>
          </div>
        )}
      </div>

      <button className="tb-icon" onClick={() => setShowShortcuts(true)} title="Keyboard shortcuts (?)">
        <span className="tb-help">?</span>
      </button>

      <button className="tb-btn guide-btn" data-tour="guide" onClick={() => setRunTour(true)} title="Take the guided tour">
        <Compass size={15} /> Guide
      </button>

      <a className="tb-btn docs-btn" href="/docs.html" target="_blank" rel="noopener noreferrer" title="Open the documentation">
        <BookOpen size={15} /> Docs
      </a>
    </div>
  );
}
