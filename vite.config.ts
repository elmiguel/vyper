/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
    // Co-locate tests next to source as *.test.ts(x); ignore build/deps.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist'],
  },
});
