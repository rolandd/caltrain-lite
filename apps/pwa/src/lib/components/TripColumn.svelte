<script lang="ts">
  // SPDX-License-Identifier: MIT
  // Copyright 2026 Roland Dreier <roland@rolandd.dev>

  import MapPinIcon from '@lucide/svelte/icons/map-pin';
  import type { TripResult } from '#lib/schedule.js';
  import type { TripTimeStatus } from '#lib/time.js';

  export interface TripRealtimeRenderData {
    delay?: number;
    delayLabel?: string;
    delayClass?: string;
    hasLocation: boolean;
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
    status?: TripTimeStatus;
    onToggleTooltip: (e: MouseEvent | KeyboardEvent, trip: TripResult) => void;
  }

  let { trip, rt, style, status = 'upcoming', onToggleTooltip }: Props = $props();

  const isPast = $derived(status === 'past');
</script>

<div
  class="relative flex-shrink-0 w-[84px] flex flex-col border-r border-border last:border-r-0 transition-colors {isPast
    ? 'bg-background'
    : style.bg}"
  role="listitem"
  data-trip-status={status}
>
  {#if status === 'next'}
    <div
      class="pointer-events-none absolute top-0 inset-x-0 h-[2.5px] bg-transit-brand"
      aria-hidden="true"
    ></div>
  {/if}

  <!-- Column header: train number + route badge -->
  <div
    class="h-[52px] flex flex-col items-center justify-center gap-1 px-1 border-b {isPast
      ? 'border-border'
      : style.border}"
  >
    <span
      class="text-[0.7rem] font-mono {isPast
        ? 'text-transit-text-tertiary'
        : 'text-muted-foreground'}">#{trip.trainNumber}</span
    >
    <span
      class="text-[0.6rem] font-bold px-1.5 py-0.5 rounded-full uppercase {isPast
        ? 'bg-muted text-transit-text-tertiary'
        : style.badge}"
    >
      {style.label}
    </span>
  </div>

  <!-- Trip body: departure / middle info / arrival -->
  <div
    class="flex flex-col items-center justify-between flex-1 py-3 px-1 gap-2 cursor-pointer hover:bg-accent active:bg-accent transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:outline-none"
    role="button"
    tabindex="0"
    aria-haspopup="dialog"
    onclick={(e) => onToggleTooltip(e, trip)}
    onkeydown={(e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        if (e.key === ' ') {
          e.preventDefault();
        }
        if (e.repeat) return;
        onToggleTooltip(e, trip);
      }
    }}
    title="View trip details"
  >
    <!-- Departure + optional delay -->
    <div class="flex flex-col items-center gap-0.5 pointer-events-none">
      <div class="flex flex-col items-center">
        <span
          class="text-base tabular-nums {status === 'next'
            ? 'font-bold text-transit-brand'
            : isPast
              ? 'font-semibold text-muted-foreground'
              : 'font-bold text-foreground'}"
        >
          {trip.departure}
        </span>
        {#if rt.delay !== undefined}
          <span
            class="text-[0.6rem] font-semibold leading-tight text-center flex items-center gap-0.5 {rt.delayClass}"
          >
            {rt.delayLabel}
            {#if rt.hasLocation}
              <MapPinIcon class="w-3 h-3 shrink-0" aria-hidden="true" />
            {/if}
          </span>
        {/if}
      </div>
    </div>

    <!-- Duration + intermediate stops -->
    <div class="flex flex-col items-center gap-0.5 text-center pointer-events-none">
      <span class="text-[0.7rem] {isPast ? 'text-transit-text-tertiary' : 'text-muted-foreground'}">
        {trip.durationMinutes}m
      </span>
      <span
        class="text-[0.65rem] {isPast ? 'text-transit-text-tertiary' : 'text-muted-foreground'}"
      >
        {trip.intermediateStops === 0
          ? 'non-stop'
          : trip.intermediateStops === 1
            ? '1 stop'
            : `${trip.intermediateStops} stops`}
      </span>
    </div>

    <!-- Arrival -->
    <div class="flex flex-col items-center pointer-events-none">
      <span
        class="text-sm tabular-nums {isPast
          ? 'font-semibold text-muted-foreground'
          : 'font-bold text-foreground'}">{trip.arrival}</span
      >
    </div>
  </div>
</div>
