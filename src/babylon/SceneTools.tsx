import { useState } from 'react';
import {
  Boxes, Lightbulb, Gamepad2, Sparkles, Scan,
  MousePointer2, Move3d, Rotate3d, Scale3d, Aperture, Eye, EyeOff, Magnet,
  Box, Grip, Slash, Square,
} from 'lucide-react';
import { useEditorStore } from '@/store/editorStore';
import type { GizmoMode, LightKind } from '@/types';
import type { MeshComponentMode } from '@/store/editorTypes';
import { primsFor, volumesFor } from '@/types';
import { EFFECT_PRESETS, presetsForMode } from '@/effects/presets';
import { KEYMAPS, describeBinding, type EditorAction } from '@/input/keymaps';

const LIGHTS: LightKind[] = ['hemispheric', 'point', 'directional'];

const TOOLS: { mode: GizmoMode; icon: typeof Move3d; action: EditorAction; label: string }[] = [
  { mode: 'select', icon: MousePointer2, action: 'tool.select', label: 'Select' },
  { mode: 'move', icon: Move3d, action: 'tool.move', label: 'Move' },
  { mode: 'rotate', icon: Rotate3d, action: 'tool.rotate', label: 'Rotate' },
  { mode: 'scale', icon: Scale3d, action: 'tool.scale', label: 'Scale' },
];

/** Component edit modes (Maya-style 1/2/3/4). 'object' = whole-object selection (not in Edit
 *  Mode); the others are the in-mesh component modes. Mirrors the 1/2/3/4 keyboard shortcuts. */
const MODES: { id: 'object' | MeshComponentMode; icon: typeof Box; label: string; key: string }[] = [
  { id: 'object', icon: Box, label: 'Object', key: '1' },
  { id: 'vertex', icon: Grip, label: 'Vertex', key: '2' },
  { id: 'edge', icon: Slash, label: 'Edge', key: '3' },
  { id: 'face', icon: Square, label: 'Face', key: '4' },
];

type AddMenu = 'mesh' | 'light' | 'fx' | 'volume' | 'modes';

/**
 * Floating in-viewport toolbar: object creation (mesh/player/light/fx/volume) plus
 * the transform-gizmo tools. Compact icon-only buttons (labels live in tooltips)
 * so the bar stays small and has room for more tools over time.
 */
