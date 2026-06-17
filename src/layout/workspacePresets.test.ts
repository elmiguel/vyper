import { describe, it, expect } from 'vitest';
import type { DockviewApi } from 'dockview';
import { BUILTIN_PRESETS, DEFAULT_PRESET_ID, applyPreset } from './workspacePresets';
import { PANEL_KEYS } from './panels';

interface RecordedPanel {
  id: string;
  component: string;
  position?: { referencePanel?: string };
}

/** Records addPanel calls so we can assert a preset's structure without a real DOM. */
function mockApi() {
  const added: RecordedPanel[] = [];
  let cleared = 0;
  const api = {
    clear: () => {
      cleared++;
      added.length = 0;
    },
    addPanel: (opts: RecordedPanel) => {
      added.push(opts);
      return { id: opts.id };
    },
  } as unknown as DockviewApi;
  return { api, added, clears: () => cleared };
}

describe('built-in workspace presets', () => {
  it('exposes the Default preset under the default id', () => {
    expect(BUILTIN_PRESETS[DEFAULT_PRESET_ID]).toBeDefined();
  });

  for (const [id, preset] of Object.entries(BUILTIN_PRESETS)) {
    describe(`"${id}"`, () => {
      it('has a matching id and a non-empty label', () => {
        expect(preset.id).toBe(id);
        expect(preset.label.length).toBeGreaterThan(0);
      });

      it('places every panel exactly once using valid keys', () => {
        const { api, added } = mockApi();
        preset.build(api);
        const ids = added.map((p) => p.id);
        for (const p of added) {
          expect(PANEL_KEYS).toContain(p.id);
          expect(p.component).toBe(p.id);
        }
        expect(new Set(ids)).toEqual(new Set(PANEL_KEYS));
        expect(ids).toHaveLength(PANEL_KEYS.length);
      });

      it('only references panels that were already added', () => {
        const { api, added } = mockApi();
        preset.build(api);
        const seen = new Set<string>();
        for (const p of added) {
          const ref = p.position?.referencePanel;
          if (ref) expect(seen.has(ref)).toBe(true);
          seen.add(p.id);
        }
      });
    });
  }

  it('applyPreset clears the dock before rebuilding', () => {
    const { api, added, clears } = mockApi();
    applyPreset(api, BUILTIN_PRESETS[DEFAULT_PRESET_ID]);
    expect(clears()).toBe(1);
    expect(added).toHaveLength(PANEL_KEYS.length);
  });
});
