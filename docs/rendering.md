# High-quality 3D rendering

Vyper renders 3D scenes through Babylon.js with an optional **high-quality
pipeline**: filmic tone mapping, bloom, anti-aliasing, ambient occlusion, dynamic
shadows, and image-based lighting (IBL). It is **3D-only** — 2D games keep their
flat, unlit sprite look and never construct a pipeline.

## Where it lives

| Concern | File |
|---|---|
| Settings type + defaults | [src/types/index.ts](../src/types/index.ts) — `RenderSettings`, `defaultRenderSettings()` |
| Store action | [src/store/slices/designSlice.ts](../src/store/slices/designSlice.ts) — `updateRenderSettings` |
| Pipeline / shadows / IBL | [src/babylon/RenderPipeline.ts](../src/babylon/RenderPipeline.ts) |
| Scene wiring | [src/babylon/SceneManager.ts](../src/babylon/SceneManager.ts) — `applyRenderSettings`, shadow collectors |
| Store → scene subscription | [src/babylon/engine.ts](../src/babylon/engine.ts) |
| UI | [src/panels/RenderSettings.tsx](../src/panels/RenderSettings.tsx) (Inspector, shown when nothing is selected) |

## Data flow

`RenderSettings` is stored on the **game design doc** (`design.render`), so it
persists and hydrates through the same `games.settings.design` channel as goals
and the HUD — no database migration. Editing a setting calls `updateRenderSettings`,
which writes a **fresh `design.render` object**. `engine.ts` watches that reference
and calls `SceneManager.applyRenderSettings`, which:

1. reconciles the `DefaultRenderingPipeline` (tone map, bloom, FXAA/MSAA, vignette,
   grain) and the `SSAO2RenderingPipeline`, both attached to **both cameras**
   (editor + game preview) so the preview matches the game;
2. loads/clears the IBL environment (`scene.environmentTexture` + optional skybox);
3. re-syncs shadows.

## Shadows

`ShadowController` (inside `RenderPipeline.ts`) keeps one `ShadowGenerator` per
shadow-casting light. After every `SceneManager.sync()` the manager collects:

- **lights** — directional / point / spot only (`castsShadows()`; hemispheric can't);
- **casters** — geometry-bearing meshes on `DEFAULT_LAYER` (game objects, not editor
  helpers or trigger wireframes), including model child meshes.

Each generator's render list is set to the caster set and every caster gets
`receiveShadows = true`. Generators are rebuilt only when shadow **resolution**
changes (fixed at creation); everything else is applied live each sync.

### Controls (Render Settings → Shadows)

`shadowParamsFrom(settings)` (pure, unit-tested) maps the settings to generator
parameters; `ShadowController.configure` applies them per light:

- **Edge** (`shadowType`): `hard` (no filtering, crisp), `soft` (PCF), or
  `contact` (contact-hardening / PCSS — sharp where objects meet, softening with
  distance; directional & spot lights only, PCF fallback for point lights).
- **Softness** (`shadowSoftness`, 0–1): PCF sample quality band (low/med/high) and
  the contact-hardening penumbra width (`contactHardeningLightSizeUVRatio`).
- **Darkness** (`shadowDarkness`, 0–1): shadow opacity (mapped to `setDarkness`,
  inverted — 1 = fully dark).
- **Resolution** (`shadowQuality`): 512 / 1024 / 2048 shadow-map px.
- **Bias / Normal bias**: depth + normal-offset bias to tune shadow acne vs
  peter-panning.

Directional lights get `autoCalcShadowZBounds` so the depth range tracks the scene
(crisper contact + correct penumbra scaling).

## Environment / IBL

`environmentUrl` points to a prefiltered `.env` / `.dds` cube (loaded via
`CubeTexture.CreateFromPrefilteredData`). It drives reflections and ambient light;
with `skybox` on it is also drawn as the background. The asset browser (see the
CC0 importer) populates this URL — until then it is empty and the section shows a
hint.

## Defaults

`defaultRenderSettings()` enables the pipeline with ACES tone mapping, soft bloom,
FXAA and shadows; SSAO, vignette and grain are off (heavier / stylistic). 2D games
ignore all of this.

## HiDPI / resolution

The editor renders through Babylon's multi-view system (one master canvas copied
into each view). Babylon renders each view at `clientSize / hardwareScalingLevel`,
so on a Retina/HiDPI display the default (level 1) renders at half the physical
resolution and looks pixelated once upscaled. `SceneManager` sets
`engine.setHardwareScalingLevel(1 / devicePixelRatio)` (capped at 2×, math in
[src/babylon/viewResize.ts](../src/babylon/viewResize.ts)) so both views render at
native resolution.

