<script lang="ts">
  // SPDX-License-Identifier: MIT
  // Copyright 2026 Roland Dreier <roland@rolandd.dev>

  import { getContext, onMount, onDestroy, tick } from 'svelte';
  import {
    getStationList,
    queryTrips,
    calculateFare,
    normalizeDate,
    getScheduleType,
    type StaticSchedule,
    type TripResult,
  } from '$lib/schedule';
  import { getFavorites, toggleFavorite } from '$lib/favorites';
  import { fetchRealtime } from '$lib/realtime';
  import { getTrainLocationDescription } from '$lib/location';
  import { getTransitDateStr, getTransitDateAtNoon, getTransitTimeStr } from '$lib/time';
  import type { RealtimeStatus } from '@packages/types/schema';

  // Context from layout
  const scheduleCtx = getContext<{ value: StaticSchedule }>('schedule');
  const schedule = $derived(scheduleCtx.value);
  const stations = $derived(schedule ? getStationList(schedule) : []);

  // --- localStorage keys for persisted UI state ---
  const LS_ORIGIN = 'transit-origin';
  const LS_DEST = 'transit-destination';
  const LS_DATE = 'transit-date';

  // State
  let origin = $state('');
  let destination = $state('');
  let dateStr = $state(getTransitDateStr());

  const formattedDate = $derived.by(() => {
    if (!dateStr) return '';
    const date = getTransitDateAtNoon(dateStr);
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
  });
  const scheduleType = $derived(
    schedule && dateStr ? getScheduleType(schedule, getTransitDateAtNoon(dateStr)) : null,
  );
  let results = $state<TripResult[]>([]);
  let searched = $state(false);
  let favorites = $state<string[]>([]);
  let realtime = $state<RealtimeStatus | null>(null);
  let pollInterval: ReturnType<typeof setInterval> | undefined;

  // Tooltip state for mobile/enhanced interaction
  let activeTooltip = $state<{
    id: string;
    text?: string;
    stops: string[];
    x: number;
    y: number;
  } | null>(null);

  // Derived: is the current origin-destination pair a favorite?
  const isCurrentFavorite = $derived(
    origin && destination ? favorites.includes(`${origin}-${destination}`) : false,
  );

  const isToday = $derived.by(() => {
    if (!dateStr) return false;
    // Use transit timezone to stay consistent with Caltrain day
    return dateStr === getTransitDateStr();
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

  /** Reset all form state and clear localStorage persistence. */
  function clearState() {
    origin = '';
    destination = '';
    dateStr = getTransitDateStr();
    results = [];
    searched = false;
    localStorage.removeItem(LS_ORIGIN);
    localStorage.removeItem(LS_DEST);
    localStorage.removeItem(LS_DATE);
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
    // Restore persisted station/date selections
    const savedOrigin = localStorage.getItem(LS_ORIGIN);
    const savedDest = localStorage.getItem(LS_DEST);
    const savedDate = localStorage.getItem(LS_DATE);
    if (savedOrigin) origin = savedOrigin;
    if (savedDest) destination = savedDest;
    if (savedDate) dateStr = savedDate;
    updateRealtime();
    pollInterval = setInterval(updateRealtime, 60000);
  });

  onDestroy(() => {
    if (pollInterval) clearInterval(pollInterval);
  });

  // Persist form selections to localStorage whenever they change
  $effect(() => {
    localStorage.setItem(LS_ORIGIN, origin);
    localStorage.setItem(LS_DEST, destination);
    localStorage.setItem(LS_DATE, dateStr);
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
    const date = getTransitDateAtNoon(dateStr);
    results = queryTrips(schedule, origin, destination, date);
    searched = true;
  };

  const swap = () => {
    const tmp = origin;
    origin = destination;
    destination = tmp;
    if (searched) search();
  };

  // Date navigation helpers
  function shiftDate(days: number) {
    const d = getTransitDateAtNoon(dateStr);
    d.setDate(d.getDate() + days);
    dateStr = d.toISOString().slice(0, 10);
    search();
  }
  const prevDay = () => shiftDate(-1);
  const nextDay = () => shiftDate(1);
  function goNow() {
    dateStr = getTransitDateStr();
    search();
    // Wait one frame for Svelte to render the results, then scroll
    tick().then(() => scrollToNow());
  }

  // Scroll the trip table to the first non-departed train
  // Scroll the trip table to the first non-departed train
  let tripScrollEl = $state<HTMLDivElement | undefined>();

  /** Return true if the "HH:MM" departure string is before the current transit time. */
  function hasDeparted(departureStr: string): boolean {
    const [h, m] = departureStr.split(':').map(Number);
    const depMins = h * 60 + m;
    const transitTime = getTransitTimeStr();
    const [nowH, nowM] = transitTime.split(':').map(Number);
    return depMins < nowH * 60 + nowM;
  }

  function scrollToNow() {
    if (!tripScrollEl || !results.length) return;
    const firstFutureIdx = results.findIndex((t) => !hasDeparted(t.departure));
    if (firstFutureIdx > 0) {
      tripScrollEl.scrollLeft = firstFutureIdx * 84;
    }
  }

  // Returns Tailwind classes for the trip column based on route type
  const getRouteStyle = (
    routeType: string,
  ): { bg: string; border: string; badge: string; label: string } => {
    const rt = routeType.toLowerCase();
    if (rt.includes('bullet') || rt.includes('express')) {
      return {
        bg: 'bg-[#2a0d0d]',
        border: 'border-[#5a1a1a]',
        badge: 'bg-[#ff6b6b33] text-[#ff8080]',
        label: 'Bullet',
      };
    }
    if (rt.includes('limited')) {
      return {
        bg: 'bg-[#0d2230]',
        border: 'border-[#1a4a60]',
        badge: 'bg-[#99d7dc33] text-[#99d7dc]',
        label: 'Ltd',
      };
    }
    return {
      bg: 'bg-transit-bg-card',
      border: 'border-transit-border',
      badge: 'bg-[#333] text-[#aaa]',
      label: 'Local',
    };
  };

  // Truncate station name to ~13 chars for the fixed left panel
  const truncateStation = (name: string, maxLen = 13): string => {
    if (name.length <= maxLen) return name;
    return name.slice(0, maxLen - 1) + '…';
  };

  const TOOLTIP_CACHE_MAX = 512;
  const tooltipTextCache: Record<string, string> = Object.create(null);
  let tooltipTextCacheSize = 0;

  interface TripRealtimeRenderData {
    delay?: number;
    delayLabel?: string;
    delayClass?: string;
    hasLocation: boolean;
    tooltipText?: string;
  }

  function getRealtimeTrip(trainNum: string) {
    if (!realtime) return undefined;
    return realtime.byTrip[trainNum];
  }

  const formatDelay = (delaySec: number): string => {
    const mins = Math.round(delaySec / 60);
    if (mins <= 0) return 'on time';
    return `${mins} min late`;
  };

  function getDelayClass(delayMins: number): string {
    if (delayMins >= 10) return 'text-[#eb5757]';
    if (delayMins >= 5) return 'text-[#f2994a]';
    return 'text-[#f2c94c]';
  }

  /** Helper to get location description for a trip */
  function getTooltipText(trainNum: string, direction: 0 | 1): string | undefined {
    if (!schedule || !realtime) return undefined;
    const entity = getRealtimeTrip(trainNum);
    if (!entity?.p) return undefined;

    const cacheEpoch = `${schedule.m.v}:${realtime.t}`;
    const cacheKey = `${cacheEpoch}:${trainNum}:${direction}`;
    const cached = tooltipTextCache[cacheKey];
    if (cached !== undefined) return cached;

    const text = getTrainLocationDescription(entity.p, direction, schedule);
    if (tooltipTextCacheSize > TOOLTIP_CACHE_MAX) {
      for (const key in tooltipTextCache) {
        delete tooltipTextCache[key];
      }
      tooltipTextCacheSize = 0;
    }
    tooltipTextCache[cacheKey] = text;
    tooltipTextCacheSize += 1;
    return text;
  }

  function getTripRealtimeRenderData(trainNum: string, direction: 0 | 1): TripRealtimeRenderData {
    const entity = getRealtimeTrip(trainNum);
    const hasLocation = !!entity?.p;
    const tooltipText = hasLocation ? getTooltipText(trainNum, direction) : undefined;

    if (!isToday || entity === undefined) {
      return {
        hasLocation,
        tooltipText,
      };
    }

    const delay = entity.d ?? 0;
    const delayMins = Math.round(delay / 60);

    return {
      delay,
      delayLabel: formatDelay(delay),
      delayClass: getDelayClass(delayMins),
      hasLocation,
      tooltipText,
    };
  }

  /**
   * Handle click on the delay badge.
   * On mobile/touch this acts as a toggle. On desktop it can also be used to "pin".
   * For now, simplistic toggle logic.
   */
  function toggleTooltip(
    event: (MouseEvent | KeyboardEvent) & { currentTarget: HTMLElement },
    trip: TripResult,
    precomputedText?: string,
  ): void {
    event.stopPropagation(); // prevent row click if we add one later

    // If clicking the same one, toggle off
    if (activeTooltip?.id === trip.trainNumber) {
      activeTooltip = null;
      return;
    }

    const text = precomputedText ?? getTooltipText(trip.trainNumber, trip.direction);
    // Allow tooltip if we have text or if we have stops to show
    if (!text && trip.stopIds.length < 2) return;

    const rect = event.currentTarget.getBoundingClientRect();
    // Position centered over the element
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;

    activeTooltip = {
      id: trip.trainNumber,
      text,
      stops: trip.stopIds,
      x,
      y,
    };
  }

  function closeTooltip() {
    activeTooltip = null;
  }

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
      <h1 class="text-2xl font-bold text-white flex items-center justify-center gap-3">
        Caltrain <img src="/caltrain.svg" alt="Logo" class="h-8 w-auto" width="32" height="32" />
      </h1>
    </header>

    <!-- Favorites List -->
    {#if !searched && favorites.length > 0}
      <section class="mb-6" aria-label="Favorite Trips">
        <h2 class="text-sm text-[#a3a3a3] mb-3 uppercase tracking-wider">Favorites</h2>
        <div class="grid grid-cols-1 gap-3">
          {#each favorites as pair (pair)}
            {@const [o, d] = pair.split('-')}
            <div
              class="bg-transit-bg-card border border-transit-border rounded-xl flex items-center justify-between p-1 pr-3 transition-colors hover:border-[#ffffff33]"
            >
              <button
                class="flex-1 text-left flex items-center gap-2 p-3 cursor-pointer bg-transparent border-none text-white text-base font-inherit"
                onclick={() => selectFavorite(pair)}
              >
                <span class="font-semibold">{getStationName(o)}</span>
                <span class="text-[#a3a3a3] text-sm">→</span>
                <span class="font-semibold">{getStationName(d)}</span>
              </button>

              <button
                class="text-[#ffd700] text-xl cursor-pointer bg-transparent border-none p-2 rounded-full hover:bg-[#ffffff10] transition-colors flex items-center justify-center leading-none"
                onclick={(e) => {
                  e.stopPropagation();
                  toggleFavorite(o, d);
                  loadFavorites();
                }}
                aria-label="Remove favorite"
              >
                ★
              </button>
            </div>
          {/each}
        </div>
      </section>
    {/if}

    <section class="bg-transit-bg-card border border-transit-border rounded-2xl p-4 mb-6">
      <div class="flex items-center gap-2 mb-4 max-[480px]:flex-col max-[480px]:items-stretch">
        <div class="flex-1 flex items-center gap-3">
          <label class="text-xs font-semibold text-[#a3a3a3] uppercase w-8 text-right" for="origin"
            >From</label
          >
          <select
            id="origin"
            class="bg-transit-bg-input border border-transit-border rounded-[10px] text-transit-text text-base p-3 w-full flex-1 min-w-0"
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
          class="w-11 h-11 bg-[#22222e] border border-transit-border rounded-[10px] text-transit-blue text-xl cursor-pointer flex-shrink-0 self-center hidden max-[480px]:flex items-center justify-center"
          onclick={swap}
          aria-label="Swap stations"
          disabled={!origin && !destination}
        >
          ⇅
        </button>

        <!-- Desktop swap button (between inputs) -->
        <button
          class="w-8 h-8 bg-transparent border-none text-transit-blue text-xl cursor-pointer flex-shrink-0 self-center max-[480px]:hidden hover:text-white transition-colors"
          onclick={swap}
          aria-label="Swap stations"
          disabled={!origin && !destination}
        >
          ⇆
        </button>

        <div class="flex-1 flex items-center gap-3">
          <label
            class="text-xs font-semibold text-[#a3a3a3] uppercase w-8 text-right max-[480px]:text-left"
            for="destination">To</label
          >
          <select
            id="destination"
            class="bg-transit-bg-input border border-transit-border rounded-[10px] text-transit-text text-base p-3 w-full flex-1 min-w-0"
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

      <div class="flex items-end gap-2 max-[480px]:flex-col max-[480px]:items-stretch">
        <div class="flex-1 flex items-center gap-3">
          <label class="text-xs font-semibold text-[#a3a3a3] uppercase w-8 text-right" for="date"
            >Date</label
          >
          <!-- Date navigation: prev / input / next -->
          <div class="flex items-center gap-1 flex-1 min-w-0">
            <button
              class="w-11 h-11 bg-transit-bg-input hover:bg-[#ffffff0a] border border-transit-border rounded-[10px] text-transit-text text-base cursor-pointer flex items-center justify-center flex-shrink-0 transition-colors"
              onclick={prevDay}
              aria-label="Previous day"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width="2.5"
                stroke="currentColor"
                class="w-5 h-5"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M15.75 19.5L8.25 12l7.5-7.5"
                />
              </svg>
            </button>
            <input
              id="date"
              class="h-11 bg-transit-bg-input border border-transit-border rounded-[10px] text-transit-text text-base px-2 w-full min-w-0 text-center uppercase"
              type="date"
              bind:value={dateStr}
              onchange={handleDateChange}
              onblur={handleDateChange}
            />
            <button
              class="w-11 h-11 bg-transit-bg-input hover:bg-[#ffffff0a] border border-transit-border rounded-[10px] text-transit-text text-base cursor-pointer flex items-center justify-center flex-shrink-0 transition-colors"
              onclick={nextDay}
              aria-label="Next day"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width="2.5"
                stroke="currentColor"
                class="w-5 h-5"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M8.25 4.5l7.5 7.5-7.5 7.5"
                />
              </svg>
            </button>
          </div>
        </div>

        <!-- Actions: Now / Clear / Favorite -->
        <div class="flex items-center gap-2 max-[480px]:w-full">
          <button
            class="h-11 px-3 bg-transparent hover:bg-[#ffffff0a] border border-transit-border rounded-[10px] text-transit-blue text-sm font-semibold cursor-pointer flex items-center justify-center gap-1.5 flex-1 transition-colors"
            onclick={goNow}
            aria-label="Jump to now"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="2.5"
              stroke="currentColor"
              class="w-4 h-4 mb-[1px]"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            Now
          </button>

          {#if origin || destination}
            <button
              class="h-11 px-3 bg-transparent hover:bg-[#ffffff0a] border border-transit-border rounded-[10px] text-[#eb5757] text-sm font-semibold cursor-pointer flex items-center justify-center gap-1.5 flex-1 transition-colors"
              onclick={clearState}
              aria-label="Clear selections"
            >
              <span class="text-lg leading-none pb-[2px]">✕</span> Clear
            </button>
          {/if}

          <button
            class="h-11 px-3 bg-transparent hover:bg-[#ffffff0a] border border-transit-border rounded-[10px] text-[#ffd700] text-sm font-semibold cursor-pointer flex items-center justify-center gap-1.5 flex-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            onclick={handleToggleFavorite}
            disabled={!origin || !destination}
            aria-label={isCurrentFavorite ? 'Remove favorite' : 'Add favorite'}
            aria-pressed={isCurrentFavorite}
          >
            <span class="text-lg leading-none pb-[2px]">{isCurrentFavorite ? '★' : '☆'}</span>
            Fav
          </button>
        </div>
      </div>
    </section>

    {#if searched}
      <section aria-live="polite">
        {#if results.length > 0}
          <!-- Status bar -->
          <div class="flex items-center justify-between mb-3 text-[0.8125rem] text-[#a3a3a3]">
            <span>{results.length} trips</span>
            <span class="font-medium text-transit-text">
              {formattedDate}
              {#if scheduleType}
                <span class="text-[#a3a3a3] font-normal">· {scheduleType}</span>
              {/if}
            </span>
            {#if realtime && isToday}
              <span class="text-transit-blue font-semibold animate-pulse">● Live</span>
            {:else}
              <span></span>
            {/if}
          </div>

          <!--
            Route table: fixed left panel + horizontally scrollable trip columns.
            The outer wrapper clips overflow; the inner flex row holds both panels.
          -->
          <div class="relative rounded-xl overflow-hidden border border-transit-border">
            <div class="flex overflow-x-auto" bind:this={tripScrollEl}>
              <!-- Fixed left panel: origin → fare → destination -->
              <div
                class="sticky left-0 z-10 flex-shrink-0 w-[108px] bg-transit-bg-card border-r border-transit-border flex flex-col"
                aria-label="Route"
              >
                <!-- Header spacer (matches trip column header height) -->
                <div class="h-[52px] border-b border-transit-border"></div>

                <!-- Station info body -->
                <div class="flex flex-col flex-1 items-center justify-between px-2 py-3 gap-1">
                  <!-- Origin -->
                  <div class="text-center">
                    <div class="text-[0.65rem] text-[#a3a3a3] uppercase tracking-wider mb-0.5">
                      From
                    </div>
                    <div class="text-[0.8rem] font-semibold text-transit-text leading-tight">
                      {truncateStation(getStationName(origin))}
                    </div>
                  </div>

                  <!-- Fare connector -->
                  <div class="flex flex-col items-center gap-0.5 my-1">
                    <div class="w-px h-3 bg-transit-border"></div>
                    {#if currentFare !== null}
                      <div
                        class="text-[0.7rem] font-bold text-transit-blue px-1.5 py-0.5 bg-[#4e9bff15] rounded-full border border-[#4e9bff33]"
                      >
                        ${(currentFare / 100).toFixed(2)}
                      </div>
                    {/if}
                    <div class="w-px h-3 bg-transit-border"></div>
                  </div>

                  <!-- Destination -->
                  <div class="text-center">
                    <div class="text-[0.65rem] text-[#a3a3a3] uppercase tracking-wider mb-0.5">
                      To
                    </div>
                    <div class="text-[0.8rem] font-semibold text-transit-text leading-tight">
                      {truncateStation(getStationName(destination))}
                    </div>
                  </div>
                </div>
              </div>

              <!-- Scrollable trip columns -->
              <div class="flex flex-row" role="list" aria-label="Trips">
                {#each results as trip (trip.trainNumber)}
                  {@const rt = getTripRealtimeRenderData(trip.trainNumber, trip.direction)}
                  {@const style = getRouteStyle(trip.routeType)}
                  <div
                    class="flex-shrink-0 w-[84px] flex flex-col border-r border-transit-border last:border-r-0 {style.bg}"
                    role="listitem"
                  >
                    <!-- Column header: train number + route badge -->
                    <div
                      class="h-[52px] flex flex-col items-center justify-center gap-1 px-1 border-b {style.border}"
                    >
                      <span class="text-[0.7rem] font-mono text-[#a3a3a3]">#{trip.trainNumber}</span
                      >
                      <span
                        class="text-[0.6rem] font-bold px-1.5 py-0.5 rounded-full uppercase {style.badge}"
                      >
                        {style.label}
                      </span>
                    </div>

                    <!-- Trip body: departure / middle info / arrival -->
                    <div
                      class="flex flex-col items-center justify-between flex-1 py-3 px-1 gap-2 cursor-pointer hover:bg-[#ffffff08] transition-colors rounded"
                      role="button"
                      tabindex="0"
                      onclick={(e) => toggleTooltip(e, trip, rt.tooltipText)}
                      onkeydown={(e) => e.key === 'Enter' && toggleTooltip(e, trip, rt.tooltipText)}
                      title={rt.tooltipText || 'View trip details'}
                    >
                      <!-- Departure + optional delay -->
                      <div class="flex flex-col items-center gap-0.5 pointer-events-none">
                        <div class="flex flex-col items-center">
                          <span class="text-[1rem] font-bold text-white tabular-nums"
                            >{trip.departure}</span
                          >
                          {#if rt.delay !== undefined}
                            <span
                              class="text-[0.6rem] font-semibold leading-tight text-center flex items-center gap-0.5 {rt.delayClass}"
                            >
                              {rt.delayLabel}
                              {#if rt.hasLocation}
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  viewBox="0 0 20 20"
                                  fill="currentColor"
                                  class="w-3 h-3 text-[#f2c94c]"
                                >
                                  <path
                                    fill-rule="evenodd"
                                    d="M9.69 18.933l.003.001C9.89 19.02 10 19 10 19s.11-.02.308-.066l.002-.001.006-.003.018-.008a5.741 5.741 0 00.281-.14c.186-.096.446-.24.757-.433.62-.384 1.445-.966 2.274-1.765C15.302 14.988 17 12.493 17 9A7 7 0 103 9c0 3.492 1.698 5.988 3.355 7.584a13.731 13.731 0 002.273 1.765 11.842 11.842 0 00.976.544l.062.029.018.008.006.003zM10 11.25a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5z"
                                    clip-rule="evenodd"
                                  />
                                </svg>
                              {/if}
                            </span>
                          {/if}
                        </div>
                      </div>

                      <!-- Duration + intermediate stops -->
                      <div
                        class="flex flex-col items-center gap-0.5 text-center pointer-events-none"
                      >
                        <span class="text-[0.7rem] text-[#a3a3a3]">{trip.durationMinutes}m</span>
                        <span class="text-[0.65rem] text-[#a3a3a3]">
                          {trip.intermediateStops === 0
                            ? 'non-stop'
                            : trip.intermediateStops === 1
                              ? '1 stop'
                              : `${trip.intermediateStops} stops`}
                        </span>
                      </div>

                      <!-- Arrival -->
                      <div class="flex flex-col items-center pointer-events-none">
                        <span class="text-[0.875rem] font-semibold text-[#aaa] tabular-nums"
                          >{trip.arrival}</span
                        >
                      </div>
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          </div>
        {:else}
          <div class="text-center p-8 opacity-60">
            <p>
              No trips found for this route on {getTransitDateAtNoon(dateStr).toLocaleDateString(
                'en-US',
                { weekday: 'long', month: 'long', day: 'numeric' },
              )}
            </p>
          </div>
        {/if}
      </section>
    {/if}
    <!-- Service Alerts -->
    {#if realtime && realtime.a.length > 0}
      <div
        class="mt-8 bg-transit-alert-bg text-white rounded-lg p-3 text-sm leading-[1.4] text-left border border-[#ff6b6b33]"
        role="alert"
      >
        <h3 class="text-[#ff8080] font-bold text-xs uppercase mb-2">Service Alerts</h3>
        {#each realtime.a as alert (alert.h)}
          <div class="alert-item mb-2 last:mb-0">
            <strong class="text-white block mb-0.5">{alert.h}</strong>
            <span class="text-[#ddd]">{alert.d}</span>
          </div>
        {/each}
      </div>
    {/if}

    <!-- Spacer for better scrolling -->
    <div class="h-32"></div>

    <!-- Active Tooltip Overlay -->
    {#if activeTooltip}
      <!-- Backdrop to close on click outside -->
      <button
        class="fixed inset-0 cursor-default bg-transparent border-none w-full h-full z-40"
        onclick={closeTooltip}
        aria-label="Close tooltip"
      ></button>

      <!-- Tooltip Bubble -->
      <div
        class="fixed z-[50] w-[200px] flex flex-col bg-[#222] text-white text-[0.75rem] rounded-xl shadow-2xl border border-[#444] transform -translate-x-1/2 -translate-y-1/2 overflow-hidden pointer-events-auto"
        style="top: {activeTooltip.y}px; left: {activeTooltip.x}px;"
        role="dialog"
        aria-label="Trip Stops"
      >
        <!-- Optional Realtime Location Header -->
        {#if activeTooltip.text}
          <div
            class="bg-[#1a3a5a] text-[#8ab4f8] px-3 py-2 border-b border-[#333] font-medium leading-tight shadow-sm text-center"
          >
            {activeTooltip.text}
          </div>
        {/if}

        <!-- Stop List -->
        <div class="flex flex-col py-2 px-1 max-h-[300px] overflow-y-auto w-full box-border">
          {#each activeTooltip.stops as stop, i (stop)}
            <div class="flex items-stretch min-h-[1.75rem]">
              <div class="w-8 flex flex-col items-center flex-shrink-0">
                <div
                  class="w-0.5 {i === 0 ? 'bg-transparent h-1/2 mt-auto' : 'bg-[#444] h-full'}"
                ></div>
                <div
                  class="w-2 h-2 rounded-full {i === 0 || i === activeTooltip.stops.length - 1
                    ? 'bg-transit-blue border border-[#222]'
                    : 'bg-[#666]'} absolute top-1/2 -translate-y-1/2"
                ></div>
                <div
                  class="w-0.5 {i === activeTooltip.stops.length - 1
                    ? 'bg-transparent h-1/2 mb-auto'
                    : 'bg-[#444] h-full'}"
                ></div>
              </div>
              <div
                class="flex-1 flex items-center py-1 pr-3 text-[0.8rem] {i === 0 ||
                i === activeTooltip.stops.length - 1
                  ? 'text-white font-medium'
                  : 'text-[#aaa]'}"
              >
                {getStationName(stop)}
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</main>
