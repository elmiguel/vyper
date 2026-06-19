# Modeling Studio — polygon editing, CSG, primitives

Build and edit 3D meshes in the **3D Modeling area** — a standalone, Maya-style
workspace separate from the game editor. From the home screen choose **Start 3D
Modeling** (or open a saved model); models persist through the same project system as
games (tagged `kind: 'model'`, see [projectStore.ts](../src/store/projectStore.ts)) and
open in [ModelerLayout](../src/modeler/ModelerLayout.tsx) instead of the game editor.
There you can spawn editable primitives, enter **Edit Mode** to push geometry around at
the vertex/edge/face level, sculpt, combine meshes with CSG booleans, rig + animate, and
save creations to the asset library so they drop into any game.

## Viewport + selection (Maya-style)

The modeler uses **Maya navigation** ([mayaCamera.ts](../src/babylon/mayaCamera.ts)):
**Alt+Left** tumbles, **Alt+Middle** tracks/pans, **Alt+Right** dollies; the wheel always
zooms. Plain clicks stay free for selecting. In Edit Mode you can:

- **Click** a vertex/edge/face to select, **Shift+click** to add.
- **Drag on empty space** to **marquee box-select** ([MeshMarquee.ts](../src/babylon/MeshMarquee.ts)).
- **Grow / Shrink** the selection, **Select All**, and (edges) **Loop / Ring** — pure
  topology walks in [selectionOps.ts](../src/babylon/editmesh/selectionOps.ts).
- **Frame** the camera on the selection (or whole mesh).

| Concern | File |
|---|---|
| Editable-mesh core (adjacency model, import/export, weld/merge, normals/adjacency, triangulate) | [src/babylon/editmesh/EditableMesh.ts](../src/babylon/editmesh/EditableMesh.ts) |
| Modeling operators — core face ops | [src/babylon/editmesh/meshOps.ts](../src/babylon/editmesh/meshOps.ts) (extrude/inset/subdivide/bevel) |
| Modeling operators — loop cut + slide rails | [src/babylon/editmesh/loopCutOps.ts](../src/babylon/editmesh/loopCutOps.ts) |
| Modeling operators — connect/bridge/split-loops | [src/babylon/editmesh/topologyOps.ts](../src/babylon/editmesh/topologyOps.ts) |
| Operator dispatch (`runMeshOp`) | [src/babylon/editmesh/meshEditOps.ts](../src/babylon/editmesh/meshEditOps.ts) |
| Knife geometry (edge-point insert + path cut) | [src/babylon/editmesh/knife.ts](../src/babylon/editmesh/knife.ts) |
| Free-form sculpt brushes (draw/inflate/smooth/flatten/grab/pinch) | [src/babylon/editmesh/sculptBrush.ts](../src/babylon/editmesh/sculptBrush.ts) |
| Clean-topology primitives (box/plane/grid/cylinder) | [src/babylon/editmesh/primitives.ts](../src/babylon/editmesh/primitives.ts) |
| Component overlays (points/edges/face highlight) | [src/babylon/editmesh/MeshEditOverlay.ts](../src/babylon/editmesh/MeshEditOverlay.ts) |
| Component move gizmo | [src/babylon/MeshComponentGizmo.ts](../src/babylon/MeshComponentGizmo.ts) |
| Interactive tool sessions (loop cut / knife) + host | [MeshLoopCutSession.ts](../src/babylon/MeshLoopCutSession.ts), [MeshKnifeSession.ts](../src/babylon/MeshKnifeSession.ts), [MeshToolHost.ts](../src/babylon/MeshToolHost.ts) |
| Edit-Mode controller (picking, gizmo, ops, tools, commit) | [src/babylon/MeshEditController.ts](../src/babylon/MeshEditController.ts) |
| Scene API | [src/babylon/SceneManager.ts](../src/babylon/SceneManager.ts) — `setMeshEdit`, `setMeshComponent`, `meshEditOp`, `applyBoolean` |
| Store state + actions | [src/store/slices/meshEditSlice.ts](../src/store/slices/meshEditSlice.ts) — `beginMeshEdit`, `endMeshEdit`, `setMeshComponent`, `setMeshSculptBrush`, `setMeshTool`, `commitMeshGeometry`, `saveMeshToLibrary` |
| Store ↔ scene wiring | [src/babylon/engine.ts](../src/babylon/engine.ts) |
| CSG init + boolean | [src/babylon/csg.ts](../src/babylon/csg.ts) — `ensureCsgReady`, `bakeBoolean` |
| Custom mesh build/extract | [src/babylon/customMesh.ts](../src/babylon/customMesh.ts) — `buildCustomMesh`, `toCustomGeometry` |
| UI | [src/panels/ModelingTools.tsx](../src/panels/ModelingTools.tsx) (reuses [ModelingPanel.tsx](../src/panels/ModelingPanel.tsx) for CSG) |

