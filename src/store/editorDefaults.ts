import { nanoid } from 'nanoid';
import type { Entity, GameMode, Vec3 } from '@/types';

/** Construct a Vec3 (defaults to the zero vector). */
export const v3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });

export const HISTORY_LIMIT = 80;
export const COALESCE_MS = 500;

let nameCounter: Record<string, number> = {};
export function uniqueName(base: string): string {
  nameCounter[base] = (nameCounter[base] ?? 0) + 1;
  const n = nameCounter[base];
  return n === 1 ? base : `${base} ${n}`;
}

export function makeEntity(partial: Partial<Entity> & Pick<Entity, 'name'>): Entity {
  return {
    id: nanoid(8),
    parentId: null,
    transform: { position: v3(), rotation: v3(), scale: v3(1, 1, 1) },
    scriptIds: [],
    props: {},
    ...partial,
  };
}

/** Default game-camera framing: behind & above, tilted down toward the origin. */
export const DEFAULT_GAME_CAMERA = { position: v3(0, 4, -10), rotation: v3(16.7, 0, 0) };
/** 2D game camera: straight-on from -Z, looking toward +Z at the XY plane (orthographic).
 *  Standard 2D orientation (+X screen-right), matching the editor camera. */
export const DEFAULT_GAME_CAMERA_2D = { position: v3(0, 0, -10), rotation: v3(0, 0, 0) };

export const defaultGameCamera = (mode: GameMode) =>
  structuredClone(mode === '2d' ? DEFAULT_GAME_CAMERA_2D : DEFAULT_GAME_CAMERA);

const COLORS = ['#4f9bff', '#5bffb0', '#ff5b8a', '#ffd24f', '#b07bff', '#ff9f43'];
let colorIdx = 0;
export const nextColor = () => COLORS[colorIdx++ % COLORS.length];

export function defaultEntities(mode: GameMode = '3d'): Entity[] {
  if (mode === '2d') {
    // Flat XY scene: a ground strip + a player square. No light — 2D shapes
    // render flat (emissive), so they're visible without one.
    const floor = makeEntity({
      name: 'Floor',
      mesh: { kind: 'square', color: '#1d2734', visible: true },
      transform: { position: v3(0, -3, 0), rotation: v3(), scale: v3(16, 1, 1) },
    });
    const player = makeEntity({
      name: 'Player',
      mesh: { kind: 'square', color: '#4f9bff', visible: true },
      transform: { position: v3(0, 0, 0), rotation: v3(), scale: v3(1, 1, 1) },
      props: { speed: 4 },
    });
    return [floor, player];
  }
  const light = makeEntity({
    name: 'Sun',
    light: { kind: 'directional', color: '#ffffff', intensity: 0.9 },
    transform: { position: v3(6, 10, 4), rotation: v3(-45, 30, 0), scale: v3(1, 1, 1) },
  });
  const ground = makeEntity({
    name: 'Ground',
    mesh: { kind: 'ground', color: '#1d2734', visible: true },
    transform: { position: v3(0, 0, 0), rotation: v3(), scale: v3(1, 1, 1) },
  });
  const box = makeEntity({
    name: 'Player',
    mesh: { kind: 'box', color: '#4f9bff', visible: true },
    transform: { position: v3(0, 1, 0), rotation: v3(), scale: v3(1, 1, 1) },
    props: { speed: 3 },
  });
  return [light, ground, box];
}

/** Starter content for a brand-new game or scene (per mode). */
export function starterEntities(mode: GameMode = '3d'): Entity[] {
  return defaultEntities(mode);
}
