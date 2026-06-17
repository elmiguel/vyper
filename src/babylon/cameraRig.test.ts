import { afterEach, describe, expect, it } from 'vitest';
import { setupEditorPanControls } from './cameraRig';

const MIDDLE = 1;
const LEFT = 0;

// Each test installs window listeners; collect teardowns and run them after.
const teardowns: Array<() => void> = [];
function install(
  canvas: HTMLCanvasElement,
  camera: { _panningMouseButton: number },
  isPlaying?: () => boolean,
) {
  const teardown = setupEditorPanControls(canvas, camera, isPlaying);
  teardowns.push(teardown);
  return teardown;
}
afterEach(() => {
  while (teardowns.length) teardowns.pop()!();
  document.body.innerHTML = '';
});

function makeCanvas() {
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  return canvas;
}
const spaceDown = () => new KeyboardEvent('keydown', { code: 'Space', cancelable: true });
const spaceUp = () => new KeyboardEvent('keyup', { code: 'Space', cancelable: true });

describe('setupEditorPanControls', () => {
  it('holding Space over the viewport switches panning to left-mouse, releasing restores middle', () => {
    const canvas = makeCanvas();
    const camera = { _panningMouseButton: MIDDLE };
    install(canvas, camera);

    canvas.dispatchEvent(new Event('pointerenter'));
    const down = spaceDown();
    window.dispatchEvent(down);
    expect(camera._panningMouseButton).toBe(LEFT);
    expect(down.defaultPrevented).toBe(true); // consumed so it can't also toggle play

    const up = spaceUp();
    window.dispatchEvent(up);
    expect(camera._panningMouseButton).toBe(MIDDLE);
    expect(up.defaultPrevented).toBe(true);
  });

  it('ignores Space when the pointer is not over the viewport', () => {
    const canvas = makeCanvas();
    const camera = { _panningMouseButton: MIDDLE };
    install(canvas, camera);

    const down = spaceDown();
    window.dispatchEvent(down);
    expect(camera._panningMouseButton).toBe(MIDDLE);
    expect(down.defaultPrevented).toBe(false); // left for the global shortcut handler
  });

  it('lets Space through during Play so the game can use it (jump), even over the viewport', () => {
    const canvas = makeCanvas();
    const camera = { _panningMouseButton: MIDDLE };
    install(canvas, camera, () => true); // playing

    canvas.dispatchEvent(new Event('pointerenter'));
    const down = spaceDown();
    window.dispatchEvent(down);
    // Pan button untouched and the event is not consumed, so it reaches InputState.
    expect(camera._panningMouseButton).toBe(MIDDLE);
    expect(down.defaultPrevented).toBe(false);
  });

  it('ignores Space while typing in a focused field', () => {
    const canvas = makeCanvas();
    const camera = { _panningMouseButton: MIDDLE };
    install(canvas, camera);

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    canvas.dispatchEvent(new Event('pointerenter'));
    window.dispatchEvent(spaceDown());
    expect(camera._panningMouseButton).toBe(MIDDLE);
  });

  it('suppresses the browser autoscroll affordance on middle-mouse press only', () => {
    const canvas = makeCanvas();
    install(canvas, { _panningMouseButton: MIDDLE });

    const middle = new MouseEvent('mousedown', { button: MIDDLE, cancelable: true });
    canvas.dispatchEvent(middle);
    expect(middle.defaultPrevented).toBe(true);

    const left = new MouseEvent('mousedown', { button: LEFT, cancelable: true });
    canvas.dispatchEvent(left);
    expect(left.defaultPrevented).toBe(false);
  });

  it('removes all listeners on teardown', () => {
    const canvas = makeCanvas();
    const camera = { _panningMouseButton: MIDDLE };
    const teardown = install(canvas, camera);

    teardown();
    canvas.dispatchEvent(new Event('pointerenter'));
    window.dispatchEvent(spaceDown());
    expect(camera._panningMouseButton).toBe(MIDDLE);
  });
});
