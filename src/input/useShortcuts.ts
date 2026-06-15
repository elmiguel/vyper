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
      if (!action) return;
      e.preventDefault();
      dispatch(action);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
