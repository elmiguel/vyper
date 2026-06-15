import { useEffect } from 'react';
import Joyride, { STATUS, type CallBackProps, type Step } from 'react-joyride';
import { useEditorStore } from '@/store/editorStore';

/**
 * Guided product tour (react-joyride), launched from the toolbar "Guide" button.
 * Walks through every major area of Vyper. Targets are stable [data-tour="…"]
 * anchors placed on the relevant components.
 */

const STEPS: Step[] = [
  {
    target: 'body',
    placement: 'center',
    disableBeacon: true,
    title: 'Welcome to Vyper',
    content:
      'A React + Babylon.js game editor. Build scenes in 3D, script behaviour with visual nodes or JavaScript, and play it all live. This quick tour covers every area — use Next, or Skip anytime.',
  },
  {
    target: '[data-tour="add"]',
    title: 'Add objects',
    content: 'Drop meshes (box, sphere, plane…) and lights into the scene from these menus.',
  },
  {
    target: '[data-tour="player"]',
    title: 'Add a player',
    content:
      'One click drops a ready-to-drive player with movement controls already attached — WASD / arrows in 2D, and a mouse-look third-person controller in 3D. Hit Play and move immediately; tune the speeds on the controller node.',
  },
  {
    target: '[data-tour="fx"]',
    title: 'Particle effects',
    content:
      'With an object selected, FX + attaches a particle effect from a preset (fire, smoke, explosion, sparkle, weather…). Tune it in the Inspector, or trigger it from scripts and FX nodes.',
  },
  {
    target: '[data-tour="tools"]',
    title: 'Transform tools',
    content:
      'Select, Move, Rotate, and Scale the active object with on-canvas gizmos. The shortcuts follow your chosen keyboard layout (Maya Q/W/E/R by default).',
  },
  {
    target: '[data-tour="history"]',
    title: 'Undo / redo',
    content: 'Every edit is undoable. Rapid changes (dragging a field or gizmo) collapse into a single step.',
  },
  {
    target: '[data-tour="hierarchy"]',
    title: 'Hierarchy',
    content:
      'The scene tree — every object, light, plus the Game Camera and Grid. Click to select, right-click for context actions.',
    placement: 'right',
  },
  {
    target: '[data-tour="scene"]',
    title: 'Scene viewport',
    content:
      'The editor view. Orbit with the mouse, click to select, drag gizmos to transform. Press F to frame the selection; right-click for a context menu.',
  },
  {
    target: '[data-tour="preview"]',
    title: 'Game preview',
    content: 'The same scene rendered through the Game Camera — what the player sees. Hit Play to run it live here.',
  },
  {
    target: '[data-tour="transport"]',
    title: 'Play · Pause · Stop',
    content:
      'Run the game. Scripts compile and execute against the live scene; Stop restores everything non-destructively so play never mutates your scene.',
  },
  {
    target: '[data-tour="scripts"]',
    title: 'Behaviour editor',
    content:
      'Author logic two ways: a visual node graph or hand-written JavaScript. They round-trip — node graphs compile to readable JS, and you can switch tabs at any time.',
    placement: 'top',
  },
  {
    target: '[data-tour="console"]',
    title: 'Debugger',
    content:
      'Live console output from running scripts, with level filters and FPS / mesh counters. Node graphs also light up their active execution path while playing.',
    placement: 'top',
  },
  {
    target: '[data-tour="inspector"]',
    title: 'Inspector',
    content:
      'Edit the selected object: transform, mesh/light properties, rigid-body physics, particle effects, custom props, and attached behaviours. While playing it shows live values.',
    placement: 'left',
  },
  {
    target: '[data-tour="design"]',
    title: 'Game design & goals',
    content:
      'Define what makes your scene a game: a concept, win/lose conditions, rules, and trackable objectives. Objectives show up as nodes so any object can complete them or react to them — and Vyper announces the win when every primary goal is done.',
  },
  {
    target: '[data-tour="hud"]',
    title: 'HUD editor',
    content:
      'Design the on-screen overlay — health bars, score, timers, a crosshair, objectives — on a 16:9 stage that renders live over the Game preview. Bind a widget to an object’s property to show live values while playing. Works in both 2D and 3D.',
  },
  {
    target: '[data-tour="keymap"]',
    title: 'Keyboard layouts',
    content: 'Switch shortcut layouts — Maya, Blender, or Unity. The whole app re-maps instantly.',
  },
  {
    target: '[data-tour="inspector3d"]',
    title: 'Babylon Inspector',
    content: 'Open Babylon.js’s built-in inspector for deep, low-level scene debugging (materials, meshes, textures…).',
  },
  {
    target: '[data-tour="guide"]',
    title: 'You’re all set 🎉',
    content:
      'Replay this tour anytime from the Guide button. Press “?” for the keyboard shortcuts cheat-sheet. Now go build something.',
  },
];

const NEON = {
  options: {
    primaryColor: '#22d3ee',
    backgroundColor: '#100e26',
    textColor: '#e6e9ff',
    arrowColor: '#100e26',
    overlayColor: 'rgba(4, 4, 12, 0.62)',
    spotlightShadow: '0 0 0 2px rgba(34,211,238,0.5), 0 0 22px rgba(34,211,238,0.35)',
    zIndex: 300,
    width: 372,
  },
  tooltip: { borderRadius: 12, border: '1px solid #4d3fb0', boxShadow: '0 18px 60px rgba(0,0,0,0.6)' },
  tooltipTitle: { fontSize: 15, fontWeight: 800, color: '#22d3ee', fontFamily: 'Orbitron, Inter, sans-serif' },
  tooltipContent: { fontSize: 13, lineHeight: 1.55, padding: '10px 4px' },
  buttonNext: { backgroundColor: '#22d3ee', color: '#04121a', borderRadius: 8, fontWeight: 700, padding: '8px 14px' },
  buttonBack: { color: '#8a86c4', marginRight: 8 },
  buttonSkip: { color: '#8a86c4' },
  spotlight: { borderRadius: 10 },
} as const;

export function Onboarding() {
  const run = useEditorStore((s) => s.runTour);
  const setRunTour = useEditorStore((s) => s.setRunTour);

  // When the tour starts, select a real object so the Inspector step has content.
  useEffect(() => {
    if (!run) return;
    const s = useEditorStore.getState();
    const firstMesh = s.entities.find((e) => e.mesh);
    if (firstMesh) s.select(firstMesh.id);
  }, [run]);

  const handleCallback = (data: CallBackProps) => {
    const finished: string[] = [STATUS.FINISHED, STATUS.SKIPPED];
    if (finished.includes(data.status)) setRunTour(false);
  };

  return (
    <Joyride
      run={run}
      steps={STEPS}
      continuous
      showProgress
      showSkipButton
      disableScrolling
      scrollToFirstStep={false}
      callback={handleCallback}
      locale={{ last: 'Finish', skip: 'Skip tour', next: 'Next', back: 'Back' }}
      styles={NEON}
    />
  );
}
