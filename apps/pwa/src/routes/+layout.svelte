<script lang="ts">
  // SPDX-License-Identifier: MIT
  // Copyright 2026 Roland Dreier <roland@rolandd.dev>

  import { initSchedule } from '$lib/sync';
  import type { StaticSchedule } from '@packages/types/schema';
  import { setContext } from 'svelte';
  import '../app.css';

  let { children } = $props();

  let schedule = $state<StaticSchedule | null>(null);
  let error = $state<string | null>(null);

  // Expose schedule to children via context
  setContext('schedule', {
    get value() {
      return schedule;
    },
  });

  import InstallPrompt from '$lib/components/InstallPrompt.svelte';
  import UpdateBanner from '$lib/components/UpdateBanner.svelte';

  $effect(() => {
    initSchedule((newSchedule) => {
      console.log('Schedule updated in background, refreshing UI...');
      schedule = newSchedule;
    })
      .then((data) => {
        schedule = data;
      })
      .catch((err) => {
        console.error('Init failed:', err);
        error = 'Failed to load schedule. Using offline mode?';
        // In a real app, we might want to try harder or show a specific offline error
        // But initSchedule already tries DB first.
      });
  });
</script>

<svelte:head>
  <link rel="icon" href="/icon.svg" />
</svelte:head>

<InstallPrompt />
<UpdateBanner />

{#if schedule}
  {@render children()}
{:else if error}
  <div
    class="flex flex-col items-center justify-center h-screen text-transit-text bg-transit-bg gap-4"
    role="alert"
  >
    <div class="text-[2rem]">⚠️</div>
    <p class="text-transit-red font-semibold">{error}</p>
    <button
      class="bg-[#222] border border-[#333] text-white px-4 py-2 rounded-lg cursor-pointer text-lg"
      onclick={() => window.location.reload()}>Retry</button
    >
  </div>
{:else}
  <div
    class="flex flex-col items-center justify-center h-screen text-transit-text bg-transit-bg gap-4"
    role="status"
    aria-busy="true"
    aria-label="Loading schedule"
  >
    <div
      class="w-10 h-10 border-4 border-white/10 border-l-transit-blue rounded-full animate-spin"
    ></div>
    <p>Loading schedule...</p>
  </div>
{/if}
