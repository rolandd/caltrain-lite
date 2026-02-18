<script lang="ts">
  import { getContext, onMount, onDestroy } from 'svelte';
  import {
    getStationList,
    queryTrips,
    calculateFare,
    type StaticSchedule,
    type TripResult,
  } from '$lib/schedule';
  import { getFavorites, toggleFavorite, isFavorite } from '$lib/favorites';
  import { fetchRealtime } from '$lib/realtime';
  import type { RealtimeStatus } from '@packages/types/schema';

  // Context from layout
  const scheduleCtx = getContext<{ value: StaticSchedule }>('schedule');
  const schedule = $derived(scheduleCtx.value);
  const stations = $derived(schedule ? getStationList(schedule) : []);

  // State
  let origin = $state('');
  let destination = $state('');
  let dateStr = $state(new Date().toISOString().slice(0, 10));
  let results = $state<TripResult[]>([]);
  let searched = $state(false);
  let favorites = $state<string[]>([]);
  let realtime = $state<RealtimeStatus | null>(null);
  let pollInterval: ReturnType<typeof setInterval> | undefined;

  // Favorites logic
  function loadFavorites() {
    favorites = getFavorites();
  }

  function handleToggleFavorite() {
    if (origin && destination) {
      toggleFavorite(origin, destination);
      loadFavorites();
    }
  }

  function selectFavorite(pair: string) {
    const [o, d] = pair.split('-');
    origin = o;
    destination = d;
    search();
  }

  function getStationName(id: string) {
    return schedule?.s[id]?.n || id;
  }

  // Realtime logic
  async function updateRealtime() {
    const data = await fetchRealtime();
    if (data) realtime = data;
  }

  onMount(() => {
    loadFavorites();
    updateRealtime();
    pollInterval = setInterval(updateRealtime, 60000);
  });

  onDestroy(() => {
    if (pollInterval) clearInterval(pollInterval);
  });

  // Search logic
  const search = () => {
    if (!schedule || !origin || !destination || origin === destination) {
      results = [];
      searched = false;
      return;
    }
    // Create date as noon to avoid timezone issues with pure dates
    const date = new Date(dateStr + 'T12:00:00');
    results = queryTrips(schedule, origin, destination, date);
    searched = true;
  };

  const swap = () => {
    const tmp = origin;
    origin = destination;
    destination = tmp;
    if (searched) search();
  };

  // Helpers
  const routeTypeClass = (rt: string): string => {
    const lower = rt.toLowerCase();
    if (lower.includes('limited')) return 'badge limited';
    if (lower.includes('express')) return 'badge express';
    if (lower.includes('bullet')) return 'badge bullet';
    return 'badge local';
  };

  const getDelay = (trainNum: string): number | undefined => {
    if (!realtime) return undefined;
    // Realtime entities use trip_id. For Caltrain this matches train number in static schedule
    // but we need to ensure type safety.
    const entity = realtime.entities.find((e) => e.id === trainNum);
    return entity?.delay;
  };

  const formatDelay = (delaySec: number): string => {
    const mins = Math.round(delaySec / 60);
    if (mins <= 0) return 'On Time';
    return `${mins} min late`;
  };

  const delayClass = (delaySec: number): string => {
    const mins = Math.round(delaySec / 60);
    if (mins >= 10) return 'delay-severe';
    if (mins >= 5) return 'delay-mod';
    return 'delay-minor';
  };

  $effect(() => {
    // If we have origin/dest set (e.g. from favorite), auto search when schedule loads
    if (schedule && origin && destination && !searched) {
      search();
    }
  });

  // Reactive Fare
  let currentFare = $derived(
    schedule && origin && destination ? calculateFare(schedule, origin, destination) : null,
  );
</script>

<svelte:head>
  <title>Caltrain Schedule</title>
  <meta name="description" content="Browse Caltrain schedules and real-time status" />
</svelte:head>

