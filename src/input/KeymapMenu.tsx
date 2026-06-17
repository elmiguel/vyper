import { useState } from 'react';
import { Keyboard, ChevronDown } from 'lucide-react';
import { KEYMAPS, describeBinding, type KeymapId } from './keymaps';

/**
 * Keyboard-layout selector: a button showing the active layout that opens a menu of all
 * layouts, each annotated with its move/rotate/scale keys (e.g. "W / E / R"). Shared by
 * the game editor toolbar and the Modeling Studio toolbar so both look and behave the
 * same; the owner supplies the value + change handler (its own store).
 */
export function KeymapMenu({ value, onChange }: { value: KeymapId; onChange: (id: KeymapId) => void }) {
  const [open, setOpen] = useState(false);
  const km = KEYMAPS[value];
  return (
    <div className="tb-menu-wrap" data-tour="keymap" onMouseLeave={() => setOpen(false)}>
      <button className="tb-btn" onClick={() => setOpen((o) => !o)} title="Keyboard layout">
        <Keyboard size={15} /> {km.label} <ChevronDown size={12} />
      </button>
      {open && (
        <div className="tb-menu km-menu">
          {(Object.keys(KEYMAPS) as KeymapId[]).map((id) => (
            <button key={id} className={value === id ? 'on' : ''} onClick={() => { onChange(id); setOpen(false); }}>
              {KEYMAPS[id].label}
              <span className="km-hint">
                {describeBinding(KEYMAPS[id], 'tool.move')} / {describeBinding(KEYMAPS[id], 'tool.rotate')} / {describeBinding(KEYMAPS[id], 'tool.scale')}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
