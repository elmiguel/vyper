// Registers Babylon's model-loading plugins as a side effect. Importing this
// module once (from engine.ts) wires up SceneLoader so it can import .obj/.mtl,
// .gltf and .glb files. Babylon's loaders self-register on import; we keep them
// isolated here so the registration point is explicit and tree-shake-safe.
import '@babylonjs/loaders/OBJ';
import '@babylonjs/loaders/glTF';