## Focused object (one mesh, many islands)

A studio mesh can hold several objects (connected islands — primitives are added "beside"
each other). To keep edits from jumping between them, there's an **active (focused) object**:

- **Object mode** sets it — clicking an object (island) focuses it (and selects it).
- In **Vertex/Edge/Face** modes, picking + editing **lock to the focused object**; clicks on
  other objects are ignored so the working object doesn't change. The first component pick
  (when nothing is focused yet) focuses the island it touches.
- Non-focused objects render **dimmed** (a subtle vertex-color multiply — `mesh.hasVertexAlpha`
  is forced off so the colors only darken, never make the mesh transparent) and aren't pickable
  while a component mode is active; Object mode shows everything bright so you can pick any to focus.
- To work on a different object, switch to Object mode and click it.

**Grouping.** Several objects can be grouped to focus/select/transform as one unit: in Object
mode shift-click them and press **Group** (`⌘/Ctrl+G`); **Ungroup** (`⇧⌘/Ctrl+G`) splits a
group back into separate objects. Clicking any member of a group focuses the whole group.

Identity is tracked by each island's **centroid** ([modelerFocus.ts](../src/modeler/modelerFocus.ts),
`ActiveObject`; groups in [modelerGroups.ts](../src/modeler/modelerGroups.ts), `ObjectGroups`):
the kernel reassigns ids on every edit, so after each rebuild the focused island(s) and group
members are re-found as the nearest centroids. The lock + dim live in
[modelerPicking.ts](../src/modeler/modelerPicking.ts) (`createPickActions`) and the viewport's
dim/hover gating ([buildIslandColors](../src/modeler/modelerSceneGeom.ts)).

## Component modes (object / vertex / edge / face)

The kernel-backed edit viewport ([ModelerScene.ts](../src/modeler/ModelerScene.ts) +
[modelerStore.ts](../src/modeler/modelerStore.ts)) is **not stuck in face editing**. A
**component mode** decides what a click selects and what the transform gizmo moves,
switched with number keys or the toolbar's mode group ([ModelerToolbar.tsx](../src/modeler/ModelerToolbar.tsx)):

| Key | Mode | Click picks | Gizmo transforms |
|---|---|---|---|
| **1** | Object | the whole model | every vertex (move/rotate/scale the object) |
| **2** | Vertex | nearest vertex | the selected vertices |
| **3** | Edge | nearest edge | both endpoints of the selected edges |
| **4** | Face | the face under the cursor | the selected faces' vertices |

Object mode is the default, and the model opens already selected so the move gizmo is
ready immediately — pick the **Move/Rotate/Scale** tool (or its keymap shortcut) and drag.
**Shift+click** adds, **Ctrl/⌘+click** removes, a plain click replaces, in any component
mode; clicking empty space clears.

**Hover feedback + loop selection** work in all three component modes (driven from
`ModelerScene`'s pointer observable; the loop seed is the edge nearest the cursor, passed to
`applyPick` as `loopEdge`):

