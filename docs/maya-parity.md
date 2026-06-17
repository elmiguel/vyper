# Maya Contextual-Menu Parity Reference (Modeling Studio)

A feature-by-feature map of Autodesk Maya's modeling-oriented right-click / marking menus
to our kernel-backed **Modeling Studio** (`src/modeler` + `src/kernel`). Use it as the
parity spec + gap tracker. Maya's RMB menus are generated at runtime from the selection
mode, active tool, and workspace, so this is organized **by component mode** the way artists
think, not by Maya's internal menu tree.

**In-Studio status legend**
- `✓` implemented (wired to the panel and/or right-click menu)
- `◐` partial / approximate (close behaviour, not 1:1 with Maya)
- `○` planned (not implemented yet)
- `—` out of scope for the polygon modeler (NURBS / curves / rigging / animation / shading)

**Shortcuts** are Maya defaults. The **In Studio** key (where present) is what our
[keymap](../src/input/keymaps.ts) binds today (Maya layout); component modes also accept
`1`–`4`. Items marked "menu" appear in the [right-click menu](../src/modeler/modelerMenu.ts)
and/or the [Modeling panel](../src/modeler/ModelerTools.tsx).

**Docs**: links point to the Maya 2024 help portal. Autodesk has no stable per-command URL
scheme — the three GUID deep-links below are the ones with known-stable ids; everything else
links to the help home (search the tool name there). Base:
`https://help.autodesk.com/view/MAYAUL/2024/ENU/`

---

## Selection / component modes

| Feature | Maya key | In Studio | Maya menu | Description | Docs |
|---|---|---|---|---|---|
| Object Mode | F8 | `✓` F8 · 1 | RMB → Object | Select whole objects. | [help] |
| Vertex Mode | F9 | `✓` F9 · 2 | RMB → Vertex | Select vertices. | [help] |
| Edge Mode | F10 | `✓` F10 · 3 | RMB → Edge | Select edges. | [help] |
| Face Mode | F11 | `✓` F11 · 4 | RMB → Face | Select faces. | [help] |
| UV Mode | F12 | `○` | RMB → UV | Select UVs (no UV pipeline yet). | [help] |
| Multi-component | — | `○` | RMB → Multi | Mixed vertex/edge/face selection. | [help] |
| Grow / Shrink Selection | `>` / `<` | `✓` `>` / `<` | RMB → Grow/Shrink | Expand/contract the selection by adjacency (any mode). | [help] |
| Convert Selection | — | `✓` (menu → Select) | RMB → Convert Selection | Convert verts ↔ edges ↔ faces. | [help] |

---

## 1. Object mode

| Feature | Maya key | In Studio | Maya menu | Description | Docs |
|---|---|---|---|---|---|
| Frame Selected | F | `✓` F (menu) | RMB → Frame Selected | Frame the camera on the selection. | [help] |
| Duplicate | ⌘D | `✓` ⌘D (menu) | RMB → Duplicate | Copy the selection as new geometry. | [help] |
| Delete | Del | `✓` Del (menu) | — | Remove the selection (all faces in object mode). | [help] |
| Copy / Paste | ⌘C / ⌘V | `✓` (menu) | Edit → Copy/Paste | Clipboard the selected faces and paste them back. | [help] |
| Select Hierarchy | — | `—` | RMB → Select Hierarchy | Single-mesh studio — no hierarchy. | [help] |
| Select Similar | — | `○` | RMB → Select Similar | Select geometry matching the current selection. | [help] |
| Isolate Select | — | `○` | RMB → Isolate Select | Hide everything except the selection. | [help] |
| Center Pivot | — | `—` | Modify → Center Pivot | Pivot is model-origin in the studio. | [help] |
| Freeze Transformations | — | `—` | Modify → Freeze Transformations | No per-object transform stack here. | [help] |
| Delete History | — | `—` | Edit → Delete by Type → History | Kernel rebuilds; there is no history stack to bake. | [help] |
| Group / Parent / Unparent | — | `—` | Edit / RMB | Scene-graph ops — out of scope. | [help] |
| Rename | — | `—` | RMB → Rename | Model name is the project name. | [help] |
| Template / Reference / X-Ray / Bounding Box | — | `○` | RMB → Display | Display modes (only Wireframe today). | [help] |
| Hide / Show | — | `○` | RMB → Display | Per-component visibility. | [help] |
| Assign / New Material · Hypershade | — | `—` | RMB → Materials | Shading handled by the game editor, not the modeler. | [help] |

