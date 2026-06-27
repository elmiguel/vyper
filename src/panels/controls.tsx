/** Shared labelled form controls for the render/look panels, matching the
 *  Inspector's `.field` styling. Extracted so RenderSettings (Inspector section)
 *  and the Game Style panel's RenderControls reuse one implementation. */

/** A labelled checkbox row. */
export function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="field check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

/** A labelled range slider with a numeric read-out. Shows more decimals for tiny steps. */
export function Slider({
  label, value, min, max, step, onChange,
}: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
      <span className="field-val">{value.toFixed(step < 0.01 ? 4 : step < 1 ? 2 : 0)}</span>
    </div>
  );
}

/** A labelled color picker with a hex read-out. */
export function Color({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
      <span className="field-val">{value}</span>
    </div>
  );
}