- **Hover** highlights the component under the cursor in a distinct magenta (`#ff2e97`,
  separate from the yellow selection) so you can see what a click will grab — the vertex,
  edge, or face per the active mode. Rendered by [modelerHover.ts](../src/modeler/modelerHover.ts).
- **Loop selection** picks a whole loop in the active mode:
  - **Edge** → **double-click** an edge selects its **edge loop**
    ([`edgeLoop`](../src/kernel/selectionOps.ts) — one edge fixes the loop unambiguously;
    continues through valence-4 vertices, stops at irregular ones, so e.g. cube corners don't
    extend). Shift/Ctrl+double-click add/remove the loop. Detection is manual (two quick
    presses at the same spot), not Babylon's heuristic `POINTERDOUBLETAP`.
  - **Vertex / Face** → a single point or face has no inherent loop direction, so select
    **two anchors on the same loop** (click one, Shift+click another) then **Select Loop** —
    the **loop (L)** button in the panel's Edit section, the `L` key, or the right-click
    *Select* submenu. It finds the **vertex loop**
    ([`loopThroughVertices`](../src/kernel/selectionOps.ts)) or **face loop**
    ([`loopThroughFaces`](../src/kernel/selectionOps.ts)) running through both anchors;
    `selectLoop` tries every selected pair, so click order / extra selected components don't
    matter. If the two anchors don't share a clean loop it **falls back to the shortest path
    between them** ([`pathBetweenVertices`](../src/kernel/selectionOps.ts) /
    [`pathBetweenFaces`](../src/kernel/selectionOps.ts)), so any two connected picks always
    produce a result. (It also handles the edge case — loop from one selected edge.)

Internally the selection is component-aware: `modelerStore.selection` holds kernel face
ids, vertex ids, or edge ids depending on the mode (object mode uses the `objectSelected`
flag), and `setComponent` clears the selection on a switch. The viewport works in the
baked geometry's **compacted** index space, so the store keeps compaction maps
(kernel↔compacted vertex ids, plus a vertex-pair→edge-id lookup) to translate picks and
highlights. Vertex/edge picking is screen-space nearest-hit
([modelerSceneGeom.ts](../src/modeler/modelerSceneGeom.ts) `nearestVertex`/`nearestEdge`),
and the highlight overlay is faces (translucent), vertices (points cloud), or edges
(bright lines) per the active mode.

## Inspector (numeric transform + material)

The **Inspector** panel ([ModelerInspector.tsx](../src/modeler/ModelerInspector.tsx),
docked right of the viewport) edits the current selection by number instead of by gizmo
drag — useful for precise, game-ready models.

- **Transform** follows the active component mode (it acts on whatever
  `selectedVertices()` resolves to): the whole object in Object mode, or the picked
  verts/edges/faces in component modes.
  - **Position** — absolute centroid of the selection (X/Y/Z). Editing translates the
    selection so its centroid lands on the typed value.
  - **Rotate°** — a relative angle dialed per axis, applied about the selection's
    centroid. The dial resets when the selection changes (baked geometry has no
    persistent rotation of its own).
  - **Size** — absolute bounding-box extent (W/H/D), scaled about the centroid. A
    zero-extent axis (e.g. a single vertex or a flat plane) is left alone.
  - Each edit runs through the existing live-transform primitives
    (`beginTransform → …Live → endTransform`), so it lands as **one undoable command**,
    exactly like a gizmo drag.
- **Material** edits the project mesh entity the modeler mirrors into (so they travel
  with the model into the game): a base **Color** (`updateMesh`) plus the shared
  [MaterialEditor](../src/panels/MaterialEditor.tsx) for PBR metallic/roughness/emissive
  and texture maps (`updateMaterial`). The viewport tints its base colour live via
  `ModelerScene.setBaseColor`; full PBR preview inside the Studio is a follow-up (the
  material still persists and renders in the game/scene).

The centroid + axis-aligned size come from [selectionBounds.ts](../src/modeler/selectionBounds.ts)
(pure), and the numeric actions live in
[modelerInspectorActions.ts](../src/modeler/modelerInspectorActions.ts).

