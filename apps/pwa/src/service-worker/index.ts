/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { version } from '$app/env';
import { assets, immutable, prerendered } from '$app/manifest';

const CACHE = `cache-${version}`;
const sw = self as unknown as ServiceWorkerGlobalScope;

// $app/manifest paths are relative to the app base (no leading slash, and ''
// for the prerendered root page). Resolve against the SW scope directory so
// ASSETS matches URL.pathname lookups and includes '/'.
const BASE_URL = new URL('./', sw.location.href);

// Filter out non-essential or potentially problematic files (like Cloudflare _headers)
const ASSETS = new Set(
  [...immutable, ...assets, ...prerendered]
    .map((file) => new URL(file.path.replace(/^\/+/, ''), BASE_URL).pathname)
    .filter((pathname) => {
      // Always keep the root or directory-like paths
      if (pathname.endsWith('/')) return true;
      const filename = pathname.split('/').pop();
      return Boolean(filename && !filename.startsWith('_'));
    }),
);

sw.addEventListener('install', (event) => {
  async function addFilesToCache() {
    const cache = await caches.open(CACHE);
    await cache.addAll([...ASSETS]);
    await sw.skipWaiting();
  }
  event.waitUntil(addFilesToCache());
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

async function matchCachedShell(): Promise<Response | undefined> {
  try {
    const cache = await caches.open(CACHE);
    return (
      (await cache.match('/')) ||
      (await cache.match('/index.html')) ||
      (await cache.match('/404.html'))
    );
  } catch {
    return undefined;
  }
}

sw.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // Guard against browser DevTools / spec edge case where fetch(event.request) throws
  if (event.request.cache === 'only-if-cached' && event.request.mode !== 'same-origin') {
    return;
  }

  const url = new URL(event.request.url);

  // Never intercept cross-origin requests (e.g. analytics beacons, browser extensions)
  if (url.origin !== sw.location.origin) return;

  // 1. Navigation: cache-first app shell for instant startup (unless forced update or API route)
  if (event.request.mode === 'navigate' && !url.pathname.startsWith('/api/')) {
    const isForcedUpdate = url.searchParams.has('v');

    event.respondWith(
      (async () => {
        if (!isForcedUpdate) {
          const cachedShell = await matchCachedShell();
          if (cachedShell) return cachedShell;
        }

        try {
          const response = await fetch(event.request);
          if (response.ok) {
            // Do not overwrite this SW's cached '/' on forced update: the fresh
            // HTML references new hashed assets that are not in this SW's cache.
            // Let the updated SW install and atomically swap caches instead.
            return response;
          }
          const cachedShell = await matchCachedShell();
          if (cachedShell) return cachedShell;
          return response;
        } catch {
          // We are offline or network failed; fall back to cached app shell
        }

        return (await matchCachedShell()) || Response.error();
      })(),
    );
    return;
  }

  // 2. Precached static assets: cache-first, falling back to network
  if (ASSETS.has(url.pathname)) {
    event.respondWith(
      (async () => {
        try {
          const cache = await caches.open(CACHE);
          const cached = await cache.match(url.pathname);
          if (cached) return cached;
        } catch {
          // Cache Storage unavailable; fall through to network
        }
        return fetch(event.request);
      })(),
    );
    return;
  }

  // 3. Uncached same-origin requests (/api/*, /_app/version.json, chunks from a
  // newer deploy during rolling updates): let the browser handle them natively.
});
