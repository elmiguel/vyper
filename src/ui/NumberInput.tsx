import { useState } from 'react';
import { useDragScrub } from './useDragScrub';

/**
 * Numeric text input that lets you type freely. It keeps a local text `draft`
 * while the field is focused, so intermediate strings like "", "-", "1." or a
 * leading "0" aren't coerced back to a number on every keystroke. (The naive
 * `value={number}` + `parseFloat(v) || 0` pattern snapped "-" and "" to 0,
 * making negatives and decimals impossible to type and the caret jump around.)
 *
 * The parsed value is committed whenever the text parses to a finite number; on
 * blur the draft is dropped so the box re-syncs to the canonical value.
 *
 * The field also supports drag-to-scrub (see {@link useDragScrub}): press and
 * drag right/up to increase or left/down to decrease. A plain click still
 * focuses the field for typing.
 */
export function NumberInput({
  value,
  onChange,
  className,
  disabled,
  step,
  min,
  max,
  display = (v) => String(v),
}: {
  value: number;
  onChange: (v: number) => void;
  className?: string;
  disabled?: boolean;
  step?: number;
  min?: number;
  max?: number;
  /** How to render the committed value when not actively editing. */
  display?: (v: number) => string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const { scrubbing, scrubHandlers } = useDragScrub({ value, onChange, step, min, max, disabled });
  const text = draft ?? (Number.isFinite(value) ? display(value) : '0');
  return (
    <input
      className={['num-scrub', scrubbing ? 'scrubbing' : '', className].filter(Boolean).join(' ')}
      type="text"
      inputMode="decimal"
      step={step}
      disabled={disabled}
      value={text}
      title="Drag to change · Shift = ×10 · Alt = fine"
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        const n = parseFloat(raw);
        if (Number.isFinite(n) && raw.trim() !== '') onChange(n);
      }}
      onBlur={() => setDraft(null)}
      onPointerDown={(e) => {
        e.stopPropagation();
        scrubHandlers.onPointerDown(e);
      }}
      onPointerMove={scrubHandlers.onPointerMove}
      onPointerUp={scrubHandlers.onPointerUp}
      onPointerCancel={scrubHandlers.onPointerCancel}
      // Prevent trackpad/mouse-wheel scroll from spinning the value while focused.
      onWheel={(e) => e.currentTarget.blur()}
    />
  );
}