export function SceneTools() {
  const {
    mode, selectedId, gizmoMode, setGizmoMode, keymap, entities,
    addPrimitive, addPlayer, addLight, addEffect, addVolume,
    editorEffects, toggleEditorEffects,
    meshEdit, showSurfaces, toggleSurfaces,
    snapToGrid, toggleSnapToGrid,
    setMeshComponent, beginMeshEdit, endMeshEdit,
  } = useEditorStore();
  const [menu, setMenu] = useState<AddMenu | null>(null);
  const is2D = mode === '2d';
  const km = KEYMAPS[keymap];
  const tip = (a: EditorAction) => describeBinding(km, a);
  const close = () => setMenu(null);

  // Component modes mirror the 1/2/3/4 keys: 'object' = leave Edit Mode (whole-object select);
  // vertex/edge/face switch the component in Edit Mode, or enter it on the selected mesh.
  const editableSelected = !!entities.find((e) => e.id === selectedId && e.mesh);
  const modeActive = (id: (typeof MODES)[number]['id']) =>
    id === 'object' ? !meshEdit.active : meshEdit.active && meshEdit.component === id;
  const activeMode = MODES.find((m) => modeActive(m.id)) ?? MODES[0];
  const modeDisabled = (id: (typeof MODES)[number]['id']) =>
    id !== 'object' && !meshEdit.active && !editableSelected;
  const setMode = (id: (typeof MODES)[number]['id']) => {
    if (id === 'object') {
      if (meshEdit.active) endMeshEdit();
      return;
    }
    if (meshEdit.active) setMeshComponent(id);
    else if (editableSelected) {
      beginMeshEdit(selectedId!);
      setMeshComponent(id);
    }
  };

  return (
    <div className="scene-tools" onMouseLeave={close} data-tour="add">
      {/* Add objects — icon-only with a "+" badge; tooltips name them. */}
      <div className="tb-menu-wrap">
        <button
          className="tb-icon tb-add"
          title={is2D ? 'Add Shape' : 'Add Mesh'}
          onClick={() => setMenu(menu === 'mesh' ? null : 'mesh')}
        >
          <Boxes size={16} />
        </button>
        {menu === 'mesh' && (
          <div className="tb-menu">
            {primsFor(mode).map((p) => (
              <button key={p} onClick={() => { addPrimitive(p); close(); }}>{p}</button>
            ))}
          </div>
        )}
      </div>

      <button
        className="tb-icon tb-add"
        data-tour="player"
        onClick={() => { addPlayer(); close(); }}
        title="Add Player (default movement: WASD / arrows · mouse-look in 3D)"
      >
        <Gamepad2 size={16} />
      </button>

      {/* Lights are 3D-only; 2D shapes render flat/unlit. */}
      {!is2D && (
        <div className="tb-menu-wrap">
          <button className="tb-icon tb-add" title="Add Light" onClick={() => setMenu(menu === 'light' ? null : 'light')}>
            <Lightbulb size={16} />
          </button>
          {menu === 'light' && (
            <div className="tb-menu">
              {LIGHTS.map((l) => (
                <button key={l} onClick={() => { addLight(l); close(); }}>{l}</button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="tb-menu-wrap">
        <button
          className="tb-icon tb-add"
          data-tour="fx"
          disabled={!selectedId}
          title={selectedId ? 'Add FX to the selected object' : 'Add FX — select an object first'}
          onClick={() => setMenu(menu === 'fx' ? null : 'fx')}
        >
          <Sparkles size={16} />
        </button>
        {menu === 'fx' && selectedId && (
          <div className="tb-menu">
            {presetsForMode(mode).map((id) => (
              <button key={id} onClick={() => { addEffect(selectedId, id); close(); }}>
                {EFFECT_PRESETS[id].label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="tb-menu-wrap">
        <button
          className="tb-icon tb-add"
          title="Add Volume (a trigger zone that fires events when objects enter/exit)"
          onClick={() => setMenu(menu === 'volume' ? null : 'volume')}
        >
          <Scan size={16} />
        </button>
        {menu === 'volume' && (
          <div className="tb-menu">
            {volumesFor(mode).map((k) => (
              <button key={k} onClick={() => { addVolume(k); close(); }}>{k}</button>
            ))}
          </div>
        )}
      </div>

      <span className="tb-divider" />

      {/* Component edit modes (object / vertex / edge / face) — 3D only, since mesh Edit Mode
          is 3D-only. Object = whole-object selection; the rest enter/switch in-mesh editing. */}
      {/* Edit mode: a single button shows the active mode's icon; the dropdown switches modes
          (with hotkeys), keeping the toolbar compact + leaving room for more tools. */}
      {!is2D && (
        <>
          <div className="tb-menu-wrap">
            <button
              className={`tb-icon ${meshEdit.active ? 'active' : ''}`}
              title={`Edit mode: ${activeMode.label} — click to change`}
              onClick={() => setMenu(menu === 'modes' ? null : 'modes')}
            >
              <activeMode.icon size={16} />
            </button>
            {menu === 'modes' && (
              <div className="tb-menu">
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    className={`tb-menu-item ${modeActive(m.id) ? 'active' : ''}`}
                    disabled={modeDisabled(m.id)}
                    onClick={() => { setMode(m.id); close(); }}
                  >
                    <m.icon size={14} /> {m.label} <span className="tb-key">{m.key}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <span className="tb-divider" />
        </>
      )}

      {/* Transform gizmo tools */}
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
        {/* Snap to grid — gizmo drags snap to 1-unit / 15° / 0.25 increments. */}
        <button
          className={`tb-icon ${snapToGrid ? 'active' : ''}`}
          onClick={toggleSnapToGrid}
          title={`Snap to grid: ${snapToGrid ? 'on' : 'off'} — transform drags snap to grid increments`}
          aria-pressed={snapToGrid}
        >
          <Magnet size={16} />
        </button>
      </div>

      {/* View toggles: turn camera post-processing (bloom/grain/vignette/SSAO/
          shadows/IBL) off for a clean authoring view. Editor-only; the game keeps
          its own render settings. 3D only — 2D has no post-processing. */}
      {!is2D && (
        <>
          <span className="tb-divider" />
          <div className="tb-tools" data-tour="view">
            <button
              className={`tb-icon ${editorEffects ? 'active' : ''}`}
              onClick={toggleEditorEffects}
              title={`Camera effects: ${editorEffects ? 'on' : 'off'} — toggle post-processing in the editor view`}
              aria-pressed={editorEffects}
            >
              <Aperture size={16} />
            </button>
            {/* Surface visibility — only meaningful in polygon Edit Mode, where it
                hides the solid preview so you can edit through to the wireframe. */}
            {meshEdit.active && (
              <button
                className={`tb-icon ${showSurfaces ? 'active' : ''}`}
                onClick={toggleSurfaces}
                title={`Surfaces: ${showSurfaces ? 'shown' : 'hidden'} — toggle the solid mesh preview while editing`}
                aria-pressed={showSurfaces}
              >
                {showSurfaces ? <Eye size={16} /> : <EyeOff size={16} />}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
