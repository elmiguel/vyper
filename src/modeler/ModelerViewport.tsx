import { useEffect, useRef, useState } from 'react';
import { ModelerScene } from './ModelerScene';
import { useModelerStore } from './modelerStore';
import { ModelerToolbar } from './ModelerToolbar';
import { buildModelerMenu } from './modelerMenu';
import { ContextMenu, type MenuItem } from '@/ui/ContextMenu';
import { KEYMAPS, buildLookup, comboFromEvent } from '@/input/keymaps';

type ModelerSnapshot = ReturnType<typeof useModelerStore.getState>;

/** Push the active selection to the viewport as the right highlight for its component mode. */
function refreshHighlight(scene: ModelerScene, st: ModelerSnapshot): void {
  scene.setHighlight(st.geometry, {
    faces: st.selectionPolygons(),
    verts: st.selectionVerticesCompact(),
    edges: st.selectionEdgesCompact(),
  });
}

/**
 * The Modeling Studio's editing viewport. Owns a dedicated {@link ModelerScene} (its own
 * Babylon engine — not the game SceneManager) and drives it from the kernel-backed
 * {@link useModelerStore}: geometry rebuilds on edits, the highlight follows the
 * selection, and pointer picks flow back into the store. Left-drag orbits, middle-drag
 * pans, wheel zooms.
 */
