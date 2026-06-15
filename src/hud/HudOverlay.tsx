import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { HudWidget } from '@/types';
import { useEditorStore } from '@/store/editorStore';
import { getRuntime } from '@/babylon/engine';

/** 720p reference height — widget fontSize/radius are authored at this height and scaled. */
const REF_H = 720;

/** Resolve a widget's displayed number: a live bound prop while playing, else its static value. */
function liveValue(w: HudWidget, props: Record<string, unknown> | null): number {
  if (props && w.bindProp && w.bindProp in props) {
    const n = Number(props[w.bindProp]);
    if (Number.isFinite(n)) return n;
  }
  return w.value;
}

function fmtTimer(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Read live bound props for all widgets from the runtime (only meaningful while playing). */
function useLiveProps(widgets: HudWidget[], playing: boolean): Record<string, Record<string, unknown>> {
  const [vals, setVals] = useState<Record<string, Record<string, unknown>>>({});
  useEffect(() => {
    if (!playing) {
      setVals({});
      return;
    }
    let raf = 0;
    const loop = () => {
      const rt = getRuntime();
      const entities = useEditorStore.getState().entities;
      const resolveId = (target: string) => {
        if (!target) {
          const p = entities.find((e) => /player/i.test(e.name)) ?? entities.find((e) => e.scriptIds.length);
          return p?.id;
        }
        return entities.find((e) => e.id === target || e.name === target)?.id;
      };
      const next: Record<string, Record<string, unknown>> = {};
      for (const w of widgets) {
        if (!w.bindProp) continue;
        const id = resolveId(w.bindTarget);
        const props = id ? rt?.liveTransform(id)?.props : null;
        if (props) next[w.id] = props;
      }
      setVals(next);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, widgets]);
  return vals;
}

function WidgetContent({ w, scale, props }: { w: HudWidget; scale: number; props: Record<string, unknown> | null }) {
  const fs = w.fontSize * scale;
  const val = liveValue(w, props);
  const textStyle: CSSProperties = {
    color: w.color,
    fontSize: fs,
    fontWeight: 700,
    textAlign: w.align,
    width: '100%',
    fontFamily: "'Orbitron','Inter',sans-serif",
    textShadow: '0 1px 2px rgba(0,0,0,0.7)',
    lineHeight: 1.1,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
  };

  switch (w.kind) {
    case 'healthbar':
    case 'bar': {
      const pct = Math.max(0, Math.min(1, w.max ? val / w.max : 0));
      return (
        <div style={{ position: 'absolute', inset: 0, background: w.bg, borderRadius: w.radius * scale, overflow: 'hidden', border: `1px solid ${w.color}` }}>
          <div style={{ position: 'absolute', inset: 0, width: `${pct * 100}%`, background: w.color, transition: 'width 0.1s linear' }} />
          {w.label && (
            <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#04121a', fontSize: Math.max(8, fs * 0.7), fontWeight: 800 }}>
              {w.label} {Math.round(val)}
            </span>
          )}
        </div>
      );
    }
    case 'crosshair':
      return (
        <svg viewBox="0 0 40 40" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
          <line x1="20" y1="4" x2="20" y2="15" stroke={w.color} strokeWidth="2" />
          <line x1="20" y1="25" x2="20" y2="36" stroke={w.color} strokeWidth="2" />
          <line x1="4" y1="20" x2="15" y2="20" stroke={w.color} strokeWidth="2" />
          <line x1="25" y1="20" x2="36" y2="20" stroke={w.color} strokeWidth="2" />
          <circle cx="20" cy="20" r="1.5" fill={w.color} />
        </svg>
      );
    case 'panel':
      return <div style={{ position: 'absolute', inset: 0, background: w.bg, borderRadius: w.radius * scale, border: `1px solid ${w.color}33` }} />;
    case 'button':
      return (
        <div style={{ position: 'absolute', inset: 0, background: w.bg, borderRadius: w.radius * scale, display: 'grid', placeItems: 'center', boxShadow: `0 0 ${10 * scale}px ${w.bg}88` }}>
          <span style={{ ...textStyle, width: 'auto', textAlign: 'center' }}>{w.label}</span>
        </div>
      );
    case 'icon':
      return <div style={{ ...textStyle, textAlign: 'center', fontSize: fs }}>{w.label || '★'}</div>;
    case 'score':
      return <div style={textStyle}>{w.label ? `${w.label} ` : ''}{Math.round(val)}</div>;
    case 'ammo':
      return <div style={textStyle}>{Math.round(val)}{w.max ? ` / ${w.max}` : ''}</div>;
    case 'timer':
      return <div style={textStyle}>{w.label ? `${w.label} ` : ''}{fmtTimer(val)}</div>;
    case 'objective':
      return (
        <div style={{ position: 'absolute', inset: 0, background: w.bg, borderRadius: w.radius * scale, display: 'flex', alignItems: 'center', gap: 6 * scale, padding: `0 ${10 * scale}px`, border: `1px solid ${w.color}33` }}>
          <span style={{ color: w.color, fontSize: fs }}>◎</span>
          <span style={{ ...textStyle, width: 'auto', textAlign: 'left' }}>{w.label}</span>
        </div>
      );
    case 'text':
    default:
      return <div style={textStyle}>{w.label}</div>;
  }
}

/** Read-only HUD layer drawn over a view (the game preview and live play). */
export function HudOverlay({ widgets, playing = false }: { widgets: HudWidget[]; playing?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const props = useLiveProps(widgets, playing);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale((el.clientHeight || REF_H) / REF_H));
    ro.observe(el);
    setScale((el.clientHeight || REF_H) / REF_H);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={ref} className="hud-overlay">
      {widgets.filter((w) => w.visible).map((w) => (
        <div
          key={w.id}
          className="hud-widget-box"
          style={{ left: `${w.x}%`, top: `${w.y}%`, width: `${w.w}%`, height: `${w.h}%`, opacity: w.opacity }}
        >
          <WidgetContent w={w} scale={scale} props={props[w.id] ?? null} />
        </div>
      ))}
    </div>
  );
}