**Why hardware scaling and not a canvas-size hack:** picking divides pointer
coordinates by the same `hardwareScalingLevel` (`CreatePickingRayToRef`). Resizing
the canvas backing store directly (leaving the level at 1) makes the render
viewport larger than the pointer space, so click-selection lands at the wrong
position and misses objects. Using `hardwareScalingLevel` keeps render resolution
and picking in sync.

## Materials (PBR)

Primitive meshes carry an optional `MeshConfig.material` (`MaterialConfig`, in
[src/types/visuals.ts](../src/types/visuals.ts)). In 3D, lit meshes default to a
**PBR** surface (metallic/roughness + texture maps) that reacts to the pipeline
and IBL; `shading: 'standard'` keeps the old flat-lit look. 2D meshes and trigger
volumes always use the unlit StandardMaterial.

| Concern | File |
|---|---|
| Material type + defaults | [src/types/visuals.ts](../src/types/visuals.ts) — `MaterialConfig`, `defaultMaterial()` |
| Material factory (PBR vs standard) | [src/babylon/materials.ts](../src/babylon/materials.ts) — `syncEntityMaterial`, `desiredMatKind` |
| Store action | [src/store/slices/entitySlice.ts](../src/store/slices/entitySlice.ts) — `updateMaterial` |
| Material presets | [src/store/slices/materialSlice.ts](../src/store/slices/materialSlice.ts) — `saveMaterialPreset`, `applyMaterialPreset` |
| UI | [src/panels/MaterialEditor.tsx](../src/panels/MaterialEditor.tsx) (Inspector → Mesh section) |
| Model texture overrides | [src/babylon/modelLoader.ts](../src/babylon/modelLoader.ts) — `material.mapAssignments` |

### Material presets (apply a whole material)

Per-channel slots aside, a **material preset** is a full `MaterialConfig` saved at
the game level (`MaterialPreset`, persisted in `games.settings.materials`). The
Inspector's **Material** dropdown applies one to the selected mesh in a single
click (`applyMaterialPreset` replaces the mesh's material wholesale); **Save**
captures the current mesh's material as a named preset. Importing a CC0 material
from the asset browser auto-registers a preset (named after the material) and
applies it to the selection — so the assets path feeds the Inspector picker.

`SceneManager.sync()` calls `syncEntityMaterial`, which rebuilds the material only
when its class must change (shading toggle, trigger toggle) and otherwise patches
in place. `desiredMatKind` decides PBR vs StandardMaterial. The mesh's `color` is
the base/albedo tint; texture-map fields (`baseColorMap`, `normalMap`,
`roughnessMap`, `aoMap`, `emissiveMap`) hold served texture **URLs**. The
roughness map is a grayscale image fed to the green channel of Babylon's
`metallicTexture` (metalness stays scalar — CC0 sets are mostly dielectric and
ship separate gray maps). Models (glTF/GLB) already arrive with their own PBR
materials; `mapAssignments` lets an OBJ material name be overridden with a texture.

## CC0 asset library (Poly Haven / ambientCG)

The asset browser has a **CC0 Library** tab that browses free public-domain
materials and HDRIs and imports them through the server.

| Concern | File |
|---|---|
| Provider parsers (pure) | [server/cc0.ts](../server/cc0.ts) |
| Catalog + import endpoints | [server/assetUploads.ts](../server/assetUploads.ts) — `/api/assets/cc0/catalog`, `/api/assets/cc0/import` |
| Client API | [src/api/client.ts](../src/api/client.ts) — `browseCc0`, `importCc0` |
| UI | [src/assets/Cc0Browser.tsx](../src/assets/Cc0Browser.tsx) (inside `AssetBrowser`) |

The server proxies each provider's catalogue (avoiding CORS) and, on import,
downloads the files server-side into the uploads dir, records them as uploaded
texture assets (same shape as manual uploads, so they merge via `mergeById`), and
returns a `material` map of texture URLs. Poly Haven serves individual files;
ambientCG ships a `.zip` that is extracted with `fflate`. Importing a **material**
applies its maps to the selected mesh (via `updateMaterial`); importing an
**HDRI** sets `design.render.environmentUrl` (loaded as the IBL environment — see
`RenderPipeline`, which handles `.hdr` via `HDRCubeTexture` and `.env`/`.dds` via
prefiltered cubes). This integration lives on the web/Express server, mirroring
the existing upload feature.
