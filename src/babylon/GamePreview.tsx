import { useEffect, useRef } from 'react';
import { getManager } from './engine';
import { useEditorStore } from '@/store/editorStore';
import { HudOverlay } from '@/hud/HudOverlay';
import { useFullscreen } from '@/ui/useFullscreen';
import { Play, Maximize2, Minimize2 } from 'lucide-react';

/** Game preview: same scene rendered through the game camera as a second view. */
export function GamePreview() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(wrapRef);
  const playState = useEditorStore((s) => s.playState);
  const play = useEditorStore((s) => s.play);
  const mode = useEditorStore((s) => s.mode);
  const hudWidgets = useEditorStore((s) => s.design.hud?.widgets ?? []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    let want = false; // whether the preview should currently be rendering
    let unregister: (() => void) | null = null;
    let raf = 0;

    // Register only while the preview is on-screen. Dockview keeps hidden tabs
    // mounted, so without this the game-preview camera would render a full extra
    // view every frame even when its tab isn't visible (≈2× scene fill-rate).
    const tick = () => {
      if (!want || unregister) return;
      const manager = getManager();
      if (manager && canvas) unregister = manager.registerPreview(canvas);
      else raf = requestAnimationFrame(tick);
    };
    const setWant = (v: boolean) => {
      if (v === want) return;
      want = v;
      if (v) tick();
      else {
        cancelAnimationFrame(raf);
        unregister?.();
        unregister = null;
      }
    };

    const io = new IntersectionObserver(([e]) => setWant(e.isIntersecting), { threshold: 0.01 });
    const ro = new ResizeObserver(() => getManager()?.resize());
    if (wrap) {
      io.observe(wrap);
      ro.observe(wrap);
    }
    return () => {
      io.disconnect();
      ro.disconnect();
      cancelAnimationFrame(raf);
      unregister?.();
    };
  }, []);

  return (
    <div className="viewport-wrap" data-tour="preview" ref={wrapRef}>
      <canvas ref={canvasRef} className="babylon-canvas" />
      {/* HUD overlay — what the player sees, live during play. */}
      <HudOverlay widgets={hudWidgets} playing={playState === 'playing'} />
      <div className="viewport-badge">Game · play camera · {mode === '2d' ? '2D' : '3D'}</div>
      <button
        className="preview-fullscreen"
        onClick={toggleFullscreen}
        title={isFullscreen ? 'Exit full screen' : 'Play full screen'}
        aria-label={isFullscreen ? 'Exit full screen' : 'Play full screen'}
      >
        {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
      </button>
      {playState === 'editing' && (
        <button className="preview-play" onClick={play}>
          <Play size={16} /> Play
        </button>
      )}
    </div>
  );
}
