<script lang="ts">
  // SPDX-License-Identifier: MIT
  // Copyright 2026 Roland Dreier <roland@rolandd.dev>

  import { updated, page } from '$app/stores';
  import { dev } from '$app/environment';

  let showBanner = $derived($updated || (dev && $page.url.searchParams.has('test-update')));

  $effect(() => {
    // Check for an update when the application comes back into the foreground
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        updated.check().catch(console.error);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  });

  const reload = () => {
    // SvelteKit's built-in update mechanism ensures the new assets are fetched
    // when we trigger a hard reload.
    window.location.reload();
  };
</script>

{#if showBanner}
  <div
    class="fixed top-0 left-0 right-0 z-50 bg-transit-brand/10 backdrop-blur-lg border-b border-transit-brand/20 px-4 py-3 flex items-center justify-between shadow-lg"
    role="alert"
  >
    <div class="font-medium text-transit-text-primary flex items-center gap-2">
      <!-- Info icon for visual interest -->
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width="2"
        stroke="currentColor"
        class="w-5 h-5 text-transit-brand"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
        />
      </svg>
      A new version is available!
    </div>
    <button
      onclick={reload}
      class="bg-transparent hover:bg-transit-surface-hover-soft border border-transit-border-subtle text-transit-brand px-4 py-2 rounded-[10px] text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap ml-4 flex items-center justify-center"
    >
      Update Now
    </button>
  </div>
{/if}
