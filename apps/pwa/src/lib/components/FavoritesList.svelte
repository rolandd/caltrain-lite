<script lang="ts">
  // SPDX-License-Identifier: MIT
  // Copyright 2026 Roland Dreier <roland@rolandd.dev>

  interface Props {
    favorites: string[];
    /** False for favorites referencing stations missing from the current schedule. */
    isAvailable: (pair: string) => boolean;
    getStationName: (id: string) => string;
    onSelectFavorite: (pair: string) => void;
    onRemoveFavorite: (origin: string, destination: string) => void;
  }

  let { favorites, isAvailable, getStationName, onSelectFavorite, onRemoveFavorite }: Props =
    $props();
</script>

{#if favorites.length > 0}
  <section class="mb-6" aria-label="Favorite Trips">
    <h2 class="text-sm text-transit-text-muted mb-3 uppercase tracking-wider font-semibold">
      Favorites
    </h2>
    <div class="grid grid-cols-1 gap-3">
      {#each favorites as pair (pair)}
        {@const [o, d] = pair.split('-')}
        {@const available = isAvailable(pair)}
        <div
          class="bg-transit-surface-card border border-transit-border-subtle rounded-xl flex items-center justify-between p-1 pr-3 transition-colors {available
            ? 'hover:border-transit-border-strong'
            : 'opacity-60'}"
        >
          <button
            class="flex-1 text-left flex items-center gap-2 p-3 bg-transparent border-none text-base font-inherit focus-visible:ring-2 focus-visible:ring-transit-brand focus-visible:outline-2 focus-visible:outline-transparent rounded-lg {available
              ? 'cursor-pointer text-transit-text-primary'
              : 'cursor-not-allowed text-transit-text-muted'}"
            disabled={!available}
            onclick={() => onSelectFavorite(pair)}
          >
            <span class="font-semibold">{getStationName(o)}</span>
            <span class="text-transit-text-muted text-sm">→</span>
            <span class="font-semibold">{getStationName(d)}</span>
            {#if !available}
              <span class="text-transit-text-muted text-xs italic">not in current schedule</span>
            {/if}
          </button>

          <button
            class="text-transit-favorite text-xl cursor-pointer bg-transparent border-none p-2 rounded-full hover:bg-transit-surface-hover-soft transition-colors active:scale-95 flex items-center justify-center leading-none focus-visible:ring-2 focus-visible:ring-transit-brand focus-visible:outline-2 focus-visible:outline-transparent"
            onclick={(e) => {
              e.stopPropagation();
              onRemoveFavorite(o, d);
            }}
            aria-label="Remove favorite"
            title="Remove favorite"
          >
            ★
          </button>
        </div>
      {/each}
    </div>
  </section>
{/if}
