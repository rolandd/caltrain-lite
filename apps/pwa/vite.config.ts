// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>
import adapter from '@sveltejs/adapter-static';

import devtoolsJson from 'vite-plugin-devtools-json';

// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>
import { sveltekit } from '@sveltejs/kit/vite';

import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import UnpluginTypia from '@typia/unplugin/vite';

const __dirname = dirname(fileURLToPath(import.meta.url));
const scheduleDataPath = resolve(__dirname, 'src/lib/schedule-data.json');

/**
 * Vite plugin that serves local schedule data during development and preview.
 *
 * Intercepts:
 *   GET /api/schedule → serves src/lib/schedule-data.json
 *   GET /api/realtime → serves src/lib/realtime-snapshot.json
 *   GET /api/meta     → returns a lightweight meta stub derived from the file
 */
function devScheduleApiPlugin() {
  const middleware: import('vite').Connect.NextHandleFunction = (req, res, next) => {
    if (req.url === '/api/schedule' || req.url === '/api/v2/schedule') {
      const data = readFileSync(scheduleDataPath, 'utf-8');

      res.setHeader('Content-Type', 'application/json');
      res.end(data);

      return;
    }

    if (req.url === '/api/realtime') {
      const realtimePath = resolve(__dirname, 'src/lib/realtime-snapshot.json');
      const data = readFileSync(realtimePath, 'utf-8');

      res.setHeader('Content-Type', 'application/json');
      res.end(data);

      return;
    }

    if (req.url === '/api/meta' || req.url === '/api/v2/meta') {
      // Build a lightweight meta stub so the PWA's version-check logic
      // doesn't trigger a redundant re-download on every dev reload.
      const schedule = JSON.parse(readFileSync(scheduleDataPath, 'utf-8'));

      const meta = {
        v: schedule.m.v,
        e: schedule.m.e,
        sv: schedule.m.sv,
      };

      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(meta));

      return;
    }

    next();
  };

  return {
    name: 'dev-schedule-api',
    configureServer(server: import('vite').ViteDevServer) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server: import('vite').PreviewServer) {
      server.middlewares.use(middleware);
    },
  };
}

export default defineConfig({
  resolve: {
    alias: {
      // Mirrors the `paths` entry in tsconfig.json (kit's `alias` option is
      // deprecated in favor of subpath imports, which cannot point outside
      // the package root).
      '@packages': resolve(__dirname, '../../packages'),
    },
  },
  plugins: [
    UnpluginTypia(),
    tailwindcss(),
    sveltekit({
      version: { pollInterval: 300000 /* 5 minutes */ },
      adapter: adapter({
        // SPA mode: single fallback page for all routes (Cloudflare Pages uses 404.html by default)
        fallback: '404.html',
      }),
    }),
    devScheduleApiPlugin(),
    devtoolsJson(),
  ],
});
