import { useEffect, useState } from 'react';

/**
 * Full-screen splash shown on app launch. Displays the animated Vyper logo for
 * `durationMs`, then fades out and unmounts, revealing the app underneath.
 */
export function SplashScreen({ durationMs = 3000 }: { durationMs?: number }) {
  const [leaving, setLeaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const fadeAt = setTimeout(() => setLeaving(true), durationMs);
    const removeAt = setTimeout(() => setDone(true), durationMs + 500);
    return () => {
      clearTimeout(fadeAt);
      clearTimeout(removeAt);
    };
  }, [durationMs]);

  if (done) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0b0923',
        opacity: leaving ? 0 : 1,
        transition: 'opacity 500ms ease',
        pointerEvents: leaving ? 'none' : 'auto',
      }}
    >
      <img
        src="/vyper_animated.svg"
        alt="Vyper"
        style={{ width: 'min(40vw, 320px)', height: 'auto' }}
      />
    </div>
  );
}
