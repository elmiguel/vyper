import { memo } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';
import { flowTracker } from '@/runtime/flowTracker';
import { useFlowTick } from './useNodeFlow';

/**
 * Neon edge that reacts to live execution:
 *  - exec edge whose source just fired → energy "flows" toward the target
 *  - edge feeding the node that threw → severed red line + ✕ break marker
 *  - data edge feeding an active node → soft pulse
 *  - otherwise → dim idle wire
 */
function FlowEdgeImpl({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  source,
  target,
  sourceHandleId,
  markerEnd,
}: EdgeProps) {
  useFlowTick();
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const isExec = (sourceHandleId ?? '').startsWith('exec-');
  const broken = flowTracker.running && flowTracker.isErrorTarget(target);
  const srcActive = flowTracker.stateOf(source) === 'active';
  const tgtActive = flowTracker.stateOf(target) === 'active';
  // Exec wires light up the instant their source fires; data wires light up
  // while the node consuming them is live.
  const flowing = flowTracker.running && !broken && (isExec ? srcActive : tgtActive);

  let cls = isExec ? 'exec' : 'data';
  if (broken) cls = 'broken';
  else if (flowing) cls = isExec ? 'flowing' : 'flowing-data';

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} className={`flow-edge ${cls}`} />
      {broken && (
        <EdgeLabelRenderer>
          <div
            className="edge-break"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            ✕
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const FlowEdge = memo(FlowEdgeImpl);
