import { useEffect, useMemo, useState } from 'react';
import { Loader2, Download, Check } from 'lucide-react';
import { useEditorStore } from '@/store/editorStore';
import { browseCc0, importCc0, type Cc0Item, type Cc0Provider, type Cc0Type } from '@/api/client';

type Source = { provider: Cc0Provider; type: Cc0Type; label: string };

const SOURCES: Source[] = [
  { provider: 'polyhaven', type: 'material', label: 'Poly Haven · Materials' },
  { provider: 'polyhaven', type: 'hdri', label: 'Poly Haven · HDRIs' },
  { provider: 'ambientcg', type: 'material', label: 'ambientCG · Materials' },
];

/**
 * Browse free CC0 materials/HDRIs from Poly Haven & ambientCG and import them via
 * the server proxy. Importing a material adds its texture maps to the library and,
 * if a mesh is selected, applies them to it; importing an HDRI sets the scene's
 * IBL environment. Rendered inside the AssetBrowser when its CC0 tab is active.
 */
export function Cc0Browser() {
  const [sourceIdx, setSourceIdx] = useState(0);
  const [items, setItems] = useState<Cc0Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());

  const addAsset = useEditorStore((s) => s.addAsset);
  const updateMaterial = useEditorStore((s) => s.updateMaterial);
  const updateRenderSettings = useEditorStore((s) => s.updateRenderSettings);
  const saveMaterialPreset = useEditorStore((s) => s.saveMaterialPreset);
  const selectedId = useEditorStore((s) => s.selectedId);

  const source = SOURCES[sourceIdx];

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    browseCc0(source.provider, source.type)
      .then((r) => { if (!cancelled) setItems(r.items); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load catalog'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [source.provider, source.type]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = q
      ? items.filter((i) => i.name.toLowerCase().includes(q) || i.categories.some((c) => c.toLowerCase().includes(q)))
      : items;
    return matched.slice(0, 90); // cap the DOM; search narrows the rest
  }, [items, query]);

  const onImport = async (item: Cc0Item) => {
    setBusyId(item.id);
    setError('');
    try {
      const r = await importCc0({ provider: item.provider, id: item.id, type: item.type });
      for (const a of r.assets) addAsset(a);
      if (r.material) {
        // Register a reusable preset (shows in the Inspector's Material picker) and
        // apply it to the current selection if there is one.
        saveMaterialPreset(item.name, { shading: 'pbr', metallic: 0, roughness: 1, ...r.material });
        if (selectedId) updateMaterial(selectedId, r.material);
      }
      if (r.environmentUrl) updateRenderSettings({ environmentUrl: r.environmentUrl, skybox: true });
      setDoneIds((s) => new Set(s).add(item.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="cc0-browser">
      <div className="cc0-toolbar">
        {SOURCES.map((s, i) => (
          <button key={s.label} className={`asset-filter ${i === sourceIdx ? 'on' : ''}`} onClick={() => setSourceIdx(i)}>
            {s.label}
          </button>
        ))}
        <div className="asset-search">
          <input placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      {source.type === 'material' && (
        <div className="empty-hint inline">
          {selectedId ? 'Imported maps apply to the selected mesh.' : 'Select a mesh first to auto-apply imported maps, or just add them to the library.'}
        </div>
      )}

      <div className="asset-body">
        {error && <div className="asset-upload-err">{error}</div>}
        {loading ? (
          <div className="asset-empty"><Loader2 size={16} className="spin" /> Loading catalogue…</div>
        ) : shown.length === 0 ? (
          <div className="asset-empty">No results.</div>
        ) : (
          <div className="asset-grid">
            {shown.map((item) => (
              <div key={`${item.provider}:${item.id}`} className="asset-card cc0-card" title={item.name}>
                <div className="asset-thumb"><img className="asset-thumb-img" src={item.thumbUrl} alt={item.name} loading="lazy" /></div>
                <div className="asset-meta">
                  <span className="asset-name">{item.name}</span>
                  <button className="asset-upload" disabled={busyId === item.id} onClick={() => void onImport(item)}>
                    {busyId === item.id ? <Loader2 size={12} className="spin" /> : doneIds.has(item.id) ? <Check size={12} /> : <Download size={12} />}
                    {doneIds.has(item.id) ? 'Added' : 'Import'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
