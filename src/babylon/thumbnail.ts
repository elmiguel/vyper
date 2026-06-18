/**
 * Downscale a (WebGL) canvas to a JPEG data-URL thumbnail, preserving aspect ratio. Shared by
 * the game {@link SceneManager} and the Modeling Studio's {@link ModelerScene} so both capture
 * project covers the same way. Returns null when the canvas is empty or its context is
 * tainted/lost (so a failed grab just skips the auto-cover rather than throwing). The source
 * engine must use `preserveDrawingBuffer: true` for the pixels to be readable here.
 */
export function canvasThumbnail(src: HTMLCanvasElement | null | undefined, width = 480): string | null {
  if (!src || !src.width || !src.height) return null;
  const height = Math.max(1, Math.round((width * src.height) / src.width));
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const ctx = out.getContext('2d');
  if (!ctx) return null;
  try {
    ctx.drawImage(src, 0, 0, width, height);
    return out.toDataURL('image/jpeg', 0.8);
  } catch {
    return null;
  }
}
