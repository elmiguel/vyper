import { useEffect } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { nodeEditorBridge } from '@/nodes/nodeActions';
import { KEYMAPS, buildLookup, comboFromEvent, type EditorAction } from './keymaps';

/** True when the user is typing in a field and shortcuts should be ignored. */
function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.closest) return false;
  return !!el.closest('input, textarea, select, [contenteditable="true"], .monaco-editor');
}

/** Installs global editor keyboard shortcuts driven by the active keymap layout. */
export function useShortcuts() {
  useEffect(() => {
    // Cache the combo→action lookup per layout id.
    const lookups = new Map(Object.values(KEYMAPS).map((m) => [m.id, buildLookup(m)] as const));

    const dispatch = (action: EditorAction) => {
      const s = useEditorStore.getState();
      const selected = s.selectedId;
      // When the pointer is over the node canvas, route the clipboard/edit
      // actions to the focused graph instead of the scene entities.
      if (nodeEditorBridge.engaged) {
        const ops = nodeEditorBridge.ops!;
        switch (action) {
          case 'copy':
            ops.copy();
            return;
          case 'paste':
            ops.paste();
            return;
          case 'duplicate':
            ops.duplicate();
            return;
          case 'delete':
            ops.remove();
            return;
        }
      }
      switch (action) {
        case 'undo':
          s.undo();
          break;
        case 'redo':
          s.redo();
          break;
        case 'copy':
          s.copySelected();
          break;
        case 'paste':
          s.paste();
          break;
        case 'duplicate':
          if (selected) s.duplicateEntity(selected);
          break;
        case 'delete':
          if (selected) s.removeEntity(selected);
          break;
        case 'tool.select':
          s.setGizmoMode('select');
          break;
        case 'tool.move':
          s.setGizmoMode('move');
          break;
        case 'tool.rotate':
          s.setGizmoMode('rotate');
          break;
        case 'tool.scale':
          s.setGizmoMode('scale');
          break;
        case 'focus':
          s.focusSelected();
          break;
        case 'playToggle':
          if (s.playState === 'editing') s.play();
          else s.pause();
          break;
        case 'stop':
          if (s.playState !== 'editing') s.stop();
          break;
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) {
        // Allow undo/redo to repeat; block tool toggles from spamming.
      }
      const store = useEditorStore.getState();
      // Global help overlay toggle — works regardless of layout / focus.
      if (e.key === '?') {
        e.preventDefault();
        store.setShowShortcuts(!store.showShortcuts);
        return;
      }
      // Esc closes the overlay before doing anything else.
      if (e.key === 'Escape' && store.showShortcuts) {
        e.preventDefault();
        store.setShowShortcuts(false);
        return;
      }
      if (isTypingTarget(e.target)) return;
      const lookup = lookups.get(store.keymap)!;
      const action = lookup.get(comboFromEvent(e));
      // While the game is actively playing it owns the keyboard: gameplay keys
      // (space = jump, WASD = move, …) must reach the running scripts, so editor
      // shortcuts are suspended except `stop` (exit play). Without this, layouts
      // that bind a gameplay key — e.g. Blender's playToggle on Space — would
      // hijack it and pause the game instead of letting the player jump.
      // `paused`/`editing` fall through so playToggle can resume from a pause.
      if (store.playState === 'playing') {
        if (action === 'stop') {
          e.preventDefault();
          dispatch('stop');
        }
        return;
      }
      // Mesh component-mode keys (Maya-style 1/2/3/4): 1 = object, 2/3/4 = vertex/edge/face.
      // In Edit Mode they switch the component (1 leaves Edit Mode, back to object selection);
      // out of Edit Mode, 2/3/4 enter it on the selected mesh — the select-object-then-edit
      // workflow. Handled before generic actions so they win over any layout digit binding.
      if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key === '1' || e.key === '2' || e.key === '3' || e.key === '4')) {
        const comp = e.key === '2' ? 'vertex' : e.key === '3' ? 'edge' : e.key === '4' ? 'face' : null;
        if (store.meshEdit.active) {
          e.preventDefault();
          if (comp) store.setMeshComponent(comp);
          else store.endMeshEdit();
          return;
        }
        if (comp && store.mode === '3d') {
          const ent = store.entities.find((en) => en.id === store.selectedId && en.mesh);
          if (ent) {
            e.preventDefault();
            store.beginMeshEdit(ent.id);
            store.setMeshComponent(comp);
            return;
          }
        }
      }
      if (!action) return;
      e.preventDefault();
      dispatch(action);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
