import { Vector3, Matrix } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { SceneManager } from '@/babylon/SceneManager';
import { type Entity, type VolumeConfig, isMeshCollidable } from '@/types';
import { gameConsole } from '@/store/consoleStore';
import {
  shapeForKind,
  isInsideLocal,
  segmentInsideLocal,
  clampInsideLocal,
  pushOutsideLocal,
  resolveConstraint,
  type VolumeShape,
  type P3,
} from './volumeGeometry';

// Babylon scene fog modes (avoids importing the Scene class as a value).
const FOG_NONE = 0;
const FOG_EXP2 = 2;

interface VolEntry {
  id: string;
  cfg: VolumeConfig;
  mesh: AbstractMesh;
  shape: VolumeShape;
  filter: string[];
  /** Latched boundary lock per affected object (trap / one-way). */
  locks: Map<string, 'in' | 'out' | null>;
  /** Objects inside as of last frame (for enter/exit latching). */
  prevInside: Set<string>;
  /** Each affected object's volume-local position last frame, for tunnel-proof (swept) dead-zone
   *  detection. Cleared for an object the frame it triggers so respawn-exit doesn't re-fire. */
  prevLocal: Map<string, P3>;
  audio?: HTMLAudioElement;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Enforces volume behaviour each frame: movement boundaries (keep-in / keep-out /
 * trap / one-way) and presets (dead zone respawn, water buoyancy+drag, and
 * camera-based fog/water tint + zone sound). Geometry math is pure
 * (./volumeGeometry); this layer does the Babylon I/O. Built at Play start and
 * disposed on Stop (which also resets scene fog and stops audio).
 */
export class VolumeEnforcer {
  private vols: VolEntry[] = [];
  private candidates: string[] = [];
  private nameById = new Map<string, string>();
  private tagById = new Map<string, string | undefined>();
  private spawns = new Map<string, Vector3>();
  private fogActive = false;
  private dbgFrame = 0; // TEMP: throttles dead-zone diagnostics

  constructor(private readonly sm: SceneManager) {}

  /** Collect volume entities + their affected-object candidates + spawn points. */
  build(entities: Entity[]): void {
    this.nameById = new Map(entities.map((e) => [e.id, e.name]));
    this.tagById = new Map(entities.map((e) => [e.id, e.tag]));
    this.candidates = entities
      .filter((e) => e.mesh && isMeshCollidable(e.mesh) && !e.trigger?.enabled)
      .map((e) => e.id);
    for (const e of entities) {
      const p = e.transform.position;
      this.spawns.set(e.id, new Vector3(p.x, p.y, p.z));
    }
    this.vols = entities
      .filter((e) => e.trigger?.enabled && isActive(e.trigger.volume) && this.sm.getMesh(e.id))
      .map((e) => {
        const cfg = e.trigger!.volume!;
        const entry: VolEntry = {
          id: e.id,
          cfg,
          mesh: this.sm.getMesh(e.id)!,
          shape: shapeForKind(e.mesh!.kind),
          filter: e.trigger!.filter,
          locks: new Map(),
          prevInside: new Set(),
          prevLocal: new Map(),
        };
        if (cfg.preset === 'sound' && cfg.soundUrl) {
          const a = new Audio(cfg.soundUrl);
          a.loop = cfg.soundLoop;
          a.volume = clamp01(cfg.soundVolume);
          a.preload = 'auto';
          entry.audio = a;
        }
        return entry;
      });

    // TEMP DIAGNOSTICS (dead-zone debugging) — remove once resolved.
    const dz = this.vols.filter((v) => v.cfg.preset === 'deadZone');
    gameConsole.warn(
      'DeadZone',
      `built ${this.vols.length} volume(s) (${dz.length} dead zone), affected: ` +
        `${this.candidates.map((id) => this.nameById.get(id) ?? id).join(', ') || '(none)'}`,
    );
    for (const v of dz) {
      gameConsole.warn('DeadZone', `"${this.nameById.get(v.id)}" respawn=${v.cfg.respawn} filter=[${v.filter.join(', ')}] shape=${v.shape}`);
    }
  }

  /** Does this volume act on the given object id (filter by name/tag; empty = any)? */
  private affects(vol: VolEntry, cid: string): boolean {
    if (cid === vol.id) return false;
    if (!vol.filter.length) return true;
    const nm = this.nameById.get(cid);
    const tg = this.tagById.get(cid);
    return !!(nm && vol.filter.includes(nm)) || !!(tg && vol.filter.includes(tg));
  }

