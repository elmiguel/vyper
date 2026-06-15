import { useState } from 'react';
import { Box, Lightbulb, Circle, Copy, Trash2, Code2, Video, Grid3x3, Eye, EyeOff } from 'lucide-react';
import { useEditorStore } from '@/store/editorStore';
import { GAME_CAMERA_ID } from '@/babylon/editorObjects';
import { ContextMenu, type MenuItem } from '@/ui/ContextMenu';
import type { Entity, LightKind } from '@/types';
import { primsFor } from '@/types';

const LIGHTS: LightKind[] = ['hemispheric', 'point', 'directional'];

function icon(e: Entity) {
  if (e.light) return <Lightbulb size={13} className="ic-light" />;
  if (e.mesh) return <Box size={13} className="ic-mesh" />;
  return <Circle size={13} className="ic-empty" />;
}

interface MenuState {
  x: number;
  y: number;
  items: MenuItem[];
}

export function Hierarchy() {
  const entities = useEditorStore((s) => s.entities);
  const selectedId = useEditorStore((s) => s.selectedId);
  const gridVisible = useEditorStore((s) => s.gridVisible);
  const select = useEditorStore((s) => s.select);
  const remove = useEditorStore((s) => s.removeEntity);
  const duplicate = useEditorStore((s) => s.duplicateEntity);
  const toggleGrid = useEditorStore((s) => s.toggleGrid);
  const [menu, setMenu] = useState<MenuState | null>(null);

  const sceneItems = (): MenuItem[] => {
    const s = useEditorStore.getState();
    const is2D = s.mode === '2d';
    const items: MenuItem[] = [
      { label: is2D ? 'Add Shape' : 'Add Mesh', submenu: primsFor(s.mode).map((p) => ({ label: p, onClick: () => s.addPrimitive(p) })) },
    ];
    if (!is2D) items.push({ label: 'Add Light', submenu: LIGHTS.map((l) => ({ label: l, onClick: () => s.addLight(l) })) });
    items.push({ label: 'Show Grid', separator: true, checked: s.gridVisible, onClick: () => s.toggleGrid() });
    return items;
  };

  const entityItems = (id: string): MenuItem[] => {
    const s = useEditorStore.getState();
    const ent = s.entities.find((e) => e.id === id);
    const items: MenuItem[] = [
      { label: 'Frame', onClick: () => { s.select(id); s.focusSelected(); } },
      { label: 'Duplicate', onClick: () => s.duplicateEntity(id) },
      { label: 'Add Behaviour', onClick: () => s.addScript(id) },
    ];
    if (ent?.mesh) {
      items.push({ label: 'Visible', checked: ent.mesh.visible, onClick: () => s.updateMesh(id, { visible: !ent.mesh!.visible }) });
    }
    items.push({ label: 'Delete', separator: true, danger: true, onClick: () => s.removeEntity(id) });
    return items;
  };

  const cameraItems = (): MenuItem[] => {
    const s = useEditorStore.getState();
    return [
      { label: 'Frame Camera', onClick: () => { s.select(GAME_CAMERA_ID); s.focusSelected(); } },
      { label: 'Reset Game Camera', separator: true, onClick: () => s.resetGameCamera() },
    ];
  };

  const openMenu = (e: React.MouseEvent, items: MenuItem[]) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, items });
  };

  return (
    <div className="panel hierarchy" data-tour="hierarchy">
      <div className="panel-head">Hierarchy <span className="count">{entities.length}</span></div>
      <div className="panel-scroll" onContextMenu={(e) => openMenu(e, sceneItems())}>
        {entities.map((e) => (
          <div
            key={e.id}
            className={`tree-row ${selectedId === e.id ? 'active' : ''}`}
            onClick={() => select(e.id)}
            onContextMenu={(ev) => { select(e.id); openMenu(ev, entityItems(e.id)); }}
          >
            {icon(e)}
            <span className="tree-name">{e.name}</span>
            {e.scriptIds.length > 0 && <Code2 size={12} className="ic-script" />}
            <span className="tree-actions">
              <button title="Duplicate" onClick={(ev) => { ev.stopPropagation(); duplicate(e.id); }}>
                <Copy size={12} />
              </button>
              <button title="Delete" onClick={(ev) => { ev.stopPropagation(); remove(e.id); }}>
                <Trash2 size={12} />
              </button>
            </span>
          </div>
        ))}
        {entities.length === 0 && <div className="empty-hint">Right-click here or use the toolbar to add objects.</div>}

        <div className="tree-group-label">Editor</div>
        <div
          className={`tree-row ${selectedId === GAME_CAMERA_ID ? 'active' : ''}`}
          onClick={() => select(GAME_CAMERA_ID)}
          onContextMenu={(ev) => { select(GAME_CAMERA_ID); openMenu(ev, cameraItems()); }}
        >
          <Video size={13} className="ic-camera" />
          <span className="tree-name">Game Camera</span>
        </div>
        <div className="tree-row" onClick={toggleGrid} title="Toggle grid visibility">
          <Grid3x3 size={13} className={gridVisible ? 'ic-grid' : 'ic-empty'} />
          <span className="tree-name" style={{ opacity: gridVisible ? 1 : 0.5 }}>Grid</span>
          <span className="tree-actions" style={{ display: 'flex' }}>
            <button title={gridVisible ? 'Hide' : 'Show'}>
              {gridVisible ? <Eye size={12} /> : <EyeOff size={12} />}
            </button>
          </span>
        </div>
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  );
}