## Assets + Environment (shared with the game engine)

For a cohesive feel with the rest of the editor, the Studio reuses the game engine's
asset and material components and adds a Studio-only lighting/environment preview.

- **Asset library** — the **Assets** button in the Studio bar opens the same
  [AssetBrowser](../src/assets/AssetBrowser.tsx) + [AssetViewer](../src/assets/AssetViewer.tsx)
  overlays the game editor uses (mounted from [ModelerLayout](../src/modeler/ModelerLayout.tsx)).
  The library is shared state (`useEditorStore.assetLibrary`, loaded once at app start), so
  textures/HDRs imported here flow straight into the Inspector's material maps. Each material
  map slot (Base/Normal/Rough/AO/Emissive) also has an **Import textures…** entry that opens
  the asset browser directly, so you can fetch a texture from where you need it.
- **Environment panel** ([ModelerEnvironmentPanel.tsx](../src/modeler/ModelerEnvironmentPanel.tsx),
  tabbed beside the Inspector) controls a **Studio-only** viewport preview — it never changes
  the shipped game scene:
  - **Environment (IBL)** — image-based lighting + reflections from an HDRI. Environments come
    from the **Assets → CC0** importer (which stores the URL on the shared render settings); a
    freshly imported HDRI auto-applies to the Studio preview. Includes an intensity and an
    optional background skybox.
  - **Lighting** — key (directional) + fill (hemispheric) intensities.
  - **Render** — a mesh renders with its real `PBRMaterial` (reflecting the environment +
    reading its `MaterialConfig`: metallic/roughness/emissive/maps) **as soon as a material is
    assigned**, so textures preview with no extra step. **Lit shading on plain meshes**
    additionally forces PBR lighting on meshes that have no material yet (otherwise they keep
    the flat modeling shading). Plus tone mapping + exposure. The choice is the pure
    `usesLitMaterial(litPreview, material)` in [modelerScenePreview.ts](../src/modeler/modelerScenePreview.ts).
    The kernel produces no UVs, so the viewport auto-generates box / tri-planar UVs
    (`computeBoxUVs` in [modelerSceneGeom.ts](../src/modeler/modelerSceneGeom.ts)) so texture
    maps show with detail; a real UV unwrap is still a follow-up.

These settings **persist with the project**: `studioEnv` lives in the design doc
(`GameDesign.studioEnv`), mirrored from `useModelerStore` on every change via `updateDesign`
and restored on `init()`, so the Studio reopens exactly as you left it.

State lives in `useModelerStore.studioEnv` (type in [visuals.ts](../src/types/visuals.ts), re-exported from [modelerEnvironment.ts](../src/modeler/modelerEnvironment.ts));
the rendering is applied by [StudioPreview](../src/modeler/modelerScenePreview.ts) (env/IBL,
tone mapping, lights, PBR material — mirroring the game's `RenderPipeline`/`materials.ts`
patterns) on the modeler's own Babylon scene. The island-dimming vertex colours still apply in
either material mode, so focus shading is unaffected.

### Make asset (export an object to the library)

The Inspector's **Asset** section has a **Make asset** toggle (shown when a whole object is
selected in Object mode). Checking it exports **just that object** — the focused island — to the
asset library as a `generated` model:

- The island's geometry is extracted on its own (`extractFacesGeometry` in
  [render.ts](../src/kernel/render.ts)), carrying the mesh's **material + colour**
  (`saveModelerObjectAsset`), and any texture maps it uses are ensured in the library too (so
  custom textures travel with it).
