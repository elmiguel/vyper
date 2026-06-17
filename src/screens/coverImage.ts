import type { GameSummary } from '@/data';
import { kindOf } from './projectFilters';

/** Largest dimension (px) a stored cover is downscaled to before persisting. Keeps
 *  the base64 blob in `settings` small enough to ship inline with the game list. */
const MAX_DIM = 720;

/** Stable non-negative hash of a string — picks a deterministic gradient per project. */
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** On-theme gradient pairs, tinted by project kind. */
function palette(g: GameSummary): [string, string][] {
  const { isModel, mode } = kindOf(g);
  if (isModel) return [['#b14aed', '#ff2e97'], ['#7a2fd0', '#b14aed']];
  if (mode === '2d') return [['#1f8f6e', '#22d3ee'], ['#3affc0', '#1b8f8f']];
  return [['#3a2f9e', '#22d3ee'], ['#5b2fd0', '#2a8fd8']];
}

/** A generated, sleek neon background used when a project has no uploaded cover. */
export function defaultCover(g: GameSummary): string {
  const pal = palette(g);
  const [a, b] = pal[hash(g.id) % pal.length];
  const angle = 120 + (hash(g.id) % 5) * 15;
  return `radial-gradient(circle at 82% 12%, rgba(255,255,255,0.18), transparent 45%), linear-gradient(${angle}deg, ${a}, ${b})`;
}

/** True when the project has a custom uploaded cover image. */
export function hasCustomCover(g: GameSummary): boolean {
  const c = g.settings?.coverImage;
  return typeof c === 'string' && c.length > 0;
}

/** The CSS `background` for a project card: the uploaded image when present,
 *  otherwise an on-theme generated gradient. */
export function coverBackground(g: GameSummary): string {
  const c = g.settings?.coverImage;
  if (typeof c === 'string' && c) return `url("${c.replace(/"/g, '%22')}") center / cover no-repeat`;
  return defaultCover(g);
}

/** Read an image file, downscale it to a bounded JPEG, and return a data URL
 *  suitable for storing in `settings.coverImage`. Falls back to the raw data URL
 *  if a 2D canvas isn't available. */
export async function fileToCoverDataUrl(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(new Error('Could not read the image file.'));
    fr.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error('Could not decode the image.'));
    im.src = dataUrl;
  });
  const scale = Math.min(1, MAX_DIM / Math.max(img.width || 1, img.height || 1));
  const w = Math.max(1, Math.round((img.width || 1) * scale));
  const h = Math.max(1, Math.round((img.height || 1) * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', 0.82);
}
