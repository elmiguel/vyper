import { useEffect, useRef } from 'react';
import { getManager } from '@/babylon/engine';
import type { RenderSettings } from '@/types';

/**
 * One preset tile in the Game Style browser. Renders the LIVE scene through a clone
 * of the game camera graded with this preset's settings (via
 * SceneManager.registerLookPreview), so the user compares looks on their own scene.
 *
 * The preview renders only while the card is on-screen (IntersectionObserver),
 * mirroring GamePreview — each card is an extra camera + pipeline over the shared
 * scene, so off-screen cards must not render. The grade shown is the preset's
 * canonical settings; fine-tuning happens in the controls below and shows in the
 * main viewports.
 */
export function LookPresetCard({
  label, description, settings, active, onSelect,
}: {
  label: string;
  description: string;
  settings: RenderSettings;
  active: boolean;
  onSelect: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Keep the latest settings without re-subscribing the effect every render.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    const canvas = canvasRef.current;
    let want = false;
    let unregister: (() => void) | null = null;
    let raf = 0;

    const tick = () => {
      if (!want || unregister) return;
      const manager = getManager();
      if (manager && canvas) unregister = manager.registerLookPreview(canvas, settingsRef.current);
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
    if (canvas) io.observe(canvas);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
      unregister?.();
    };
  }, []);

  return (
    <button
      className={`look-card ${active ? 'active' : ''}`}
      onClick={onSelect}
      title={description}
      aria-pressed={active}
    >
      <div className="look-thumb">
        <canvas ref={canvasRef} className="look-thumb-canvas" />
      </div>
      <span className="look-card-label">{label}</span>
    </button>
  );
}
