import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline';
import { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera';
import type { Scene } from '@babylonjs/core/scene';
import type { Engine } from '@babylonjs/core/Engines/engine';
import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import type { GameMode, RenderSettings } from '@/types';
import { RenderPipeline, configureDefaultPipeline } from './RenderPipeline';
import { DEFAULT_LAYER } from './sceneBuilders';
import { canvasThumbnail } from './thumbnail';
import type { Tracked } from './sceneSync';

/** What the render controller needs from its owning SceneManager. */
export interface RenderCtx {
  scene: Scene;
  engine: Engine;
  editorCamera: ArcRotateCamera;
  gameCamera: UniversalCamera;
  mode: GameMode;
  /** Hidden master backbuffer (preserveDrawingBuffer) — source for thumbnails. */
  master: HTMLCanvasElement;
  /** Shared (live) tracked-mesh map, for keeping shadow casters/receivers in step. */
  tracked: Map<string, Tracked>;
}

/**
 * Owns high-quality 3D rendering output: the post-processing/shadow/IBL pipeline,
 * the editor-effects mute toggle, frame-render error recovery, the Game-Style
 * look-preview cameras, and viewport thumbnail capture. 3D-only — in 2D the
 * pipeline is never created and the render methods are no-ops. Extracted from
 * SceneManager to keep that class focused on scene lifecycle.
 */
export class RenderController {
  /** High-quality 3D rendering (post-processing, shadows, IBL). 3D mode only. */
  private pipeline?: RenderPipeline;
  /** Most recent render settings applied (re-used when the editor-effects toggle flips). */
  private lastRender?: RenderSettings;
  /** Editor-session toggle: when false, post-processing is suppressed in the scene render. */
  private editorEffectsOn = true;
  private lookPreviewSeq = 0;
  private renderErrorFrames = 0;

  constructor(private readonly ctx: RenderCtx) {
    // High-quality rendering is 3D-only; 2D keeps its flat, unlit look.
    if (ctx.mode === '3d') this.pipeline = new RenderPipeline(ctx.scene, [ctx.editorCamera, ctx.gameCamera]);
  }

  /**
   * Render one frame, tolerating the transient window after a post-process pipeline is created.
   * With parallel (async) shader compilation, a render effect's `_effect` is briefly null while
   * its shader compiles; the PostProcessRenderPipelineManager reads `postProcess.isSupported`
   * (→ `_effect.isSupported`) during `_gatherRenderTargets` and throws on that null for a frame or
   * two. The condition self-heals once the shader finishes, so we swallow the throw for those
   * frames (throttled logging) instead of letting it kill the whole render loop. Any other render
   * error is logged and rethrown.
   */
  renderFrame(): void {
    try {
      this.ctx.scene.render();
      this.renderErrorFrames = 0;
    } catch (err) {
      const msg = String((err as Error)?.message ?? err);
      const isCompileRace = msg.includes("reading 'isSupported'") || msg.includes('isSupported');
      if (!isCompileRace) throw err;
      // Transient post-process compile race: skip this frame; it renders next frame.
      if (this.renderErrorFrames < 3) console.warn('[SceneManager] post-process not ready this frame, skipping:', msg);
      this.renderErrorFrames++;
      // If it never recovers (~1s of failures), the post-processing pipeline is genuinely broken —
      // tear it down so the raw scene stays visible rather than leaving a silent black viewport.
      if (this.renderErrorFrames === 60) {
        console.error('[SceneManager] post-processing kept failing; disabling effects to recover the view.');
        this.pipeline?.recoverByDisablingEffects();
      }
    }
  }

  /** Apply scene-wide high-quality render settings (post-processing/shadows/IBL).
   *  No-op in 2D. Re-syncs shadow casters so a shadows toggle takes effect at once. */
  applyRenderSettings(s: RenderSettings) {
    this.lastRender = s;
    if (!this.pipeline) return;
    this.pipeline.apply(s);
    // FOV is a camera property (wide-angle look), not a post-process. Apply it to
    // the game camera only — the orbit editor camera keeps its default so editing
    // navigation feel is unchanged; the Game preview + Game-Style thumbnails render
    // through the game camera, so the chosen FOV shows there.
    this.ctx.gameCamera.fov = (s.fov * Math.PI) / 180;
    // The editor-effects toggle MUTES the post-processing in place (flag flips on
    // the live pipeline) rather than disposing/detaching it — disposing mid-frame
    // froze the multi-view render loop and detaching blanked the view. The saved
    // settings are untouched, so toggling back on restores the authored look.
    this.pipeline.setEffectsMuted(!this.editorEffectsOn, s);
    this.pipeline.syncShadows(this.ctx.tracked.values());
  }

  /** Toggle camera post-processing in the scene render (muted in place). No-op in 2D. */
  setEditorEffects(on: boolean) {
    if (this.editorEffectsOn === on) return;
    this.editorEffectsOn = on;
    if (this.lastRender) this.applyRenderSettings(this.lastRender);
  }

  /** Keep shadow casters/receivers in step with the reconciled scene. */
  syncShadows(tracked: IterableIterator<Tracked>) {
    this.pipeline?.syncShadows(tracked);
  }

  /** Play moves objects → shadows must re-render every frame; editing refreshes on-demand. */
  setShadowsLive(live: boolean) {
    this.pipeline?.setShadowsLive(live);
  }

  /**
   * Register a canvas that renders the LIVE scene through a clone of the game
   * camera, graded by its own DefaultRenderingPipeline configured from `settings`.
   * This is how the Game Style browser shows each preset applied to the real scene
   * side-by-side. The clone mirrors the game camera's view (position/rotation/FOV)
   * every frame so the thumbnails track as the user navigates. 3D only — returns a
   * no-op teardown in 2D (RenderSettings don't apply there). The preview always
   * builds its pipeline regardless of the global HQ toggle, since previewing the
   * look is its whole purpose.
   */
  registerLookPreview(canvas: HTMLCanvasElement, settings: RenderSettings): () => void {
    if (this.ctx.mode === '2d') return () => {};
    const { scene, engine, gameCamera } = this.ctx;
    const cam = new UniversalCamera(`lookPrev_${this.lookPreviewSeq++}`, gameCamera.position.clone(), scene);
    cam.layerMask = DEFAULT_LAYER;
    cam.minZ = gameCamera.minZ;
    cam.maxZ = gameCamera.maxZ;
    const sync = () => {
      cam.position.copyFrom(gameCamera.position);
      cam.rotation.copyFrom(gameCamera.rotation);
      cam.fov = (settings.fov * Math.PI) / 180;
    };
    sync();
    const obs = scene.onBeforeRenderObservable.add(sync);
    const pipeline = new DefaultRenderingPipeline(`lookPrevPipe_${this.lookPreviewSeq}`, true, scene, [cam]);
    configureDefaultPipeline(pipeline, settings);
    engine.registerView(canvas, cam);
    return () => {
      try {
        engine.unRegisterView(canvas);
      } catch {
        /* already gone */
      }
      scene.onBeforeRenderObservable.remove(obs);
      pipeline.dispose();
      cam.dispose();
    };
  }

  /** Grab the last rendered viewport frame as a downscaled JPEG data URL, for use
   *  as a project cover thumbnail. Reads the hidden master backbuffer directly —
   *  `preserveDrawingBuffer` keeps the latest frame available. Returns null if the
   *  engine hasn't drawn yet or a 2D canvas isn't available. */
  captureThumbnail(width = 480): string | null {
    return canvasThumbnail(this.ctx.master, width);
  }

  dispose() {
    this.pipeline?.dispose();
  }
}
