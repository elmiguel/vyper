import { useEffect, useState } from 'react';
import {
  Play, Pause, Square, Plus, Bug, Boxes, Lightbulb,
  MousePointer2, Move3d, Rotate3d, Scale3d, Undo2, Redo2, Keyboard, ChevronDown, Compass, BookOpen,
  Home, Save, Layers, Loader2, X, History, Pencil, Gamepad2, Target, LayoutDashboard, Sparkles, Scan,
} from 'lucide-react';
import { useEditorStore } from '@/store/editorStore';
import { useProjectStore } from '@/store/projectStore';
import type { GizmoMode, LightKind, PrimitiveKind } from '@/types';
import { primsFor } from '@/types';
import { EFFECT_PRESETS, presetsForMode } from '@/effects/presets';
import { KEYMAPS, describeBinding, type EditorAction, type KeymapId } from '@/input/keymaps';

const LIGHTS: LightKind[] = ['hemispheric', 'point', 'directional'];
/** Shapes offered for trigger volumes, per game mode. */
const VOLUME_SHAPES: Record<'2d' | '3d', PrimitiveKind[]> = {
  '3d': ['box', 'sphere', 'cylinder'],
  '2d': ['square', 'circle'],
};

const TOOLS: { mode: GizmoMode; icon: typeof Move3d; action: EditorAction; label: string }[] = [
  { mode: 'select', icon: MousePointer2, action: 'tool.select', label: 'Select' },
  { mode: 'move', icon: Move3d, action: 'tool.move', label: 'Move' },
  { mode: 'rotate', icon: Rotate3d, action: 'tool.rotate', label: 'Rotate' },
  { mode: 'scale', icon: Scale3d, action: 'tool.scale', label: 'Scale' },
];

export function Toolbar() {
  const {
    playState, play, pause, stop, addPrimitive, addPlayer, addLight, toggleInspector3D, showInspector3D,
    gizmoMode, setGizmoMode, keymap, setKeymap, undo, redo, past, future, setShowShortcuts, setRunTour, mode, setShowDesign, setShowHud,
    addEffect, addVolume, selectedId,
  } = useEditorStore();
  const PRIMS = primsFor(mode);
  const is2D = mode === '2d';
  const [menu, setMenu] = useState<null | 'mesh' | 'light' | 'keymap' | 'scene' | 'fx' | 'volume'>(null);
  const km = KEYMAPS[keymap];
  const tip = (a: EditorAction) => `${describeBinding(km, a)}`;

  const { gameName, scenes, sceneId, saving, dirty, save, switchScene, addScene, deleteScene, renameScene, goHome, setShowHistory } =
    useProjectStore();
  const activeScene = scenes.find((s) => s.id === sceneId);
  const [editScene, setEditScene] = useState<string | null>(null);
  const [sceneDraft, setSceneDraft] = useState('');

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
        <button className="tb-btn" data-tour="design" onClick={() => setShowDesign(true)} title="Game design: goals, objectives, rules">
          <Target size={14} /> Design
        </button>
        <button className="tb-btn" data-tour="hud" onClick={() => setShowHud(true)} title="HUD editor: on-screen overlay (2D & 3D)">
          <LayoutDashboard size={14} /> HUD
        </button>
      </div>

      <span className="tb-divider" />

      <div className="tb-group" data-tour="add">
        <div className="tb-menu-wrap">
          <button className="tb-btn" onClick={() => setMenu(menu === 'mesh' ? null : 'mesh')}>
            <Boxes size={15} /> {is2D ? 'Shape' : 'Mesh'} <Plus size={12} />
          </button>
          {menu === 'mesh' && (
            <div className="tb-menu">
              {PRIMS.map((p) => (
                <button key={p} onClick={() => { addPrimitive(p); setMenu(null); }}>{p}</button>
              ))}
            </div>
          )}
        </div>
        <button
          className="tb-btn"
          data-tour="player"
          onClick={() => { addPlayer(); setMenu(null); }}
          title="Add a player with default movement controls (WASD / arrows · mouse-look in 3D)"
        >
          <Gamepad2 size={15} /> Player <Plus size={12} />
        </button>
        {/* Lights are 3D-only; 2D shapes render flat/unlit. */}
        {!is2D && (
          <div className="tb-menu-wrap">
            <button className="tb-btn" onClick={() => setMenu(menu === 'light' ? null : 'light')}>
              <Lightbulb size={15} /> Light <Plus size={12} />
            </button>
            {menu === 'light' && (
              <div className="tb-menu">
                {LIGHTS.map((l) => (
                  <button key={l} onClick={() => { addLight(l); setMenu(null); }}>{l}</button>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="tb-menu-wrap">
          <button
            className="tb-btn"
            data-tour="fx"
            disabled={!selectedId}
            title={selectedId ? 'Add a particle effect to the selected object' : 'Select an object first'}
            onClick={() => setMenu(menu === 'fx' ? null : 'fx')}
          >
            <Sparkles size={15} /> FX <Plus size={12} />
          </button>
          {menu === 'fx' && selectedId && (
            <div className="tb-menu">
              {presetsForMode(mode).map((id) => (
                <button key={id} onClick={() => { addEffect(selectedId, id); setMenu(null); }}>
                  {EFFECT_PRESETS[id].label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="tb-menu-wrap">
          <button
            className="tb-btn"
            title="Add a trigger volume (a zone that fires events when objects enter/exit)"
            onClick={() => setMenu(menu === 'volume' ? null : 'volume')}
          >
            <Scan size={15} /> Volume <Plus size={12} />
          </button>
          {menu === 'volume' && (
            <div className="tb-menu">
              {VOLUME_SHAPES[is2D ? '2d' : '3d'].map((k) => (
                <button key={k} onClick={() => { addVolume(k); setMenu(null); }}>{k}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      <span className="tb-divider" />

      {/* Transform tools */}
      <div className="tb-tools" data-tour="tools">
        {TOOLS.map((t) => (
          <button
            key={t.mode}
            className={`tb-icon ${gizmoMode === t.mode ? 'active' : ''}`}
            onClick={() => setGizmoMode(t.mode)}
            title={`${t.label} (${tip(t.action)})`}
          >
            <t.icon size={16} />
          </button>
        ))}
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

      <button className={`tb-btn ${showInspector3D ? 'active' : ''}`} onClick={toggleInspector3D} title="Babylon Inspector" data-tour="inspector3d">
        <Bug size={15} /> Inspector
      </button>

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
