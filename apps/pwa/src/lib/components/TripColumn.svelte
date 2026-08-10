<script lang="ts">
  // SPDX-License-Identifier: MIT
  // Copyright 2026 Roland Dreier <roland@rolandd.dev>

  import type { TripResult } from '$lib/schedule';

  export interface TripRealtimeRenderData {
    delay?: number;
    delayLabel?: string;
    delayClass?: string;
    hasLocation: boolean;
    tooltipText?: string;
  }

  export interface RouteStyle {
    bg: string;
    border: string;
    badge: string;
    label: string;
  }

  interface Props {
    trip: TripResult;
    rt: TripRealtimeRenderData;
    style: RouteStyle;
    onToggleTooltip: (
      e: MouseEvent | KeyboardEvent,
      trip: TripResult,
      precomputedText?: string,
    ) => void;
  }

  let { trip, rt, style, onToggleTooltip }: Props = $props();
</script>

<div
  class="flex-shrink-0 w-[84px] flex flex-col border-r border-transit-border-subtle last:border-r-0 {style.bg}"
  role="listitem"
>
  <!-- Column header: train number + route badge -->
  <div
    class="h-[52px] flex flex-col items-center justify-center gap-1 px-1 border-b {style.border}"
  >
    <span class="text-[0.7rem] font-mono text-transit-text-muted">#{trip.trainNumber}</span>
    <span class="text-[0.6rem] font-bold px-1.5 py-0.5 rounded-full uppercase {style.badge}">
      {style.label}
    </span>
  </div>

  <!-- Trip body: departure / middle info / arrival -->
  <div
    class="flex flex-col items-center justify-between flex-1 py-3 px-1 gap-2 cursor-pointer hover:bg-transit-surface-hover-soft transition-colors rounded"
    role="button"
    tabindex="0"
    onclick={(e) => onToggleTooltip(e, trip, rt.tooltipText)}
    onkeydown={(e) => e.key === 'Enter' && onToggleTooltip(e, trip, rt.tooltipText)}
    title={rt.tooltipText || 'View trip details'}
  >
    <!-- Departure + optional delay -->
    <div class="flex flex-col items-center gap-0.5 pointer-events-none">
      <div class="flex flex-col items-center">
        <span class="text-[1rem] font-bold text-transit-text-primary tabular-nums"
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
                fill="currentColor"
                class="w-3 h-3 text-transit-warning"
                viewBox="0 0 20 20"
              >
                <path
                  fill-rule="evenodd"
                  d="M9.69 18.933a11.54 11.54 0 0 0 7.31-9.933A7 7 0 1 0 3 9c0 3.492 1.698 5.988 3.355 7.584a13.731 13.731 0 0 0 2.273 1.765 11.842 11.842 0 0 0 1.056.584l.006.003ZM10 11.25a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5Z"
                  clip-rule="evenodd"
                />
              </svg>
            {/if}
          </span>
        {/if}
      </div>
    </div>

    <!-- Duration + intermediate stops -->
    <div class="flex flex-col items-center gap-0.5 text-center pointer-events-none">
      <span class="text-[0.7rem] text-transit-text-muted">{trip.durationMinutes}m</span>
      <span class="text-[0.65rem] text-transit-text-muted">
        {trip.intermediateStops === 0
          ? 'non-stop'
          : trip.intermediateStops === 1
            ? '1 stop'
            : `${trip.intermediateStops} stops`}
      </span>
    </div>

    <!-- Arrival -->
    <div class="flex flex-col items-center pointer-events-none">
      <span class="text-[0.875rem] font-semibold text-transit-text-muted tabular-nums"
        >{trip.arrival}</span
      >
    </div>
  </div>
</div>
