# High-quality 3D rendering

Vyper renders 3D scenes through Babylon.js with an optional **high-quality
pipeline**: filmic tone mapping, bloom, anti-aliasing, ambient occlusion, dynamic
shadows, image-based lighting (IBL), a colour grade (saturation / warm-cool split),
lens effects (chromatic aberration, depth-of-field, sharpen), a wide-angle camera
FOV, and volumetric god rays. It is **3D-only** — 2D games keep their flat, unlit
sprite look and never construct a pipeline. The whole grade can be applied in one
click from a library of **look presets** (the Game Style browser).

## Where it lives

| Concern | File |
|---|---|
| Settings type + defaults | [src/types/index.ts](../src/types/index.ts) — `RenderSettings`, `defaultRenderSettings()` |
| Store actions | [src/store/slices/designSlice.ts](../src/store/slices/designSlice.ts) — `updateRenderSettings`, `applyLookPreset` |
| Look-preset library | [src/presets/lookPresets.ts](../src/presets/lookPresets.ts) — `LOOK_PRESETS` (Hyperreal Dreamscape, Cinematic, …) |
| Pipeline / shadows / IBL / god rays | [src/babylon/RenderPipeline.ts](../src/babylon/RenderPipeline.ts) — incl. `configureDefaultPipeline`, `colorCurvesFrom`, `GodRayController` |
| Scene wiring + look previews | [src/babylon/SceneManager.ts](../src/babylon/SceneManager.ts) — `applyRenderSettings` (incl. FOV), `registerLookPreview` |
| Store → scene subscription | [src/babylon/engine.ts](../src/babylon/engine.ts) |
| UI — Game Style browser | [src/panels/GameStylePanel.tsx](../src/panels/GameStylePanel.tsx), [LookPresetCard.tsx](../src/panels/LookPresetCard.tsx), [RenderControls.tsx](../src/panels/RenderControls.tsx) |
| UI — Inspector render section | [src/panels/RenderSettings.tsx](../src/panels/RenderSettings.tsx) (shown when nothing is selected) |

## Data flow

`RenderSettings` is stored on the **game design doc** (`design.render`), so it
persists and hydrates through the same `games.settings.design` channel as goals
and the HUD — no database migration. Editing a setting calls `updateRenderSettings`,
which writes a **fresh `design.render` object**. `engine.ts` watches that reference
and calls `SceneManager.applyRenderSettings`, which:

1. reconciles the `DefaultRenderingPipeline` (tone map, bloom, FXAA/MSAA, vignette,
   grain, colour grade, chromatic aberration, depth-of-field, sharpen) via the
   shared `configureDefaultPipeline` helper, and the `SSAO2RenderingPipeline`, both
   attached to **both cameras** (editor + game preview) so the preview matches the
   game;
2. applies the camera **FOV** to the game camera (a camera property, not a
   post-process — the orbit editor camera keeps its default so editing feel is
   unchanged);
3. reconciles **god rays** (`GodRayController`);
4. loads/clears the IBL environment (`scene.environmentTexture` + optional skybox);
5. re-syncs shadows.

## Look presets — the Game Style browser

`LOOK_PRESETS` ([src/presets/lookPresets.ts](../src/presets/lookPresets.ts)) is a
library of art-direction bundles — each a `Partial<RenderSettings>` merged over the
defaults, so a preset only states what it changes. The flagship
**Hyperreal Dreamscape** reproduces the surreal "AI reel" look (wide FOV, heavy
saturation + teal-and-orange split, strong bloom, chromatic aberration, cinematic
depth-of-field, sharpen and god rays); others are Cinematic, Golden Hour, Vibrant
Toon and Noir.

The **Game Style** dock panel ([GameStylePanel.tsx](../src/panels/GameStylePanel.tsx))
shows one tile per preset. Each tile renders the **live scene through a clone of the
game camera** with that preset's grade applied — `SceneManager.registerLookPreview`
registers the tile's canvas as an extra Babylon view with its own
`DefaultRenderingPipeline` (configured by the same `configureDefaultPipeline`).
Tiles render only while on-screen (an `IntersectionObserver`, like the Game preview),
since each is an extra camera + pipeline over the shared scene. Clicking a tile calls
`applyLookPreset`, which merges the preset and stamps `render.lookPreset` (so the
gallery can highlight the active look); any manual edit via `updateRenderSettings`
clears that id, so the look reads as "Custom". Fine-tuning happens in `RenderControls`
below the gallery and shows in the main Scene/Game viewports.

### Colour grade, lens & god rays

- **Colour grade** — `colorCurvesFrom(settings)` (pure, unit-tested) builds an
  image-processing `ColorCurves`: `saturation` drives `globalSaturation`, and
  `warmth` (-1…1) applies a complementary split-tone (warm highlights + cool "blue"
  shadows when positive — the cinematic teal-and-orange grade).