  tick(dt: number): void {
    this.dbgFrame++; // TEMP: dead-zone diagnostics throttle
    const cam = this.sm.gameCamera;
    let visual: VolumeConfig | null = null;

    for (const vol of this.vols) {
      const wm = vol.mesh.getWorldMatrix();
      const inv = Matrix.Invert(wm);
      const nextInside = new Set<string>();

      for (const cid of this.candidates) {
        if (!this.affects(vol, cid)) continue;
        const cm = this.sm.getMesh(cid);
        // TEMP DIAGNOSTICS — report any candidate skipped before the inside-test. Remove once resolved.
        if (this.dbgFrame % 60 === 0 && vol.cfg.preset === 'deadZone' && (!cm || !cm.isEnabled())) {
          gameConsole.warn('DeadZone', `SKIP "${this.nameById.get(cid) ?? cid}" mesh=${!!cm} enabled=${cm ? cm.isEnabled() : 'n/a'}`);
        }
        if (!cm || !cm.isEnabled()) continue;
        const local = Vector3.TransformCoordinates(cm.getAbsolutePosition(), inv);
        const inside = isInsideLocal(vol.shape, { x: local.x, y: local.y, z: local.z });
        const wasInside = vol.prevInside.has(cid);

        if (vol.cfg.boundary !== 'none') {
          const r = resolveConstraint(vol.cfg.boundary, inside, wasInside, vol.locks.get(cid) ?? null);
          vol.locks.set(cid, r.lock);
          const target =
            r.constrain === 'in' && !inside ? clampInsideLocal(vol.shape, { x: local.x, y: local.y, z: local.z })
            : r.constrain === 'out' && inside ? pushOutsideLocal(vol.shape, { x: local.x, y: local.y, z: local.z })
            : null;
          if (target) {
            // Push the object to the boundary surface and slide it along — the
            // local displacement (target − local) is the surface normal toward the
            // allowed side, transformed to world space for the velocity correction.
            const localTarget = new Vector3(target.x, target.y, target.z);
            const worldPos = Vector3.TransformCoordinates(localTarget, wm);
            const worldNormal = Vector3.TransformNormal(localTarget.subtract(local), wm);
            if (worldNormal.lengthSquared() > 1e-8) worldNormal.normalize();
            this.sm.constrainEntity(cid, worldPos, worldNormal);
          }
        }

        // Dead zone uses swept detection so a fast faller that skips over a thin volume between
        // frames still triggers; water/fog/boundary stay point-based (continuous effects).
        if (vol.cfg.preset === 'deadZone') {
          const prev = vol.prevLocal.get(cid);
          const hit = inside || (prev ? segmentInsideLocal(vol.shape, prev, { x: local.x, y: local.y, z: local.z }) : false);
          // TEMP DIAGNOSTICS — every ~60 frames, report each candidate's position in the dead
          // zone's local space (inside = |x|,|y|,|z| ≤ 0.5 for a box). Remove once resolved.
          if (this.dbgFrame % 60 === 0) {
            gameConsole.warn(
              'DeadZone',
              `"${this.nameById.get(cid) ?? cid}" local=(${local.x.toFixed(2)}, ${local.y.toFixed(2)}, ${local.z.toFixed(2)}) inside=${inside}`,
            );
          }
          if (hit) {
            gameConsole.warn('DeadZone', `HIT → ${this.nameById.get(cid) ?? cid} respawn=${vol.cfg.respawn}`);
            this.deadZone(vol, cid);
            vol.prevLocal.delete(cid); // after teleport/destroy, don't swept-test the exit path
          } else {
            vol.prevLocal.set(cid, { x: local.x, y: local.y, z: local.z });
          }
        } else if (inside && vol.cfg.preset === 'water') {
          this.water(vol, cid, dt);
        }

        if (inside) nextInside.add(cid);
      }
      vol.prevInside = nextInside;

      // Camera-based effects: fog/water tint + zone sound follow what the viewer sees.
      const camLocal = Vector3.TransformCoordinates(cam.globalPosition, inv);
      const camInside = isInsideLocal(vol.shape, { x: camLocal.x, y: camLocal.y, z: camLocal.z });
      if (camInside && (vol.cfg.preset === 'fog' || vol.cfg.preset === 'water')) visual = vol.cfg;
      if (vol.audio) this.tickSound(vol, camInside);
    }

    this.applyFog(visual);
  }

  private deadZone(vol: VolEntry, cid: string): void {
    if (vol.cfg.respawn) {
      const spawn = this.spawns.get(cid);
      if (spawn) this.sm.repositionEntity(cid, spawn);
    } else {
      this.sm.destroyRuntimeEntity(cid);
    }
  }

  private water(vol: VolEntry, cid: string, dt: number): void {
    const body = this.sm.getBody(cid);
    if (!body) return;
    const v = body.getLinearVelocity();
    v.scaleInPlace(Math.max(0, 1 - vol.cfg.drag)); // viscous drag
    v.y += vol.cfg.buoyancy * dt; // buoyancy counters gravity
    body.setLinearVelocity(v);
  }

  private tickSound(vol: VolEntry, camInside: boolean): void {
    const a = vol.audio!;
    if (camInside) {
      a.volume = clamp01(vol.cfg.soundVolume);
      if (a.paused) void a.play().catch(() => { /* autoplay may defer until a gesture */ });
    } else if (!a.paused) {
      a.pause();
    }
  }

  private applyFog(visual: VolumeConfig | null): void {
    const scene = this.sm.scene;
    if (visual) {
      scene.fogMode = FOG_EXP2;
      scene.fogColor = Color3.FromHexString(visual.color);
      scene.fogDensity = visual.density;
      this.fogActive = true;
    } else if (this.fogActive) {
      scene.fogMode = FOG_NONE;
      this.fogActive = false;
    }
  }

  dispose(): void {
    for (const v of this.vols) v.audio?.pause();
    if (this.fogActive) {
      this.sm.scene.fogMode = FOG_NONE;
      this.fogActive = false;
    }
    this.vols = [];
    this.spawns.clear();
  }
}

/** A volume config does something only if it has a boundary or a preset. */
function isActive(v: VolumeConfig | undefined): v is VolumeConfig {
  return !!v && (v.preset !== 'none' || v.boundary !== 'none');
}