<main>
  <div class="container">
    <header>
      <h1>🚂 Caltrain</h1>
      <!-- Service Alerts -->
      {#if realtime && realtime.alerts.length > 0}
        <div class="alerts" role="alert">
          {#each realtime.alerts as alert (alert.header)}
            <div class="alert-item">
              <strong>{alert.header}</strong>: {alert.description}
            </div>
          {/each}
        </div>
      {/if}
    </header>

    <!-- Favorites List (only if not searched, or always? standard PWA pattern is landing screen) -->
    {#if !searched && favorites.length > 0}
      <section class="favorites" aria-label="Favorite Trips">
        <h2>Favorites</h2>
        <div class="grid">
          {#each favorites as pair (pair)}
            <button class="fav-card" onclick={() => selectFavorite(pair)}>
              <span class="st">{getStationName(pair.split('-')[0])}</span>
              <span class="arrow">→</span>
              <span class="st">{getStationName(pair.split('-')[1])}</span>
            </button>
          {/each}
        </div>
      </section>
    {/if}

    <section class="controls">
      <div class="station-row">
        <div class="field">
          <label for="origin">From</label>
          <select id="origin" bind:value={origin} onchange={search}>
            <option value="">Select station...</option>
            {#each stations as s (s.id)}
              <option value={s.id} disabled={s.id === destination}>{s.name}</option>
            {/each}
          </select>
        </div>

        <button
          class="swap-btn"
          onclick={swap}
          aria-label="Swap stations"
          disabled={!origin && !destination}
        >
          ⇆
        </button>

        <div class="field">
          <label for="destination">To</label>
          <select id="destination" bind:value={destination} onchange={search}>
            <option value="">Select station...</option>
            {#each stations as s (s.id)}
              <option value={s.id} disabled={s.id === origin}>{s.name}</option>
            {/each}
          </select>
        </div>
      </div>

      <div class="row-2">
        <div class="field date-field">
          <label for="date">Date</label>
          <input id="date" type="date" bind:value={dateStr} onchange={search} />
        </div>

        {#if currentFare !== null}
          <div class="fare-display">
            <span class="label">One-Way</span>
            <span class="amount">${(currentFare / 100).toFixed(2)}</span>
          </div>
        {/if}

        <button
          class="fav-toggle"
          onclick={handleToggleFavorite}
          disabled={!origin || !destination}
          aria-label={isFavorite(origin, destination) ? 'Remove favorite' : 'Add favorite'}
          aria-pressed={isFavorite(origin, destination)}
        >
          {isFavorite(origin, destination) ? '★' : '☆'}
        </button>
      </div>
    </section>

    {#if searched}
      <section class="results" aria-live="polite">
        {#if results.length > 0}
          <div class="results-header">
            <span>{results.length} trips</span>
            {#if realtime}<span class="live-dot">● Live</span>{/if}
          </div>

          <div class="card-list">
            {#each results as trip (trip.trainNumber)}
              {@const delay = getDelay(trip.trainNumber)}
              <div class="trip-card">
                <div class="times">
                  <div class="dept">
                    <span class="t">{trip.departure}</span>
                  </div>
                  <div class="arr">
                    <span class="t">{trip.arrival}</span>
                    <span class="dur">{trip.duration}</span>
                  </div>
                </div>

                <div class="meta">
                  <div class="top">
                    <div class="badges">
                      <span class="train-id">#{trip.trainNumber}</span>
                      <span class={routeTypeClass(trip.routeType)}>{trip.routeType}</span>
                    </div>

                    {#if delay !== undefined}
                      <span class="status-badge {delayClass(delay)}">
                        {formatDelay(delay)}
                      </span>
                    {/if}
                  </div>
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <div class="no-results">
            <p>
              No trips found for this route on {new Date(dateStr + 'T12:00:00').toLocaleDateString(
                'en-US',
                { weekday: 'long', month: 'long', day: 'numeric' },
              )}
            </p>
          </div>
        {/if}
      </section>
    {/if}
  </div>
</main>

<style>
  /* Base styles inherited from layout generally, but we make specific component styles here */

  :global(*, *::before, *::after) {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  :global(html) {
    font-family: 'Inter', system-ui, sans-serif;
    background: #0f0f13;
    color: #e8e8ed;
  }

  main {
    padding: 1rem;
    max-width: 600px;
    margin: 0 auto;
    padding-bottom: 3rem; /* bottom safe area */
  }

  header {
    text-align: center;
    margin-bottom: 1.5rem;
  }

  h1 {
    font-size: 1.5rem;
    font-weight: 700;
    color: #fff;
  }

  .alerts {
    margin-top: 1rem;
    background: #933;
    color: #fff;
    border-radius: 8px;
    padding: 0.75rem;
    font-size: 0.875rem;
    line-height: 1.4;
    text-align: left;
  }

  .controls {
    background: #1a1a22;
    border: 1px solid #2a2a35;
    border-radius: 16px;
    padding: 1rem;
    margin-bottom: 1.5rem;
  }

  .station-row {
    display: flex;
    align-items: flex-end;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .field {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .row-2 {
    display: flex;
    align-items: flex-end;
    gap: 1rem;
  }

  label {
    font-size: 0.75rem;
    font-weight: 600;
    color: #888;
    text-transform: uppercase;
  }

  select,
  input {
    background: #12121a;
    border: 1px solid #2a2a35;
    border-radius: 10px;
    color: #e8e8ed;
    font-size: 1rem; /* Better for touch */
    padding: 0.75rem;
    width: 100%;
  }

  .swap-btn {
    width: 44px;
    height: 44px; /* Accessible target */
    background: #22222e;
    border: 1px solid #2a2a35;
    border-radius: 10px;
    color: #4e9bff;
    font-size: 1.25rem;
    cursor: pointer;
    flex-shrink: 0;
  }

  .fav-toggle {
    width: 44px;
    height: 44px;
    background: transparent;
    border: 1px solid #2a2a35;
    border-radius: 10px;
    color: #ffd700;
    font-size: 1.5rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
    padding-bottom: 3px;
  }

  .fare-display {
    flex: 1;
    text-align: right;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding-right: 0.5rem;
  }

  .fare-display .label {
    font-size: 0.7rem;
    color: #888;
    text-transform: uppercase;
  }

  .fare-display .amount {
    font-size: 1.125rem;
    font-weight: 700;
    color: #4e9bff;
  }

  /* Favorites Section */
  .favorites {
    margin-bottom: 1.5rem;
  }

  .favorites h2 {
    font-size: 0.875rem;
    color: #888;
    margin-bottom: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.75rem;
  }

  .fav-card {
    background: #1a1a22;
    border: 1px solid #2a2a35;
    padding: 1rem;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    color: #fff;
    font-family: inherit;
    font-size: 1rem;
    cursor: pointer;
    text-align: left;
  }

  .fav-card .arrow {
    color: #555;
    font-size: 0.875rem;
    margin: 0 0.5rem;
  }

  /* Results List */
  .results-header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 0.5rem;
    font-size: 0.8125rem;
    color: #888;
  }

  .live-dot {
    color: #4e9bff;
    font-weight: 600;
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
    100% {
      opacity: 1;
    }
  }

  .card-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .trip-card {
    background: #1a1a22;
    border-radius: 12px;
    padding: 1rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-left: 3px solid transparent;
  }

  .trip-card:hover {
    background: #20202a;
  }

  .times {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .dept .t {
    font-size: 1.25rem;
    font-weight: 700;
    color: #fff;
  }

  .arr {
    display: flex;
    gap: 0.5rem;
    align-items: baseline;
  }

  .arr .t {
    font-size: 0.875rem;
    color: #bbb;
  }

  .arr .dur {
    font-size: 0.75rem;
    color: #666;
  }

  .meta {
    text-align: right;
  }

  .badges {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
    align-items: center;
    margin-bottom: 0.375rem;
  }

  .train-id {
    font-size: 0.75rem;
    color: #555;
    font-family: monospace;
  }

  .badge {
    font-size: 0.6875rem;
    font-weight: 700;
    padding: 0.15rem 0.4rem;
    border-radius: 4px;
    text-transform: uppercase;
  }

  .badge.local {
    background: #333;
    color: #ccc;
  }
  .badge.limited {
    background: rgba(153, 215, 220, 0.2);
    color: #99d7dc;
  }
  .badge.express {
    background: rgba(206, 32, 47, 0.2);
    color: #ff6b6b;
  }
  .badge.bullet {
    background: rgba(206, 32, 47, 0.3);
    color: #ff5b5b;
    border: 1px solid rgba(206, 32, 47, 0.4);
  }

  .status-badge {
    font-size: 0.75rem;
    font-weight: 600;
  }

  .delay-minor {
    color: #f2c94c;
  } /* Yellow */
  .delay-mod {
    color: #f2994a;
  } /* Orange */
  .delay-severe {
    color: #eb5757;
  } /* Red */

  @media (max-width: 480px) {
    .station-row {
      flex-direction: column;
      align-items: stretch;
    }
  }
</style>
