import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import type { Scene } from '@babylonjs/core/scene';
import type { ParticleTextureKind } from '@/types';

/**
 * Procedural particle sprites drawn on a canvas at runtime — so presets are
 * self-contained and need no image asset files.
 *
 * NOTE: each call returns a FRESH texture, never a shared/cached one. Babylon's
 * `ParticleSystem.dispose()` disposes the system's texture by default (and
 * one-shots self-dispose via `disposeOnStop`). A shared texture would therefore
 * be killed the first time any system using it is disposed — on an edit-rebuild
 * or a Stop→Play — leaving every later system with a dead texture that emits
 * nothing. Giving each system its own texture keeps disposal self-contained.
 */
const SIZE = 128;
const C = SIZE / 2;
let uid = 0;

function draw(kind: ParticleTextureKind, ctx: CanvasRenderingContext2D) {
  ctx.clearRect(0, 0, SIZE, SIZE);
  switch (kind) {
    case 'soft': {
      // Soft radial dot — the workhorse for fire/glow/magic.
      const g = ctx.createRadialGradient(C, C, 0, C, C, C);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.4, 'rgba(255,255,255,0.6)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, SIZE, SIZE);
      break;
    }
    case 'circle': {
      // Crisp filled disc — confetti, bubbles.
      ctx.fillStyle = 'rgba(255,255,255,1)';
      ctx.beginPath();
      ctx.arc(C, C, C * 0.78, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'spark': {
      // Bright streak with a soft halo — sparks, electricity.
      const g = ctx.createRadialGradient(C, C, 0, C, C, C);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.25)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, SIZE, SIZE);
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = SIZE * 0.05;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(C, SIZE * 0.12);
      ctx.lineTo(C, SIZE * 0.88);
      ctx.stroke();
      break;
    }
    case 'smoke': {
      // Lumpy soft blob for smoke/dust/clouds.
      ctx.globalAlpha = 0.5;
      for (const [dx, dy, r] of [
        [0, 0, 0.5],
        [-0.18, -0.1, 0.34],
        [0.2, 0.05, 0.36],
        [0.02, 0.2, 0.32],
      ] as const) {
        const cx = C + dx * SIZE;
        const cy = C + dy * SIZE;
        const rad = r * C;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
        g.addColorStop(0, 'rgba(255,255,255,0.9)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, rad, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      break;
    }
    case 'star': {
      // 4-point sparkle — magic, collectibles.
      const g = ctx.createRadialGradient(C, C, 0, C, C, C);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.translate(C, C);
      for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(C * 0.16, C * 0.16);
        ctx.lineTo(0, C * 0.95);
        ctx.lineTo(-C * 0.16, C * 0.16);
        ctx.closePath();
        ctx.fill();
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      break;
    }
  }
}

/**
 * Build a fresh procedural particle texture. The returned texture is owned by the
 * particle system that receives it, so it's safe for that system to dispose it.
 */
export function getParticleTexture(scene: Scene, kind: ParticleTextureKind): DynamicTexture {
  const tex = new DynamicTexture(`__fx_${kind}_${uid++}`, { width: SIZE, height: SIZE }, scene, false);
  tex.hasAlpha = true;
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  draw(kind, ctx);
  tex.update();
  return tex;
}
