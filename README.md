# Vyper — React + Babylon.js Game Editor

A browser-based game editor that combines a **Babylon.js** engine with a
**React** UI shell. Build **3D** or **2D** games — the game type is chosen at
creation and the same workspace auto-configures its cameras and rendering to
match. Author entity behaviour visually with a **React Flow** node graph *or*
hand-written JavaScript — and swap between the two at any time, because the node
graph compiles to readable JS that you can keep editing.

## 2D vs 3D

A game's **mode** (`settings.kind`) is picked on the Home screen and persisted
per game. It flows into `editorStore.mode`, which `SceneManager` reads to set up
the scene:

| | 3D | 2D |
| --- | --- | --- |
| Editor camera | orbit (perspective) | orthographic, head-on XY, locked orbit (wheel zoom, ctrl/middle-drag pan) |
| Game camera | free perspective rig | orthographic frame, pans in XY at a fixed depth |
| Grid | XZ floor | XY plane, facing the camera |
| Primitives | box, sphere, cylinder, cone, plane, ground | square, circle, triangle, plane |
| Lighting | lights + lit materials | flat/unlit (emissive) — no lights needed |
| Gizmos | full XYZ | constrained (no Z-move, Z-only rotate, no Z-scale) |

Everything else — Hierarchy, Inspector, scripting, play/stop, history — is shared.

## Stack

| Concern            | Library |
| ------------------ | ------- |
| 3D engine          | `@babylonjs/core` (+ `@babylonjs/inspector` for live scene debugging) |
| UI framework       | React 18 + TypeScript + Vite |
| State              | Zustand (`editorStore`, `consoleStore`) |
| Visual scripting   | React Flow (`@xyflow/react`) |
| Code editor        | Monaco (`@monaco-editor/react`) |
| Dockable layout    | `react-resizable-panels` |
| Icons              | `lucide-react` |

## Run

Vyper is a Vite client **plus** an Express + Postgres backend (games/scenes/scripts persist to the database).

```bash
npm install

# 1. Create the database and point Vyper at it
createdb vyper
cp .env.example .env          # then edit DATABASE_URL if needed

# 2. Start API + client together (server auto-creates its schema on boot)
npm run dev                   # API :8787, client :5173 (proxies /api)

npm run build                 # type-check + production client bundle
npm run typecheck             # client
npm run typecheck:server      # server
```

### Desktop app (Electron)

The same codebase also ships as a standalone, multi-platform desktop app. It uses an
**embedded database** (PGlite — Postgres in WASM), works fully offline, and **syncs
with your Postgres in the background when it's reachable** (newest write wins).

```bash
npm run dev:desktop           # standalone: build UI + launch Electron (no web server)
npm run dev:desktop:hot       # optional hot reload: Vite + Electron @ :5173
npm run build:desktop         # bundle + package installers → release/
npm run typecheck:electron    # electron main/preload/sync
```

`dev:desktop` is self-contained — Electron loads the bundled UI from `dist/` and never
touches the web server. The UI is the same React app, but **data** goes through the
embedded PGlite DB over IPC; the sync engine looks for your Postgres at `DATABASE_URL`
and syncs if reachable, else stays embedded (watch the console for which mode it's in).
A build-target bootstrap (`src/buildEnv.ts` + `src/data/`) selects the provider at
runtime — HTTP `/api` on web, embedded-DB-over-IPC on desktop. See
[docs/desktop.md](docs/desktop.md) for the architecture and sync semantics.

On launch you get the **home screen** (project picker): create a game or model,
or open a saved one. Games and models share one **filterable list** — the
`All / Games / Models / 2D / 3D` chips toggle the view (`All` is exclusive; the
rest form an additive union). Each project card shows an on-theme generated cover
by default. The first **autosave** of a project with no cover assigned captures a
viewport thumbnail as the cover (once per session, and never overwriting an
existing cover); the card's `…` menu lets you **upload a custom cover image**
(drop or click) and the editor toolbar's thumbnail button sets one on demand.
All are stored as a downscaled data URL in `settings.coverImage`. Each game has multiple
**scenes** you switch between from the toolbar;
**⌘/Ctrl+S** (or the Save button) persists the active scene's entities, the game's
scripts, and the play-camera. The toolbar's **thumbnail** button (image icon, next
to History) sets the project's home-screen cover from the current viewport on
demand. Use the **Home** button to save and return to the picker.

