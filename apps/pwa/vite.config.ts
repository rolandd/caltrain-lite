import devtoolsJson from 'vite-plugin-devtools-json';

// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>
import { sveltekit } from '@sveltejs/kit/vite';

import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const scheduleDataPath = resolve(__dirname, 'src/lib/schedule-data.json');

/**
 * Vite plugin that serves local schedule data during development.
 *
 * Intercepts:
 *   GET /api/schedule → serves src/lib/schedule-data.json
 *   GET /api/meta     → returns a lightweight meta stub derived from the file
 *
 * Only active in dev mode (configureServer is a no-op in production builds).
 */
function devScheduleApiPlugin() {
  return {
    name: 'dev-schedule-api',
    configureServer(server: import('vite').ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/api/schedule') {
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

        if (req.url === '/api/meta') {
          // Build a lightweight meta stub so the PWA's version-check logic
          // doesn't trigger a redundant re-download on every dev reload.
          const schedule = JSON.parse(readFileSync(scheduleDataPath, 'utf-8'));

          const meta = {
            v: schedule.m.v,
            e: schedule.m.e,
            u: schedule.m.u,
            sv: schedule.m.sv,
            realtimeAge: 9999, // no realtime in dev
          };

          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(meta));

          return;
        }

        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [tailwindcss(), sveltekit(), devScheduleApiPlugin(), devtoolsJson()],
});
