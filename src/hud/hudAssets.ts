import { nanoid } from 'nanoid';
import type { HudWidget, HudWidgetKind } from '@/types';

/**
 * Library of ready-made HUD widgets. Each entry knows its palette label and a
 * factory for a sensibly-styled default instance, so dropping one in looks good
 * immediately. Geometry is in percent-of-view; the same layout scales to any
 * preview or play resolution (see HudOverlay).
 */

export interface HudAsset {
  kind: HudWidgetKind;
  label: string;
  /** Short glyph shown in the palette tile. */
  glyph: string;
  hint: string;
}

export const HUD_ASSETS: HudAsset[] = [
  { kind: 'text', label: 'Text', glyph: 'T', hint: 'A plain text label.' },
  { kind: 'score', label: 'Score', glyph: '＃', hint: 'Label + a live number (e.g. SCORE 0).' },
  { kind: 'timer', label: 'Timer', glyph: '◷', hint: 'A mm:ss countdown / clock.' },
  { kind: 'healthbar', label: 'Health Bar', glyph: '❤', hint: 'A fill bar bound to a value/max.' },
  { kind: 'bar', label: 'Bar', glyph: '▭', hint: 'A generic progress / stamina bar.' },
  { kind: 'ammo', label: 'Ammo', glyph: '⁝', hint: 'value / max counter.' },
  { kind: 'crosshair', label: 'Crosshair', glyph: '✛', hint: 'Centered aiming reticle.' },
  { kind: 'objective', label: 'Objective', glyph: '◎', hint: 'Current goal text with a marker.' },
  { kind: 'icon', label: 'Icon', glyph: '★', hint: 'A glyph/emoji badge.' },
  { kind: 'button', label: 'Button', glyph: '▢', hint: 'A menu/action button.' },
  { kind: 'panel', label: 'Panel', glyph: '▢', hint: 'A translucent background container.' },
];

/** Build a fresh widget of a kind with good defaults. */
export function makeHudWidget(kind: HudWidgetKind): HudWidget {
  const base: HudWidget = {
    id: nanoid(8),
    kind,
    name: HUD_ASSETS.find((a) => a.kind === kind)?.label ?? kind,
    x: 44,
    y: 45,
    w: 12,
    h: 8,
    label: '',
    color: '#e6e9ff',
    bg: '#0b0a1c',
    fontSize: 22,
    radius: 8,
    opacity: 1,
    align: 'center',
    bindTarget: '',
    bindProp: '',
    value: 0,
    max: 100,
    visible: true,
  };

  switch (kind) {
    case 'text':
      return { ...base, label: 'Text', bg: 'transparent', x: 4, y: 5, w: 20, h: 6, align: 'left' };
    case 'score':
      return { ...base, label: 'SCORE', bindProp: 'score', value: 0, bg: 'transparent', color: '#3affc0', x: 4, y: 5, w: 18, h: 7, align: 'left', fontSize: 26 };
    case 'timer':
      return { ...base, label: '', value: 90, bg: 'transparent', color: '#e6e9ff', x: 44, y: 4, w: 12, h: 7, fontSize: 28 };
    case 'healthbar':
      return { ...base, label: 'HP', bindProp: 'health', value: 100, max: 100, color: '#3affc0', bg: '#1d2734', x: 4, y: 90, w: 26, h: 4 };
    case 'bar':
      return { ...base, label: '', value: 70, max: 100, color: '#22d3ee', bg: '#1d2734', x: 4, y: 84, w: 26, h: 3 };
    case 'ammo':
      return { ...base, label: '', bindProp: 'ammo', value: 30, max: 30, bg: 'transparent', color: '#ffd24f', x: 80, y: 88, w: 16, h: 8, align: 'right', fontSize: 30 };
    case 'crosshair':
      return { ...base, label: '', bg: 'transparent', color: '#e6e9ff', x: 47, y: 46, w: 6, h: 8, opacity: 0.85 };
    case 'objective':
      return { ...base, label: 'Reach the exit', bg: '#0b0a1c', color: '#e6e9ff', x: 36, y: 5, w: 28, h: 7, align: 'left', fontSize: 18, opacity: 0.9 };
    case 'icon':
      return { ...base, label: '★', bg: 'transparent', color: '#ffd24f', x: 4, y: 5, w: 6, h: 8, fontSize: 30 };
    case 'button':
      return { ...base, label: 'START', color: '#04121a', bg: '#22d3ee', x: 42, y: 60, w: 16, h: 9, fontSize: 20, radius: 10 };
    case 'panel':
      return { ...base, label: '', bg: '#0b0a1c', x: 2, y: 80, w: 30, h: 16, opacity: 0.55 };
    default:
      return base;
  }
}
