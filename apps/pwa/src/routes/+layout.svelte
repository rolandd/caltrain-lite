<script lang="ts">
  import favicon from '$lib/assets/favicon.svg';
  import { initSchedule } from '$lib/sync';
  import type { StaticSchedule } from '@packages/types/schema';
  import { setContext } from 'svelte';

  let { children } = $props();

  let schedule = $state<StaticSchedule | null>(null);
  let error = $state<string | null>(null);

  // Expose schedule to children via context
  setContext('schedule', {
    get value() {
      return schedule;
    },
  });

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
  <link rel="icon" href={favicon} />
</svelte:head>

{#if schedule}
  {@render children()}
{:else if error}
  <div class="center" role="alert">
    <div class="error-icon">⚠️</div>
    <p class="error">{error}</p>
    <button onclick={() => window.location.reload()}>Retry</button>
  </div>
{:else}
  <div class="center" role="status" aria-busy="true" aria-label="Loading schedule">
    <div class="spinner"></div>
    <p>Loading schedule...</p>
  </div>
{/if}

<style>
  .center {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    color: #e8e8ed;
    background: #0f0f13;
    gap: 1rem;
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 4px solid rgba(255, 255, 255, 0.1);
    border-left-color: #4e9bff;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .error {
    color: #ff6b6b;
    font-weight: 600;
  }

  .error-icon {
    font-size: 2rem;
  }

  button {
    background: #222;
    border: 1px solid #333;
    color: #fff;
    padding: 0.5rem 1rem;
    border-radius: 8px;
    cursor: pointer;
    font-size: 1rem;
  }
</style>
