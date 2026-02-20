// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>

import type { Handle } from '@sveltejs/kit';
import { env } from '$env/dynamic/public';

export const handle: Handle = async ({ event, resolve }) => {
  return resolve(event, {
    transformPageChunk: ({ html }) => {
      // Prioritize environment variable, fallback to default for local dev if not defined
      const domain = env.PUBLIC_DOMAIN || 'https://transit.example.com';

      const metaTags = `
        <!-- OpenGraph / Facebook -->
        <meta property="og:type" content="website" />
        <meta property="og:url" content="${domain}/" />
        <meta property="og:title" content="Caltrain Schedule" />
        <meta property="og:description" content="fast, lightweight PWA for Caltrain schedules and realtime status" />
        <meta property="og:image" content="${domain}/icon-512.png" />

        <!-- Twitter -->
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:url" content="${domain}/" />
        <meta name="twitter:title" content="Caltrain Schedule" />
        <meta name="twitter:description" content="fast, lightweight PWA for Caltrain schedules and realtime status" />
        <meta name="twitter:image" content="${domain}/icon-512.png" />
      `;

      return html.replace('%meta_tags%', metaTags);
    },
  });
};
