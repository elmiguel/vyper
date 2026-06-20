import { useCallback, useEffect, useRef, useState } from 'react';
import { useReactFlow, type Node } from '@xyflow/react';

/**
 * Rubber-band (marquee) selection for the node canvas. React Flow's built-in box-select can only
 * add/replace and is keyed to Shift, so we roll our own to support all four gestures the editor
 * wants on a left-drag over empty canvas:
 *   - plain        → replace the selection with the boxed nodes
 *   - Shift        → add the boxed nodes to the selection
 *   - Ctrl / Cmd   → subtract the boxed nodes from the selection
 * (Cmd is accepted alongside Ctrl because macOS turns Ctrl+click into a right-click.)
 *
 * The geometry helpers are pure and exported for testing; the hook wires them to pointer events.
 */

export type MarqueeMode = 'replace' | 'add' | 'subtract';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Axis-aligned rect from two corner points, in any order. */
export function rectFromPoints(ax: number, ay: number, bx: number, by: number): Rect {
  return { x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(ax - bx), h: Math.abs(ay - by) };
}

/** Do two axis-aligned rects overlap at all? (Partial overlap counts as a hit.) */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** A node's bounding rect in flow coordinates (falls back to a default size before it's measured). */
export function nodeRect(n: Pick<Node, 'position' | 'measured' | 'width' | 'height'>): Rect {
  const w = n.measured?.width ?? n.width ?? 152;
  const h = n.measured?.height ?? n.height ?? 40;
  return { x: n.position.x, y: n.position.y, w, h };
}

/** Resolve the final selected-id set for a marquee gesture given what was boxed. */
export function resolveSelection(mode: MarqueeMode, snapshot: Set<string>, inRect: Set<string>): Set<string> {
  if (mode === 'replace') return new Set(inRect);
  if (mode === 'add') return new Set([...snapshot, ...inRect]);
  const out = new Set(snapshot); // subtract
  for (const id of inRect) out.delete(id);
  return out;
}

/** Which marquee mode the held modifier keys mean. */
export function modeFromEvent(e: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean }): MarqueeMode {
  if (e.metaKey || e.ctrlKey) return 'subtract';
  if (e.shiftKey) return 'add';
  return 'replace';
}

const THRESHOLD = 4; // px of movement before a press counts as a drag (vs a click)

interface DragState {
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  bounds: DOMRect;
  mode: MarqueeMode;
  moved: boolean;
  snapshot: Set<string>;
}

type SetNodes = (updater: (nodes: Node[]) => Node[]) => void;

export interface MarqueeBox extends Rect {
  mode: MarqueeMode;
}

/**
 * Returns an `onPointerDown` to attach to the canvas wrapper and the live overlay box (in
 * container-relative pixels) to render while dragging. The gesture only starts on a left press over
 * empty canvas (the React Flow pane), so node drags, handles and panning are untouched. Holding
 * Space lets React Flow pan instead (we bail so its panActivationKeyCode takes over).
 */
export function useMarqueeSelection(setNodes: SetNodes) {
  const { screenToFlowPosition, getNodes } = useReactFlow();
  const [box, setBox] = useState<MarqueeBox | null>(null);
  const drag = useRef<DragState | null>(null);
  const spaceHeld = useRef(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceHeld.current = e.type === 'keydown';
    };
    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      if (Math.abs(e.clientX - d.startX) > THRESHOLD || Math.abs(e.clientY - d.startY) > THRESHOLD) d.moved = true;
      d.lastX = e.clientX;
      d.lastY = e.clientY;
      const r = rectFromPoints(d.startX - d.bounds.left, d.startY - d.bounds.top, e.clientX - d.bounds.left, e.clientY - d.bounds.top);
      setBox({ ...r, mode: d.mode });
    };
    const onUp = () => {
      const d = drag.current;
      drag.current = null;
      setBox(null);
      if (!d || !d.moved) return; // a click, not a drag — let React Flow's pane click handle it
      const a = screenToFlowPosition({ x: d.startX, y: d.startY });
      const b = screenToFlowPosition({ x: d.lastX, y: d.lastY });
      const marquee = rectFromPoints(a.x, a.y, b.x, b.y);
      const inRect = new Set(getNodes().filter((n) => rectsOverlap(marquee, nodeRect(n))).map((n) => n.id));
      const next = resolveSelection(d.mode, d.snapshot, inRect);
      setNodes((nds) => nds.map((n) => (n.selected === next.has(n.id) ? n : { ...n, selected: next.has(n.id) })));
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [screenToFlowPosition, getNodes, setNodes]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0 || spaceHeld.current) return; // left only; Space → let React Flow pan
      const target = e.target as HTMLElement;
      if (!target.classList?.contains('react-flow__pane')) return; // empty canvas only
      const bounds = (e.currentTarget as HTMLElement).getBoundingClientRect();
      drag.current = {
        startX: e.clientX,
        startY: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
        bounds,
        mode: modeFromEvent(e),
        moved: false,
        snapshot: new Set(getNodes().filter((n) => n.selected).map((n) => n.id)),
      };
    },
    [getNodes],
  );

  return { onPointerDown, box };
}
