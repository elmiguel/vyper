import { useEffect, useRef, useState } from 'react';
import { Trash2, ChevronsDownUp } from 'lucide-react';
import { useConsoleStore } from '@/store/consoleStore';
import { getManager } from '@/babylon/engine';
import { useEditorStore } from '@/store/editorStore';
import type { LogLevel } from '@/types';

const LEVELS: LogLevel[] = ['log', 'info', 'warn', 'error', 'debug'];

export function ConsolePanel() {
  const logs = useConsoleStore((s) => s.logs);
  const filter = useConsoleStore((s) => s.filter);
  const collapse = useConsoleStore((s) => s.collapse);
  const { clear, toggleFilter, setCollapse } = useConsoleStore();
  const playState = useEditorStore((s) => s.playState);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [stats, setStats] = useState({ fps: 0, meshes: 0 });

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs]);

  // Live engine stats — sampled a few times a second (not every frame). FPS/mesh
  // counts don't need 60 Hz, and a per-frame React re-render of this panel was
  // pure overhead. Only writes state when a value actually changed.
  useEffect(() => {
    const id = setInterval(() => {
      const m = getManager();
      if (!m) return;
      const next = { fps: Math.round(m.engine.getFps()), meshes: m.scene.meshes.length };
      setStats((prev) => (prev.fps === next.fps && prev.meshes === next.meshes ? prev : next));
    }, 250);
    return () => clearInterval(id);
  }, []);

  const visible = logs.filter((l) => filter[l.level]);

  return (
    <div className="panel console-panel" data-tour="console">
      <div className="panel-head console-head">
        <span>Debugger</span>
        <div className="console-stats">
          <span className={`stat ${playState !== 'editing' ? 'hot' : ''}`}>{stats.fps} fps</span>
          <span className="stat">{stats.meshes} meshes</span>
        </div>
        <div className="spacer" />
        <div className="level-filters">
          {LEVELS.map((lv) => (
            <button key={lv} className={`lvl ${lv} ${filter[lv] ? 'on' : ''}`} onClick={() => toggleFilter(lv)}>
              {lv}
            </button>
          ))}
        </div>
        <button className={`mini-btn ${collapse ? 'on' : ''}`} onClick={() => setCollapse(!collapse)} title="Collapse repeats">
          <ChevronsDownUp size={13} />
        </button>
        <button className="mini-btn" onClick={clear} title="Clear">
          <Trash2 size={13} />
        </button>
      </div>
      <div className="console-scroll" ref={scrollRef}>
        {visible.map((l) => (
          <div className={`log-line ${l.level}`} key={l.id}>
            {l.count > 1 && <span className="log-count">{l.count}</span>}
            <span className="log-source">{l.source}</span>
            <span className="log-msg">{l.message}</span>
          </div>
        ))}
        {visible.length === 0 && <div className="empty-hint">Console output appears here. Press Play to run scripts.</div>}
      </div>
    </div>
  );
}
