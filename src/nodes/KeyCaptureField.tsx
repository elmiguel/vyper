import { useEffect, useRef, useState } from 'react';
import { Keyboard } from 'lucide-react';

/**
 * Inline editor for the "Key Down" node's key field. You can type a key name
 * directly, or click Capture and physically press the key — or a combination of
 * keys held at once (e.g. Shift + ↑). Stored as a lowercase combo string like
 * `"arrowup"` or `"shift+arrowup"`, which the runtime's `input.key()` understands.
 */

const MODS = ['control', 'shift', 'alt', 'meta'];
const SYM: Record<string, string> = {
  arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→',
  ' ': 'Space', space: 'Space', escape: 'Esc', enter: '⏎', backspace: '⌫', tab: '⇥',
  shift: '⇧', control: 'Ctrl', alt: '⌥', meta: '⌘',
};

/** Pretty, human label for a stored combo string. */
function pretty(combo: string): string {
  if (!combo) return '—';
  return combo
    .split('+')
    .map((k) => SYM[k] ?? (k.length === 1 ? k.toUpperCase() : k))
    .join(' + ');
}

const normalize = (k: string) => (k === ' ' ? 'space' : k.toLowerCase());

/** Order a held set as modifiers-first, then alphabetical, joined by '+'. */
function orderCombo(keys: Set<string>): string {
  return [...keys]
    .sort((a, b) => {
      const ia = MODS.indexOf(a);
      const ib = MODS.indexOf(b);
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      return a.localeCompare(b);
    })
    .join('+');
}

export function KeyCaptureField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [capturing, setCapturing] = useState(false);
  const held = useRef<Set<string>>(new Set());
  const best = useRef('');

  useEffect(() => {
    if (!capturing) return;
    held.current = new Set();
    best.current = '';

    const down = (e: KeyboardEvent) => {
      // Swallow the event so it can't trigger editor shortcuts or scroll the page.
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.key === 'Escape') {
        setCapturing(false);
        return;
      }
      held.current.add(normalize(e.key));
      best.current = orderCombo(held.current); // remember the peak combo held
    };
    const up = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      held.current.delete(normalize(e.key));
      // Commit once everything is released, using the largest combo seen.
      if (held.current.size === 0 && best.current) {
        onChange(best.current);
        setCapturing(false);
      }
    };

    // Capture phase so we run before the app's global shortcut handlers.
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    return () => {
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
    };
  }, [capturing, onChange]);

  if (capturing) {
    return (
      <button
        className="kc-capture listening"
        title="Press a key or hold a combination… (Esc to cancel)"
        onClick={() => setCapturing(false)}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <span className="kc-dot" /> Press keys…
      </button>
    );
  }

  return (
    <div className="key-capture">
      <input
        className="nf-text kc-input"
        type="text"
        value={value ?? ''}
        spellCheck={false}
        placeholder="key"
        title={`Captured: ${pretty(value)}`}
        onChange={(e) => onChange(e.target.value)}
        onPointerDown={(e) => e.stopPropagation()}
      />
      <span className="kc-pretty" aria-hidden>{pretty(value)}</span>
      <button
        className="kc-capture"
        title="Capture a key or key combination"
        onClick={() => setCapturing(true)}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <Keyboard size={12} />
      </button>
    </div>
  );
}
