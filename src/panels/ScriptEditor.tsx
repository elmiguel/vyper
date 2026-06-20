import Editor from '@monaco-editor/react';
import { ReactFlowProvider } from '@xyflow/react';
import { GitBranch, Code2, RefreshCw, AlertTriangle } from 'lucide-react';
import { useEditorStore } from '@/store/editorStore';
import { NodeEditor } from '@/nodes/NodeEditor';

const API_DTS = `
declare const entity: {
  id: string; name: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  props: Record<string, any>;
  translate(x: number, y?: number, z?: number): void;
  rotate(x: number, y?: number, z?: number): void;
  setPosition(v: { x: number; y: number; z: number }): void;
  /** Return to the authored start position and clear velocity (e.g. respawn after falling). */
  respawn(): void;
};
declare const input: {
  /** True while the key is held. Accepts a single key ("w", "arrowup") or a
   *  "+"-joined combo held at once ("shift+arrowup"). */
  key(name: string): boolean;
  axisX: number;
  axisY: number;
};
declare const time: { elapsed: number; delta: number };
declare function vec(x?: number, y?: number, z?: number): { x: number; y: number; z: number };
declare const scene: any;
/** Reach other objects by id or name (Set/Get Property "target", On Collision "other"). */
declare const world: {
  findObject(name: string): string;
  setProp(target: string, key: string, value: any): void;
  getProp(target: string, key: string): any;
};
declare function onStart(dt: number): void;
declare function onUpdate(dt: number): void;
/** Runs when this entity's physics body collides; \`other\` is the other object's id. */
declare function onCollision(other: string): void;
`;

export function ScriptEditor() {
  const scripts = useEditorStore((s) => s.scripts);
  const activeScriptId = useEditorStore((s) => s.activeScriptId);
  const setActiveScript = useEditorStore((s) => s.setActiveScript);
  const setScriptMode = useEditorStore((s) => s.setScriptMode);
  const updateScriptCode = useEditorStore((s) => s.updateScriptCode);
  const regenerate = useEditorStore((s) => s.regenerateFromGraph);

  const list = Object.values(scripts);
  const active = activeScriptId ? scripts[activeScriptId] : undefined;

  return (
    <div className="panel script-editor" data-tour="scripts">
      <div className="script-tabs">
        {list.map((s) => (
          <button
            key={s.id}
            className={`script-tab ${s.id === activeScriptId ? 'active' : ''}`}
            onClick={() => setActiveScript(s.id)}
          >
            {s.mode === 'nodes' ? <GitBranch size={12} /> : <Code2 size={12} />} {s.name}
          </button>
        ))}
        {list.length === 0 && <span className="empty-hint inline">Add a behaviour from the Inspector to start scripting.</span>}
      </div>

      {active && (
        <>
          <div className="script-bar">
            <div className="segmented">
              <button className={active.mode === 'nodes' ? 'on' : ''} onClick={() => setScriptMode(active.id, 'nodes')}>
                <GitBranch size={12} /> Nodes
              </button>
              <button className={active.mode === 'code' ? 'on' : ''} onClick={() => setScriptMode(active.id, 'code')}>
                <Code2 size={12} /> Code
              </button>
            </div>
            {active.mode === 'code' && (
              active.codeDirty ? (
                <span className="dirty-warn"><AlertTriangle size={12} /> can’t be represented as nodes — graph paused</span>
              ) : (
                <span className="sync-ok"><GitBranch size={12} /> synced ⇄ nodes</span>
              )
            )}
            <div className="spacer" />
            {active.mode === 'code' && active.codeDirty && (
              <button className="mini-btn" onClick={() => regenerate(active.id)} title="Discard this code and rebuild it from the node graph">
                <RefreshCw size={12} /> Reset from nodes
              </button>
            )}
          </div>

          <div className="script-body">
            {active.mode === 'nodes' ? (
              <ReactFlowProvider>
                <NodeEditor scriptId={active.id} />
              </ReactFlowProvider>
            ) : (
              <Editor
                key={active.id}
                height="100%"
                defaultLanguage="javascript"
                theme="vs-dark"
                value={active.code}
                onChange={(v) => updateScriptCode(active.id, v ?? '')}
                onMount={(_editor, monaco) => {
                  monaco.languages.typescript.javascriptDefaults.addExtraLib(API_DTS, 'engine-api.d.ts');
                }}
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  fontLigatures: true,
                  scrollBeyondLastLine: false,
                  tabSize: 2,
                  padding: { top: 10 },
                }}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
