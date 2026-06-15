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

On launch you get the **home screen** (project picker): create a game or open a
saved one. Each game has multiple **scenes** you switch between from the toolbar;
**⌘/Ctrl+S** (or the Save button) persists the active scene's entities, the game's
scripts, and the play-camera. Use the **Home** button to save and return to the picker.

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
- **Scene viewport** — editor camera, grid, pick-to-select, move gizmo.
- **Game preview** — the *same* scene rendered through the play camera (Babylon
  multi-view), with an inline Play button.
- **Script editor** (center) — per-entity behaviours, toggled between **Nodes**
  and **Code**.
- **Debugger** (bottom) — live console (captures `console.*` from scripts),
  level filters, repeat-collapsing, and live FPS / mesh counters.
- **Inspector** (right) — transform, mesh/light properties, custom props, and
  attached behaviours. Shows **live** transforms while playing.

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

## Source map

```
src/
  store/        editorStore (scene/scripts/play) + consoleStore (logs)
  babylon/      SceneManager (engine), engine.ts (store↔scene wiring), viewports
  nodes/        nodeTypes (spec registry), EngineNode, NodeEditor, codegen (graph→code), codeparse (code→graph)
  runtime/      ScriptRuntime (compile + lifecycle + input + console capture)
  panels/       Toolbar, Hierarchy, Inspector, ScriptEditor, ConsolePanel
  layout/       EditorLayout (resizable panes)
```

`scripts/smoke.ts` (`npx tsx scripts/smoke.ts`) exercises codegen + the runtime
compile path without a browser.
