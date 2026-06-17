import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { InputState } from './InputState';

// InputState only touches sceneManager in lockPointer(), which these tests
// don't exercise — a bare stub is enough.
const stubSceneManager = {} as never;

function press(key: string) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key }));
}
function release(key: string) {
  window.dispatchEvent(new KeyboardEvent('keyup', { key }));
}

describe('InputState — spacebar normalization', () => {
  let input: InputState;

  beforeEach(() => {
    input = new InputState(stubSceneManager);
    input.start();
  });
  afterEach(() => input.stop());

  it('matches the spacebar whether queried as " " or "space"', () => {
    press(' '); // KeyboardEvent.key for the spacebar is a literal space
    expect(input.key('space')).toBe(true); // what the node editor stores
    expect(input.key(' ')).toBe(true); // what controller templates write
  });

  it('clears the spacebar on keyup', () => {
    press(' ');
    release(' ');
    expect(input.key('space')).toBe(false);
  });

  it('still matches ordinary keys by name', () => {
    press('w');
    expect(input.key('w')).toBe(true);
    expect(input.key('a')).toBe(false);
  });

  it('matches combos that include space', () => {
    press('Shift');
    press(' ');
    expect(input.key('shift+space')).toBe(true);
  });
});
