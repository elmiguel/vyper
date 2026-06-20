import { describe, it, expect, beforeEach } from 'vitest';
import { makeEntity } from '../editorDefaults';
import { useEditorStore } from '../editorStore';

const s = () => useEditorStore.getState();
const scriptRec = (...ids: string[]) => Object.fromEntries(ids.map((id) => [id, { id }])) as never;

beforeEach(() => {
  useEditorStore.setState({ entities: [], scripts: {}, selectedId: null, activeScriptId: null, lastScriptByEntity: {} });
});

describe('select() auto-focuses an entity behaviour script', () => {
  it('activates the first attached script when selecting an object with scripts', () => {
    const e = makeEntity({ name: 'A' } as never);
    e.scriptIds = ['s1', 's2'];
    useEditorStore.setState({ entities: [e], scripts: scriptRec('s1', 's2') });
    s().select(e.id);
    expect(s().activeScriptId).toBe('s1');
  });

  it('reopens the last-used script when an object is re-selected', () => {
    const a = makeEntity({ name: 'A' } as never); a.scriptIds = ['s1', 's2'];
    const b = makeEntity({ name: 'B' } as never); b.scriptIds = ['s3'];
    useEditorStore.setState({ entities: [a, b], scripts: scriptRec('s1', 's2', 's3') });
    s().select(a.id);
    s().setActiveScript('s2');     // user switches to the second behaviour
    s().select(b.id);              // jump to another object
    expect(s().activeScriptId).toBe('s3');
    s().select(a.id);              // come back to the first object
    expect(s().activeScriptId).toBe('s2'); // remembered, not reset to s1
  });

  it('leaves the active script untouched when selecting an object with no scripts', () => {
    const a = makeEntity({ name: 'A' } as never); a.scriptIds = ['s1'];
    const empty = makeEntity({ name: 'Empty' } as never); // no scripts
    useEditorStore.setState({ entities: [a, empty], scripts: scriptRec('s1') });
    s().select(a.id);
    expect(s().activeScriptId).toBe('s1');
    s().select(empty.id);
    expect(s().activeScriptId).toBe('s1'); // unchanged — don't blank the editor
  });

  it('ignores dangling script ids and falls back to the first valid one', () => {
    const a = makeEntity({ name: 'A' } as never); a.scriptIds = ['ghost', 's2'];
    useEditorStore.setState({ entities: [a], scripts: scriptRec('s2') });
    s().select(a.id);
    expect(s().activeScriptId).toBe('s2');
  });
});
