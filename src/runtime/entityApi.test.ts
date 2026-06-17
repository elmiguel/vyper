import { describe, expect, it } from 'vitest';
import { restingGroundState, GROUND_REST_FRAMES } from './entityApi';

describe('restingGroundState (grounded-by-rest)', () => {
  it('grounds once vertical motion has been arrested for enough frames', () => {
    let s = restingGroundState(0, 0); // frame 1 at rest
    expect(s.frames).toBe(1);
    expect(s.grounded).toBe(false);
    s = restingGroundState(s.frames, 0.01); // frame 2 at rest (tiny jitter ok)
    expect(s.frames).toBe(GROUND_REST_FRAMES);
    expect(s.grounded).toBe(true);
  });

  it('resets the counter while rising or falling', () => {
    const rising = restingGroundState(9, 1.5);
    expect(rising.frames).toBe(0);
    expect(rising.grounded).toBe(false);
    const falling = restingGroundState(9, -2);
    expect(falling.frames).toBe(0);
  });

  it('never grounds during the brief apex of a jump (one near-zero frame)', () => {
    let s = restingGroundState(0, 3); // rising
    s = restingGroundState(s.frames, 0); // apex — a single near-zero frame
    s = restingGroundState(s.frames, -3); // falling
    expect(s.grounded).toBe(false);
  });
});
