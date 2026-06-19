import { useEditorStore } from '@/store/editorStore';
import type { Entity } from '@/types';

/**
 * Inspector section for a Spawner entity: pick the object it deploys. Choosing a target snaps
 * that object onto the spawner (its spawn point); at play the source is pooled and `world.spawn`
 * deploys instances here. Candidate targets are every non-spawner entity except the spawner
 * itself. See {@link SpawnerConfig} and the Spawn / Despawn action nodes.
 */
export function SpawnerPanel({ entity, disabled }: { entity: Entity; disabled?: boolean }) {
  const entities = useEditorStore((s) => s.entities);
  const setSpawnerTarget = useEditorStore((s) => s.setSpawnerTarget);
  const targetId = entity.spawner?.targetId ?? '';
  const candidates = entities.filter((e) => e.id !== entity.id && !e.spawner);
  const targetMissing = !!targetId && !candidates.some((e) => e.id === targetId);

  return (
    <section>
      <h4>Spawner</h4>
      <div className="field">
        <span className="field-label">Object</span>
        <select
          value={targetId}
          disabled={disabled}
          onChange={(e) => setSpawnerTarget(entity.id, e.target.value || null)}
        >
          <option value="">— none —</option>
          {candidates.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
      </div>
      <div className="empty-hint inline">
        {targetMissing
          ? 'The chosen object was removed — pick another.'
          : targetId
            ? 'This object spawns here when triggered. Wire a Spawn action to fire it; Despawn returns instances to the pool.'
            : 'Choose the object to spawn. It will move onto this spawn point.'}
      </div>
    </section>
  );
}