export function ModelerViewport() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<ModelerScene | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);

  const revision = useModelerStore((s) => s.revision);
  const selRevision = useModelerStore((s) => s.selRevision);
  const activeRevision = useModelerStore((s) => s.activeRevision);
  const frameRequest = useModelerStore((s) => s.frameRequest);
  const tool = useModelerStore((s) => s.tool);
  const component = useModelerStore((s) => s.component);
  const keymap = useModelerStore((s) => s.keymap);
  const showWireframe = useModelerStore((s) => s.showWireframe);
  const snapToGrid = useModelerStore((s) => s.snapToGrid);
  const editTool = useModelerStore((s) => s.editTool);

  // Create the scene once, load the model, wire picking, and clean up on unmount.
  useEffect(() => {
    if (!canvasRef.current) return;
    const scene = new ModelerScene(canvasRef.current);
    sceneRef.current = scene;
    scene.setOnPick((pick, additive, subtract, loop) => useModelerStore.getState().applyPick(pick, additive, subtract, loop));
    scene.setComponentMode(useModelerStore.getState().component);
    scene.setOnTransform({
      begin: () => useModelerStore.getState().beginTransform(),
      translate: (dx, dy, dz) => useModelerStore.getState().translateSelectionLive(dx, dy, dz),
      rotate: (q, pivot) => useModelerStore.getState().rotateSelectionLive(q, pivot),
      scale: (sx, sy, sz, pivot) => useModelerStore.getState().scaleSelectionLive(sx, sy, sz, pivot),
      end: () => useModelerStore.getState().endTransform(),
    });
    scene.setGizmoMode(useModelerStore.getState().tool);
    scene.setLoopCutHandlers({
      preview: (edge, t) => useModelerStore.getState().loopCutPreview(edge, t),
      commit: (edge, t) => useModelerStore.getState().loopCutCommit(edge, t),
    });
    scene.setSketchTopoHandlers({
      commit: (verts, faces) => useModelerStore.getState().sketchTopoCommit(verts, faces),
      resolution: () => useModelerStore.getState().retopoResolution,
    });
    scene.setKnifeHandlers({ commit: (path) => useModelerStore.getState().knifeCommit(path) });
    scene.setDrawPolyHandlers({ commit: (points) => useModelerStore.getState().drawPolyCommit(points) });
    useModelerStore.getState().init();
    scene.setGeometry(useModelerStore.getState().geometry);
    scene.frame();
    const ro = new ResizeObserver(() => scene.resize());
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => {
      ro.disconnect();
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  // Geometry rebuilds (edits) → re-upload to the viewport + refresh the highlight.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const st = useModelerStore.getState();
    scene.setGeometry(st.geometry);
    refreshHighlight(scene, st);
  }, [revision]);

  // Selection-only changes → refresh the highlight and re-place the gizmo.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const st = useModelerStore.getState();
    refreshHighlight(scene, st);
    scene.setGizmo(st.selectionCentroid());
  }, [selRevision]);

  // Component mode (object/vertex/edge/face) → which component clicks pick + how it highlights.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.setComponentMode(component);
    const st = useModelerStore.getState();
    refreshHighlight(scene, st);
    scene.setGizmo(st.selectionCentroid());
  }, [component]);

  // Focus lock: dim + lock the non-active objects in component modes. Object mode shows all
  // (no dim) so any object can be picked to become the active one. Runs after the geometry /
  // component effects above so it colors the current mesh.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.setActivePolygons(component === 'object' ? null : useModelerStore.getState().activePolygonIndices());
  }, [component, revision, activeRevision]);

  // Frame requests from the toolbar.
  useEffect(() => {
    if (frameRequest > 0) sceneRef.current?.frame();
  }, [frameRequest]);

  // Active transform tool → which gizmo the scene shows.
  useEffect(() => {
    sceneRef.current?.setGizmoMode(tool);
  }, [tool]);

  // Wireframe overlay toggle.
  useEffect(() => {
    sceneRef.current?.setWireframe(showWireframe);
  }, [showWireframe]);

  // Grid snapping toggle (viewport magnet) → gizmo snap increments.
  useEffect(() => {
    sceneRef.current?.setSnapping(snapToGrid);
  }, [snapToGrid]);

  // Interactive edit tool (loop cut / knife) → route viewport pointer input.
  useEffect(() => {
    sceneRef.current?.setEditTool(editTool);
  }, [editTool]);

  // Keyboard layout: map keys (per the chosen layout) to tools / frame / undo-redo.
  useEffect(() => {
    const lookup = buildLookup(KEYMAPS[keymap]);
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (el?.closest('input, textarea, select, [contenteditable="true"]')) return;
      // Interactive tools: Esc toggles the tool off; Enter finishes the in-progress path.
      if (useModelerStore.getState().editTool !== 'none') {
        if (e.key === 'Escape') { useModelerStore.getState().setEditTool('none'); e.preventDefault(); return; }
        if (e.key === 'Enter') { sceneRef.current?.finishEditTool(); e.preventDefault(); return; }
      }
      // Component modes: 1/2/3/4 or Maya's F8–F11 (object/vertex/edge/face).
      const modes: Record<string, 'object' | 'vertex' | 'edge' | 'face'> = {
        '1': 'object', '2': 'vertex', '3': 'edge', '4': 'face',
        f8: 'object', f9: 'vertex', f10: 'edge', f11: 'face',
      };
      const mode = modes[e.key.toLowerCase()];
      if (mode && !e.ctrlKey && !e.metaKey && !e.altKey) {
        useModelerStore.getState().setComponent(mode);
        e.preventDefault();
        return;
      }
      // Modeling shortcuts: Ctrl/⌘+E extrude · > grow · < shrink (Maya defaults).
      const st0 = useModelerStore.getState();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') { e.shiftKey ? st0.ungroup() : st0.group(); e.preventDefault(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') { st0.extrude(0.5); e.preventDefault(); return; }
      if (e.key === '>' && !e.ctrlKey && !e.metaKey) { st0.grow(); e.preventDefault(); return; }
      if (e.key === '<' && !e.ctrlKey && !e.metaKey) { st0.shrink(); e.preventDefault(); return; }
      // Select Loop: edge loop from a selected edge, or the vertex/face loop through two anchors.
      if (e.key.toLowerCase() === 'l' && !e.ctrlKey && !e.metaKey) { st0.selectLoop(); e.preventDefault(); return; }
      const action = lookup.get(comboFromEvent(e));
      if (!action) return;
      const st = useModelerStore.getState();
      if (action === 'tool.select') st.setTool('select');
      else if (action === 'tool.move') st.setTool('move');
      else if (action === 'tool.rotate') st.setTool('rotate');
      else if (action === 'tool.scale') st.setTool('scale');
      else if (action === 'focus') st.requestFrame();
      else if (action === 'undo') st.undo();
      else if (action === 'redo') st.redo();
      else if (action === 'delete') st.deleteSelection();
      else if (action === 'duplicate') st.duplicateSelection();
      else if (action === 'copy') st.copySelection();
      else if (action === 'paste') st.paste();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [keymap]);

  // Right-click opens the themed, mode-aware context menu (unless a tool owns right-click).
  // Only a true secondary-button click (button 2) qualifies — macOS fires `contextmenu` with
  // button 0 for Ctrl+left-click, which is reserved for deselect, so we ignore that here.
  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (e.button !== 2) return; // Ctrl+left-click (deselect), not a menu request
    const st = useModelerStore.getState();
    if (st.editTool !== 'none') return;
    setMenu({ x: e.clientX, y: e.clientY, items: buildModelerMenu(st, KEYMAPS[st.keymap]) });
  };

  return (
    <div className="viewport-wrap modeler-viewport" ref={wrapRef} onContextMenu={onContextMenu}>
      <ModelerToolbar />
      <canvas ref={canvasRef} className="babylon-canvas" />
      <div className="viewport-badge">Model · edit viewport · LMB orbit · MMB pan · wheel zoom · RMB menu</div>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  );
}
