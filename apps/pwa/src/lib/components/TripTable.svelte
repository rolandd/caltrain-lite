<script lang="ts">
  // SPDX-License-Identifier: MIT
  // Copyright 2026 Roland Dreier <roland@rolandd.dev>

  import type { TripResult } from '#lib/schedule.js';
  import type { RealtimeStatusWithMetadata } from '#lib/realtime.js';
  import {
    getTransitDateAtNoon,
    formatNoTripsDate,
    getLocalWallTimeUtcSec,
    classifyTripsByTime,
    type TripTimeStatus,
  } from '#lib/time.js';
  import { Badge } from '#lib/components/ui/badge/index.js';
  import { Card } from '#lib/components/ui/card/index.js';
  import TripColumn, { type TripRealtimeRenderData, type RouteStyle } from './TripColumn.svelte';

  interface Props {
    results: TripResult[];
    origin: string;
    destination: string;
    currentFare: number | null;
    scheduleType: 'Weekday' | 'Weekend' | 'Special' | null;
    isRealtimeAvailable: boolean;
    realtime: RealtimeStatusWithMetadata | null;
    lastSuccessfulFetch: number | null;
    isPastEndOfSchedule: boolean;
    scheduleEndDate: string;
    dateStr: string;
    todayDateStr: string;
    nowMs: number;
    scrollLeft: number;
    tripScrollEl: HTMLDivElement | undefined;
    getStationName: (id: string) => string;
    getRouteStyle: (routeType: string) => RouteStyle;
    getTripRealtimeRenderData: (trip: TripResult) => TripRealtimeRenderData;
    onToggleTooltip: (e: MouseEvent | KeyboardEvent, trip: TripResult) => void;
  }

  let {
    results,
    origin,
    destination,
    currentFare,
    scheduleType,
    isRealtimeAvailable,
    realtime,
    lastSuccessfulFetch,
    isPastEndOfSchedule,
    scheduleEndDate,
    dateStr,
    todayDateStr,
    nowMs,
    scrollLeft = $bindable(),
    tripScrollEl = $bindable(),
    getStationName,
    getRouteStyle,
    getTripRealtimeRenderData,
    onToggleTooltip,
  }: Props = $props();

  let canScrollLeft = $state(false);
  let canScrollRight = $state(false);

  function updateScrollShadows() {
    if (!tripScrollEl) {
      canScrollLeft = false;
      canScrollRight = false;
      return;
    }
    const { scrollLeft: left, clientWidth, scrollWidth } = tripScrollEl;
    canScrollLeft = left > 2;
    canScrollRight = left + clientWidth < scrollWidth - 2;
  }

  function restoreScroll(node: HTMLDivElement) {
    if (scrollLeft > 0) {
      node.scrollLeft = scrollLeft;
    }
    updateScrollShadows();
  }

  $effect(() => {
    // Re-evaluate scroll fades whenever results or scroll container change
    void results.length;
    const el = tripScrollEl;
    if (!el) return;

    updateScrollShadows();

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      updateScrollShadows();
    });
    observer.observe(el);
    return () => observer.disconnect();
  });

  const isToday = $derived(dateStr === todayDateStr);

  // Classify each trip once using its effective departure time (scheduled + realtime delay)
  // so delayed earlier trains don't hide an earlier-departing train or mark departed trains upcoming.
  const tripStatuses = $derived.by((): TripTimeStatus[] => {
    if (!isToday || !results.length) {
      return results.map(() => 'upcoming');
    }
    const nowSec = nowMs / 1000;
    const effectiveDepartures = results.map((trip) => {
      const rt = getTripRealtimeRenderData(trip);
      return getLocalWallTimeUtcSec(dateStr, trip.departureMinutes * 60) + (rt.delay ?? 0);
    });
    return classifyTripsByTime(effectiveDepartures, nowSec).statuses;
  });

  const realtimeFreshness = $derived.by(() => {
    if (!isRealtimeAvailable || !realtime) return null;
    const fetchAgeMs = lastSuccessfulFetch ? nowMs - lastSuccessfulFetch : 0;
    const feedAgeMs = realtime.initialAge + (nowMs - realtime.fetchedAt);
    const maxAgeMs = Math.max(fetchAgeMs, feedAgeMs);
    if (maxAgeMs < 180000) return 'live' as const;
    if (maxAgeMs < 600000) return 'old' as const;
    return null;
  });
</script>

