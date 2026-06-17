import { describe, it, expect, beforeEach } from 'vitest';
import { defaultVolume } from '@/types';
import { useEditorStore } from '../editorStore';

const s = () => useEditorStore.getState();

beforeEach(() => {
  useEditorStore.setState({ entities: [], past: [], future: [], sceneRevision: 0 });
});

describe('updateVolume', () => {
  it('seeds default volume config on a trigger entity, then merges patches', () => {
    const id = s().addVolume('box');
    expect(s().entities.find((e) => e.id === id)!.trigger!.volume).toBeUndefined();

    s().updateVolume(id, { boundary: 'keepIn' });
    const vol = s().entities.find((e) => e.id === id)!.trigger!.volume!;
    expect(vol).toMatchObject({ ...defaultVolume(), boundary: 'keepIn' });

    s().updateVolume(id, { preset: 'water', drag: 0.3 });
    const vol2 = s().entities.find((e) => e.id === id)!.trigger!.volume!;
    expect(vol2).toMatchObject({ boundary: 'keepIn', preset: 'water', drag: 0.3 });
  });

  it('bumps sceneRevision and is a no-op without a trigger', () => {
    const id = s().addVolume('sphere');
    const before = s().sceneRevision;
    s().updateVolume(id, { preset: 'fog' });
    expect(s().sceneRevision).toBeGreaterThan(before);

    const box = s().addPrimitive('box'); // no trigger
    s().updateVolume(box, { preset: 'fog' });
    expect(s().entities.find((e) => e.id === box)!.trigger).toBeUndefined();
  });
});
