import './loaders'; // registers OBJ/glTF model loaders on SceneLoader (side effect)
import { SceneManager } from './SceneManager';
import { ScriptRuntime } from '@/runtime/ScriptRuntime';
import { useEditorStore, type EditorState } from '@/store/editorStore';
import { gameConsole } from '@/store/consoleStore';
import { isSceneEditable } from '@/types';

/** The slice of editor state captured at Play start and restored verbatim on Stop,
 *  so every play-mode change (simulation + edits made while paused) is discarded. */
type PlaySnapshot = Pick<
  EditorState,
  'entities' | 'scripts' | 'design' | 'gameCamera' | 'gridVisible' | 'past' | 'future' | 'selectedId' | 'activeScriptId'
>;

/**
 * Single shared Babylon engine for the whole editor. The editor viewport creates
 * it; the game-preview panel registers a second view onto the same scene. All
 * store → scene wiring lives here so it is set up exactly once.
 */

let manager: SceneManager | null = null;
let runtime: ScriptRuntime | null = null;
let unsubscribers: Array<() => void> = [];
let refCount = 0;
let playSnapshot: PlaySnapshot | null = null;

export function getManager() {
  return manager;
}
export function getRuntime() {
  return runtime;
}

export function acquireEngine(canvas: HTMLCanvasElement): SceneManager {
  refCount++;
  if (manager) return manager;

  manager = new SceneManager(
    canvas,
    useEditorStore.getState().mode,
    () => useEditorStore.getState().playState !== 'editing',
  );
  runtime = new ScriptRuntime(manager);
  const store = useEditorStore;

  // Warm up the Havok WASM in the background so the first Play doesn't stall.
  void manager.loadHavok().catch((err) => gameConsole.warn('runtime', `Physics failed to load: ${(err as Error).message}`));

  manager.setOnPick((id) => store.getState().select(id));
  manager.setOnTransform((id, patch) => {
    // Editable while editing AND while paused (adjust the frozen game); not while playing.
    if (isSceneEditable(store.getState().playState)) store.getState().updateTransform(id, patch);
  });
  manager.setOnCameraTransform((patch) => store.getState().updateGameCamera(patch));

  // Initial scene build.
  manager.sync(store.getState().entities);
  manager.setAssetLibrary(store.getState().assetLibrary.assets);
  manager.highlightSelection(store.getState().selectedId);
  manager.setGizmoMode(store.getState().gizmoMode);
  manager.applyGameCamera(store.getState().gameCamera);
  manager.setGridVisible(store.getState().gridVisible);
  manager.setSnapping(store.getState().snapToGrid);
  manager.applyRenderSettings(store.getState().design.render);
  manager.setEditorEffects(store.getState().editorEffects);
  // Committed sculpt strokes persist as a terrain edit (undoable as one step).
  manager.setOnSculptCommit((id, heights) => store.getState().updateTerrain(id, { heights }));
  // Polygon Edit Mode: geometry commits persist as a custom-mesh edit; the controller
  // reports its live component selection back to the store for the tools panel.
  manager.meshEditController?.setOnCommit((id, geo) => store.getState().commitMeshGeometry(id, geo));
  manager.meshEditController?.setOnSelectionChange((mode, keys) => store.getState().setMeshSelection(mode, keys));
  // Rigging: skeleton/skin/pose commits persist on the entity (commitRig writes the
  // live pose, which the timeline keys from).
  manager.rigController?.setOnCommit((id, c) => store.getState().commitRig(id, c.skeleton, c.skin, c.pose));

  // Rebuild scene when structure/materials change. Skip transforms only while
  // actively playing (the runtime owns positions); while paused, apply them so
  // gizmo/inspector edits show on the frozen scene.
  let lastRev = store.getState().sceneRevision;
  unsubscribers.push(
    store.subscribe((s) => {
      if (s.sceneRevision !== lastRev) {
        lastRev = s.sceneRevision;
        manager!.sync(s.entities, { skipTransforms: !isSceneEditable(s.playState) });
      }
    }),
  );

  // Asset catalogue changes (manifest load, edits, uploads) — refresh the loader
  // so newly-known assets resolve for any already-placed model entities.
  let lastAssets = store.getState().assetLibrary;
  unsubscribers.push(
    store.subscribe((s) => {
      if (s.assetLibrary !== lastAssets) {
        lastAssets = s.assetLibrary;
        manager!.setAssetLibrary(s.assetLibrary.assets);
      }
    }),
  );

  // High-quality render settings (post-processing/shadows/IBL). `design.render`
  // gets a fresh object reference on every edit, so identity comparison suffices.
  // The editor-only `editorEffects` toggle suppresses all post-processing for a
  // clean authoring view without touching the game's saved render settings.
  let lastRender = store.getState().design.render;
  let lastEffects = store.getState().editorEffects;
  unsubscribers.push(
    store.subscribe((s) => {
      if (s.design.render !== lastRender) {
        lastRender = s.design.render;
        manager!.applyRenderSettings(s.design.render);
        // Re-applying may rebuild the pipeline (attaching all cameras); re-assert
        // the editor-camera toggle so a clean editor view survives a settings edit.
        manager!.setEditorEffects(s.editorEffects);
      }
      if (s.editorEffects !== lastEffects) {
        lastEffects = s.editorEffects;
        manager!.setEditorEffects(s.editorEffects);
      }
    }),
  );

  // Terrain sculpt tool: toggling `sculpting`, changing selection, or tweaking the
  // brush re-targets/updates the live sculpt controller.
  let lastSculpt = store.getState().sculpting;
  let lastBrush = store.getState().brush;
  let lastSculptSel = store.getState().selectedId;
  unsubscribers.push(
    store.subscribe((s) => {
      const selChanged = s.selectedId !== lastSculptSel;
      const sculptChanged = s.sculpting !== lastSculpt;
      const brushChanged = s.brush !== lastBrush;
      if (!selChanged && !sculptChanged && !brushChanged) return;
      lastSculpt = s.sculpting;
      lastBrush = s.brush;
      lastSculptSel = s.selectedId;
      if (sculptChanged || selChanged) {
        const ent = s.entities.find((e) => e.id === s.selectedId);
        const terrain = s.sculpting && ent?.mesh?.kind === 'terrain' ? ent.mesh.terrain ?? null : null;
        manager!.setSculpt(!!terrain, terrain ? s.selectedId : null, terrain, s.brush);
      } else if (brushChanged) {
        manager!.setBrush(s.brush);
      }
    }),
  );

  // Polygon Edit Mode: entering/leaving re-targets the controller; the component
  // type (vertex/edge/face) re-routes selection + overlays.
  let lastMeshActive = store.getState().meshEdit.active;
  let lastMeshEntity = store.getState().meshEdit.entityId;
  let lastMeshComp = store.getState().meshEdit.component;
  let lastMeshSculpt = store.getState().meshEdit.sculpt;
  let lastMeshTool = store.getState().meshEdit.tool;
  let lastShowSurfaces = store.getState().showSurfaces;
  unsubscribers.push(
    store.subscribe((s) => {
      const me = s.meshEdit;
      const mec = manager!.meshEditController;
      if (me.active !== lastMeshActive || me.entityId !== lastMeshEntity) {
        lastMeshActive = me.active;
        lastMeshEntity = me.entityId;
        // Pass the entity's stored geometry so persisted quad topology re-opens faithfully.
        const ent = me.entityId ? s.entities.find((e) => e.id === me.entityId) : undefined;
        mec?.setTarget(me.active, me.entityId, ent?.mesh?.custom ?? null);
      }
      if (me.component !== lastMeshComp) {
        lastMeshComp = me.component;
        mec?.setComponentMode(me.component);
      }
      if (me.sculpt !== lastMeshSculpt) {
        lastMeshSculpt = me.sculpt;
        mec?.setSculptBrush(me.sculpt);
      }
      if (me.tool !== lastMeshTool) {
        lastMeshTool = me.tool;
        mec?.setTool(me.tool);
      }
      if (s.showSurfaces !== lastShowSurfaces) {
        lastShowSurfaces = s.showSurfaces;
        mec?.setShowSurfaces(s.showSurfaces);
      }
    }),
  );

  // Rigging + animation: enter/exit Rig Mode, and scrub the active clip's pose live.
  let lastRigActive = store.getState().rig.active;
  let lastRigEntity = store.getState().rig.entityId;
  let lastPose = store.getState().rig.scrubPose;
  let lastRigBone = store.getState().rig.selectedBone;
  unsubscribers.push(
    store.subscribe((s) => {
      const rc = manager!.rigController;
      const r = s.rig;
      if (r.active !== lastRigActive || r.entityId !== lastRigEntity) {
        lastRigActive = r.active;
        lastRigEntity = r.entityId;
        const ent = r.entityId ? s.entities.find((e) => e.id === r.entityId) : undefined;
        rc?.setTarget(r.active, r.entityId, ent?.mesh?.custom ?? null, ent?.rig ?? null);
      }
      if (r.selectedBone !== lastRigBone) {
        lastRigBone = r.selectedBone;
        rc?.selectBone(r.selectedBone);
      }
      if (r.scrubPose !== lastPose) {
        lastPose = r.scrubPose;
        if (r.scrubPose) rc?.applyPose(r.scrubPose);
      }
    }),
  );

  // Selection highlight + gizmo.
  let lastSel = store.getState().selectedId;
  unsubscribers.push(
    store.subscribe((s) => {
      if (s.selectedId !== lastSel) {
        lastSel = s.selectedId;
        manager!.highlightSelection(s.selectedId);
      }
    }),
  );

  // Gizmo tool changes (Maya q/w/e/r etc.).
  let lastGizmo = store.getState().gizmoMode;
  unsubscribers.push(
    store.subscribe((s) => {
      if (s.gizmoMode !== lastGizmo) {
        lastGizmo = s.gizmoMode;
        manager!.setGizmoMode(s.gizmoMode);
      }
    }),
  );

  // Game-camera moves (gizmo on its helper, or inspector edits).
  let lastCam = store.getState().cameraRevision;
  unsubscribers.push(
    store.subscribe((s) => {
      if (s.cameraRevision !== lastCam) {
        lastCam = s.cameraRevision;
        manager!.applyGameCamera(s.gameCamera);
      }
    }),
  );

  // Maya-style viewport navigation toggle (on in the 3D Modeling area).
  manager.setMayaNavigation(store.getState().mayaNav);
  let lastMayaNav = store.getState().mayaNav;
  unsubscribers.push(
    store.subscribe((s) => {
      if (s.mayaNav !== lastMayaNav) {
        lastMayaNav = s.mayaNav;
        manager!.setMayaNavigation(s.mayaNav);
      }
    }),
  );

  // Grid visibility toggle (editor-only).
  let lastGrid = store.getState().gridVisible;
  unsubscribers.push(
    store.subscribe((s) => {
      if (s.gridVisible !== lastGrid) {
        lastGrid = s.gridVisible;
        manager!.setGridVisible(s.gridVisible);
      }
    }),
  );

  // Grid snapping toggle (viewport magnet) — applies to transform gizmo drags.
  let lastSnap = store.getState().snapToGrid;
  unsubscribers.push(
    store.subscribe((s) => {
      if (s.snapToGrid !== lastSnap) {
        lastSnap = s.snapToGrid;
        manager!.setSnapping(s.snapToGrid);
      }
    }),
  );

  // Focus-on-selected requests (the "F" shortcut).
  let lastFocus = store.getState().focusRequest;
  unsubscribers.push(
    store.subscribe((s) => {
      if (s.focusRequest !== lastFocus) {
        lastFocus = s.focusRequest;
        manager!.focusOn(s.selectedId);
      }
    }),
  );

  // Play / pause / stop transitions.
  let lastPlay = store.getState().playState;
  unsubscribers.push(
    store.subscribe((s) => {
      if (s.playState === lastPlay) return;
      const prev = lastPlay;
      lastPlay = s.playState;

      if (prev === 'editing' && s.playState === 'playing') {
        // Capture the pre-Play scene so Stop can fully reset it. Store updates are
        // immutable, so holding references is enough — they won't be mutated in place.
        playSnapshot = {
          entities: s.entities,
          scripts: s.scripts,
          design: s.design,
          gameCamera: s.gameCamera,
          gridVisible: s.gridVisible,
          past: s.past,
          future: s.future,
          selectedId: s.selectedId,
          activeScriptId: s.activeScriptId,
        };
        manager!.snapshotTransforms(s.entities);
        // Enable physics first (async — Havok is usually preloaded) so bodies
        // exist before scripts run; then start the runtime.
        void manager!
          .enablePhysics(s.entities)
          .catch((err) => gameConsole.error('runtime', `Physics error: ${(err as Error).message}`))
          .finally(() => {
            const errs = runtime!.start(s.entities, s.scripts, s.design.objectives);
            // Auto-play effects flagged to start on Play.
            for (const e of s.entities) {
              for (const fx of e.effects ?? []) {
                if (fx.enabled && fx.config.playback.mode === 'auto') manager!.playEffect(e.id, fx.config);
              }
            }
            gameConsole.info(
              'runtime',
              `▶ Play started — ${Object.keys(s.scripts).length} script(s)${errs ? `, ${errs} compile error(s)` : ''}.`,
            );
          });
      } else if (s.playState === 'paused') {
        // Freeze scripts AND physics so the scene truly stops and can be edited.
        runtime!.setPaused(true);
        manager!.setPhysicsPaused(true);
        gameConsole.info('runtime', '⏸ Paused — edit the scene, then resume or stop.');
      } else if (prev === 'paused' && s.playState === 'playing') {
        // Unfreeze; physics bodies snap to any meshes moved while paused.
        manager!.setPhysicsPaused(false);
        runtime!.setPaused(false);
        gameConsole.info('runtime', '▶ Resumed.');
      } else if (s.playState === 'editing') {
        runtime!.stop();
        manager!.disablePhysics();
        manager!.clearEffects();
        manager!.clearClips();
        manager!.exitPointerLock();
        // Stop always resets: restore the captured pre-Play state (discarding the
        // simulation and any edits made while paused), then rebuild the scene.
        if (playSnapshot) {
          store.setState(playSnapshot);
          playSnapshot = null;
        }
        const fresh = store.getState();
        manager!.sync(fresh.entities);
        manager!.applyGameCamera(fresh.gameCamera);
        manager!.setGridVisible(fresh.gridVisible);
        manager!.restoreTransforms();
        gameConsole.info('runtime', '⏹ Stopped — scene reset to pre-Play state.');
      }
    }),
  );

  return manager;
}

export function releaseEngine() {
  refCount--;
  if (refCount > 0 || !manager) return;
  unsubscribers.forEach((u) => u());
  unsubscribers = [];
  runtime?.stop();
  manager.dispose();
  manager = null;
  runtime = null;
  playSnapshot = null;
}
