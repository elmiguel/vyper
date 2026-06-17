import { Boxes, Plus } from 'lucide-react';
import { useEditorStore } from '@/store/editorStore';

/**
 * The game's prefab library: reusable entity templates. Lists saved prefabs with
 * a one-click "Place" to stamp a fresh instance into the scene. Shown in the
 * Inspector when nothing is selected. Saving is done from a selected entity
 * (see the Inspector's "Save as Prefab" action).
 */
export function PrefabsPanel() {
  const prefabs = useEditorStore((s) => s.prefabs);
  const instantiate = useEditorStore((s) => s.instantiatePrefab);
  const remove = useEditorStore((s) => s.removePrefab);
  const list = Object.values(prefabs);

  return (
    <section>
      <h4><Boxes size={13} /> Prefabs</h4>
      {list.length === 0 ? (
        <div className="empty-hint inline">Select an object and choose “Save as Prefab” to reuse it across scenes.</div>
      ) : (
        list.map((p) => (
          <div className="script-row" key={p.id}>
            <span className="script-name" onClick={() => instantiate(p.id)}>{p.name}</span>
            <button className="add-script-btn inline" title="Place an instance" onClick={() => instantiate(p.id)}>
              <Plus size={12} /> Place
            </button>
            <button className="script-detach" title="Delete prefab" onClick={() => remove(p.id)}>✕</button>
          </div>
        ))
      )}
    </section>
  );
}
