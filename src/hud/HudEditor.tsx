import { useRef, useState, type PointerEvent as ReactPointerEvent, type DragEvent as ReactDragEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { X, Trash2, Copy, Eye, EyeOff, Layout } from 'lucide-react';
import { useEditorStore } from '@/store/editorStore';
import type { HudWidget, HudWidgetKind } from '@/types';
import { HUD_ASSETS } from './hudAssets';
import { HudOverlay } from './HudOverlay';
import { ContextMenu, type MenuItem } from '@/ui/ContextMenu';
import { NumberInput } from '@/ui/NumberInput';

/** Custom MIME carrying a widget kind from the palette to the stage on drop. */
const HUD_DND = 'application/vyper-hud-kind';

const MIN = 2; // min widget size, % of view
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/** Apply a resize from a handle: dx/dy are deltas in percent-of-view. */
function resize(o: { x: number; y: number; w: number; h: number }, h: Handle, dx: number, dy: number) {
  let { x, y, w, hh } = { x: o.x, y: o.y, w: o.w, hh: o.h };
  if (h.includes('e')) w = clamp(o.w + dx, MIN, 100 - o.x);
  if (h.includes('s')) hh = clamp(o.h + dy, MIN, 100 - o.y);
  if (h.includes('w')) {
    const nx = clamp(o.x + dx, 0, o.x + o.w - MIN);
    w = o.x + o.w - nx;
    x = nx;
  }
  if (h.includes('n')) {
    const ny = clamp(o.y + dy, 0, o.y + o.h - MIN);
    hh = o.y + o.h - ny;
    y = ny;
  }
  return { x, y, w, h: hh };
}

export function HudEditor() {
  const show = useEditorStore((s) => s.showHud);
  const widgets = useEditorStore((s) => s.design.hud?.widgets ?? []);
  const selectedId = useEditorStore((s) => s.selectedHudId);
  const mode = useEditorStore((s) => s.mode);
  const {
    setShowHud, selectHudWidget, addHudWidget, updateHudWidget, removeHudWidget, duplicateHudWidget, reorderHudWidget,
  } = useEditorStore();

  const stageRef = useRef<HTMLDivElement>(null);
  // Active drag/resize interaction (in percent-of-view space).
  const drag = useRef<{ id: string; mode: 'move' | Handle; sx: number; sy: number; orig: HudWidget; rect: DOMRect } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);

  const selected = widgets.find((w) => w.id === selectedId) ?? null;

  if (!show) return null;

  /** Add a widget of `kind` centered on a client (px) point over the stage. */
  const addAtClient = (kind: HudWidgetKind, clientX: number, clientY: number) => {
    const rect = stageRef.current?.getBoundingClientRect();
    const id = addHudWidget(kind);
    if (!rect) return id;
    const px = ((clientX - rect.left) / rect.width) * 100;
    const py = ((clientY - rect.top) / rect.height) * 100;
    // Center the new widget on the cursor, clamped inside the stage.
    const w = useEditorStore.getState().design.hud?.widgets.find((x) => x.id === id);
    if (w) updateHudWidget(id, { x: clamp(px - w.w / 2, 0, 100 - w.w), y: clamp(py - w.h / 2, 0, 100 - w.h) });
    return id;
  };

  // ----- palette → stage drag-and-drop -----
  const onAssetDragStart = (e: ReactDragEvent, kind: HudWidgetKind) => {
    e.dataTransfer.setData(HUD_DND, kind);
    e.dataTransfer.effectAllowed = 'copy';
  };
  const onStageDragOver = (e: ReactDragEvent) => {
    if (!e.dataTransfer.types.includes(HUD_DND)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };
  const onStageDrop = (e: ReactDragEvent) => {
    const kind = e.dataTransfer.getData(HUD_DND) as HudWidgetKind;
    if (!kind) return;
    e.preventDefault();
    addAtClient(kind, e.clientX, e.clientY);
  };

  // ----- right-click context menus -----
  const addSubmenu = (clientX: number, clientY: number): MenuItem => ({
    label: 'Add widget',
    submenu: HUD_ASSETS.map((a) => ({ label: `${a.glyph}  ${a.label}`, onClick: () => addAtClient(a.kind, clientX, clientY) })),
  });

  const onStageContextMenu = (e: ReactMouseEvent) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, items: [addSubmenu(e.clientX, e.clientY)] });
  };

  const onWidgetContextMenu = (e: ReactMouseEvent, w: HudWidget) => {
    e.preventDefault();
    e.stopPropagation();
    selectHudWidget(w.id);
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: 'Duplicate', onClick: () => duplicateHudWidget(w.id) },
        { label: w.visible ? 'Hide' : 'Show', onClick: () => updateHudWidget(w.id, { visible: !w.visible }) },
        { label: 'Bring to front', onClick: () => reorderHudWidget(w.id, 'front') },
        { label: 'Send to back', onClick: () => reorderHudWidget(w.id, 'back') },
        { label: 'Add widget', separator: true, submenu: addSubmenu(e.clientX, e.clientY).submenu },
        { label: 'Delete', danger: true, separator: true, onClick: () => removeHudWidget(w.id) },
      ],
    });
  };

  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dxPct = ((e.clientX - d.sx) / d.rect.width) * 100;
    const dyPct = ((e.clientY - d.sy) / d.rect.height) * 100;
    if (d.mode === 'move') {
      updateHudWidget(d.id, {
        x: clamp(d.orig.x + dxPct, 0, 100 - d.orig.w),
        y: clamp(d.orig.y + dyPct, 0, 100 - d.orig.h),
      });
    } else {
      updateHudWidget(d.id, resize(d.orig, d.mode, dxPct, dyPct));
    }
  };

  const endDrag = () => {
    drag.current = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', endDrag);
  };

  const startDrag = (e: ReactPointerEvent, w: HudWidget, mode: 'move' | Handle) => {
    e.stopPropagation();
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    selectHudWidget(w.id);
    drag.current = { id: w.id, mode, sx: e.clientX, sy: e.clientY, orig: { ...w }, rect };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', endDrag);
  };

  return (
    <div className="hud-backdrop" onClick={() => setShowHud(false)}>
      <div className="hud-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="HUD editor">
        <header className="hud-head">
          <div className="hud-title"><Layout size={17} /> <span>HUD Editor</span> <em>· {mode === '2d' ? '2D' : '3D'} game</em></div>
          <span className="hud-hint">Drag to move · handles to resize · changes show live in the Game preview</span>
          <button className="sc-close" onClick={() => setShowHud(false)} aria-label="Close"><X size={16} /></button>
        </header>

        <div className="hud-body">
          {/* Palette */}
          <div className="hud-palette">
            <div className="hud-palette-label">Widgets</div>
            {HUD_ASSETS.map((a) => (
              <button
                key={a.kind}
                className="hud-asset"
                title={`${a.hint}  ·  click to add, or drag onto the screen`}
                draggable
                onDragStart={(e) => onAssetDragStart(e, a.kind)}
                onClick={() => addHudWidget(a.kind)}
              >
                <span className="hud-asset-glyph">{a.glyph}</span>
                <span className="hud-asset-name">{a.label}</span>
              </button>
            ))}
          </div>

          {/* Stage — a 16:9 screen with the live HUD and editable boxes on top */}
          <div className="hud-stage-wrap" onClick={() => selectHudWidget(null)}>
            <div
              className="hud-stage"
              ref={stageRef}
              onDragOver={onStageDragOver}
              onDrop={onStageDrop}
              onContextMenu={onStageContextMenu}
            >
              {/* rule-of-thirds + safe-area guides */}
              <div className="hud-guides">
                <span className="g v" style={{ left: '33.33%' }} /><span className="g v" style={{ left: '66.66%' }} />
                <span className="g h" style={{ top: '33.33%' }} /><span className="g h" style={{ top: '66.66%' }} />
                <span className="hud-safe" />
              </div>

              {/* Read-only visuals (identical to the in-game overlay) */}
              <HudOverlay widgets={widgets} />

              {/* Interaction layer: one box per widget */}
              <div className="hud-edit-layer">
                {widgets.map((w) => (
                  <div
                    key={w.id}
                    className={`hud-edit-box ${selectedId === w.id ? 'sel' : ''} ${w.visible ? '' : 'hidden'}`}
                    style={{ left: `${w.x}%`, top: `${w.y}%`, width: `${w.w}%`, height: `${w.h}%` }}
                    onPointerDown={(e) => startDrag(e, w, 'move')}
                    onClick={(e) => e.stopPropagation()}
                    onContextMenu={(e) => onWidgetContextMenu(e, w)}
                  >
                    {selectedId === w.id &&
                      HANDLES.map((h) => (
                        <span
                          key={h}
                          className={`hud-handle h-${h}`}
                          onPointerDown={(e) => startDrag(e, w, h)}
                        />
                      ))}
                  </div>
                ))}
              </div>

              {widgets.length === 0 && (
                <div className="hud-empty">Click a widget on the left to add it to the HUD.</div>
              )}
            </div>
          </div>

          {/* Inspector */}
          <div className="hud-inspector">
            {selected ? (
              <HudInspector key={selected.id} w={selected} onChange={(p) => updateHudWidget(selected.id, p)}
                onDelete={() => removeHudWidget(selected.id)} onDup={() => duplicateHudWidget(selected.id)} />
            ) : (
              <div className="empty-hint">Select a widget to edit it.</div>
            )}
          </div>
        </div>
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  );
}

