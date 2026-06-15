import { useEffect, useRef, useState } from 'react';
import { acquireEngine, getManager, releaseEngine } from './engine';
import { useEditorStore } from '@/store/editorStore';
import { GAME_CAMERA_ID } from './editorObjects';
import { ContextMenu, type MenuItem } from '@/ui/ContextMenu';
import type { LightKind } from '@/types';
import { primsFor } from '@/types';

const LIGHTS: LightKind[] = ['hemispheric', 'point', 'directional'];

interface MenuState {
  x: number;
  y: number;
  items: MenuItem[];
}

/** The main scene-editing viewport: editor camera, grid, gizmos, picking. */
export function SceneViewport() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const showInspector = useEditorStore((s) => s.showInspector3D);
  const mode = useEditorStore((s) => s.mode);
  const [menu, setMenu] = useState<MenuState | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const manager = acquireEngine(canvasRef.current);
    const ro = new ResizeObserver(() => manager.resize());
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => {
      ro.disconnect();
      releaseEngine();
    };
  }, []);

  // Babylon's built-in Inspector — the deep "live debugger" for the 3D scene.
  useEffect(() => {
    const manager = getManager();
    if (!manager) return;
    let cancelled = false;
    (async () => {
      await import('@babylonjs/inspector');
      if (cancelled) return;
      if (showInspector) {
        manager.scene.debugLayer.show({ embedMode: true, overlay: true });
      } else {
        manager.scene.debugLayer.hide();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showInspector]);

  // Context menu — contents depend on what's under the cursor (object / camera / empty).
  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const manager = getManager();
    if (!manager) return;
    const store = useEditorStore.getState();
    const id = manager.pickAtPointer();
    store.select(id);

    let items: MenuItem[];
    if (id === GAME_CAMERA_ID) {
      items = [
        { label: 'Frame Camera', onClick: () => store.focusSelected() },
        { label: 'Reset Game Camera', separator: true, onClick: () => store.resetGameCamera() },
      ];
    } else if (id) {
      const entity = store.entities.find((en) => en.id === id);
      items = [
        { label: 'Frame Object', onClick: () => store.focusSelected() },
        { label: 'Duplicate', onClick: () => store.duplicateEntity(id) },
        { label: 'Add Behaviour', onClick: () => store.addScript(id) },
      ];
      if (entity?.mesh) {
        items.push({
          label: 'Visible',
          checked: entity.mesh.visible,
          onClick: () => store.updateMesh(id, { visible: !entity.mesh!.visible }),
        });
      }
      items.push({ label: 'Delete', separator: true, danger: true, onClick: () => store.removeEntity(id) });
    } else {
      const is2D = store.mode === '2d';
      items = [
        {
          label: is2D ? 'Add Shape' : 'Add Mesh',
          submenu: primsFor(store.mode).map((p) => ({ label: p, onClick: () => store.addPrimitive(p) })),
        },
      ];
      if (!is2D) {
        items.push({
          label: 'Add Light',
          submenu: LIGHTS.map((l) => ({ label: l, onClick: () => store.addLight(l) })),
        });
      }
      items.push(
        { label: 'Frame All', separator: true, onClick: () => { store.select(null); store.focusSelected(); } },
        { label: 'Show Grid', checked: store.gridVisible, onClick: () => store.toggleGrid() },
      );
    }
    setMenu({ x: e.clientX, y: e.clientY, items });
  };

  return (
    <div className="viewport-wrap" ref={wrapRef} onContextMenu={onContextMenu} data-tour="scene">
      <canvas ref={canvasRef} className="babylon-canvas" />
      <div className="viewport-badge">Scene · editor camera · {mode === '2d' ? '2D' : '3D'}</div>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  );
}
