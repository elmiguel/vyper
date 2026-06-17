/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative asset paths so the built renderer also loads over file:// inside the
  // Electron desktop shell (harmless for the web deploy, which serves from root).
  base: './',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    open: false,
    proxy: {
      // Forward API calls to the Vyper backend during development.
      '/api': { target: 'http://localhost:8787', changeOrigin: true },
      // Uploaded assets are stored + served by the backend, not Vite's /public.
      '/uploads': { target: 'http://localhost:8787', changeOrigin: true },
    },
  },
  optimizeDeps: {
    // Babylon is large; pre-bundle the heavy entry points.
    include: ['@babylonjs/core', '@babylonjs/inspector'],
    // Havok ships a WASM glue module that must not be pre-bundled (it resolves
    // its .wasm relative to itself). We load the wasm from /public explicitly.
    exclude: ['@babylonjs/havok'],
  },
  test: {
    // jsdom gives React components a DOM to render into under Node.
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // Co-locate tests next to source as *.test.ts(x); also cover the desktop
    // (electron) pure modules like the sync merge logic. Ignore build/deps.
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'electron/**/*.{test,spec}.ts', 'scripts/**/*.{test,spec}.{ts,mts}', 'server/**/*.{test,spec}.ts'],
    exclude: ['node_modules', 'dist', 'dist-electron'],
  },
});
