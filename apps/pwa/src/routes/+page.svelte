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
    getCanonicalStationId,
    findStopIndex,
    type StaticSchedule,
    type TripResult,
  } from '$lib/schedule';
  import { getFavorites, toggleFavorite } from '$lib/favorites';
  import { fetchRealtime, type RealtimeStatusWithMetadata } from '$lib/realtime';
  import { getTrainLocationDescription, metersToMiles } from '$lib/location';
  import { estimateDelay, computeDistanceBehind } from '$lib/delay-estimation';
  import {
    getTransitDateStr,
    getTransitDateAtNoon,
    getTransitTimeStr,
    getTransitDayStartEpoch,
    formatTransitDateLong,
    formatScheduleEndDate,
  } from '$lib/time';

  import type { TrainPerformanceProfile } from '@packages/types/schema';
  import { SvelteMap } from 'svelte/reactivity';
  import FavoritesList from '$lib/components/FavoritesList.svelte';
  import TripSearchForm from '$lib/components/TripSearchForm.svelte';
  import ServiceAlertsBanner from '$lib/components/ServiceAlertsBanner.svelte';
  import TripTooltipModal, { type ActiveTooltip } from '$lib/components/TripTooltipModal.svelte';
  import TripTable from '$lib/components/TripTable.svelte';
  import type { TripRealtimeRenderData, RouteStyle } from '$lib/components/TripColumn.svelte';

  // Context from layout
  const scheduleCtx = getContext<{ value: StaticSchedule }>('schedule');
  const schedule = $derived(scheduleCtx.value);
  const performanceCtx = getContext<{ value: TrainPerformanceProfile | null }>('performance');
  const performance = $derived(performanceCtx?.value ?? null);
  const stations = $derived(schedule ? getStationList(schedule) : []);

  // localStorage keys for persisted UI state
  const LS_ORIGIN = 'transit-origin';
  const LS_DEST = 'transit-destination';
  const LS_DATE = 'transit-date';
  const LS_SCROLL = 'transit-scroll-left';

  // State
  let origin = $state('');
  let destination = $state('');
  let dateStr = $state(getTransitDateStr());
  let scrollLeft = $state(0);

  const formattedDate = $derived.by(() => {
    if (!dateStr) return '';
    return formatTransitDateLong(getTransitDateAtNoon(dateStr));
  });
  const scheduleType = $derived(
    schedule && dateStr ? getScheduleType(schedule, getTransitDateAtNoon(dateStr)) : null,
  );
  let results = $state<TripResult[]>([]);
  let searched = $state(false);
  let favorites = $state<string[]>([]);
  let realtime = $state<RealtimeStatusWithMetadata | null>(null);
  let lastSuccessfulFetch = $state<number | null>(null);
  let pollInterval: ReturnType<typeof setInterval> | undefined;

  let activeTooltip = $state<ActiveTooltip | null>(null);

  // Derived: is the current origin-destination pair a favorite?
  const isCurrentFavorite = $derived(
    origin && destination ? favorites.includes(`${origin}-${destination}`) : false,
  );

  const isToday = $derived.by(() => {
    if (!dateStr) return false;
    return dateStr === getTransitDateStr();
  });

  const scheduleEndDate = $derived.by(() => {
    if (!schedule) return '';
    return formatScheduleEndDate(schedule.m.e);
  });

  const isPastEndOfSchedule = $derived.by(() => {
    if (!schedule || !dateStr) return false;
    const dateInt = parseInt(dateStr.replace(/-/g, ''), 10);
    return dateInt > schedule.m.e;
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

  function handleRemoveFavorite(o: string, d: string) {
    toggleFavorite(o, d);
    loadFavorites();
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
    scrollLeft = 0;
    localStorage.removeItem(LS_ORIGIN);
    localStorage.removeItem(LS_DEST);
    localStorage.removeItem(LS_DATE);
    localStorage.removeItem(LS_SCROLL);
  }

  function getStationName(id: string) {
    if (!schedule) return id;
    const canonicalId = getCanonicalStationId(schedule, id);
    return schedule.s[canonicalId]?.n || id;
  }

  // Realtime logic
  async function updateRealtime() {
    const data = await fetchRealtime();
    if (data) {
      realtime = data;
      lastSuccessfulFetch = Date.now();
    }

    if (realtime) {
      const now = Date.now();
      const fetchAgeMs = lastSuccessfulFetch ? now - lastSuccessfulFetch : 0;
      const feedAgeMs = realtime.initialAge + (now - realtime.fetchedAt);

      if (fetchAgeMs > 600000 || feedAgeMs > 600000) {
        realtime = null;
      }
    }
  }

  onMount(() => {
    loadFavorites();
    const savedOrigin = localStorage.getItem(LS_ORIGIN);
    const savedDest = localStorage.getItem(LS_DEST);
    const savedDate = localStorage.getItem(LS_DATE);
    const savedScroll = localStorage.getItem(LS_SCROLL);
    if (savedOrigin) origin = savedOrigin;
    if (savedDest) destination = savedDest;
    if (savedDate) dateStr = savedDate;
    if (savedScroll) {
      const parsed = parseFloat(savedScroll);
      if (!isNaN(parsed) && parsed >= 0) {
        scrollLeft = parsed;
      }
    }
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
    localStorage.setItem(LS_SCROLL, String(scrollLeft));
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
    tick().then(() => scrollToNow());
  }

  let tripScrollEl = $state<HTMLDivElement | undefined>();

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

  const getRouteStyle = (routeType: string): RouteStyle => {
    const rt = routeType.toLowerCase();
    if (rt.includes('bullet') || rt.includes('express')) {
      return {
        bg: 'bg-route-bullet-bg',
        border: 'border-route-bullet-border',
        badge: 'bg-route-bullet-badge-bg text-route-bullet-badge-text',
        label: 'Bullet',
      };
    }
    if (rt.includes('limited')) {
      return {
        bg: 'bg-route-limited-bg',
        border: 'border-route-limited-border',
        badge: 'bg-route-limited-badge-bg text-route-limited-badge-text',
        label: 'Ltd',
      };
    }
    return {
      bg: 'bg-route-local-bg',
      border: 'border-route-local-border',
      badge: 'bg-route-local-badge-bg text-route-local-badge-text',
      label: 'Local',
    };
  };

  const truncateStation = (name: string, maxLen = 13): string => {
    if (name.length <= maxLen) return name;
    return name.slice(0, maxLen - 1) + '…';
  };

  const TOOLTIP_CACHE_MAX = 512;
  const tooltipTextCache = new SvelteMap<string, string>();

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
    if (delayMins >= 10) return 'text-transit-danger';
    if (delayMins >= 5) return 'text-transit-warning-medium';
    return 'text-transit-warning';
  }

  function getTooltipText(trainNum: string, direction: 0 | 1): string | undefined {
    if (!schedule || !realtime) return undefined;
    const entity = getRealtimeTrip(trainNum);
    if (!entity?.p) return undefined;

    const cacheKey = `${schedule.m.v}:${trainNum}:${direction}:${entity.p.la}:${entity.p.lo}:${entity.d ?? 0}`;
    const cached = tooltipTextCache.get(cacheKey);
    if (cached !== undefined) return cached;

    let text = getTrainLocationDescription(entity.p, direction, schedule);

    if (entity.s && schedule) {
      const fullTrip = schedule.t.find((t) => t.i === trainNum);
      const canonicalStop = getCanonicalStationId(schedule, entity.s);
      if (fullTrip && canonicalStop) {
        const perf = performance?.trips[trainNum];
        const dayStart = getTransitDayStartEpoch(dateStr);
        const behindMeters = computeDistanceBehind(
          entity.p,
          canonicalStop,
          fullTrip,
          schedule,
          perf,
          Date.now() / 1000,
          dayStart,
        );
        if (behindMeters !== undefined && behindMeters > 400) {
          const behindMiles = metersToMiles(behindMeters).toFixed(1);
          text += ` · ${behindMiles} mi behind`;
        }
      }
    }

    if (tooltipTextCache.size >= TOOLTIP_CACHE_MAX) {
      const oldestKey = tooltipTextCache.keys().next().value;
      if (oldestKey !== undefined) {
        tooltipTextCache.delete(oldestKey);
      }
    }
    tooltipTextCache.set(cacheKey, text);
    return text;
  }

  function getTripRealtimeRenderData(trip: TripResult): TripRealtimeRenderData {
    const trainNum = trip.trainNumber;
    const direction = trip.direction;
    const entity = getRealtimeTrip(trainNum);
    const hasLocation = !!entity?.p;
    const tooltipText = hasLocation ? getTooltipText(trainNum, direction) : undefined;

    if (!isToday || entity === undefined) {
      return {
        hasLocation,
        tooltipText,
      };
    }

    let delay = entity.d ?? 0;
    const dayStart = getTransitDayStartEpoch(dateStr);
    const fullTrip = schedule?.t.find((t) => t.i === trainNum);

    if (schedule && fullTrip) {
      const currentStopCanonical = entity.s ? getCanonicalStationId(schedule, entity.s) : undefined;
      const perf = performance?.trips[trainNum];
      const estimate = estimateDelay(
        entity.d ?? 0,
        entity.p,
        currentStopCanonical,
        fullTrip,
        schedule,
        perf,
        Date.now() / 1000,
        dayStart,
      );

      delay = estimate.delaySec;

      if (delay === 0 && estimate.source === 'feed' && entity.t && entity.s) {
        const predictedMins = (entity.t - dayStart) / 60;
        const stopIdx = fullTrip.p ? findStopIndex(schedule, fullTrip.p, entity.s) : -1;
        if (stopIdx !== -1) {
          const scheduledMins = fullTrip.st[stopIdx * 2];
          if (scheduledMins != null) {
            delay = (predictedMins - scheduledMins) * 60;
          }
        }
      }
    }

    const alert = realtime?.a.find((a) => a.tr?.includes(trainNum));
    let delayLabel = formatDelay(delay);
    if (delayLabel === 'on time' && alert) {
      if (alert.h.toLowerCase().includes('delayed')) {
        delayLabel = 'delayed';
      }
    }

    const delayMins = Math.round(delay / 60);

    return {
      delay,
      delayLabel,
      delayClass: getDelayClass(delayMins),
      hasLocation,
      tooltipText,
    };
  }

  // Pre-computed realtime render data map derived from reactivity signals
  const realtimeRenderDataMap = $derived.by(() => {
    const map = new SvelteMap<string, TripRealtimeRenderData>();
    if (!results.length) return map;
    for (const trip of results) {
      map.set(trip.trainNumber, getTripRealtimeRenderData(trip));
    }
    return map;
  });

  function getTripRealtimeRenderDataFromMap(trip: TripResult): TripRealtimeRenderData {
    return realtimeRenderDataMap.get(trip.trainNumber) ?? { hasLocation: false };
  }

  function toggleTooltip(
    event: MouseEvent | KeyboardEvent,
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

    const target = (event.currentTarget as HTMLElement | null) ?? (event.target as HTMLElement);
    const rect = target.getBoundingClientRect();
    // Position centered over the element
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;

    const perf = performance?.trips[trip.trainNumber];
    const entity = getRealtimeTrip(trip.trainNumber);
    const isRealtimeActive = !!entity;
    const realtimeData = getTripRealtimeRenderData(trip);

    let liveDelaySec = realtimeData.delay;
    if (liveDelaySec === undefined) {
      if (schedule && entity) {
        const fullTrip = schedule.t.find((t) => t.i === trip.trainNumber);
        const dayStart = getTransitDayStartEpoch(dateStr);
        if (fullTrip) {
          const currentStopCanonical = entity.s
            ? getCanonicalStationId(schedule, entity.s)
            : undefined;
          liveDelaySec = estimateDelay(
            entity.d ?? 0,
            entity.p,
            currentStopCanonical,
            fullTrip,
            schedule,
            perf,
            Date.now() / 1000,
            dayStart,
          ).delaySec;
        } else {
          liveDelaySec = entity.d ?? 0;
        }
      } else {
        liveDelaySec = entity?.d ?? 0;
      }
    }
    const currentStopCanonical =
      entity?.s && schedule ? getCanonicalStationId(schedule, entity.s) : entity?.s;
    let perfNote: string | undefined;

    if (perf) {
      const destStop = trip.stopIds[trip.stopIds.length - 1];
      const stopsList = Object.values(perf.stops);
      const destStopPerf =
        (destStop && perf.stops[destStop]) ||
        (destStop && perf.stops[destStop.slice(0, 4)]) ||
        stopsList[stopsList.length - 1];

      if (isRealtimeActive && destStopPerf) {
        const currentStopPerf = currentStopCanonical ? perf.stops[currentStopCanonical] : undefined;
        const currentStopP50 = currentStopPerf ? currentStopPerf.p50Delay : 0;

        const remainingP50Sec = Math.max(0, destStopPerf.p50Delay - currentStopP50);
        const remainingP90Sec = Math.max(0, destStopPerf.p90Delay - currentStopP50);

        const estP50Mins = Math.round((liveDelaySec + remainingP50Sec) / 60);
        const estP90Mins = Math.round((liveDelaySec + remainingP90Sec) / 60);

        const p50Text = estP50Mins <= 0 ? 'on time' : `+${estP50Mins}m`;
        const p90Text = estP90Mins > 0 ? ` (p90: +${estP90Mins}m)` : '';

        perfNote = `est. ${p50Text}${p90Text}`;
      } else if (destStopPerf) {
        const p50Mins = Math.round(destStopPerf.p50Delay / 60);
        const p90Mins = Math.round(destStopPerf.p90Delay / 60);

        const p50Text = p50Mins <= 0 ? 'on time' : `+${p50Mins}m`;
        const p90Text = p90Mins > 0 ? ` (p90: +${p90Mins}m)` : '';

        perfNote = `typical ${p50Text}${p90Text}`;
      }
    }

    const stops = trip.stopIds.map((stopId) => {
      const name = getStationName(stopId);
      let estText: string | undefined;
      let delayClass: string | undefined;

      if (perf) {
        const stopPerf = perf.stops[stopId] || perf.stops[stopId.slice(0, 4)];
        if (isRealtimeActive && entity) {
          const currentStopPerf = currentStopCanonical
            ? perf.stops[currentStopCanonical]
            : undefined;
          const currentStopP50 = currentStopPerf ? currentStopPerf.p50Delay : 0;
          const targetP50 = stopPerf ? stopPerf.p50Delay : 0;

          const remainingP50Sec = Math.max(0, targetP50 - currentStopP50);
          const estP50Mins = Math.round((liveDelaySec + remainingP50Sec) / 60);

          if (estP50Mins <= 0) {
            estText = 'on time';
            delayClass = 'text-transit-brand-soft-text font-medium';
          } else {
            estText = `+${estP50Mins}m`;
            delayClass = `${getDelayClass(estP50Mins)} font-semibold`;
          }
        } else if (stopPerf) {
          const p50Mins = Math.round(stopPerf.p50Delay / 60);
          if (p50Mins <= 0) {
            estText = 'on time';
            delayClass = 'text-transit-text-tertiary';
          } else {
            estText = `+${p50Mins}m`;
            delayClass = `${getDelayClass(p50Mins)} font-medium`;
          }
        }
      }

      return { stopId, name, estText, delayClass };
    });

    activeTooltip = {
      id: trip.trainNumber,
      text,
      perfNote,
      stops,
      x,
      y,
    };
  }

  function closeTooltip() {
    activeTooltip = null;
  }

  $effect(() => {
    if (schedule && origin && destination && !searched) {
      search();
      if (scrollLeft > 0) {
        tick().then(() => {
          if (tripScrollEl) {
            tripScrollEl.scrollLeft = scrollLeft;
          }
        });
      }
    }
  });

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
      <h1
        class="text-2xl font-bold text-transit-text-primary flex items-center justify-center gap-3"
      >
        Caltrain <img src="/icon.svg" alt="Logo" class="h-8 w-auto" width="32" height="32" />
      </h1>
    </header>

    <!-- Favorites List -->
    {#if !searched}
      <FavoritesList
        {favorites}
        {getStationName}
        onSelectFavorite={selectFavorite}
        onRemoveFavorite={handleRemoveFavorite}
      />
    {/if}

    <!-- Search Form -->
    <TripSearchForm
      {stations}
      bind:origin
      bind:destination
      bind:dateStr
      {isCurrentFavorite}
      onSearch={search}
      onDateChange={handleDateChange}
      onSwap={swap}
      onPrevDay={prevDay}
      onNextDay={nextDay}
      onGoNow={goNow}
      onClear={clearState}
      onToggleFavorite={handleToggleFavorite}
    />

    <!-- Results Table -->
    {#if searched}
      <TripTable
        {results}
        {origin}
        {destination}
        {currentFare}
        {formattedDate}
        {scheduleType}
        {isToday}
        {realtime}
        {lastSuccessfulFetch}
        {isPastEndOfSchedule}
        {scheduleEndDate}
        {dateStr}
        bind:scrollLeft
        bind:tripScrollEl
        {getStationName}
        {truncateStation}
        {getRouteStyle}
        getTripRealtimeRenderData={getTripRealtimeRenderDataFromMap}
        onToggleTooltip={toggleTooltip}
      />
    {/if}

    <!-- Service Alerts -->
    {#if realtime}
      <ServiceAlertsBanner alerts={realtime.a} />
    {/if}

    <!-- Spacer for better scrolling -->
    <div class="h-32"></div>

    <!-- Active Tooltip Modal -->
    <TripTooltipModal {activeTooltip} onClose={closeTooltip} />
  </div>
</main>
