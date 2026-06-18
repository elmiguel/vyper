import { describe, it, expect, beforeEach } from 'vitest';
import type { Entity } from '@/types';
import { useEditorStore } from '@/store/editorStore';
import { designOf } from '@/store/projectStore';
import { useModelerStore } from './modelerStore';
import { defaultStudioEnv } from './modelerEnvironment';

const meshEntity = (): Entity => ({
  id: 'model', name: 'Mesh', parentId: null,
  transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
  mesh: { kind: 'box', color: '#fff', visible: true },
  scriptIds: [], props: {},
});

beforeEach(() => {
  useEditorStore.setState({ entities: [meshEntity()] });
  useEditorStore.getState().updateDesign({ studioEnv: defaultStudioEnv() });
  useModelerStore.setState({ studioEnv: defaultStudioEnv() });
});

describe('Studio environment persistence', () => {
  it('setStudioEnv mirrors into the project design doc (so save captures it)', () => {
    useModelerStore.getState().setStudioEnv({ exposure: 1.5, url: 'env.hdr', litPreview: true });
    const saved = useEditorStore.getState().design.studioEnv;
    expect(saved.exposure).toBe(1.5);
    expect(saved.url).toBe('env.hdr');
    expect(saved.litPreview).toBe(true);
  });

  it('init() restores studioEnv from the project design doc', () => {
    useEditorStore.getState().updateDesign({ studioEnv: { ...defaultStudioEnv(), exposure: 2, tone: 'none', key: 0.4 } });
    useModelerStore.getState().init();
    const env = useModelerStore.getState().studioEnv;
    expect(env.exposure).toBe(2);
    expect(env.tone).toBe('none');
    expect(env.key).toBe(0.4);
  });

  it('designOf round-trips studioEnv through the settings blob (deep-merged over defaults)', () => {
    const settings = { design: { studioEnv: { exposure: 2.5, url: 'studio.hdr' } } };
    const d = designOf(settings);
    expect(d.studioEnv.exposure).toBe(2.5);
    expect(d.studioEnv.url).toBe('studio.hdr');
    // Missing fields fall back to defaults so older saves still hydrate complete.
    expect(d.studioEnv.tone).toBe(defaultStudioEnv().tone);
    expect(d.studioEnv.key).toBe(defaultStudioEnv().key);
  });
});
