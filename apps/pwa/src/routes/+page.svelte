<script lang="ts">
  // SPDX-License-Identifier: MIT
  // Copyright 2026 Roland Dreier <roland@rolandd.dev>

  import { getContext, onMount, onDestroy } from 'svelte';
  import {
    getStationList,
    queryTrips,
    calculateFare,
    normalizeDate,
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
  const dayOfWeek = $derived.by(() => {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'T12:00:00');
    return new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(date);
  });
  let results = $state<TripResult[]>([]);
  let searched = $state(false);
  let favorites = $state<string[]>([]);
  let realtime = $state<RealtimeStatus | null>(null);
  let pollInterval: ReturnType<typeof setInterval> | undefined;

  const isToday = $derived.by(() => {
    if (!dateStr) return false;
    const now = new Date();
    // Use America/Los_Angeles timezone to stay consistent with Caltrain day
    const californiaDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
    return dateStr === californiaDate;
  });

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

  $effect(() => {
    const normalized = normalizeDate(dateStr);
    if (normalized !== dateStr) {
      dateStr = normalized;
    }
  });

  // Search logic
  function handleDateChange() {
    search();
  }

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

  const getDelay = (trainNum: string): number | undefined => {
    if (!realtime || !isToday) return undefined;
    // Realtime entities use trip_id (i). For Caltrain this matches train number in static schedule
    const entity = realtime.e.find((e) => e.i === trainNum);
    return entity?.d;
  };

  const formatDelay = (delaySec: number): string => {
    const mins = Math.round(delaySec / 60);
    if (mins <= 0) return 'on time';
    return `${mins} min late`;
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

<main class="p-4 max-w-[600px] mx-auto pb-12">
  <div class="container">
    <header class="text-center mb-6">
      <h1 class="text-2xl font-bold text-white">🚂 Caltrain</h1>
      <!-- Service Alerts -->
      {#if realtime && realtime.a.length > 0}
        <div
          class="mt-4 bg-transit-alert-bg text-white rounded-lg p-3 text-sm leading-[1.4] text-left"
          role="alert"
        >
          {#each realtime.a as alert (alert.h)}
            <div class="alert-item">
              <strong>{alert.h}</strong>: {alert.d}
            </div>
          {/each}
        </div>
      {/if}
    </header>

    <!-- Favorites List -->
    {#if !searched && favorites.length > 0}
      <section class="mb-6" aria-label="Favorite Trips">
        <h2 class="text-sm text-[#888] mb-3 uppercase tracking-wider">Favorites</h2>
        <div class="grid grid-cols-1 gap-3">
          {#each favorites as pair (pair)}
            <button
              class="bg-transit-bg-card border border-transit-border p-4 rounded-xl flex items-center justify-between text-white font-inherit text-base cursor-pointer text-left"
              onclick={() => selectFavorite(pair)}
            >
              <span class="st">{getStationName(pair.split('-')[0])}</span>
              <span class="text-[#555] text-sm mx-2">→</span>
              <span class="st">{getStationName(pair.split('-')[1])}</span>
            </button>
          {/each}
        </div>
      </section>
    {/if}

    <section class="bg-transit-bg-card border border-transit-border rounded-2xl p-4 mb-6">
      <div class="flex items-end gap-2 mb-4 max-[480px]:flex-col max-[480px]:items-stretch">
        <div class="flex-1 flex flex-col gap-1.5">
          <label class="text-[0.75rem] font-semibold text-[#888] uppercase" for="origin">From</label
          >
          <select
            id="origin"
            class="bg-transit-bg-input border border-transit-border rounded-[10px] text-transit-text text-base p-3 w-full"
            bind:value={origin}
            onchange={search}
          >
            <option value="">Select station...</option>
            {#each stations as s (s.id)}
              <option value={s.id} disabled={s.id === destination}>{s.name}</option>
            {/each}
          </select>
        </div>

        <button
          class="w-11 h-11 bg-[#22222e] border border-transit-border rounded-[10px] text-transit-blue text-xl cursor-pointer flex-shrink-0"
          onclick={swap}
          aria-label="Swap stations"
          disabled={!origin && !destination}
        >
          ⇆
        </button>

        <div class="flex-1 flex flex-col gap-1.5">
          <label class="text-[0.75rem] font-semibold text-[#888] uppercase" for="destination"
            >To</label
          >
          <select
            id="destination"
            class="bg-transit-bg-input border border-transit-border rounded-[10px] text-transit-text text-base p-3 w-full"
            bind:value={destination}
            onchange={search}
          >
            <option value="">Select station...</option>
            {#each stations as s (s.id)}
              <option value={s.id} disabled={s.id === origin}>{s.name}</option>
            {/each}
          </select>
        </div>
      </div>

      <div class="flex items-end gap-4">
        <div class="flex-1 flex flex-col gap-1.5 date-field">
          <label class="text-[0.75rem] font-semibold text-[#888] uppercase" for="date"
            >Date <span class="day-label lowercase">({dayOfWeek})</span></label
          >
          <input
            id="date"
            class="bg-transit-bg-input border border-transit-border rounded-[10px] text-transit-text text-base p-3 w-full"
            type="date"
            bind:value={dateStr}
            onchange={handleDateChange}
            onblur={handleDateChange}
          />
        </div>

        {#if currentFare !== null}
          <div class="flex-1 text-right flex flex-col justify-center pr-2">
            <span class="text-[0.7rem] text-[#888] uppercase">One-Way</span>
            <span class="text-lg font-bold text-transit-blue"
              >${(currentFare / 100).toFixed(2)}</span
            >
          </div>
        {/if}

        <button
          class="w-11 h-11 bg-transparent border border-transit-border rounded-[10px] text-[#ffd700] text-2xl cursor-pointer flex items-center justify-center leading-none pb-[3px]"
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
          <div class="flex justify-between mb-2 text-[0.8125rem] text-[#888]">
            <span>{results.length} trips</span>
            {#if realtime}<span class="text-transit-blue font-semibold animate-pulse">● Live</span
              >{/if}
          </div>

          <div class="flex flex-col gap-3">
            {#each results as trip (trip.trainNumber)}
              {@const delay = getDelay(trip.trainNumber)}
              <div
                class="bg-transit-bg-card rounded-xl p-4 flex justify-between items-center border-l-3 border-transparent hover:bg-[#20202a]"
              >
                <div class="flex flex-col gap-1">
                  <div class="dept">
                    <span class="text-xl font-bold text-white">{trip.departure}</span>
                  </div>
                  <div class="flex gap-2 items-baseline text-transit-text opacity-70">
                    <span class="text-sm">{trip.arrival}</span>
                    <span class="text-[0.75rem] opacity-60">{trip.duration}</span>
                  </div>
                </div>

                <div class="text-right">
                  <div class="flex gap-2 justify-end items-center mb-1.5">
                    <span class="text-[0.75rem] text-[#555] font-mono">#{trip.trainNumber}</span>
                    <span
                      class="text-[0.6875rem] font-bold px-1.5 py-0.5 rounded uppercase {trip.routeType
                        .toLowerCase()
                        .includes('limited')
                        ? 'bg-[#99d7dc33] text-[#99d7dc]'
                        : trip.routeType.toLowerCase().includes('express')
                          ? 'bg-[#ff6b6b33] text-transit-red'
                          : trip.routeType.toLowerCase().includes('bullet')
                            ? 'bg-[#ff6b6b4d] text-[#ff5b5b] border border-[#ce202f66]'
                            : 'bg-[#333] text-[#ccc]'}"
                    >
                      {trip.routeType}
                    </span>
                  </div>

                  {#if delay !== undefined}
                    <span
                      class="text-[0.75rem] font-semibold {Math.round(delay / 60) >= 10
                        ? 'text-[#eb5757]'
                        : Math.round(delay / 60) >= 5
                          ? 'text-[#f2994a]'
                          : 'text-[#f2c94c]'}"
                    >
                      {formatDelay(delay)}
                    </span>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <div class="text-center p-8 opacity-60">
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
