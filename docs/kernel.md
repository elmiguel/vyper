# 3D modeling kernel (half-edge)

The modeling kernel is the **source of truth for mesh topology**. Babylon never edits a
mesh — it only displays the baked geometry the kernel produces. This is the architecture
the modeling guidance calls for: a real half-edge (DCEL) structure for O(1) adjacency,
command-based undo from day one, validation after every op, n-gons internally, and a
clean separation between kernel / operations / render adapter.

```
src/kernel/
  HalfEdgeMesh.ts   topology: Vertex / HalfEdge / Edge / Face (twin·next·prev) + traversal + serialize
  validate.ts       invariant checks (twin symmetry, closed loops, edge ref-counts, orphans)
  commands.ts       Command interface + CommandStack (do/undo/redo); snapshotCommand
  render.ts         toGeometry (triangulate → CustomGeometry) / fromGeometry (weld → HE)
  primitives.ts     buildPrimitive: cube / plane / grid / cylinder (clean quad topology)
  operations/
    extrude.ts      region extrude (boundary-edge walls, averaged-normal offset)
```

## Why half-edge

Render buffers (`positions[]`, `indices[]`) are great for the GPU and terrible for
editing — there's no way to ask "what faces touch this edge?" without a full scan. A
half-edge mesh stores, per directed edge, its `twin`, `next`, `prev`, owning `face`, and
target `vertex`, so extrude / bevel / loop-cut / dissolve / bridge become local pointer
walks. Faces stay as n-gons (quads); triangulation happens only in `toGeometry`.

## Rules followed (from the guidance)

1. **Topology first, rendering second** — the kernel owns the mesh; `render.ts` is the
   only bridge to Babylon (`HalfEdgeMesh → CustomGeometry → buildCustomMesh`).
2. **Command-based undo from day one** — every edit is a `Command`; `snapshotCommand`
   makes any mutation reversible (capture before/after) without hand-writing inverses.
3. **Validate early** — `validateMesh` runs in tests after every op and is available as a
   dev assertion (`assertValid`); it catches broken twins, open loops, bad edge counts.
4. **n-gons internally** — quads/n-gons are preserved; only render output is triangles.
5. **TypeScript first** — prototype in TS for speed; hot ops can move to Rust/WASM later.
6. **Separation** — kernel / operations / (editor + viewport adapters) are distinct.

## The Modeling Studio runs on the kernel

The 3D Modeling area (`src/modeler/`) is a **standalone modeling + rendering app**, not
the game editor. It has its own Babylon scene and does not touch the game `SceneManager`,
entities, gizmos, scripts, or play loop:

| Piece | Role |
|---|---|
| [ModelerScene.ts](../src/modeler/ModelerScene.ts) | Dedicated Babylon engine/scene/camera (left-drag orbit · middle-drag pan · wheel zoom), lighting, grid; renders the baked kernel geometry + a wireframe overlay; face picking. |
| [modelerStore.ts](../src/modeler/modelerStore.ts) | Owns the `HalfEdgeMesh` + `CommandStack`. Primitives, face selection, extrude, undo/redo — all kernel ops. Mirrors baked geometry into the project's mesh entity so the existing save system persists it. |
| [ModelerViewport.tsx](../src/modeler/ModelerViewport.tsx) | Mounts `ModelerScene`, drives it from the store (rebuild on edit, highlight on selection), routes picks back to the store. |
| [ModelerTools.tsx](../src/modeler/ModelerTools.tsx) | Kernel-driven side panel: primitives, selection, extrude, frame, undo/redo. |
| [ModelerToolbar.tsx](../src/modeler/ModelerToolbar.tsx) | In-viewport transform toolbar (Select/Move/Rotate/Scale) + keyboard-layout dropdown (Maya default · Blender · Unity), reusing the shared [keymaps](../src/input/keymaps.ts). |

Move/rotate/scale gizmos transform the selected faces' vertices about their centroid
(translate/rotate/scale deltas reported by the gizmo, applied in the kernel, committed as
one undoable command). Keys follow the chosen layout — Maya `Q/W/E/R`, Blender `G/R/S`,
Unity `Q/W/E/R` — plus `F` to frame and `mod+Z` / `mod+Shift+Z` to undo/redo.

The flow is exactly the guidance's: **kernel edits the model → `toGeometry` bakes render
buffers → Babylon displays them**. The editing viewport is shaded (it *is* the rendered
result); a separate higher-fidelity render viewport is a planned follow-up.

## Still to migrate / build

- More ops in `kernel/operations/` (inset, bevel, loop cut, subdivide, dissolve, bridge,
  weld) — each a validated `Command`.
- Vertex/edge component modes (today the modeler edits at the face level).
- In-place pointer surgery for ops (today they transform polygons and rebuild — always
  valid, but a full rebuild per op; fine at prototype scale).
- A dedicated render viewport, materials/lighting controls, and booleans via Manifold.
- The older face-list `EditableMesh` (`src/babylon/editmesh/`) still powers the game
  editor's in-scene mesh editing; it can be retired once the kernel covers those paths.

## Not yet implemented (follow-ups)

- In-place pointer surgery for ops (today they transform polygons and rebuild — always
  valid, but a full rebuild per op; fine at prototype scale).
- Booleans via **Manifold** (WASM), UV unwrap, and a Rust/WASM kernel for heavy meshes.
