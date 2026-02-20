// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>

import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapter({
      // SPA mode: single fallback page for all routes (Cloudflare Pages uses 404.html by default)
      fallback: '404.html',
    }),
    alias: {
      '@packages': '../../packages',
    },
  },
};

export default config;
