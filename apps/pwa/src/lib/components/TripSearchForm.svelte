<script lang="ts">
  // SPDX-License-Identifier: MIT
  // Copyright 2026 Roland Dreier <roland@rolandd.dev>

  import type { StationInfo } from '$lib/schedule';

  interface Props {
    stations: StationInfo[];
    origin: string;
    destination: string;
    dateStr: string;
    isCurrentFavorite: boolean;
    onSearch: () => void;
    onDateChange: () => void;
    onSwap: () => void;
    onPrevDay: () => void;
    onNextDay: () => void;
    onGoNow: () => void;
    onClear: () => void;
    onToggleFavorite: () => void;
  }

  let {
    stations,
    origin = $bindable(),
    destination = $bindable(),
    dateStr = $bindable(),
    isCurrentFavorite,
    onSearch,
    onDateChange,
    onSwap,
    onPrevDay,
    onNextDay,
    onGoNow,
    onClear,
    onToggleFavorite,
  }: Props = $props();
</script>

<section class="bg-transit-surface-card border border-transit-border-subtle rounded-2xl p-4 mb-6">
  <div class="flex items-center gap-2 mb-4 max-[480px]:flex-col max-[480px]:items-stretch">
    <div class="flex-1 flex items-center gap-3">
      <label
        class="text-xs font-semibold text-transit-text-muted uppercase w-8 text-right"
        for="origin">From</label
      >
      <select
        id="origin"
        class="bg-transit-surface-input border border-transit-border-subtle rounded-[10px] text-transit-text-primary text-base p-3 w-full flex-1 min-w-0 focus-visible:ring-2 focus-visible:ring-transit-brand focus-visible:outline-2 focus-visible:outline-transparent"
        bind:value={origin}
        onchange={onSearch}
      >
        <option value="">Select station...</option>
        {#each stations as s (s.id)}
          <option value={s.id} disabled={s.id === destination}>{s.name}</option>
        {/each}
      </select>
    </div>

    <!-- Mobile swap button -->
    <button
      class="w-11 h-11 bg-transit-surface-elevated border border-transit-border-subtle rounded-[10px] text-transit-brand text-xl cursor-pointer flex-shrink-0 self-center hidden max-[480px]:flex items-center justify-center active:scale-95 transition-transform focus-visible:ring-2 focus-visible:ring-transit-brand focus-visible:outline-2 focus-visible:outline-transparent"
      onclick={onSwap}
      aria-label="Swap stations"
      title="Swap stations"
      disabled={!origin && !destination}
    >
      ⇅
    </button>

    <!-- Desktop swap button -->
    <button
      class="w-8 h-8 bg-transparent border-none text-transit-brand text-xl cursor-pointer flex-shrink-0 self-center max-[480px]:hidden hover:text-transit-text-primary active:scale-95 transition-all focus-visible:ring-2 focus-visible:ring-transit-brand focus-visible:outline-2 focus-visible:outline-transparent rounded-[4px]"
      onclick={onSwap}
      aria-label="Swap stations"
      title="Swap stations"
      disabled={!origin && !destination}
    >
      ⇆
    </button>

    <div class="flex-1 flex items-center gap-3">
      <label
        class="text-xs font-semibold text-transit-text-muted uppercase w-8 text-right max-[480px]:text-left"
        for="destination">To</label
      >
      <select
        id="destination"
        class="bg-transit-surface-input border border-transit-border-subtle rounded-[10px] text-transit-text-primary text-base p-3 w-full flex-1 min-w-0 focus-visible:ring-2 focus-visible:ring-transit-brand focus-visible:outline-2 focus-visible:outline-transparent"
        bind:value={destination}
        onchange={onSearch}
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
      <label
        class="text-xs font-semibold text-transit-text-muted uppercase w-8 text-right"
        for="date">Date</label
      >
      <!-- Date navigation: prev / input / next -->
      <div class="flex items-center gap-1 flex-1 min-w-0">
        <button
          class="w-11 h-11 bg-transit-surface-input hover:bg-transit-surface-hover-soft border border-transit-border-subtle rounded-[10px] text-transit-text-primary text-base cursor-pointer flex items-center justify-center flex-shrink-0 active:scale-95 transition-all focus-visible:ring-2 focus-visible:ring-transit-brand focus-visible:outline-2 focus-visible:outline-transparent"
          onclick={onPrevDay}
          aria-label="Previous day"
          title="Previous day"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            class="w-5 h-5"
            viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="m15.75 19.5-7.5-7.5 7.5-7.5" />
          </svg>
        </button>
        <input
          id="date"
          class="h-11 bg-transit-surface-input border border-transit-border-subtle rounded-[10px] text-transit-text-primary text-base px-2 w-full min-w-0 text-center uppercase focus-visible:ring-2 focus-visible:ring-transit-brand focus-visible:outline-2 focus-visible:outline-transparent"
          type="date"
          bind:value={dateStr}
          onchange={onDateChange}
          onblur={onDateChange}
        />
        <button
          class="w-11 h-11 bg-transit-surface-input hover:bg-transit-surface-hover-soft border border-transit-border-subtle rounded-[10px] text-transit-text-primary text-base cursor-pointer flex items-center justify-center flex-shrink-0 active:scale-95 transition-all focus-visible:ring-2 focus-visible:ring-transit-brand focus-visible:outline-2 focus-visible:outline-transparent"
          onclick={onNextDay}
          aria-label="Next day"
          title="Next day"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            class="w-5 h-5"
            viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Actions: Now / Clear / Favorite -->
    <div class="flex items-center gap-2 max-[480px]:w-full">
      <button
        class="h-11 px-3 bg-transparent hover:bg-transit-surface-hover-soft border border-transit-border-subtle rounded-[10px] text-transit-brand text-sm font-semibold cursor-pointer flex items-center justify-center gap-1.5 flex-1 active:scale-95 transition-all focus-visible:ring-2 focus-visible:ring-transit-brand focus-visible:outline-2 focus-visible:outline-transparent"
        onclick={onGoNow}
        aria-label="Jump to now"
        title="Jump to now"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          class="w-4 h-4 mb-[1px]"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"
          />
        </svg>
        Now
      </button>

      {#if origin || destination}
        <button
          class="h-11 px-3 bg-transparent hover:bg-transit-surface-hover-soft border border-transit-border-subtle rounded-[10px] text-transit-danger text-sm font-semibold cursor-pointer flex items-center justify-center gap-1.5 flex-1 active:scale-95 transition-all focus-visible:ring-2 focus-visible:ring-transit-brand focus-visible:outline-2 focus-visible:outline-transparent"
          onclick={onClear}
          aria-label="Clear selections"
          title="Clear selections"
        >
          <span class="text-lg leading-none pb-[2px]">✕</span> Clear
        </button>
      {/if}

      <button
        class="h-11 px-3 bg-transparent hover:bg-transit-surface-hover-soft border border-transit-border-subtle rounded-[10px] text-transit-favorite text-sm font-semibold cursor-pointer flex items-center justify-center gap-1.5 flex-1 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-transit-brand focus-visible:outline-2 focus-visible:outline-transparent"
        onclick={onToggleFavorite}
        disabled={!origin || !destination}
        aria-label={isCurrentFavorite ? 'Remove favorite' : 'Add favorite'}
        title={isCurrentFavorite ? 'Remove favorite' : 'Add favorite'}
        aria-pressed={isCurrentFavorite}
      >
        <span class="text-lg leading-none pb-[2px]">{isCurrentFavorite ? '★' : '☆'}</span>
        Fav
      </button>
    </div>
  </div>
</section>
