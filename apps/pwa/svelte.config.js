import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapter({
      // SPA mode: single fallback page for all routes (Cloudflare Pages)
    }),
    alias: {
      '@packages': '../../packages',
    },
  },
};

export default config;