<section aria-live="polite">
  {#if results.length > 0}
    <!-- Status bar -->
    <div
      class="flex items-center justify-between gap-2 mb-2.5 text-[0.8125rem] text-muted-foreground"
    >
      <div class="flex items-center gap-2 min-w-0">
        <span class="font-medium text-foreground">
          {results.length}
          {results.length === 1 ? 'trip' : 'trips'}
        </span>
        {#if scheduleType === 'Special'}
          <Badge variant="warning" class="text-[0.7rem] py-0 px-2">Special schedule</Badge>
        {:else if scheduleType}
          <span class="text-muted-foreground">· {scheduleType}</span>
        {/if}
      </div>

      {#if realtimeFreshness === 'live'}
        <span class="inline-flex items-center gap-1.5 text-transit-brand font-semibold shrink-0">
          <span class="relative flex h-2 w-2" aria-hidden="true">
            <span
              class="absolute inline-flex h-full w-full rounded-full bg-transit-brand opacity-75 animate-ping"
            ></span>
            <span class="relative inline-flex rounded-full h-2 w-2 bg-transit-brand"></span>
          </span>
          Live
        </span>
      {:else if realtimeFreshness === 'old'}
        <span class="inline-flex items-center gap-1.5 text-transit-warning font-semibold shrink-0">
          <span class="inline-flex rounded-full h-2 w-2 bg-transit-warning" aria-hidden="true"
          ></span>
          Delayed feed
        </span>
      {/if}
    </div>

    <!--
      Route table: fixed left station/fare panel + horizontally scrollable trip columns.
      Scrollable columns tuck beneath the left panel with dynamic edge fades.
    -->
    <Card class="overflow-hidden contain-paint">
      <div class="flex items-stretch">
        <!-- Fixed left panel: origin → fare → destination -->
        <div
          class="relative z-10 flex-shrink-0 w-[108px] bg-card border-r border-border flex flex-col"
          aria-label="Route"
        >
          <!-- Header spacer (matches trip column header height) -->
          <div class="h-[52px] border-b border-border"></div>

          <!-- Station info body -->
          <div class="flex flex-col flex-1 items-center justify-between px-2 py-3 gap-1">
            <!-- Origin -->
            <div class="text-center w-full px-1">
              <div class="text-[0.65rem] text-muted-foreground uppercase tracking-wider mb-0.5">
                From
              </div>
              <div class="text-[0.8rem] font-semibold text-foreground leading-tight break-words">
                {getStationName(origin)}
              </div>
            </div>

            <!-- Fare connector -->
            <div class="flex flex-col items-center gap-0.5 my-1">
              <div class="w-px h-3 bg-transit-border-default"></div>
              {#if currentFare !== null}
                <Badge
                  variant="brand"
                  class="text-[0.7rem] font-bold px-1.5 py-0.5 text-transit-brand"
                >
                  ${(currentFare / 100).toFixed(2)}
                </Badge>
              {/if}
              <div class="w-px h-3 bg-transit-border-default"></div>
            </div>

            <!-- Destination -->
            <div class="text-center w-full px-1">
              <div class="text-[0.65rem] text-muted-foreground uppercase tracking-wider mb-0.5">
                To
              </div>
              <div class="text-[0.8rem] font-semibold text-foreground leading-tight break-words">
                {getStationName(destination)}
              </div>
            </div>
          </div>
        </div>

        <!-- Scrollable trip columns with tuck-under left shadow and right edge fade -->
        <div class="relative flex-1 min-w-0">
          <div
            class="flex h-full overflow-x-auto touch-pan-x touch-pan-y overscroll-x-contain"
            bind:this={tripScrollEl}
            use:restoreScroll
            onscroll={() => {
              if (tripScrollEl) {
                scrollLeft = tripScrollEl.scrollLeft;
                updateScrollShadows();
              }
            }}
          >
            <div class="flex flex-row" role="list" aria-label="Trips">
              {#each results as trip, i (trip.trainNumber)}
                {@const rt = getTripRealtimeRenderData(trip)}
                {@const style = getRouteStyle(trip.routeType)}
                <TripColumn
                  {trip}
                  {rt}
                  {style}
                  status={tripStatuses[i] ?? 'upcoming'}
                  {onToggleTooltip}
                />
              {/each}
            </div>
          </div>

          <!-- Left tuck-under shadow/fade (shown when scrolled right) -->
          <div
            class="pointer-events-none absolute inset-y-0 left-0 w-5 bg-gradient-to-r from-background/80 via-background/35 to-transparent transition-opacity duration-150 {canScrollLeft
              ? 'opacity-100'
              : 'opacity-0'}"
            aria-hidden="true"
          ></div>

          <!-- Right scroll-hint fade (shown when more trips exist off-screen to the right) -->
          <div
            class="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-background/85 via-background/40 to-transparent transition-opacity duration-150 {canScrollRight
              ? 'opacity-100'
              : 'opacity-0'}"
            aria-hidden="true"
          ></div>
        </div>
      </div>
    </Card>
  {:else}
    <div class="text-center p-8 text-muted-foreground">
      <p>
        {#if isPastEndOfSchedule}
          Schedule only available through {scheduleEndDate}
        {:else}
          No trips found for this route on {formatNoTripsDate(getTransitDateAtNoon(dateStr))}
        {/if}
      </p>
    </div>
  {/if}
</section>