// 9-grid anchor presets: snap the widget to a screen region for its current size.
const ANCHORS: { key: string; label: string; pos: (w: HudWidget) => { x: number; y: number } }[] = [
  { key: 'tl', label: '↖', pos: () => ({ x: 3, y: 4 }) },
  { key: 't', label: '↑', pos: (w) => ({ x: 50 - w.w / 2, y: 4 }) },
  { key: 'tr', label: '↗', pos: (w) => ({ x: 97 - w.w, y: 4 }) },
  { key: 'l', label: '←', pos: (w) => ({ x: 3, y: 50 - w.h / 2 }) },
  { key: 'c', label: '•', pos: (w) => ({ x: 50 - w.w / 2, y: 50 - w.h / 2 }) },
  { key: 'r', label: '→', pos: (w) => ({ x: 97 - w.w, y: 50 - w.h / 2 }) },
  { key: 'bl', label: '↙', pos: (w) => ({ x: 3, y: 95 - w.h }) },
  { key: 'b', label: '↓', pos: (w) => ({ x: 50 - w.w / 2, y: 95 - w.h }) },
  { key: 'br', label: '↘', pos: (w) => ({ x: 97 - w.w, y: 95 - w.h }) },
];

function HudInspector({ w, onChange, onDelete, onDup }: {
  w: HudWidget; onChange: (p: Partial<HudWidget>) => void; onDelete: () => void; onDup: () => void;
}) {
  const showsValue = ['score', 'ammo', 'timer', 'healthbar', 'bar'].includes(w.kind);
  const showsText = ['text', 'score', 'button', 'objective', 'icon', 'timer'].includes(w.kind);
  const showsBar = w.kind === 'healthbar' || w.kind === 'bar';
  const showsBg = !['text', 'crosshair', 'icon', 'score', 'timer', 'ammo'].includes(w.kind);

  return (
    <div className="hud-insp-scroll">
      <div className="hud-insp-head">
        <input className="name-input" value={w.name} onChange={(e) => onChange({ name: e.target.value })} />
        <button className="hud-icon" title="Duplicate" onClick={onDup}><Copy size={13} /></button>
        <button className="hud-icon" title={w.visible ? 'Hide' : 'Show'} onClick={() => onChange({ visible: !w.visible })}>
          {w.visible ? <Eye size={13} /> : <EyeOff size={13} />}
        </button>
        <button className="hud-icon danger" title="Delete" onClick={onDelete}><Trash2 size={13} /></button>
      </div>
      <div className="hud-kind">{w.kind}</div>

      <h4>Anchor</h4>
      <div className="hud-anchors">
        {ANCHORS.map((a) => (
          <button key={a.key} onClick={() => onChange(a.pos(w))} title={`Snap ${a.key}`}>{a.label}</button>
        ))}
      </div>

      <h4>Position &amp; size <span className="hud-unit">% of screen</span></h4>
      <div className="hud-grid4">
        {(['x', 'y', 'w', 'h'] as const).map((k) => (
          <label key={k}><span>{k.toUpperCase()}</span>
            <NumberInput step={0.5} value={w[k]} display={(n) => String(Number(n.toFixed(1)))} onChange={(v) => onChange({ [k]: v })} />
          </label>
        ))}
      </div>

      {showsText && (
        <>
          <h4>{w.kind === 'icon' ? 'Glyph / emoji' : 'Label'}</h4>
          <input className="hud-text-input" value={w.label} onChange={(e) => onChange({ label: e.target.value })} placeholder={w.kind === 'score' ? 'SCORE' : 'text'} />
        </>
      )}

      {showsValue && (
        <>
          <h4>Value{showsBar ? ' / max' : ''}</h4>
          <div className="hud-grid4">
            <label><span>Value</span><NumberInput value={w.value} onChange={(v) => onChange({ value: v })} /></label>
            {showsBar && <label><span>Max</span><NumberInput value={w.max} onChange={(v) => onChange({ max: v })} /></label>}
          </div>
          <h4>Bind to live value <span className="hud-unit">while playing</span></h4>
          <div className="hud-grid4">
            <label><span>Object</span><input value={w.bindTarget} placeholder="Player" onChange={(e) => onChange({ bindTarget: e.target.value })} /></label>
            <label><span>Prop</span><input value={w.bindProp} placeholder="health" onChange={(e) => onChange({ bindProp: e.target.value })} /></label>
          </div>
        </>
      )}

      <h4>Style</h4>
      <div className="hud-style-row">
        <label className="hud-color"><span>{showsBar ? 'Fill' : 'Color'}</span><input type="color" value={w.color} onChange={(e) => onChange({ color: e.target.value })} /></label>
        {showsBg && (
          <label className="hud-color"><span>{showsBar ? 'Track' : 'Background'}</span>
            <input type="color" value={w.bg === 'transparent' ? '#0b0a1c' : w.bg} onChange={(e) => onChange({ bg: e.target.value })} />
          </label>
        )}
      </div>
      {showsBg && (
        <label className="hud-check"><input type="checkbox" checked={w.bg === 'transparent'} onChange={(e) => onChange({ bg: e.target.checked ? 'transparent' : '#0b0a1c' })} /> Transparent background</label>
      )}
      <div className="hud-grid4">
        {showsText && <label><span>Font</span><NumberInput value={w.fontSize} onChange={(v) => onChange({ fontSize: v })} /></label>}
        <label><span>Radius</span><NumberInput value={w.radius} onChange={(v) => onChange({ radius: v })} /></label>
        <label><span>Opacity</span><NumberInput step={0.05} min={0} max={1} value={w.opacity} onChange={(v) => onChange({ opacity: clamp(v, 0, 1) })} /></label>
      </div>
      {showsText && (
        <div className="hud-align">
          {(['left', 'center', 'right'] as const).map((a) => (
            <button key={a} className={w.align === a ? 'on' : ''} onClick={() => onChange({ align: a })}>{a}</button>
          ))}
        </div>
      )}
    </div>
  );
}
