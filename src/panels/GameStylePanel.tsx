import { useMemo } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { defaultRenderSettings, type RenderSettings } from '@/types';
import { LOOK_PRESETS, lookPresetIds } from '@/presets/lookPresets';
import { LookPresetCard } from './LookPresetCard';
import { RenderControls } from './RenderControls';
import { RenderSettings as RenderSettingsControls } from './RenderSettings';

/**
 * Game Style browser: a gallery of look presets, each rendering the live scene
 * through the game camera with that preset's grade applied (Hyperreal Dreamscape,
 * Cinematic, …). Click a card to apply it to the game's render settings, then
 * fine-tune with the controls below. 3D only — look effects don't apply to flat 2D.
 */
export function GameStylePanel() {
  const mode = useEditorStore((s) => s.mode);
  const active = useEditorStore((s) => s.design.render?.lookPreset);
  const apply = useEditorStore((s) => s.applyLookPreset);

  // Each card previews the preset's CANONICAL look (config merged over defaults),
  // independent of the live (possibly fine-tuned) design.render.
  const cards = useMemo(
    () =>
      lookPresetIds().map((id) => {
        const p = LOOK_PRESETS[id];
        const settings: RenderSettings = { ...defaultRenderSettings(), ...p.config, enabled: true };
        return { id, label: p.label, description: p.description, settings };
      }),
    [],
  );

  if (mode === '2d') {
    return (
      <div className="panel-scroll game-style">
        <div className="empty-hint">Game styles apply to 3D games. This is a 2D game.</div>
      </div>
    );
  }

  return (
    <div className="panel-scroll game-style">
      <section>
        <h4>Look presets</h4>
        <div className="look-gallery">
          {cards.map((c) => (
            <LookPresetCard
              key={c.id}
              label={c.label}
              description={c.description}
              settings={c.settings}
              active={active === c.id}
              onSelect={() => apply(c.id)}
            />
          ))}
        </div>
        <div className="empty-hint inline">
          {active ? `Active: ${LOOK_PRESETS[active]?.label ?? active}` : 'Custom look (adjusted below)'}
        </div>
      </section>

      <RenderControls />
      <RenderSettingsControls />
    </div>
  );
}
