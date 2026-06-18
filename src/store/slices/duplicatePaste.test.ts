import { describe, it, expect, beforeEach } from 'vitest';
import { makeEntity } from '../editorDefaults';
import { useEditorStore } from '../editorStore';

const s = () => useEditorStore.getState();

beforeEach(() => {
  useEditorStore.setState({ entities: [], scripts: {}, clipboard: null, selectedId: null, past: [], future: [], sceneRevision: 0 });
});

describe('makeEntity', () => {
  it('always mints a fresh id, even when a partial carries one (clone safety)', () => {
    const a = makeEntity({ name: 'A', id: 'fixed-id' } as never);
    const b = makeEntity({ name: 'B', id: 'fixed-id' } as never);
    expect(a.id).not.toBe('fixed-id');
    expect(a.id).not.toBe(b.id);
  });
});

describe('duplicateEntity', () => {
  it('creates a second, independent entity with a NEW id (not a collision)', () => {
    const id = s().addPrimitive('box');
    s().duplicateEntity(id);
    const ents = s().entities;
    expect(ents).toHaveLength(2);
    expect(ents[0].id).not.toBe(ents[1].id); // distinct → both render
    expect(s().selectedId).toBe(ents[1].id); // copy selected
    // Offset so the copy is visibly separate from the original.
    expect(ents[1].transform.position).not.toEqual(ents[0].transform.position);
  });

  it('clones attached behaviours with fresh script ids (independent, not shared)', () => {
    const id = s().addPrimitive('sphere');
    const sid = s().addScript(id);
    s().duplicateEntity(id);
    const copy = s().entities[1];
    expect(copy.scriptIds[0]).not.toBe(sid);
    expect(s().scripts[copy.scriptIds[0]]).toBeTruthy();
  });

  it('tolerates a stale scriptId with no matching script (skips it, no throw)', () => {
    const id = s().addPrimitive('box');
    // Simulate a dangling reference (e.g. from undo/redo or partial hydration).
    const ent = s().entities.find((e) => e.id === id)!;
    useEditorStore.setState({
      entities: s().entities.map((e) => (e.id === id ? { ...ent, scriptIds: ['ghost-script'] } : e)),
    });
    expect(() => s().duplicateEntity(id)).not.toThrow();
    const copy = s().entities[1];
    expect(copy.scriptIds).toHaveLength(0); // dangling ref dropped, not carried over
  });
});

describe('copy + paste', () => {
  it('pastes an independent copy with a new id and offset position', () => {
    const id = s().addPrimitive('box');
    s().select(id);
    s().copySelected();
    s().paste();
    const ents = s().entities;
    expect(ents).toHaveLength(2);
    expect(ents[0].id).not.toBe(ents[1].id);
    expect(ents[1].transform.position.x).toBeCloseTo(ents[0].transform.position.x + 1);
  });

  it('paste twice yields three distinct entities (no id reuse across pastes)', () => {
    const id = s().addPrimitive('box');
    s().select(id);
    s().copySelected();
    s().paste();
    s().paste();
    const ids = new Set(s().entities.map((e) => e.id));
    expect(ids.size).toBe(3);
  });
});