## Persistence (Postgres)

Single local user, no auth. Schema is created automatically on server start
(`server/db/bootstrap.ts`); `drizzle.config.ts` + `npm run db:generate`/`db:migrate`
are available for managed migrations.

| Table | Holds |
| ----- | ----- |
| `app_state` | singleton: last-opened game, global prefs |
| `games` | game name/description, active scene, settings |
| `scenes` | per-scene **entities** (JSONB), play-camera, grid flag |
| `scripts` | game-scoped behaviours: mode, code, and **node graph** (JSONB) |

Scenes' entity lists and node graphs are JSONB (the editor already serializes them
to JSON and they round-trip); everything above is relational and queryable.

## Layout

A sleek, fully resizable multi-view workspace:

- **Hierarchy** (left) — scene tree; add/duplicate/delete entities.
- **Scene viewport** — editor camera, grid, pick-to-select, gizmos. A floating
  toolbar over the canvas holds object creation (Mesh/Shape, Player, Light, FX,
  Volume) and the transform tools (Select/Move/Rotate/Scale), keeping the top menu
  uncluttered. Orbit with left-drag; **pan by holding the middle mouse button** (or
  hold **Space** and left-drag — release Space to return to orbit); zoom with the wheel.
- **Game preview** — the *same* scene rendered through the play camera (Babylon
  multi-view), with inline Play / Pause / Stop. **Pause** freezes scripts *and*
  physics so you can adjust the frozen scene (move objects, tweak the inspector);
  **Resume** continues from there. **Stop** always resets the scene to exactly
  how it was before Play — the simulation and any pause-time edits are discarded.
- **Script editor** (center) — per-entity behaviours, toggled between **Nodes**
  and **Code**.
- **Debugger** (bottom) — live console (captures `console.*` from scripts),
  level filters, repeat-collapsing, and live FPS / mesh counters.
- **Inspector** (right) — transform, mesh/light properties, custom props, and
  attached behaviours. Shows **live** transforms while playing. Mesh **Visible**
  (surface) and **Collision** are independent toggles, so an object can be
  invisible yet still collide/trigger (an invisible wall), or visible yet
  pass-through.

## Node ↔ Script round-trip (bi-directional)

Each behaviour (`Script`) holds both a node `graph` and `code`, kept in sync
**both ways** — they're two views of one behaviour:

- Edit the **graph** → `src/nodes/codegen.ts` regenerates the JS, so the Code tab
  mirrors the graph.
- Edit the **code** → `src/nodes/codeparse.ts` parses it back into a graph, so the
  Nodes tab mirrors the code (the Code tab shows a *⇄ synced* badge).
- If the code uses something the node vocabulary can't represent (a loop, an
  arbitrary call, a comparison), the sync **pauses** instead of mangling the
  graph: the script is marked `codeDirty`, the code stays the source of truth,
  and *Reset from nodes* explicitly rebuilds the code from the last good graph.

`scripts/smoke.ts` includes code → graph → code round-trip checks.

## Runtime & scripting API

On **Play**, `ScriptRuntime` snapshots the scene (so Stop restores it
non-destructively), compiles each enabled script with `new Function`, runs
`onStart`, then drives `onUpdate(dt)` from Babylon's render loop. Scripts receive:

```ts
entity   // { name, position, rotation, props, translate(), rotate(), setPosition() }
input    // { key(name), axisX, axisY }   — WASD / arrows
time     // { elapsed, delta }
vec(x,y,z)
scene    // the raw Babylon Scene (advanced)
console  // routed to the in-editor Debugger panel
// define: function onStart(dt) {}  /  function onUpdate(dt) {}
```

Runtime errors are caught and reported in the Debugger; a script that throws is
disabled for the session to avoid 60fps log spam.

## Assets (3D models & textures)