- The link is remembered on the entity (`mesh.objectAssets`, keyed by the island's centroid), so
  the toggle reflects state; unchecking removes the asset + link.
- **Generated assets persist with the project** now (`settings.generatedAssets`, hydrated on
  open via `hydrateGeneratedAssets`) — previously they were in-memory only and lost on reload.
  Re-importing into the game studio drops in an editable copy with its material applied.

### Make reference (linked proxy instances)

Once an object is an asset, a **Make reference** toggle marks it as a *linked* asset
(`Asset.reference`). How instances behave when dropped into the game (`addModelEntity`):

- **Reference on** → the instance is tagged with `mesh.linkedAssetId` (a proxy). On every
  project load it re-syncs its geometry/material/colour from the source asset
  (`syncLinkedEntities`, run inside `hydrateScene`), so edits to the source propagate to all
  references. **Saving the model auto-republishes** exported objects (`republishLinkedObjects`
  re-extracts each linked island, re-matched by nearest centroid, and updates its asset in place
  — same id, reference flag kept), so editing the source and saving is enough to update
  references on their next load. `resolveLinkedAssets()` re-syncs already-open instances.
- **Reference off** (default) → the instance is an independent **copy**, unaffected by later
  source changes.

### Project thumbnail

The Studio captures a project cover the same way the game editor does. The shared
[canvasThumbnail](../src/babylon/thumbnail.ts) helper downscales a viewport canvas to a JPEG
data URL; the Studio viewport registers its `ModelerScene` canvas as the active capturer
(`setViewportCapturer` in [projectCover.ts](../src/store/projectCover.ts)), so it takes
precedence over the game `SceneManager` while the Studio is open. On save, model projects run
the same auto-cover rule (`applyAutoCover`) — a thumbnail of the model is captured once per
session when no cover is set, never overwriting a user-chosen cover.

## Kernel operations + interactive tools (Modeling Studio)

The kernel modeler runs modeling operators as pure functions in
[src/kernel/operations/](../src/kernel/operations/) that mutate a polygon soup (dense
positions + face loops) and re-link a fresh half-edge mesh via `buildFromPolygons`
(always valid by construction — see [extrude.ts](../src/kernel/operations/extrude.ts) for
the template, [soup.ts](../src/kernel/operations/soup.ts) for the shared snapshot helper).
Every op runs inside a `snapshotCommand` so it's one undo step, then re-bakes geometry.

| Op | Component | File | Behavior |
|---|---|---|---|
| Extrude | face | [extrude.ts](../src/kernel/operations/extrude.ts) | Region extrude along the averaged normal. |
| Connect | vertex | [connect.ts](../src/kernel/operations/connect.ts) | Connect two selected verts on a face with a new edge (splits the face). |
| Bridge | edge | [bridge.ts](../src/kernel/operations/bridge.ts) | Bridge two selected edge loops with a band of quads. |
| Loop cut | edge (interactive) | [loopcut.ts](../src/kernel/operations/loopcut.ts) | Insert a ring across a strip from a seed edge at slide ratio `t`. Walks **quad strips** (opposite-edge step) *and* **triangle fans** (cone/pole caps — steps around the shared apex), so cones cut cleanly. |
| Knife | interactive | [knife.ts](../src/kernel/operations/knife.ts) | Insert points on edges and connect consecutive ones, splitting crossed faces. |
| Sketch retopo | interactive | [retopo/](../src/modeler/retopo/) | Freehand strokes over the surface form a curve network; each closed 4-sided patch fills with an R×R quad grid fitted to the surface. Commit replaces the mesh with the cage. |
| Delete / Dissolve | face/vertex/edge | [editOps.ts](../src/kernel/operations/editOps.ts) | `deleteFaces` removes faces; `dissolveVertices`/`dissolveEdges` remove a vertex/edge, merging the surrounding faces. |
| Add face / vertex | vertex/edge | [editOps.ts](../src/kernel/operations/editOps.ts) | `addFace` builds a face from selected verts; `splitEdges` inserts a midpoint vertex. |
| Duplicate / Copy-Paste | face/object | [editOps.ts](../src/kernel/operations/editOps.ts) | `duplicateFaces`/`pasteFaces` copy faces as independent geometry. |
| Draw poly | interactive | [editOps.ts](../src/kernel/operations/editOps.ts) | `addPolygon` appends a face from ground-plane points placed with the draw-poly tool. |

### Right-click context menu + shortcuts

The viewport has a themed right-click menu ([modelerMenu.ts](../src/modeler/modelerMenu.ts) →
the shared [ContextMenu](../src/ui/ContextMenu.tsx), which now renders a right-aligned
keyboard-shortcut hint per item). It adapts to the active component mode: New Mesh,
Component Mode (Object/Vertex/Edge/Face — F8–F11 or 1–4), Tools (Loop Cut / Knife / Draw
Poly / Sketch Retopo), the mode's operators (Extrude / Connect+Add Face / Bridge+Add Vertex), Duplicate /
Copy / Paste, a mode-labelled **Delete**, and Frame/Undo/Redo. A tool owning right-click
(knife/draw-poly finish) suppresses the menu.

**Delete key** deletes per mode ([ModelerViewport](../src/modeler/ModelerViewport.tsx) wires
the keymap's `delete`/`copy`/`paste`/`duplicate` actions to the store): faces in face mode,
vertices in vertex mode (dissolve), edges in edge mode (dissolve), all faces in object mode.

The kernel-operation actions are factored into
[modelerEditActions.ts](../src/modeler/modelerEditActions.ts) (`createEditActions`) to keep
the store focused on state/selection/transform.

A full mapping of Maya's per-mode right-click menus to our tools (with shortcuts, Maya menu
paths, docs links, and an implemented/planned status per command) lives in
[maya-parity.md](maya-parity.md) — the parity spec + gap tracker.

**Interactive tools.** Loop cut, knife, draw-poly, and sketch-retopo are driven from the
viewport by [ModelerEditTools.ts](../src/modeler/ModelerEditTools.ts), which `ModelerScene`
forwards pointer events to while `modelerStore.editTool` is set (toggled from the Modeling
panel's **Tools** section):

- **Loop cut** — hovering an edge previews the ring (`loopCutPreview`, yellow guide).
  Left-press-drag-release positions the cut like the Move/Rotate gizmos: the real Babylon
  gizmo appears at the ring (anchored at its centroid) and the camera freezes; in **Move**
  mode the drag slides the ring along the strip (slide ratio `t`), in **Rotate** mode it
  swings the cut to another loop direction at the cursor. Release commits `loopCutCommit`;
  a press-release without dragging cuts at the midpoint. The gizmo lives in
  [ToolGizmo.ts](../src/modeler/ToolGizmo.ts); the pure drag math in
  [loopCutDrag.ts](../src/modeler/loopCutDrag.ts).
- **Knife** — left-clicks drop points snapped to the nearest edge (with a rubber-band
  guide); right-click commits `knifeCommit`. The browser context menu is suppressed over
  the canvas while a tool is active.
- **Sketch retopo** — freehand strokes over the surface (camera freezes while drawing) are
  projected onto the mesh, smoothed into curves, and added to a curve network; a closed
  4-sided region auto-fills with an R×R quad grid hugging the surface (grid resolution R is
  set in the panel). Enter commits the cage as the new mesh. The session lives in
  [retopo/SketchTopoSession.ts](../src/modeler/retopo/SketchTopoSession.ts) over pure
  modules ([stroke.ts](../src/modeler/retopo/stroke.ts) smoothing,
  [curveNetwork.ts](../src/modeler/retopo/curveNetwork.ts) graph + 4-cycle detection,
  [patchGrid.ts](../src/modeler/retopo/patchGrid.ts) Coons fill,
  [surfaceProject.ts](../src/modeler/retopo/surfaceProject.ts) closest-point fitting). It
  implements a 4-sided-patch subset of the sketch-retopo technique (Takayama et al.,
  SIGGRAPH 2013); N-sided patches + per-edge subdivision are future work.

`Connect`/`Bridge` are instant buttons gated on the active component mode (vertex/edge);
the panel's "Edit" section swaps its operators to match the mode. Live gizmo-drag transforms
are factored into [modelerTransformActions.ts](../src/modeler/modelerTransformActions.ts).

## Quads by default

The studio works in **polygons (quads), not triangle soup**. `EditableMesh` keeps faces
as n-gon loops, and geometry persists its polygon topology in `CustomGeometry.polygons`
(+ welded `polyVerts`), so a mesh re-opens with the exact quads it was saved with. When
a mesh has no stored topology (a loaded model, a CSG result, a legacy primitive), import
**quadrangulates** it: coplanar, convex triangle pairs are greedily merged into quads
(`EditableMesh.quadrangulate`), so a triangulated box becomes 6 quads and a sphere's
bands become quad strips with stray triangles only where the topology forces them. The
GPU still renders triangles (the flat-shaded `positions`/`indices`/`normals`); quads are
the *editing/representation* layer. Pass `fromGeometry(geo, { quads: false })` to keep
raw triangles.

## The editable mesh

The studio works on an `EditableMesh` — a pragmatic, adjacency-aware polygon mesh that
sits on top of the engine's flat-array `CustomGeometry` ({positions, indices, normals,
uvs}). Faces are kept as **n-gon loops** (so extrude/inset make real quads, not triangle
soup) and vertices are **welded** (a shared position is one entry, so moving it moves
every connected face). Edges are derived on demand from the face loops.

