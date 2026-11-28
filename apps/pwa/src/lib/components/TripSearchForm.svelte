<script lang="ts">
  // SPDX-License-Identifier: MIT
  // Copyright 2026 Roland Dreier <roland@rolandd.dev>

  import type { Snippet } from 'svelte';
  import ArrowLeftRightIcon from '@lucide/svelte/icons/arrow-left-right';
  import ArrowUpDownIcon from '@lucide/svelte/icons/arrow-up-down';
  import CalendarIcon from '@lucide/svelte/icons/calendar';
  import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
  import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
  import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
  import ClockIcon from '@lucide/svelte/icons/clock';
  import type { StationInfo } from '#lib/schedule.js';
  import { formatTransitDateSmart } from '#lib/time.js';
  import { Button } from '#lib/components/ui/button/index.js';
  import { Card } from '#lib/components/ui/card/index.js';

  interface Props {
    stations: StationInfo[];
    origin: string;
    destination: string;
    dateStr: string;
    todayDateStr: string;
    onSearch: () => void;
    onDateChange: () => void;
    onSwap: () => void;
    onPrevDay: () => void;
    onNextDay: () => void;
    onGoNow: () => void;
    children?: Snippet;
  }

  let {
    stations,
    origin = $bindable(),
    destination = $bindable(),
    dateStr = $bindable(),
    todayDateStr,
    onSearch,
    onDateChange,
    onSwap,
    onPrevDay,
    onNextDay,
    onGoNow,
    children,
  }: Props = $props();

  let dateInputEl = $state<HTMLInputElement | null>(null);

  const smartDate = $derived(formatTransitDateSmart(dateStr, todayDateStr));

  function openDatePicker() {
    try {
      dateInputEl?.showPicker?.();
    } catch {
      // Fallback for browsers where showPicker is unavailable or picker is already opening
    }
  }
</script>

<Card class="p-4 mb-5">
  <div
    class="grid grid-cols-[1fr_auto_1fr] items-center gap-2 mb-3 max-[480px]:grid-cols-[1fr_auto] max-[480px]:gap-y-2.5"
  >
    <div class="col-start-1 row-start-1 flex items-center gap-2.5 min-w-0">
      <label
        class="text-xs font-semibold text-muted-foreground uppercase w-8 text-right shrink-0"
        for="origin">From</label
      >
      <div class="relative flex-1 min-w-0">
        <select
          id="origin"
          class="h-11 appearance-none bg-transit-surface-input border border-border hover:border-transit-border-default rounded-lg text-foreground text-base pl-3 pr-9 w-full min-w-0 transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          bind:value={origin}
          onchange={onSearch}
        >
          <option value="">Select station...</option>
          {#each stations as s (s.id)}
            <option value={s.id} disabled={s.id === destination}>{s.name}</option>
          {/each}
        </select>
        <ChevronDownIcon
          class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
          aria-hidden="true"
        />
      </div>
    </div>

    <!-- Swap button (outlined control matching date arrows; horizontal on desktop, vertical on mobile) -->
    <Button
      variant="control"
      size="icon"
      class="col-start-2 row-start-1 max-[480px]:row-span-2 self-center h-10 w-10 max-[480px]:h-11 max-[480px]:w-11 text-transit-brand hover:text-foreground"
      onclick={onSwap}
      aria-label="Swap stations"
      title="Swap stations"
      disabled={!origin && !destination}
    >
      <ArrowLeftRightIcon class="h-4 w-4 max-[480px]:hidden" aria-hidden="true" />
      <ArrowUpDownIcon class="hidden h-4 w-4 max-[480px]:block" aria-hidden="true" />
    </Button>

    <div
      class="col-start-3 row-start-1 max-[480px]:col-start-1 max-[480px]:row-start-2 flex items-center gap-2.5 min-w-0"
    >
      <label
        class="text-xs font-semibold text-muted-foreground uppercase w-8 min-[481px]:w-auto text-right shrink-0"
        for="destination">To</label
      >
      <div class="relative flex-1 min-w-0">
        <select
          id="destination"
          class="h-11 appearance-none bg-transit-surface-input border border-border hover:border-transit-border-default rounded-lg text-foreground text-base pl-3 pr-9 w-full min-w-0 transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          bind:value={destination}
          onchange={onSearch}
        >
          <option value="">Select station...</option>
          {#each stations as s (s.id)}
            <option value={s.id} disabled={s.id === origin}>{s.name}</option>
          {/each}
        </select>
        <ChevronDownIcon
          class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
          aria-hidden="true"
        />
      </div>
    </div>
  </div>

  <!-- Compact single-row date navigation + Now action -->
  <div class="flex items-center gap-2 max-[480px]:gap-1.5 min-w-0">
    <label
      class="text-xs font-semibold text-muted-foreground uppercase w-8 text-right shrink-0 max-[480px]:sr-only"
      for="date">Date</label
    >
    <div class="flex items-center gap-1.5 max-[480px]:gap-1 flex-1 min-w-0">
      <Button
        variant="control"
        size="icon"
        class="max-[480px]:w-9"
        onclick={onPrevDay}
        aria-label="Previous day"
        title="Previous day"
      >
        <ChevronLeftIcon class="h-4 w-4" aria-hidden="true" />
      </Button>

      <!-- Consolidated rich date display with transparent native date input overlay -->
      <div
        class="relative h-11 flex-1 min-w-0 rounded-lg bg-transit-surface-input border border-border hover:bg-accent hover:border-transit-border-default transition-colors flex items-center justify-center px-2.5 max-[480px]:px-2 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
      >
        <span
          class="pointer-events-none flex items-center justify-center gap-1.5 text-sm font-medium text-foreground min-w-0"
          aria-hidden="true"
        >
          <CalendarIcon class="h-3.5 w-3.5 text-muted-foreground shrink-0 max-[480px]:hidden" />
          {#if smartDate.relative}
            <span
              class="min-w-0 flex items-center justify-center max-[539px]:flex-col max-[539px]:gap-0.5"
            >
              <span
                class="text-transit-brand font-semibold max-[539px]:text-[0.65rem] max-[539px]:uppercase max-[539px]:tracking-wider max-[539px]:leading-none"
                >{smartDate.relative}</span
              >
              <span class="text-muted-foreground mx-1 max-[539px]:hidden">·</span>
              <span class="truncate max-[539px]:text-[0.8125rem] max-[539px]:leading-tight"
                >{smartDate.dateLabel}</span
              >
            </span>
          {:else}
            <span class="truncate max-[480px]:text-[0.8125rem]">{smartDate.dateLabel}</span>
          {/if}
        </span>
        <input
          bind:this={dateInputEl}
          id="date"
          type="date"
          class="date-picker-overlay absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          bind:value={dateStr}
          onchange={onDateChange}
          onblur={onDateChange}
          onclick={openDatePicker}
          aria-label="Travel date: {smartDate.text}"
        />
      </div>

      <Button
        variant="control"
        size="icon"
        class="max-[480px]:w-9"
        onclick={onNextDay}
        aria-label="Next day"
        title="Next day"
      >
        <ChevronRightIcon class="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>

    <Button
      variant="outline"
      size="default"
      class="px-3 max-[480px]:px-2.5 text-transit-brand border-transit-border-brand/70 hover:bg-transit-brand-soft-bg/35 hover:border-transit-border-brand"
      onclick={onGoNow}
      aria-label="Jump to now"
      title="Jump to now"
    >
      <ClockIcon class="h-3.5 w-3.5" aria-hidden="true" />
      <span>Now</span>
    </Button>
  </div>

  {@render children?.()}
</Card>
