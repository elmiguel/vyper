import { useEffect, useRef } from 'react';
import { getManager } from './engine';
import { useEditorStore } from '@/store/editorStore';
import { HudOverlay } from '@/hud/HudOverlay';
import { Play } from 'lucide-react';

/** Game preview: same scene rendered through the game camera as a second view. */
export function GamePreview() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playState = useEditorStore((s) => s.playState);
  const play = useEditorStore((s) => s.play);
  const mode = useEditorStore((s) => s.mode);
  const hudWidgets = useEditorStore((s) => s.design.hud?.widgets ?? []);

  useEffect(() => {
    let unregister: (() => void) | null = null;
    let raf = 0;
    const tryRegister = () => {
      const manager = getManager();
      if (manager && canvasRef.current) {
        unregister = manager.registerPreview(canvasRef.current);
      } else {
        raf = requestAnimationFrame(tryRegister);
      }
    };
    tryRegister();
    return () => {
      cancelAnimationFrame(raf);
      unregister?.();
    };
  }, []);

  return (
    <div className="viewport-wrap" data-tour="preview">
      <canvas ref={canvasRef} className="babylon-canvas" />
      {/* HUD overlay — what the player sees, live during play. */}
      <HudOverlay widgets={hudWidgets} playing={playState === 'playing'} />
      <div className="viewport-badge">Game · play camera · {mode === '2d' ? '2D' : '3D'}</div>
      {playState === 'editing' && (
        <button className="preview-play" onClick={play}>
          <Play size={16} /> Play
        </button>
      )}
    </div>
  );
}
