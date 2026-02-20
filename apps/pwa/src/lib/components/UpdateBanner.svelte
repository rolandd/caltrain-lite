<script lang="ts">
  // SPDX-License-Identifier: MIT
  // Copyright 2026 Roland Dreier <roland@rolandd.dev>

  import { updated } from '$app/stores';

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

{#if $updated}
  <div
    class="fixed top-0 left-0 right-0 z-50 bg-transit-blue text-white px-4 py-3 flex items-center justify-between shadow-md"
    role="alert"
  >
    <div class="font-medium">A new version is available!</div>
    <button
      onclick={reload}
      class="bg-white/20 hover:bg-white/30 border border-white/50 text-white px-3 py-1.5 rounded text-sm transition-colors cursor-pointer whitespace-nowrap ml-4"
    >
      Update Now
    </button>
  </div>
{/if}
