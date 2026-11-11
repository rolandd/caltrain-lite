<script lang="ts">
  // SPDX-License-Identifier: MIT
  // Copyright 2026 Roland Dreier <roland@rolandd.dev>

  interface Props {
    favorites: string[];
    origin: string;
    destination: string;
    /** False for favorites referencing stations missing from the current schedule. */
    isAvailable: (pair: string) => boolean;
    getStationName: (id: string) => string;
    getStationAbbr: (id: string) => string;
    onSelectFavorite: (pair: string) => void;
    onRemoveFavorite: (pair: string) => void;
  }

  let {
    favorites,
    origin,
    destination,
    isAvailable,
    getStationName,
    getStationAbbr,
    onSelectFavorite,
    onRemoveFavorite,
  }: Props = $props();
</script>

{#if favorites.length > 0}
  <div
    class="mt-3 pt-3 border-t border-transit-border-subtle flex flex-wrap items-center gap-1.5"
    role="group"
    aria-label="Favorite trips"
  >
    {#each favorites as pair (pair)}
      {@const [o = '', d = ''] = pair.split('-')}
      {@const available = isAvailable(pair)}
      {@const isActive = available && o === origin && d === destination}
      {@const originName = getStationName(o)}
      {@const destName = getStationName(d)}
      {@const originAbbr = getStationAbbr(o)}
      {@const destAbbr = getStationAbbr(d)}

      {#if available}
        <button
          type="button"
          class="inline-flex items-center gap-1 px-2.5 py-1 min-h-8 rounded-full text-xs font-semibold border transition-all cursor-pointer active:scale-95 select-none focus-visible:ring-2 focus-visible:ring-transit-brand focus-visible:outline-2 focus-visible:outline-transparent {isActive
            ? 'bg-transit-brand-soft-bg text-transit-brand-soft-text border-transit-border-brand'
            : 'bg-transit-surface-input hover:bg-transit-surface-hover-soft text-transit-text-secondary hover:text-transit-text-primary border-transit-border-subtle hover:border-transit-border-default'}"
          aria-pressed={isActive}
          aria-label="{originName} to {destName}"
          title="{originName} → {destName}"
          onclick={() => onSelectFavorite(pair)}
        >
          <span>{originAbbr}</span>
          <span
            class={isActive ? 'text-transit-brand' : 'text-transit-text-muted'}
            aria-hidden="true">→</span
          >
          <span>{destAbbr}</span>
        </button>
      {:else}
        <div
          class="inline-flex items-center rounded-full text-xs border border-transit-border-subtle bg-transit-surface-input opacity-60"
        >
          <span
            class="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 min-h-8 font-semibold text-transit-text-muted cursor-not-allowed select-none"
            title="{originName} → {destName} (not in current schedule)"
          >
            <span>{originAbbr}</span>
            <span class="text-transit-text-muted" aria-hidden="true">→</span>
            <span>{destAbbr}</span>
          </span>
          <button
            type="button"
            class="inline-flex items-center justify-center pr-2 pl-1 py-1 min-h-8 rounded-r-full text-transit-text-muted hover:text-transit-danger cursor-pointer bg-transparent border-none transition-colors focus-visible:ring-2 focus-visible:ring-transit-brand focus-visible:outline-2 focus-visible:outline-transparent"
            aria-label="Remove unavailable favorite {originName} to {destName}"
            title="Remove favorite"
            onclick={() => onRemoveFavorite(pair)}
          >
            ✕
          </button>
        </div>
      {/if}
    {/each}
  </div>
{/if}