- **Lens** — chromatic aberration, depth-of-field (focus distance / f-stop / focal
  length / blur quality) and sharpen are all built-in `DefaultRenderingPipeline`
  effects, enabled and tuned in `configureDefaultPipeline`. Preset DOF values are
  tuned for outdoor scale (a far focus plane), not the shallow macro defaults.
- **Vignette / film grain** have strength controls (`vignetteWeight`,
  `grainIntensity`). NB: `configureDefaultPipeline` sets every chain toggle
  (bloom/CA/sharpen/DOF/grain) FIRST and configures image processing (tone map +
  colour curves) LAST — each toggle calls the pipeline's `_buildPipeline`, and a
  rebuild after the grade is set leaves colour-curves enabled-but-unbound, which
  renders the frame grayscale. Configuring the grade last avoids that.
- **FOV** — `fov` (degrees) sets the game camera's vertical field of view for the
  wide-angle look. NB: the first/third-person controller assets **own their FOV**
  (their own `fov` field, set via `cameraApi.attachFirstPerson`/`followThirdPerson`)
  — a controlled gameplay camera shouldn't inherit the cinematic look FOV, or a
  wide preset (e.g. 75°) fish-eyes the player view. The look FOV applies to static /
  uncontrolled cameras and the editor preview.
- **God rays** — `GodRayController` (in `RenderPipeline.ts`) owns one
  `VolumetricLightScatteringPostProcess` per camera, all pointing at a shared
  emissive "sun" billboard placed far along the scene's directional light's reverse
  direction. A no-op until god rays are enabled **and** the scene has a directional
  light.

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
and IBL; `shading: 'standard'` keeps the old flat-lit look; `shading: 'foliage'`
is the stylized windy grass material (below). 2D meshes and trigger volumes always
use the unlit StandardMaterial.

| Concern | File |
|---|---|
| Material type + defaults | [src/types/visuals.ts](../src/types/visuals.ts) — `MaterialConfig`, `defaultMaterial()` |
| Material factory (PBR / standard / foliage) | [src/babylon/materials.ts](../src/babylon/materials.ts) — `syncEntityMaterial`, `desiredMatKind` |
| Foliage material (wind + rim) | [src/babylon/foliageMaterial.ts](../src/babylon/foliageMaterial.ts) — `buildFoliageMaterial`, `applyFoliageConfig` |
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

### Foliage material (windy "neon grass")

`shading: 'foliage'` ([buildFoliageMaterial](../src/babylon/foliageMaterial.ts))
builds a **PBR** material — so it shares the scene's lights + IBL exactly like
every other 3D mesh (a StandardMaterial would ignore the environment and read flat
next to PBR neighbours) — augmented by a `MaterialPluginBase` (`FoliagePlugin`):

- **Wind** — injects vertex displacement at the stable
  `CUSTOM_VERTEX_UPDATE_POSITION` point; the sway scales with local height so the
  blade base stays planted and the tip moves. A single per-scene before-render
  clock advances the time uniform for every foliage material, so multi-view
  rendering can't speed up the sway.
- **Rim glow** — injects a view-dependent fresnel at `CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR`,
  brightening `finalColor` toward the silhouette. It uses only variables the PBR
  shader exposes (`normalW`, `vPositionW`, `finalColor`) plus the plugin's own
  camera-position uniform, so it has no dependency on Babylon shader internals.

Tuning (`MaterialConfig.foliage`: wind strength/speed, rim colour/intensity) is in
the Inspector's **Surface** section. The same material is what the grass system
(below) puts on its blades.

### Grass (scattered field over a surface)

A *material* on flat ground can't look like a grass field — grass is **geometry**.
The grass system ([grassSystem.ts](../src/babylon/grassSystem.ts)) grows a field of
**thin-instanced blades** (one draw call) over a host mesh's surface, using the
foliage material so the blades sway + rim-glow.

- Stored as `MeshConfig.grass` (`GrassConfig`) on the host entity, so it persists
  and rebuilds with the terrain. The Game Style panel's **Add grass to selection**
  button sets it; density / blade size / colours / wind are adjustable there.
- Blade placement is sampled in the host's **local** space and the field is parented
  to the host, so it tracks the host transform. For `kind: 'terrain'` hosts the
  blade Y is read straight from the heightfield (`sampleTerrainHeight`, bilinear —
  no raycast); other meshes scatter across the top of their bounding box.
- Placement is deterministic per entity id (a seeded PRNG), so the field is identical
  across rebuilds and in every viewport. `scene` sync (`syncGrass` in
  [sceneSync.ts](../src/babylon/sceneSync.ts)) rebuilds the field only when its
  config/terrain signature (`grassKeyFor`) changes.
- Blade count = `density × surface area`, capped at 60k. The wind sway is shared
  object-space (all blades sway in phase) in this version.

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
