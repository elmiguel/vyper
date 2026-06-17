import { MousePointer2, Move3d, Rotate3d, Scale3d, Grid3x3, Magnet, Box, Grip, Slash, Square } from 'lucide-react';
import { useModelerStore, type ModelerTool, type ComponentMode } from './modelerStore';
import { KEYMAPS, describeBinding, type EditorAction } from '@/input/keymaps';
import { KeymapMenu } from '@/input/KeymapMenu';

const TOOLS: Array<{ id: ModelerTool; action: EditorAction; label: string; Icon: typeof Move3d }> = [
  { id: 'select', action: 'tool.select', label: 'Select', Icon: MousePointer2 },
  { id: 'move', action: 'tool.move', label: 'Move', Icon: Move3d },
  { id: 'rotate', action: 'tool.rotate', label: 'Rotate', Icon: Rotate3d },
  { id: 'scale', action: 'tool.scale', label: 'Scale', Icon: Scale3d },
];

const MODES: Array<{ id: ComponentMode; key: string; label: string; Icon: typeof Box }> = [
  { id: 'object', key: '1', label: 'Object mode', Icon: Box },
  { id: 'vertex', key: '2', label: 'Vertex mode', Icon: Grip },
  { id: 'edge', key: '3', label: 'Edge mode', Icon: Slash },
  { id: 'face', key: '4', label: 'Face mode', Icon: Square },
];

/**
 * The Modeling Studio's in-viewport toolbar: transform tools (Select/Move/Rotate/Scale)
 * with shortcut hints from the active keyboard layout, plus a layout dropdown
 * (Maya/Blender/Unity, defaulting to Maya) — mirroring the game editor's keymap menu.
 */
export function ModelerToolbar() {
  const tool = useModelerStore((s) => s.tool);
  const component = useModelerStore((s) => s.component);
  const keymap = useModelerStore((s) => s.keymap);
  const showWireframe = useModelerStore((s) => s.showWireframe);
  const snapToGrid = useModelerStore((s) => s.snapToGrid);
  const setTool = useModelerStore((s) => s.setTool);
  const setComponent = useModelerStore((s) => s.setComponent);
  const setKeymap = useModelerStore((s) => s.setKeymap);
  const toggleWireframe = useModelerStore((s) => s.toggleWireframe);
  const toggleSnapToGrid = useModelerStore((s) => s.toggleSnapToGrid);
  const km = KEYMAPS[keymap];

  return (
    <div className="modeler-toolbar">
      <div className="mtb-tools">
        {MODES.map(({ id, key, label, Icon }) => (
          <button
            key={id}
            className={`tb-icon ${component === id ? 'active' : ''}`}
            title={`${label} (${key})`}
            aria-pressed={component === id}
            onClick={() => setComponent(id)}
          >
            <Icon size={16} />
          </button>
        ))}
      </div>
      <span className="tb-divider" />
      <div className="mtb-tools">
        {TOOLS.map(({ id, action, label, Icon }) => {
          const key = describeBinding(km, action);
          return (
            <button
              key={id}
              className={`tb-icon ${tool === id ? 'active' : ''}`}
              title={key ? `${label} (${key})` : label}
              onClick={() => setTool(id)}
            >
              <Icon size={16} />
            </button>
          );
        })}
      </div>
      <span className="tb-divider" />
      <button
        className={`tb-icon ${snapToGrid ? 'active' : ''}`}
        title={`Snap to grid: ${snapToGrid ? 'on' : 'off'} — transform drags snap to grid increments`}
        aria-pressed={snapToGrid}
        onClick={() => toggleSnapToGrid()}
      >
        <Magnet size={16} />
      </button>
      <button
        className={`mtb-toggle ${showWireframe ? 'active' : ''}`}
        title={showWireframe ? 'Hide wireframe' : 'Show wireframe'}
        aria-pressed={showWireframe}
        onClick={() => toggleWireframe()}
      >
        <Grid3x3 size={14} /> Wire
      </button>
      <span className="tb-divider" />
      <KeymapMenu value={keymap} onChange={setKeymap} />
    </div>
  );
}
