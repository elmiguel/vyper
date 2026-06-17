import { describe, it, expect } from 'vitest';
import { ASSET_TEMPLATES } from './assetTemplates';

const tmpl = (kind: string) => {
  const t = ASSET_TEMPLATES[kind];
  if (!t) throw new Error(`no template for ${kind}`);
  return t;
};

describe('2D Player Controller — spacebar jump', () => {
  const c = tmpl('asset/playerController2D');

  it('seeds vertical-velocity and ground state in onStart', () => {
    const start = c.onStart({});
    expect(start).toContain('entity.props.vy = 0');
    expect(start).toContain('entity.props.groundY = entity.position.y');
  });

  it('jumps on spacebar only when grounded, edge-triggered', () => {
    const update = c.onUpdate({});
    expect(update).toContain("input.key(' ')");
    // Gated on grounded (can't fly by holding Space) AND on the press edge
    // (jumpHeld) so a held key can't bunny-hop on every landing frame.
    expect(update).toMatch(/grounded && jumpPressed && !entity\.props\.jumpHeld/);
  });

  it('integrates gravity and lands back at the ground height', () => {
    const update = c.onUpdate({});
    expect(update).toContain('entity.props.vy -= gravity * dt');
    expect(update).toContain('entity.translate(0, entity.props.vy * dt, 0)');
    expect(update).toContain('entity.props.vy = 0'); // reset on landing
  });

  it('derives take-off velocity from jumpHeight and gravity (v = √(2gh))', () => {
    // defaults: jumpHeight 2, gravity 20 → √(2·20·2) = 8.94
    expect(c.onUpdate({})).toContain('entity.props.vy = 8.94');
    // custom fields flow through
    expect(c.onUpdate({ jumpHeight: 3, gravity: 30 })).toContain('entity.props.vy = 13.42');
  });

  it('uses the configured horizontal speed', () => {
    expect(c.onUpdate({ moveSpeed: 9 })).toContain('const speed = 9');
  });
});

describe('3D controllers — smooth locomotion + jump', () => {
  for (const kind of ['asset/firstPersonController', 'asset/thirdPersonController']) {
    it(`${kind} sets an upward velocity on a grounded jump`, () => {
      const update = tmpl(kind).onUpdate({});
      expect(update).toContain('entity.isGrounded()');
      expect(update).toMatch(/entity\.setVelocity\(v\.x, \d+\.\d+, v\.z\)/);
    });

    it(`${kind} edge-triggers the jump (fires once per press, not while held)`, () => {
      const update = tmpl(kind).onUpdate({});
      // Guarded on the press edge via entity.props.jumpHeld so a held key can't
      // re-fire and launch the player.
      expect(update).toContain('!entity.props.jumpHeld');
      expect(update).toContain('entity.props.jumpHeld = jumpPressed');
    });

    it(`${kind} has full ground control but only partial air control (smooth arcs)`, () => {
      const update = tmpl(kind).onUpdate({});
      // Grounded snaps to input; airborne blends a fraction so jumps keep momentum.
      expect(update).toContain('if (grounded) entity.setVelocity(wish.x * speed, vel.y, wish.z * speed)');
      expect(update).toContain('* 0.1'); // air-control blend factor
    });
  }
});
