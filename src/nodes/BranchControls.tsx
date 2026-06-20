import { useEffect } from 'react';
import { Handle, Position, useStore, type Node } from '@xyflow/react';
import { NumberInput } from '@/ui/NumberInput';
import { portKind } from './connectionRules';
import { checksFor, operatorsFor, opNeedsRhs, coerceOp, effectiveKind, type BranchPath } from './branchLogic';
import type { DataKind } from './nodeSpec.types';

type Fields = Record<string, number | string | boolean | { x: number; y: number; z: number }>;

/** The compare-value literal editor, typed to whatever the Branch is checking. */
function RhsEditor({ kind, value, onChange }: { kind: DataKind; value: unknown; onChange: (v: unknown) => void }) {
  if (kind === 'number') return <NumberInput className="nf-num" value={Number(value) || 0} onChange={onChange} />;
  if (kind === 'entity') return <span className="nf-hint">connect an object →</span>;
  return (
    <input
      className="nf-text"
      type="text"
      value={String(value ?? '')}
      onChange={(e) => onChange(e.target.value)}
      onPointerDown={(e) => e.stopPropagation()}
    />
  );
}

/**
 * Inline controls for the Branch (if) node. Reads the kind of whatever is wired into `value`, then
 * offers: what to check (vec3 → x/y/z/length), an operator valid for that kind, and a compare value
 * — a literal, or the `compare` port for comparing against another node/object. Renders its own data
 * handles (in-cond / in-compare) so EngineNode skips the generic input rendering for this node.
 */
export function BranchControls({
  id,
  fields,
  setField,
}: {
  id: string;
  fields: Fields;
  setField: (key: string, value: unknown) => void;
}) {
  // Kind feeding `value` (from the connected source's output port), reactive to (dis)connection.
  const incomingKind = useStore((s): DataKind => {
    const edge = s.edges.find((e) => e.target === id && e.targetHandle === 'in-cond');
    if (!edge?.sourceHandle) return 'any';
    const src = s.nodeLookup.get(edge.source) as unknown as Node | undefined;
    return (portKind(src, edge.sourceHandle, 'out') as DataKind | null) ?? 'any';
  });
  const compareConnected = useStore((s) => s.edges.some((e) => e.target === id && e.targetHandle === 'in-compare'));

  const path = String(fields.path ?? 'value') as BranchPath;
  const op = String(fields.op ?? 'is true');
  const checks = checksFor(incomingKind);
  const ops = operatorsFor(incomingKind, path);

  // When the incoming kind changes, snap any now-invalid check/operator back to a valid one so the
  // compiled condition stays meaningful. Guarded so it settles (no update loop).
  useEffect(() => {
    if (!checks.includes(path)) setField('path', 'value');
    if (!ops.includes(op)) setField('op', ops[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingKind, path, op]);

  const stop = (e: React.PointerEvent) => e.stopPropagation();

  return (
    <>
      <div className="port-row data-in">
        <Handle type="target" position={Position.Left} id="in-cond" className="h-data k-any" />
        <span className="port-label">value</span>
      </div>

      {checks.length > 1 && (
        <div className="port-row field-row">
          <span className="port-label">check</span>
          <select className="nf-text" value={path} onChange={(e) => setField('path', e.target.value)} onPointerDown={stop}>
            {checks.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      )}

      <div className="port-row field-row">
        <span className="port-label">op</span>
        <select className="nf-text" value={coerceOp(op, incomingKind, path)} onChange={(e) => setField('op', e.target.value)} onPointerDown={stop}>
          {ops.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      </div>

      {opNeedsRhs(op) && (
        <div className="port-row data-in">
          <Handle type="target" position={Position.Left} id="in-compare" className="h-data k-any" />
          <span className="port-label">compare</span>
          {!compareConnected && (
            <RhsEditor kind={effectiveKind(incomingKind, path)} value={fields.rhs} onChange={(v) => setField('rhs', v)} />
          )}
        </div>
      )}
    </>
  );
}
