import { defineEnvVars } from '@sveltejs/kit/env';

// PUBLIC_DOMAIN falls back to the empty string if not set at build time;
// hooks.server.ts then uses its own https://transit.example.com default.
export const variables = defineEnvVars({
  PUBLIC_DOMAIN: { public: true, schema: (input) => input ?? '' },
});
