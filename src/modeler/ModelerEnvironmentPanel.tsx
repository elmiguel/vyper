import { useEffect, useMemo, useRef } from 'react';
import { Globe, Sun, Aperture } from 'lucide-react';
import { useModelerStore } from './modelerStore';
import { useEditorStore } from '@/store/editorStore';
import { assetsWithTextures } from '@/assets/deriveTextures';
import { ASSET_ROOT } from '@/store/slices/assetSlice';
import type { StudioTone } from './modelerEnvironment';

/** A labelled range slider matching the game panels' form style. */
function Slider({ label, value, min, max, step, onChange }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void;
}) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
      <span className="field-val">{value.toFixed(2)}</span>
    </div>
  );
}

/**
 * Studio viewport "Environment" panel — image-based lighting (HDR/.env), key/fill light
 * levels, tone mapping, and a lit PBR preview toggle. These mirror the game's render path for
 * a cohesive feel but are Studio-only: they light the modeling viewport for previewing
 * materials and never change the shipped game scene. Environment options come from the shared
 * asset library (upload HDRs via the Assets button), so it stays consistent with the editor.
 */
export function ModelerEnvironmentPanel() {
  const env = useModelerStore((s) => s.studioEnv);
  const setEnv = useModelerStore((s) => s.setStudioEnv);
  const assets = useEditorStore((s) => s.assetLibrary.assets);
  // Environments in this app come from CC0 HDRI imports, which store the URL on the game's
  // render settings (see Cc0Browser). Offer that here too, plus any uploaded .hdr/.env texture.
  const importedEnvUrl = useEditorStore((s) => s.design.render?.environmentUrl);

  const envOptions = useMemo(() => {
    const opts: Array<{ url: string; name: string }> = [];
    if (importedEnvUrl) opts.push({ url: importedEnvUrl, name: 'Imported HDRI' });
    for (const a of assetsWithTextures(assets)) {
      const file = a.textures[0] ?? '';
      if (!/\.(hdr|env|dds)$/i.test(file)) continue;
      const url = `${a.rootUrl ?? ASSET_ROOT}${file}`;
      if (!opts.some((o) => o.url === url)) opts.push({ url, name: a.name });
    }
    // Keep the current selection listed even if its source isn't otherwise enumerated.
    if (env.url && !opts.some((o) => o.url === env.url)) opts.push({ url: env.url, name: 'Current environment' });
    return opts;
  }, [assets, importedEnvUrl, env.url]);

  // Auto-apply a freshly imported HDRI (e.g. from the CC0 browser) to the Studio preview, so
  // "choose an HDRI → it lights the viewport" works without a second pick. A new import wins;
  // a manual selection afterward sticks (we only react to a *changed* imported URL).
  const lastImported = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (importedEnvUrl && importedEnvUrl !== lastImported.current) {
      lastImported.current = importedEnvUrl;
      setEnv({ url: importedEnvUrl });
    }
  }, [importedEnvUrl, setEnv]);

  return (
    <div className="panel inspector modeler-environment">
      <div className="panel-head">Environment</div>
      <div className="panel-scroll">
        <div className="studio-section">
          <div className="studio-label"><Globe size={13} /> Environment (IBL)</div>
          <div className="field">
            <span className="field-label">Source</span>
            <select value={env.url} onChange={(e) => setEnv({ url: e.target.value })}>
              <option value="">None (flat lighting)</option>
              {envOptions.map((o) => (
                <option key={o.url} value={o.url}>{o.name}</option>
              ))}
            </select>
          </div>
          {envOptions.length === 0 && (
            <div className="empty-hint inline">Import an HDRI from the <strong>Assets</strong> browser (CC0 tab) to light the viewport — it applies here automatically.</div>
          )}
          <Slider label="Intensity" value={env.intensity} min={0} max={3} step={0.05} onChange={(v) => setEnv({ intensity: v })} />
          <label className="field check">
            <input type="checkbox" checked={env.skybox} disabled={!env.url} onChange={(e) => setEnv({ skybox: e.target.checked })} />
            Show as background
          </label>
        </div>

        <div className="studio-section">
          <div className="studio-label"><Sun size={13} /> Lighting</div>
          <Slider label="Key light" value={env.key} min={0} max={3} step={0.05} onChange={(v) => setEnv({ key: v })} />
          <Slider label="Fill light" value={env.fill} min={0} max={2} step={0.05} onChange={(v) => setEnv({ fill: v })} />
        </div>

        <div className="studio-section">
          <div className="studio-label"><Aperture size={13} /> Render</div>
          <label className="field check">
            <input type="checkbox" checked={env.litPreview} onChange={(e) => setEnv({ litPreview: e.target.checked })} />
            Lit preview (PBR materials)
          </label>
          <div className="field">
            <span className="field-label">Tone</span>
            <select value={env.tone} onChange={(e) => setEnv({ tone: e.target.value as StudioTone })}>
              <option value="aces">ACES (filmic)</option>
              <option value="standard">Standard</option>
              <option value="none">None</option>
            </select>
          </div>
          <Slider label="Exposure" value={env.exposure} min={0} max={3} step={0.05} onChange={(v) => setEnv({ exposure: v })} />
        </div>
      </div>
    </div>
  );
}
