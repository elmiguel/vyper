/**
 * Engine hardware-scaling level for a device pixel ratio. Babylon renders at
 * `canvasClientSize / hardwareScalingLevel`, so `1 / dpr` yields native-resolution
 * (crisp) output. The ratio is clamped to [1, cap] so a 3×+ panel doesn't render
 * needlessly large. Using this — rather than resizing the canvas backing store
 * directly — keeps picking correct, since the picking ray also divides pointer
 * coordinates by hardwareScalingLevel.
 */
export function hardwareScalingLevelFor(devicePixelRatio: number, cap = 2): number {
  const dpr = Math.min(Math.max(devicePixelRatio || 1, 1), cap);
  return 1 / dpr;
}
