import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** A single context-menu entry. Either runs `onClick` or opens a `submenu`. */
export interface MenuItem {
  label: string;
  onClick?: () => void;
  /** Nested items, shown as a flyout to the right. */
  submenu?: MenuItem[];
  /** Renders a ✓ to the left (toggle state). */
  checked?: boolean;
  /** Red destructive styling (e.g. Delete). */
  danger?: boolean;
  /** Renders a thin divider above this item. */
  separator?: boolean;
  disabled?: boolean;
  /** Right-aligned keyboard-shortcut hint (e.g. "⌘D", "Del"). */
  shortcut?: string;
}

const MENU_W = 180; // keep in sync with .node-ctx-menu min-width for clamping

function MenuList({ items, onClose }: { items: MenuItem[]; onClose: () => void }) {
  const [openSub, setOpenSub] = useState<number | null>(null);
  return (
    <>
      {items.map((item, i) => {
        if (item.disabled) {
          return (
            <button key={i} className={`ctx-item disabled ${item.separator ? 'sep' : ''}`} disabled>
              {item.label}
            </button>
          );
        }
        const hasSub = !!item.submenu?.length;
        return (
          <div
            key={i}
            className="ctx-row"
            onMouseEnter={() => setOpenSub(hasSub ? i : null)}
          >
            <button
              className={`ctx-item ${item.danger ? 'danger' : ''} ${item.separator ? 'sep' : ''}`}
              onClick={() => {
                if (hasSub) return;
                item.onClick?.();
                onClose();
              }}
            >
              {item.checked != null && <span className="ctx-check">{item.checked ? '✓' : ''}</span>}
              <span className="ctx-label">{item.label}</span>
              {item.shortcut && <span className="ctx-shortcut">{item.shortcut}</span>}
              {hasSub && <span className="ctx-caret">▸</span>}
            </button>
            {hasSub && openSub === i && (
              <div className="node-ctx-menu ctx-sub">
                <MenuList items={item.submenu!} onClose={onClose} />
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

/** Floating right-click menu. Closes on outside-click, Escape, or scroll. */
export function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  // Clamp inside the viewport once we know the rendered size.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const maxX = window.innerWidth - r.width - 8;
    const maxY = window.innerHeight - r.height - 8;
    setPos({ x: Math.min(x, Math.max(8, maxX)), y: Math.min(y, Math.max(8, maxY)) });
  }, [x, y, items]);

  useEffect(() => {
    const close = () => onClose();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener('keydown', onKey);
    // Capture phase so a click anywhere (incl. the canvas) closes us first. Listen for
    // pointerdown too: Babylon viewports consume pointer events on their canvas and the
    // compatibility `mousedown` doesn't reliably reach window, but `pointerdown` always does.
    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [onClose]);

  // Portal to <body> so the fixed-position menu escapes any ancestor that
  // creates a containing block (backdrop-filter/transform) or clips it
  // (overflow: hidden) — e.g. the `.panel` the node/scene editors live in.
  return createPortal(
    <div
      ref={ref}
      className="node-ctx-menu"
      style={{ left: pos.x, top: pos.y, minWidth: MENU_W }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <MenuList items={items} onClose={onClose} />
    </div>,
    document.body,
  );
}