---

## 2. Vertex mode

| Feature | Maya key | In Studio | Maya menu | Description | Docs |
|---|---|---|---|---|---|
| Delete Vertex (dissolve) | Del | `✓` Del (menu) | RMB → Delete | Remove vertices, merging surrounding faces. | [help] |
| Connect | — | `✓` (menu) | RMB → Connect Components | Connect two selected verts with a new edge (splits the face). | [help] |
| Add Face | — | `✓` (menu) | Mesh → Fill Hole / Append | Build a face from ≥3 selected verts. | [help] |
| Merge Vertices / to Center | — | `✓` Merge Vertices (menu) | Edit Mesh → Merge | Weld the selected verts to their center. | [help] |
| Average Vertices | — | `✓` (menu) | Edit Mesh → Average Vertices | Relax verts toward neighbour average. | [help] |
| Target Weld | — | `○` | Modeling Toolkit → Target Weld | Drag one vert onto another to merge. | [help] |
| Circularize | — | `○` | Mesh Tools → Circularize | Arrange a selection into a circle. | [help] |
| Relax | — | `◐` Average | Sculpting → Relax | One-step Laplacian via Average Vertices. | [help] |
| Grow / Shrink Selection | `>` / `<` | `✓` `>` / `<` (menu → Select) | RMB → Grow/Shrink | Expand/contract the selection by adjacency. | [help] |
| Select Vertex Loop / Ring | — | `○` | RMB → Select Loop/Ring | Select a connected loop/ring of verts. | [help] |
| Convert Selection | — | `✓` (menu → Select) | RMB → Convert Selection | Convert verts ↔ edges/faces. | [help] |
| Soft Selection | B | `○` | (toggle) | Falloff-weighted component transforms. | [help] |
| Move Along Normal | — | `○` | Edit Mesh → Transform Component | Constrain a move to the vertex normal. | [help] |
| Set / Unlock Normals · Harden/Soften | — | `○` | Mesh Display → Normals | Per-vertex normal editing. | [help] |

---

## 3. Edge mode

