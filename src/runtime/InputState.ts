import type { SceneManager } from '@/babylon/SceneManager';

/**
 * Canonical key name. The spacebar's `KeyboardEvent.key` is a literal " ", but
 * the node editor's key field stores it as "space" (see KeyCaptureField), so we
 * normalize both the stored keys and lookups to "space". Without this,
 * `input.key('space')` never matched the held " " and Space input silently
 * failed. Everything else is just lowercased.
 */
const normalizeKey = (k: string) => (k === ' ' ? 'space' : k.toLowerCase());

/** Live input state shared by all running scripts. */
export class InputState {
  private down = new Set<string>();
  /** Mouse movement since the last frame (cleared each frame). Use for look controls. */
  mouse = { dx: 0, dy: 0 };
  private attach: () => void;
  private detach: () => void;

  constructor(private sceneManager: SceneManager) {
    const onDown = (e: KeyboardEvent) => this.down.add(normalizeKey(e.key));
    const onUp = (e: KeyboardEvent) => this.down.delete(normalizeKey(e.key));
    // Accumulate raw mouse motion; only meaningful while the pointer is locked.
    const onMove = (e: MouseEvent) => {
      this.mouse.dx += e.movementX || 0;
      this.mouse.dy += e.movementY || 0;
    };
    this.attach = () => {
      window.addEventListener('keydown', onDown);
      window.addEventListener('keyup', onUp);
      window.addEventListener('mousemove', onMove);
    };
    this.detach = () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('mousemove', onMove);
      this.down.clear();
      this.mouse.dx = 0;
      this.mouse.dy = 0;
    };
  }

  key(name: string) {
    const combo = String(name).toLowerCase();
    // A "+"-joined combo (e.g. "shift+arrowup") is down only when every key is held.
    if (combo.length > 1 && combo.includes('+')) {
      return combo.split('+').every((k) => k.trim() !== '' && this.down.has(normalizeKey(k.trim())));
    }
    return this.down.has(normalizeKey(combo));
  }
  get axisX() {
    return (this.key('d') || this.key('arrowright') ? 1 : 0) - (this.key('a') || this.key('arrowleft') ? 1 : 0);
  }
  get axisY() {
    return (this.key('w') || this.key('arrowup') ? 1 : 0) - (this.key('s') || this.key('arrowdown') ? 1 : 0);
  }
  /** Capture the mouse to the game canvas for FPS-style look (clicks to lock). */
  lockPointer() {
    this.sceneManager.requestPointerLock();
  }
  /** Called by the runtime after each frame so deltas don't accumulate. */
  endFrame() {
    this.mouse.dx = 0;
    this.mouse.dy = 0;
  }
  start() {
    this.attach();
  }
  stop() {
    this.detach();
  }
}
