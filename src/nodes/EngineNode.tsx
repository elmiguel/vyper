import { memo } from 'react';
import { Handle, Position, useReactFlow, useStore, type NodeProps } from '@xyflow/react';
import { AlertTriangle } from 'lucide-react';
import { NODE_SPECS, type EngineNodeData, type PortSpec } from './nodeTypes';
import { flowTracker } from '@/runtime/flowTracker';
import { useFlowTick } from './useNodeFlow';
import { KeyCaptureField } from './KeyCaptureField';
import { BranchControls } from './BranchControls';
import { NumberInput } from '@/ui/NumberInput';
import { useEditorStore } from '@/store/editorStore';

type Vec = { x: number; y: number; z: number };

/** Dropdown that picks one of the game's defined objectives (by id). */
function ObjectiveField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const objectives = useEditorStore((s) => s.design.objectives);
  const setShowDesign = useEditorStore((s) => s.setShowDesign);
  if (objectives.length === 0) {
    return (
      <button className="nf-objective-empty" onPointerDown={(e) => e.stopPropagation()} onClick={() => setShowDesign(true)}>
        + Define a goal
      </button>
    );
  }
  return (
    <select
      className="nf-objective"
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <option value="">— pick goal —</option>
      {objectives.map((o) => (
        <option key={o.id} value={o.id}>
          {o.title || '(untitled)'}
        </option>
      ))}
    </select>
  );
}

function NumField({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return <NumberInput className="nf-num" value={value} onChange={onChange} />;
}

function VecField({ value, onChange }: { value: Vec; onChange: (v: Vec) => void }) {
  const v = value ?? { x: 0, y: 0, z: 0 };
  return (
    <div className="nf-vec">
      {(['x', 'y', 'z'] as const).map((axis) => (
        <NumberInput key={axis} value={v[axis]} onChange={(n) => onChange({ ...v, [axis]: n })} />
      ))}
    </div>
  );
}

function FieldEditor({
  port,
  value,
  onChange,
}: {
  port: PortSpec;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  // Specialised editors take precedence over the default per-kind ones.
  if (port.editor === 'keycapture') {
    return <KeyCaptureField value={String(value ?? '')} onChange={onChange} />;
  }
  if (port.editor === 'objective') {
    return <ObjectiveField value={String(value ?? '')} onChange={onChange} />;
  }
  switch (port.kind) {
    case 'number':
      return <NumField value={value as number} onChange={onChange} />;
    case 'vec3':
      return <VecField value={value as Vec} onChange={onChange} />;
    case 'bool':
      return (
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          onPointerDown={(e) => e.stopPropagation()}
        />
      );
    default:
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
}

function EngineNodeImpl({ id, data, selected }: NodeProps) {
  const d = data as EngineNodeData;
  const spec = NODE_SPECS[d.kind];
  const { updateNodeData } = useReactFlow();
  // Live execution paint (active pulse / error break) — independent of saved graph.
  useFlowTick();
  const flow = flowTracker.stateOf(id);
  // Which target handles are connected → hide their inline editors.
  const connectedTargets = useStore((s) => {
    const set = new Set<string>();
    s.edges.forEach((e) => {
      if (e.target === id && e.targetHandle) set.add(e.targetHandle);
    });
    return set;
  });

  if (!spec) return <div className="engine-node">Unknown: {d.kind}</div>;

  const setField = (key: string, value: unknown) =>
    updateNodeData(id, { fields: { ...d.fields, [key]: value } });

  return (
    <div className={`engine-node cat-${spec.category} flow-${flow} ${selected ? 'selected' : ''}`}>
      <div className="en-title" style={{ background: spec.color }}>
        {spec.execIn && <Handle type="target" position={Position.Left} id="exec-in" className="h-exec" />}
        <span>{spec.label}</span>
        {flow === 'error' && <AlertTriangle className="en-err-icon" size={13} />}
      </div>

      <div className="en-body">
        {/* Execution outputs */}
        {spec.execOuts.map((name) => (
          <div className="port-row exec-out" key={`exec-${name}`}>
            <span className="port-label">{name === 'out' ? '▸' : name}</span>
            <Handle type="source" position={Position.Right} id={`exec-${name}`} className="h-exec" />
          </div>
        ))}

        {/* Data outputs */}
        {spec.outputs.map((o) => (
          <div className="port-row data-out" key={`out-${o.id}`}>
            <span className="port-label">{o.label}</span>
            <Handle type="source" position={Position.Right} id={`out-${o.id}`} className={`h-data k-${o.kind}`} />
          </div>
        ))}

        {/* Branch (if) renders its own type-aware controls (value/compare handles + check/op/rhs);
            every other node uses the generic input + field rendering below. */}
        {d.kind === 'action/branch' ? (
          <BranchControls id={id} fields={d.fields} setField={setField} />
        ) : (
          <>
            {/* Data inputs (with inline editors when unconnected) */}
            {spec.inputs.map((i) => {
              const connected = connectedTargets.has(`in-${i.id}`);
              return (
                <div className="port-row data-in" key={`in-${i.id}`}>
                  <Handle type="target" position={Position.Left} id={`in-${i.id}`} className={`h-data k-${i.kind}`} />
                  <span className="port-label">{i.label}</span>
                  {!connected && i.default !== undefined && (
                    <FieldEditor port={i} value={d.fields[i.id]} onChange={(v) => setField(i.id, v)} />
                  )}
                </div>
              );
            })}

            {/* Inline-only fields (math op, prop key, etc.) */}
            {(spec.fields ?? []).map((field) => (
              <div className="port-row field-row" key={`f-${field.id}`}>
                {field.label && <span className="port-label">{field.label}</span>}
                <FieldEditor port={field} value={d.fields[field.id]} onChange={(v) => setField(field.id, v)} />
              </div>
            ))}
          </>
        )}
      </div>

      {flow === 'error' && flowTracker.errorMessage && (
        <div className="en-error" title={flowTracker.errorMessage}>
          <AlertTriangle size={11} />
          <span>{flowTracker.errorMessage}</span>
        </div>
      )}
    </div>
  );
}

export const EngineNode = memo(EngineNodeImpl);