| Feature | Maya key | In Studio | Maya menu | Description | Docs |
|---|---|---|---|---|---|
| Insert Edge Loop | — | `✓` Loop Cut tool (menu) | Edit Mesh → Insert Edge Loop Tool | Insert a ring across an edge strip (quad strips or triangle fans), drag to slide the cut. | [GUID-226A…](https://help.autodesk.com/view/MAYAUL/2024/ENU/?guid=GUID-226AECD6-F2C0-48D7-BE16-39E52D77DB84) |
| Multi-Cut | — | `◐` Knife tool (menu) | Mesh Tools → Multi-Cut | Free cut between points; our Knife covers edge-to-edge cuts. | [help] |
| Bridge | — | `✓` (menu) | Edit Mesh → Bridge | Build faces between two edge loops. | [help] |
| Connect Components | — | `✓` Connect | Edit Mesh → Connect | New edge(s) between selected components. | [help] |
| Delete Edge (dissolve) | Del | `✓` Del (menu) | Edit Mesh → Delete Edge | Remove an edge, merging the two faces. | [help] |
| Add Vertex / Divisions | — | `✓` Add Vertex (menu) | Edit Mesh → Add Divisions | Insert a midpoint vertex on the edge. | [help] |
| Bevel | ⌘B | `○` deferred | Edit Mesh → Bevel | Chamfer edges into new faces. (Needs a manifold vertex-split — focused follow-up.) | [GUID-40E3…](https://help.autodesk.com/view/MAYAUL/2024/ENU/?guid=GUID-40E32F44-1EB9-4DC6-8EE4-6A013EEC626F) |
| Offset Edge Loop | — | `○` | Edit Mesh → Offset Edge Loop | Insert paired loops either side of an edge. | [help] |
| Collapse Edge | — | `✓` (menu) | Edit Mesh → Collapse | Collapse selected edges, welding endpoints. | [help] |
| Slide Edge | — | `○` | Edit Mesh → Slide Edge Tool | Slide an edge while preserving topology. | [help] |
| Spin Edge Forward / Backward | — | `○` | Edit Mesh → Spin Edge | Rotate an edge between its two triangles. | [help] |
| Crease Tool | — | `○` | Mesh Tools → Crease Tool | Weight edges for subdivision creasing. | [help] |
| Select Edge Loop / Ring | — | `✓` (menu → Select) | RMB → Select Loop/Ring | Select the edge loop/ring through the seed edge. | [help] |
| Shortest Edge Path | — | `○` | RMB → Shortest Edge Path | Select the shortest edge path between two. | [help] |
| Harden / Soften / Set Edge Hardness | — | `○` | Mesh Display → Normals | Edge normal hardness. | [help] |

---

## 4. Face mode

| Feature | Maya key | In Studio | Maya menu | Description | Docs |
|---|---|---|---|---|---|
| Extrude | ⌘E | `✓` Extrude (menu) | Edit Mesh → Extrude | Pull selected faces into new geometry. | [GUID-77FF…](https://help.autodesk.com/view/MAYAUL/2024/ENU/?guid=GUID-77FF95F8-13E8-48A6-BF82-84078E1F4FD3) |
| Delete Face | Del | `✓` Del (menu) | RMB → Delete | Remove the selected faces. | [help] |
| Duplicate Face | — | `✓` Duplicate (menu) | Edit Mesh → Duplicate Face | Copy faces as independent geometry. | [help] |
| Bridge | — | `✓` (edge loops) | Edit Mesh → Bridge | Connect two face borders. | [help] |
| Bevel | ⌘B | `○` deferred | Edit Mesh → Bevel | Chamfer face borders. (See Edge → Bevel.) | [GUID-40E3…](https://help.autodesk.com/view/MAYAUL/2024/ENU/?guid=GUID-40E32F44-1EB9-4DC6-8EE4-6A013EEC626F) |
| Poke Face | — | `✓` (menu) | Edit Mesh → Poke | Add a center vert and fan-triangulate. | [help] |
| Triangulate | — | `✓` (menu) | Mesh → Triangulate | Split faces into triangles. | [help] |
| Quadrangulate | — | `✓` (menu) | Mesh → Quadrangulate | Merge coplanar triangle pairs into quads. | [help] |
| Extract Face | — | `✓` Extract (menu) | Edit Mesh → Extract | Detach faces into a new shell in the same object. | [help] |
| Detach / Separate | — | `◐` Extract | Mesh → Separate | Extract detaches the shell; full multi-object separate is N/A (single mesh). | [help] |
| Reverse Normals | — | `✓` (menu) | Mesh Display → Reverse | Flip the winding of the selected faces. | [help] |
| Select Face Loop / Border / Shell | — | `○` | RMB → Select Loop/Shell | Select connected face loops/shells. | [help] |
| Select Similar Faces | — | `○` | RMB → Select Similar | Select faces matching the selection. | [help] |
| Conform Normals | — | `○` | Mesh Display → Conform | Unify winding across the mesh. | [help] |
| Circularize Components | — | `○` | Mesh Tools → Circularize | Arrange the face's verts into a circle. | [help] |

---

## 5. Interactive tools (Modeling Toolkit)

| Tool | Maya key | In Studio | Maya menu | Description | Docs |
|---|---|---|---|---|---|
| Insert Edge Loop | — | `✓` Loop Cut | Mesh Tools | Hover an edge → preview ring → click to cut. | [GUID-226A…](https://help.autodesk.com/view/MAYAUL/2024/ENU/?guid=GUID-226AECD6-F2C0-48D7-BE16-39E52D77DB84) |
| Multi-Cut | — | `◐` Knife | Mesh Tools → Multi-Cut | Click edge points to trace a cut; right-click to finish. | [help] |
| Quad Draw / Draw Poly | — | `◐` Draw Poly | Mesh Tools → Quad Draw | Click ground-plane points to build a face; right-click closes it. (No full retopo snapping yet.) | [help] |
| Target Weld | — | `○` | Modeling Toolkit | Drag-merge verts. | [help] |
| Slide Edge | — | `○` | Edit Mesh | Slide an edge along its neighbours. | [help] |

---

## 6. Component conversion

| Feature | In Studio | Maya menu | Description | Docs |
|---|---|---|---|---|
| To Vertices / Edges / Faces / UVs | `○` | RMB → Convert Selection | Convert the current selection to another component type. | [help] |
| To Vertex Faces / Edge Perimeter / Border / Shell | `○` | RMB → Convert Selection | Topology-aware conversions. | [help] |

---

## 7. Shift+RMB marking menu (create + quick ops)

| Group | Items | In Studio | Description |
|---|---|---|---|
| Create | Cube · Sphere · Cylinder · Plane · Torus · Cone | `✓` Cube/Plane/Grid/Cylinder/Sphere/Cone/Torus | All present (plus Grid). |
| Edit Mesh | Extrude · Bevel · Bridge · Multi-Cut · Insert/Offset Edge Loop | `◐` Extrude/Bridge/LoopCut/Knife (Bevel/Offset planned) | Core ops in. |
| Cleanup | Merge · Separate · Combine · Cleanup · Remesh · Retopologize | `◐` Merge/Extract | Merge + extract in; combine/remesh/retopo planned. |
| Normals | Harden · Soften · Average · Reverse | `○` | Normal editing. |
| UV | Cut · Sew · Unfold · Layout | `○` | UV pipeline. |
| Symmetry | World X · Object X · Topological | `○` | Symmetric editing. |

> A radial **marking menu** (press-and-hold) isn't implemented — our menu is a standard
> click list. The same commands live in the right-click menu instead.

---

## Out of scope for the polygon modeler

These Maya contexts target data the Modeling Studio doesn't edit; some are handled
elsewhere in the app (rigging/animation live in the game editor's Modeling Studio rig mode).

| Maya context | Status | Note |
|---|---|---|
| UV mode / UV Toolkit (Cut/Sew/Unfold/Layout/Optimize/Straighten/Stack/Normalize) | `○` | No UV pipeline yet — a sizeable follow-up. |
| Sculpting brushes (Sculpt/Smooth/Relax/Grab/Pinch/Flatten/Foamy/Scrape/Wax) | `○` | The game editor has a separate terrain/mesh sculpt; the kernel modeler doesn't. |
| Curve components (CV / Edit Point / Hull / Curve Point) | `—` | No NURBS/curve geometry. |
| NURBS surfaces (Isoparm / Surface Point / Stitch / Rebuild) | `—` | Polygon-only kernel. |
| Camera viewport menu (bookmarks, look-through, shading modes) | `◐` | Frame + Wireframe exist; bookmarks/shading modes don't. |
| Outliner / Hypershade | `—` | No scene graph / shading network in the modeler. |
| Rigging (joints, skinning, paint weights) | `—` | Lives in the game editor's rig tools, not the modeler. |
| Animation (keys, tangents, playback) | `—` | Game-editor timeline, not the modeler. |
| Hotbox (spacebar) | `○` | We use docked panels + the right-click menu instead. |

---

## Summary — what reaches parity today

**Implemented (`✓`/`◐`):** component modes · pick + frame · move/rotate/scale gizmo ·
7 primitives (cube/plane/grid/cylinder/sphere/cone/torus) · extrude · connect · add face ·
add vertex (edge divisions) · delete/dissolve per mode · bridge · insert edge loop (Loop Cut)
· multi-cut (Knife) · draw poly · **triangulate · quadrangulate · poke · reverse normals ·
extract · merge vertices · collapse edge · average vertices · grow/shrink (`>`/`<`) · edge
loop/ring select · convert selection** · duplicate · copy/paste · undo/redo · wireframe ·
grid snap · right-click context menu with shortcuts.

**Remaining gaps (by artist frequency):** **Bevel** (deferred — needs manifold vertex-split)
· Target Weld (interactive) · Offset Edge Loop · Slide/Spin/Crease Edge · Circularize ·
Conform Normals · Select Loop/Shell (face) · Combine/Remesh/Retopo · Soft Selection ·
Symmetry · then the **UV toolkit** and **sculpting brushes** (the two largest subsystems).
