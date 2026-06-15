import { X, Keyboard } from 'lucide-react';
import { useEditorStore } from '@/store/editorStore';
import { KEYMAPS, bindingChips, type EditorAction, type KeymapId } from './keymaps';

interface Row {
  action: EditorAction;
  label: string;
}
interface Group {
  title: string;
  rows: Row[];
}

const GROUPS: Group[] = [
  {
    title: 'Transform Tools',
    rows: [
      { action: 'tool.select', label: 'Select tool' },
      { action: 'tool.move', label: 'Move tool' },
      { action: 'tool.rotate', label: 'Rotate tool' },
      { action: 'tool.scale', label: 'Scale tool' },
    ],
  },
  {
    title: 'Edit',
    rows: [
      { action: 'undo', label: 'Undo' },
      { action: 'redo', label: 'Redo' },
      { action: 'copy', label: 'Copy' },
      { action: 'paste', label: 'Paste' },
      { action: 'duplicate', label: 'Duplicate' },
      { action: 'delete', label: 'Delete' },
    ],
  },
  {
    title: 'Playback',
    rows: [
      { action: 'playToggle', label: 'Play / Pause' },
      { action: 'stop', label: 'Stop' },
    ],
  },
  {
    title: 'View',
    rows: [{ action: 'focus', label: 'Frame selected' }],
  },
];

function Chips({ combos }: { combos: string[][] }) {
  return (
    <span className="sc-chips">
      {combos.map((tokens, i) => (
        <span key={i} className="sc-combo">
          {i > 0 && <span className="sc-or">or</span>}
          {tokens.map((t, j) => (
            <kbd key={j} className="sc-kbd">
              {t}
            </kbd>
          ))}
        </span>
      ))}
    </span>
  );
}

export function ShortcutsOverlay() {
  const show = useEditorStore((s) => s.showShortcuts);
  const close = () => useEditorStore.getState().setShowShortcuts(false);
  const keymap = useEditorStore((s) => s.keymap);
  const setKeymap = useEditorStore((s) => s.setKeymap);
  const km = KEYMAPS[keymap];

  if (!show) return null;

  return (
    <div className="sc-backdrop" onClick={close}>
      <div className="sc-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Keyboard shortcuts">
        <header className="sc-head">
          <div className="sc-title">
            <Keyboard size={17} />
            <span>Keyboard Shortcuts</span>
          </div>
          <div className="sc-layouts">
            {(Object.keys(KEYMAPS) as KeymapId[]).map((id) => (
              <button key={id} className={`sc-layout ${keymap === id ? 'on' : ''}`} onClick={() => setKeymap(id)}>
                {KEYMAPS[id].label}
              </button>
            ))}
          </div>
          <button className="sc-close" onClick={close} aria-label="Close">
            <X size={16} />
          </button>
        </header>

        <div className="sc-grid">
          {GROUPS.map((g) => (
            <section className="sc-group" key={g.title}>
              <h4>{g.title}</h4>
              {g.rows.map((r) => (
                <div className="sc-row" key={r.action}>
                  <span className="sc-label">{r.label}</span>
                  <Chips combos={bindingChips(km, r.action)} />
                </div>
              ))}
            </section>
          ))}
        </div>

        <footer className="sc-foot">
          Active layout: <strong>{km.label}</strong> · Press <kbd className="sc-kbd">?</kbd> to toggle this panel, <kbd className="sc-kbd">Esc</kbd> to close
        </footer>
      </div>
    </div>
  );
}
