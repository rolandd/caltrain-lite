<script lang="ts">
  // SPDX-License-Identifier: MIT
  // Copyright 2026 Roland Dreier <roland@rolandd.dev>

  import type { TripResult } from '$lib/schedule';
  import type { RealtimeStatusWithMetadata } from '$lib/realtime';
  import { getTransitDateAtNoon, formatNoTripsDate } from '$lib/time';
  import TripColumn, { type TripRealtimeRenderData, type RouteStyle } from './TripColumn.svelte';

  interface Props {
    results: TripResult[];
    origin: string;
    destination: string;
    currentFare: number | null;
    formattedDate: string;
    scheduleType: 'Weekday' | 'Weekend' | 'Special' | null;
    isToday: boolean;
    realtime: RealtimeStatusWithMetadata | null;
    lastSuccessfulFetch: number | null;
    isPastEndOfSchedule: boolean;
    scheduleEndDate: string;
    dateStr: string;
    scrollLeft: number;
    tripScrollEl: HTMLDivElement | undefined;
    getStationName: (id: string) => string;
    truncateStation: (name: string, maxLen?: number) => string;
    getRouteStyle: (routeType: string) => RouteStyle;
    getTripRealtimeRenderData: (trip: TripResult) => TripRealtimeRenderData;
    onToggleTooltip: (
      e: MouseEvent | KeyboardEvent,
      trip: TripResult,
      precomputedText?: string,
    ) => void;
  }

  let {
    results,
    origin,
    destination,
    currentFare,
    formattedDate,
    scheduleType,
    isToday,
    realtime,
    lastSuccessfulFetch,
    isPastEndOfSchedule,
    scheduleEndDate,
    dateStr,
    scrollLeft = $bindable(),
    tripScrollEl = $bindable(),
    getStationName,
    truncateStation,
    getRouteStyle,
    getTripRealtimeRenderData,
    onToggleTooltip,
  }: Props = $props();

  function restoreScroll(node: HTMLDivElement) {
    if (scrollLeft > 0) {
      node.scrollLeft = scrollLeft;
    }
  }
</script>

<section aria-live="polite">
  {#if results.length > 0}
    <!-- Status bar -->
    <div class="flex items-center justify-between mb-3 text-[0.8125rem] text-transit-text-muted">
      <span>{results.length} trips</span>
      <span class="font-medium text-transit-text-primary">
        {formattedDate}
        {#if scheduleType}
          <span class="text-transit-text-muted font-normal">· {scheduleType}</span>
        {/if}
      </span>
      {#if realtime && isToday}
        {@const now = Date.now()}
        {@const fetchAgeMs = lastSuccessfulFetch ? now - lastSuccessfulFetch : 0}
        {@const feedAgeMs = realtime.initialAge + (now - realtime.fetchedAt)}
        {@const maxAgeMs = Math.max(fetchAgeMs, feedAgeMs)}

        {#if maxAgeMs < 180000}
          <span class="text-transit-brand font-semibold animate-pulse">● Live</span>
        {:else if maxAgeMs < 600000}
          <span class="text-transit-warning font-semibold">● Old</span>
        {/if}
      {:else}
        <span></span>
      {/if}
    </div>

    <!--
      Route table: fixed left panel + horizontally scrollable trip columns.
      The outer wrapper clips overflow; the inner flex row holds both panels.
    -->
    <div class="relative rounded-xl overflow-hidden border border-transit-border-subtle">
      <div
        class="flex overflow-x-auto touch-pan-x touch-pan-y overscroll-x-contain"
        bind:this={tripScrollEl}
        use:restoreScroll
        onscroll={() => {
          if (tripScrollEl) scrollLeft = tripScrollEl.scrollLeft;
        }}
      >
        <!-- Fixed left panel: origin → fare → destination -->
        <div
          class="sticky left-0 z-10 flex-shrink-0 w-[108px] bg-transit-surface-card border-r border-transit-border-subtle flex flex-col"
          aria-label="Route"
        >
          <!-- Header spacer (matches trip column header height) -->
          <div class="h-[52px] border-b border-transit-border-subtle"></div>

          <!-- Station info body -->
          <div class="flex flex-col flex-1 items-center justify-between px-2 py-3 gap-1">
            <!-- Origin -->
            <div class="text-center">
              <div class="text-[0.65rem] text-transit-text-muted uppercase tracking-wider mb-0.5">
                From
              </div>
              <div class="text-[0.8rem] font-semibold text-transit-text-primary leading-tight">
                {truncateStation(getStationName(origin))}
              </div>
            </div>

            <!-- Fare connector -->
            <div class="flex flex-col items-center gap-0.5 my-1">
              <div class="w-px h-3 bg-transit-border-default"></div>
              {#if currentFare !== null}
                <div
                  class="text-[0.7rem] font-bold text-transit-brand px-1.5 py-0.5 bg-transit-brand-soft-bg/35 rounded-full border border-transit-border-brand"
                >
                  ${(currentFare / 100).toFixed(2)}
                </div>
              {/if}
              <div class="w-px h-3 bg-transit-border-default"></div>
            </div>

            <!-- Destination -->
            <div class="text-center">
              <div class="text-[0.65rem] text-transit-text-muted uppercase tracking-wider mb-0.5">
                To
              </div>
              <div class="text-[0.8rem] font-semibold text-transit-text-primary leading-tight">
                {truncateStation(getStationName(destination))}
              </div>
            </div>
          </div>
        </div>

        <!-- Scrollable trip columns -->
        <div class="flex flex-row" role="list" aria-label="Trips">
          {#each results as trip (trip.trainNumber)}
            {@const rt = getTripRealtimeRenderData(trip)}
            {@const style = getRouteStyle(trip.routeType)}
            <TripColumn {trip} {rt} {style} {onToggleTooltip} />
          {/each}
        </div>
      </div>
    </div>
  {:else}
    <div class="text-center p-8 opacity-60">
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
