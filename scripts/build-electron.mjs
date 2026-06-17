// Bundle the Electron main + preload from TypeScript into dist-electron/.
//
//   main.js     ESM  — app lifecycle, embedded PGlite, IPC, background sync
//   preload.cjs CJS  — the contextBridge shim (CJS is the most compatible preload form)
//
// The shared data service + drizzle + pg are bundled in; Electron and PGlite (WASM)
// are kept external (Electron is provided by the runtime; PGlite is unpacked from the
// app's node_modules by electron-builder — see the build config in package.json).
import esbuild from 'esbuild';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

// The server/electron code uses NodeNext-style ".js" import specifiers that point at
// ".ts" source. Map them back to ".ts" during bundling so esbuild can find them.
const tsExtension = {
  name: 'ts-js-extension',
  setup(build) {
    build.onResolve({ filter: /\.js$/ }, (args) => {
      if (!args.importer || !args.path.startsWith('.')) return undefined;
      const tsPath = resolve(dirname(args.importer), args.path.replace(/\.js$/, '.ts'));
      return existsSync(tsPath) ? { path: tsPath } : undefined;
    });
  },
};

const common = {
  bundle: true,
  platform: 'node',
  target: 'node18',
  external: ['electron', '@electric-sql/pglite'],
  plugins: [tsExtension],
  logLevel: 'info',
  sourcemap: true,
};

await esbuild.build({
  ...common,
  entryPoints: ['electron/main.ts'],
  outfile: 'dist-electron/main.js',
  format: 'esm',
  // Some bundled CJS deps call require() at runtime; provide it in the ESM output.
  banner: { js: "import{createRequire as __cr}from'module';const require=__cr(import.meta.url);" },
});

await esbuild.build({
  ...common,
  entryPoints: ['electron/preload.ts'],
  outfile: 'dist-electron/preload.cjs',
  format: 'cjs',
});

console.log('[vyper] electron main + preload bundled → dist-electron/');
