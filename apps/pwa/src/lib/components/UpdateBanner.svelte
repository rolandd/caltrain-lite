<script lang="ts">
  // SPDX-License-Identifier: MIT
  // Copyright 2026 Roland Dreier <roland@rolandd.dev>

  import InfoIcon from '@lucide/svelte/icons/info';
  import { updated, page } from '$app/state';
  import { dev } from '$app/env';
  import { Button } from '#lib/components/ui/button/index.js';

  let showBanner = $derived(updated.current || (dev && page.url.searchParams.has('test-update')));

  $effect(() => {
    // Clean up update query parameter from address bar if present
    if (typeof window !== 'undefined' && page.url.searchParams.has('v')) {
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('v');
      const newSearch = cleanUrl.searchParams.toString();
      const newUrl = cleanUrl.pathname + (newSearch ? `?${newSearch}` : '') + cleanUrl.hash;
      history.replaceState({}, '', newUrl);
    }

    // Check for an update immediately when the component mounts
    updated.check().catch(console.error);

    // Check for an update when the application comes back into the foreground
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        updated.check().catch(console.error);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Also trigger update check if the Service Worker controller changes in the background
    let swUnsub: (() => void) | undefined;
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const handleControllerChange = () => {
        updated.check().catch(console.error);
      };
      navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
      swUnsub = () => {
        navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      };
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (swUnsub) swUnsub();
    };
  });

  const reload = () => {
    // Append a unique timestamp query parameter to bypass static asset SW cache on reload
    const url = new URL(window.location.href);
    url.searchParams.set('v', Date.now().toString());
    window.location.href = url.toString();
  };
</script>

{#if showBanner}
  <div
    class="fixed top-0 left-0 right-0 z-50 bg-transit-brand/10 backdrop-blur-lg border-b border-transit-brand/20 px-4 py-3 flex items-center justify-between shadow-lg animate-in fade-in slide-in-from-top-2 duration-200"
    role="alert"
  >
    <div class="font-medium text-foreground flex items-center gap-2 text-sm">
      <InfoIcon class="w-4 h-4 text-transit-brand shrink-0" aria-hidden="true" />
      <span>A new version is available!</span>
    </div>
    <Button
      variant="outline"
      size="sm"
      class="text-transit-brand border-transit-border-brand/70 hover:bg-transit-brand-soft-bg/35 ml-4"
      onclick={reload}
    >
      Update Now
    </Button>
  </div>
{/if}
