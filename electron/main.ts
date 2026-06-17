import 'dotenv/config'; // load DATABASE_URL (etc.) so background sync can find Postgres
import { app, BrowserWindow, protocol } from 'electron';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { openEmbedded } from './db/embedded.js';
import { createDataService } from '../server/dataService.js';
import { registerIpc } from './ipc.js';
import { startSync } from './sync/syncEngine.js';

/**
 * Electron main process. Offline-first: on launch it opens the embedded PGlite DB,
 * serves all data calls from it over IPC, and kicks off a background sync that
 * reconciles with the user's Postgres (DATABASE_URL) whenever it's reachable
 * (newest `updatedAt` wins). The renderer is the same Vite build as the web app.
 *
 * The built renderer is served over a custom `app://` protocol rather than file://,
 * so it behaves like a normal web origin: absolute asset paths resolve and `fetch()`
 * works — which is what lets Babylon's Havok WASM (`/HavokPhysics.wasm`) load.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RENDERER_DIR = path.join(__dirname, '../dist');

// Set by the dev script so the window loads the live Vite server; unset in prod.
const DEV_URL = process.env.VITE_DEV_SERVER_URL;

// Must be registered before `app` is ready. `standard + secure + supportFetchAPI`
// give the renderer a real origin where fetch/XHR (and thus the WASM loader) work.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm', // required: Havok loads via WebAssembly.instantiateStreaming
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

/** Serve the bundled renderer (dist/) over app://local/… , guarding path traversal. */
function registerAppProtocol(): void {
  protocol.handle('app', async (request) => {
    const { pathname } = new URL(request.url);
    const rel = decodeURIComponent(pathname === '/' || pathname === '' ? '/index.html' : pathname);
    const target = path.normalize(path.join(RENDERER_DIR, rel));
    if (target !== RENDERER_DIR && !target.startsWith(RENDERER_DIR + path.sep)) {
      return new Response('forbidden', { status: 403 });
    }
    try {
      const data = await readFile(target);
      const type = MIME[path.extname(target).toLowerCase()] ?? 'application/octet-stream';
      return new Response(data, { headers: { 'content-type': type } });
    } catch {
      return new Response('not found', { status: 404 });
    }
  });
}

async function createWindow(): Promise<void> {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    backgroundColor: '#0b0a1c',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  if (DEV_URL) await loadDevUrl(win, DEV_URL);
  else await win.loadURL('app://local/index.html');
}

/** Load the Vite dev server, retrying briefly in case Electron started first. */
async function loadDevUrl(win: BrowserWindow, url: string, attempts = 20): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    try {
      await win.loadURL(url);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  await win.loadURL(url);
}

async function main(): Promise<void> {
  await app.whenReady();
  registerAppProtocol();
  const dataDir = path.join(app.getPath('userData'), 'vyper-db');
  const embedded = await openEmbedded(dataDir);
  registerIpc(createDataService(embedded.db));
  // Reconcile embedded ↔ Postgres in the background; the app never blocks on it.
  startSync(embedded, process.env.DATABASE_URL);
  await createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

void main();