- `EditableMesh.fromGeometry(geo)` — welds an incoming triangle soup into an editable
  mesh. `buildEditPrimitive(kind)` builds clean quad topology to model against.
- `toGeometry()` — bakes back to `CustomGeometry`, **flat-shaded by default** (crisp
  hard-surface edges); pass `{ smooth: true }` for shared smooth normals.

The operators in `meshOps.ts` are pure functions over an `EditableMesh` and report the
components they created so the controller can keep the selection live:

The operators are split across three files, all re-exported from `meshOps.ts` so callers
import the whole set from one place: core face ops live in
[meshOps.ts](../src/babylon/editmesh/meshOps.ts) (extrude/inset/subdivide/bevel), loop-cut
in [loopCutOps.ts](../src/babylon/editmesh/loopCutOps.ts), and connect/bridge in
[topologyOps.ts](../src/babylon/editmesh/topologyOps.ts). The controller dispatches them
through [meshEditOps.ts](../src/babylon/editmesh/meshEditOps.ts) (`runMeshOp`).

| Op | Component | Behavior |
|---|---|---|
| Extrude | faces | Region extrude along the averaged normal; interior edges stay welded, only boundary edges grow walls. |
| Inset | faces | Per-face inner cap toward the centroid, bridged with rim quads. |
| Subdivide | faces (or all) | Linear midpoint split; edge midpoints shared across faces (no cracks). |
| Bevel | edges | Single-segment chamfer per selected edge. |
| Loop cut | edges | Inserts a ring of midpoints across a strip of quads from a seed edge (also available as an interactive tool — see below). |
| Merge | verts/edges/faces | Welds the selected vertices to their center. |
| Delete | faces | Removes selected faces. |
| Triangulate | faces (or all) | Fan-triangulates the selected faces (or whole mesh) — the only way quads become triangles in the topology. |
| Connect | verts/edges | Connects the selected vertices with new edges, splitting the shared face (Blender's "J"). |
| Bridge | edges | Bridges two selected edge loops with a band of quads. |

### Interactive tools (loop cut, knife)

Beyond the one-shot operators, two **interactive tools** take over viewport pointer input
while active (`meshEdit.tool`, set via `setMeshTool`; mutually exclusive with the sculpt
brush). Each lives in its own session class fed by a small `MeshToolHost`
([MeshToolHost.ts](../src/babylon/MeshToolHost.ts)) the controller implements:

- **Loop cut** ([MeshLoopCutSession.ts](../src/babylon/MeshLoopCutSession.ts)) — hovering an
  edge previews the ring the cut would insert (`loopCutSegments`); clicking inserts it at the
  edge midpoints, then dragging **slides** the new loop along its rails (a uniform factor
  derived from the cursor's closest point on the seed edge) before release commits.
- **Knife** ([MeshKnifeSession.ts](../src/babylon/MeshKnifeSession.ts)) — left-clicks drop
  points, each snapped to the nearest edge of the face under the cursor; a rubber-band guide
  previews the path; right-click finishes, splitting every crossed face (`applyKnife` in
  [knife.ts](../src/babylon/editmesh/knife.ts), which inserts edge points then connects
  consecutive ones). The viewport context menu is suppressed while a tool is active.

## How editing flows

Entering Edit Mode (`beginMeshEdit(entityId)`) hides the source mesh and hands the
geometry to the `MeshEditController` (3D only), which renders a live **preview** plus
component **overlays** (vertices as points, edges as a line system, selected faces as a
translucent highlight). Clicking picks the nearest vertex/edge/face under the cursor;
a position gizmo on the selection centroid drags the underlying vertices.

The preview is **flat-shaded per face** (each triangle carries its face's normal), matching
`toGeometry`'s baked output — so quads read as crisp flat faces instead of revealing their
fan-triangulation as a shading crease. A viewport **"show surfaces"** toggle
(`showSurfaces` / `setShowSurfaces`) can hide the solid preview to edit through to the
wireframe; the overlays and gizmo stay live.

Edits **commit** back as `CustomGeometry` via `commitMeshGeometry` — once per operator
and once per gizmo drag, so each step is a single undo. While Edit Mode is live the
preview is authoritative, so commits don't force a scene rebuild; exiting bumps the
scene revision once to rebuild the final `kind: 'custom'` mesh. This mirrors how
`SculptController` commits terrain strokes.

## Sculpting

Inside Edit Mode, picking a sculpt brush switches pointer drags from component-select
to free-form sculpting (the camera detaches mid-stroke, like the terrain sculptor). The
brushes are pure functions in [sculptBrush.ts](../src/babylon/editmesh/sculptBrush.ts)
that displace vertices within a smoothstep radius:

| Brush | Effect |
|---|---|
| Draw | Push along the surface normal at the hit (clay-style dab). |
| Inflate | Push along each vertex's own normal (balloon out/in). |
| Smooth | Laplacian relax toward neighbor average (uses `vertexAdjacency`). |
| Flatten | Pull toward the plane through the hit point. |
| Grab | Drag vertices with the cursor — projected onto a view-aligned plane. |
| Pinch | Pull toward the hit point (tighten features). |

Each brush has a **radius**, **strength**, and **invert** control. Sculpting commits
geometry back on pointer-up (one undo per stroke). Use **Subdivide** first to add the
vertex density sculpting needs — brushes only move existing vertices (no dynamic
tessellation yet; see follow-ups).

## CSG booleans

`CSG2` (Babylon, backed by the **Manifold** WASM library) does the boolean.
`bakeBoolean` builds `CSG2.FromMesh` for each operand in **world space**, applies the
op, reads the result into a serializable `CustomGeometry`, and disposes the temporaries.
Because the bake is world-space, the new entity sits at the origin with absolute
coordinates. The originals are kept so you can tweak or delete them.

## Saving to the asset library

`saveMeshToLibrary(name, geo)` adds a `source: 'generated'` `Asset` carrying the baked
geometry inline (no file to load). Generated assets are preserved across asset-manifest
reloads, and `addModelEntity` drops them straight into the scene as an editable
`kind: 'custom'` mesh.

## Not yet implemented (follow-ups)

- **Cross-session persistence of generated assets** — they currently live in the
  in-memory library; persisting them needs server/embedded-DB storage.
- **GLB export** of created meshes (no `@babylonjs/serializers` dependency yet).
- **Dynamic tessellation/remeshing** while sculpting (brushes currently move existing
  vertices only; subdivide manually for density).
- **UV unwrapping/painting** and **rigging + keyframe animation** — the next phases.
- **Offline/desktop CSG** — host the Manifold WASM locally instead of the CDN.