Built-in assets live in `public/assets/` (served by Vite at `/assets/...`, so
Babylon's `SceneLoader` can fetch them at runtime). Supported model formats:
`.obj`/`.mtl`, `.gltf`, `.glb`. OBJ is static — animation preview only applies to
glTF/GLB (which carry `animationGroups`).

`scripts/gen-asset-manifest.mjs` scans that folder and writes
`public/assets/manifest.json` — the list the app reads to populate its built-in
asset library. It runs automatically on `predev`/`prebuild`; run it by hand with
`npm run assets:manifest` after adding or removing files. MTL `map_*` paths must be
relative to the asset folder (not absolute), or the texture won't resolve in the browser.

**Managing assets.** Right-click any asset card for a context menu: Edit/View,
Add to scene (models), Rename, Copy/Paste, Duplicate, Export (downloads the
model + its `.mtl`/textures), and Delete. Deleting an uploaded asset also removes
its files on the server (`DELETE /api/assets/:id`, keeping files shared by other
assets); built-in deletes are session-only. Model-derived texture entries are
view/export-only (manage them via their model).

**Runtime uploads.** The Asset Browser's *Upload* button posts model + texture
files to `POST /api/assets` (Express + multer, see `server/assetUploads.ts`). They're
stored on disk under `ASSET_UPLOAD_DIR` (default `server/uploads/`), served at
`/uploads/...` (proxied by Vite in dev), and catalogued in `uploads.json`. The store
merges built-in + uploaded assets by id (`assetLibrary`); uploaded assets carry
`rootUrl: '/uploads/'`. Upload several files together (the `.obj` with its `.mtl` and
images) so references resolve as siblings.

Model loaders are registered once via `src/babylon/loaders.ts` (imported from
`src/babylon/engine.ts`).

**Editing assets.** The viewer's Edit tab covers metadata, import transform
(scale/rotate/recenter/normalize), a material tint, and a *double-sided* geometry
toggle (renders back faces — fixes inside-out/thin meshes). These are
non-destructive overrides applied at load. **True mesh editing** (vertices,
topology, remeshing) is intentionally out of scope — it belongs in a 3D modeler.
Round-trip: edit the model in Blender, export `.glb`/`.obj`, and re-upload it.

**Placing models in a scene.** An entity's `mesh.kind` can be `'model'` (with
`mesh.assetId`). `SceneManager` loads each asset once (`modelLoader.ts`, cached
`AssetContainer`) and instantiates it under an empty root mesh named with the
entity id; child meshes are tagged `metadata.entityId` so picking/selection
resolve to the entity. The asset's import transform applies under the entity
transform. Known limits (follow-ups): the selection-highlight outline isn't drawn
on models, model physics uses an approximate bounding box, and editing an asset's
transform/material doesn't retroactively update already-placed instances.

## Source map

```
src/
  store/        editorStore = initial state + slices/ (ui, history, entity, effect,
                script, design, persistence, asset); editorTypes, editorDefaults; consoleStore
  assets/       AssetBrowser/AssetViewer/ModelPreview/TextureViewer (asset library UI)
  babylon/      SceneManager (engine + scene reconcile) delegating to PhysicsManager,
                EffectsManager, RenderPipeline (post-processing/shadows/IBL), sceneBuilders,
                cameraRig; engine.ts (store↔scene wiring); loaders.ts (OBJ/glTF registration);
                SceneViewport (canvas) + SceneTools (in-viewport add/transform toolbar, plus
                a session camera-effects toggle that suppresses the post-processing pipeline
                for a clean authoring view — the game's saved render settings are untouched)
  nodes/        nodeTypes (merges nodeSpecs.core/extra, nodeSpec.types), EngineNode,
                NodeEditor, codegen (graph→code), codeparse (lexer/ir/parser/graph → code→graph)
  runtime/      ScriptRuntime (lifecycle loop) + vector, InputState, cameraApi,
                entityApi, ObjectiveTracker
  panels/       Toolbar, Hierarchy, Inspector, ScriptEditor, ConsolePanel
  layout/       EditorLayout (resizable panes)
```

`scripts/smoke.ts` (`npx tsx scripts/smoke.ts`) exercises codegen + the runtime
compile path without a browser.
