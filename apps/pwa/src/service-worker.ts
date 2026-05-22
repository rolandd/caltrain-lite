/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, prerendered, version } from '$service-worker';

const CACHE = `cache-${version}`;

// Filter out non-essential or potentially problematic files (like Cloudflare _headers)
const ASSETS = new Set(
  [...build, ...files, ...prerendered].filter((file) => {
    // Always keep the root or directory-like paths
    if (file.endsWith('/')) return true;
    const filename = file.split('/').pop();
    return filename && !filename.startsWith('_');
  }),
);

const sw = self as unknown as ServiceWorkerGlobalScope;

sw.addEventListener('install', (event) => {
  async function addFilesToCache() {
    const cache = await caches.open(CACHE);
    await cache.addAll([...ASSETS]);
  }
  event.waitUntil(addFilesToCache());
  sw.skipWaiting();
});

sw.addEventListener('activate', (event) => {
  async function deleteOldCaches() {
    for (const key of await caches.keys()) {
      if (key !== CACHE) await caches.delete(key);
    }
    // Take control of all clients immediately
    await sw.clients.claim();
  }
  event.waitUntil(deleteOldCaches());
});

sw.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  async function respond() {
    const url = new URL(event.request.url);
    const cache = await caches.open(CACHE);

    // 1. Static assets: serve from cache if available
    if (ASSETS.has(url.pathname)) {
      const response = await cache.match(url.pathname);
      if (response) return response;
    }

    // 2. Navigation: try network first, fallback to app shell
    if (event.request.mode === 'navigate') {
      try {
        const response = await fetch(event.request);
        if (response.ok) return response;
      } catch {
        // We are offline or network failed
      }

      // Try matching the root or common app shell entry points
      return (
        (await cache.match('/')) ||
        (await cache.match('/index.html')) ||
        (await cache.match('/404.html')) ||
        Response.error()
      );
    }

    // 3. Default: Network first, then cache match
    try {
      return await fetch(event.request);
    } catch (err) {
      const response = await cache.match(event.request);
      if (response) return response;
      // For anything else, just let the fetch fail naturally
      throw err;
    }
  }

  event.respondWith(respond());
});
