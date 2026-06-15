import { useSyncExternalStore } from 'react';
import { flowTracker } from '@/runtime/flowTracker';

/**
 * Subscribe a component to the live execution tracker. Returns nothing — read
 * `flowTracker.stateOf(id)` / `.isErrorTarget(id)` after calling. Re-renders only
 * when the tracker reports a real flow transition (see FlowTracker.startLoop).
 */
export function useFlowTick() {
  useSyncExternalStore(flowTracker.subscribe, flowTracker.getVersion, flowTracker.getVersion);
}
