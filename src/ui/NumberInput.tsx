import { useState } from 'react';

/**
 * Numeric text input that lets you type freely. It keeps a local text `draft`
 * while the field is focused, so intermediate strings like "", "-", "1." or a
 * leading "0" aren't coerced back to a number on every keystroke. (The naive
 * `value={number}` + `parseFloat(v) || 0` pattern snapped "-" and "" to 0,
 * making negatives and decimals impossible to type and the caret jump around.)
 *
 * The parsed value is committed whenever the text parses to a finite number; on
 * blur the draft is dropped so the box re-syncs to the canonical value.
 */
export function NumberInput({
  value,
  onChange,
  className,
  disabled,
  step,
  display = (v) => String(v),
}: {
  value: number;
  onChange: (v: number) => void;
  className?: string;
  disabled?: boolean;
  step?: number;
  /** How to render the committed value when not actively editing. */
  display?: (v: number) => string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? (Number.isFinite(value) ? display(value) : '0');
  return (
    <input
      className={className}
      type="text"
      inputMode="decimal"
      step={step}
      disabled={disabled}
      value={text}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        const n = parseFloat(raw);
        if (Number.isFinite(n) && raw.trim() !== '') onChange(n);
      }}
      onBlur={() => setDraft(null)}
      onPointerDown={(e) => e.stopPropagation()}
      // Prevent trackpad/mouse-wheel scroll from spinning the value while focused.
      onWheel={(e) => e.currentTarget.blur()}
    />
  );
}
