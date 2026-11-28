// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>
import { defineEnvVars } from '@sveltejs/kit/env';

// PUBLIC_DOMAIN is evaluated at build/prerender time (static: true) and falls
// back to the empty string if not set; hooks.server.ts then uses its own
// https://transit.example.com default.
// Marking it static is also required with adapter-static + service workers:
// dynamic public vars cause SvelteKit to inject `import { env } from '/_app/env.js'`
// into service-worker.js even when no client code uses them (so adapter-static
// never emits /_app/env.js, breaking service worker registration/updates).
export const variables = defineEnvVars({
  PUBLIC_DOMAIN: { public: true, static: true, schema: (input) => input ?? '' },
});
