import type { Handle } from '@sveltejs/kit/hooks';

// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>
import { PUBLIC_DOMAIN } from '$app/env/public';

export const handle: Handle = async ({ event, resolve }) => {
  return resolve(event, {
    transformPageChunk: ({ html }) => {
      // Prioritize environment variable, fallback to default for local dev if not defined
      let domain = 'https://transit.example.com';
      if (PUBLIC_DOMAIN) {
        try {
          const url = new URL(PUBLIC_DOMAIN);
          if (url.protocol === 'https:') {
            domain = url.origin;
          }
        } catch {
          // ignore invalid URLs that fail to parse
        }
      }

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
