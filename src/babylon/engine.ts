import { SceneManager } from './SceneManager';
import { ScriptRuntime } from '@/runtime/ScriptRuntime';
import { useEditorStore } from '@/store/editorStore';
import { gameConsole } from '@/store/consoleStore';

/**
 * Single shared Babylon engine for the whole editor. The editor viewport creates
 * it; the game-preview panel registers a second view onto the same scene. All
 * store → scene wiring lives here so it is set up exactly once.
 */

let manager: SceneManager | null = null;
let runtime: ScriptRuntime | null = null;
let unsubscribers: Array<() => void> = [];
let refCount = 0;

export function getManager() {
  return manager;
}
export function getRuntime() {
  return runtime;
}

export function acquireEngine(canvas: HTMLCanvasElement): SceneManager {
  refCount++;
  if (manager) return manager;

  manager = new SceneManager(canvas, useEditorStore.getState().mode);
  runtime = new ScriptRuntime(manager);
  const store = useEditorStore;

  // Warm up the Havok WASM in the background so the first Play doesn't stall.
  void manager.loadHavok().catch((err) => gameConsole.warn('runtime', `Physics failed to load: ${(err as Error).message}`));

  manager.setOnPick((id) => store.getState().select(id));
  manager.setOnTransform((id, patch) => {
    if (store.getState().playState === 'editing') store.getState().updateTransform(id, patch);
  });
  manager.setOnCameraTransform((patch) => store.getState().updateGameCamera(patch));

  // Initial scene build.
  manager.sync(store.getState().entities);
  manager.highlightSelection(store.getState().selectedId);
  manager.setGizmoMode(store.getState().gizmoMode);
  manager.applyGameCamera(store.getState().gameCamera);
  manager.setGridVisible(store.getState().gridVisible);

  // Rebuild scene when structure/materials change (skip transforms while playing
  // so the runtime keeps authority over object positions).
  let lastRev = store.getState().sceneRevision;
  unsubscribers.push(
    store.subscribe((s) => {
      if (s.sceneRevision !== lastRev) {
        lastRev = s.sceneRevision;
        manager!.sync(s.entities, { skipTransforms: s.playState !== 'editing' });
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
        runtime!.setPaused(true);
        gameConsole.info('runtime', '⏸ Paused.');
      } else if (prev === 'paused' && s.playState === 'playing') {
        runtime!.setPaused(false);
        gameConsole.info('runtime', '▶ Resumed.');
      } else if (s.playState === 'editing') {
        runtime!.stop();
        manager!.disablePhysics();
        manager!.clearEffects();
        manager!.exitPointerLock();
        // Rebuild anything scripts destroyed/hid at runtime, then restore transforms.
        manager!.sync(s.entities);
        manager!.restoreTransforms();
        gameConsole.info('runtime', '⏹ Stopped — scene restored.');
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
}
