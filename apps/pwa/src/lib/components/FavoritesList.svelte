<script lang="ts">
  // SPDX-License-Identifier: MIT
  // Copyright 2026 Roland Dreier <roland@rolandd.dev>

  import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
  import StarIcon from '@lucide/svelte/icons/star';
  import XIcon from '@lucide/svelte/icons/x';
  import { Button } from '#lib/components/ui/button/index.js';

  interface Props {
    favorites: string[];
    origin: string;
    destination: string;
    isCurrentFavorite: boolean;
    canToggleFavorite: boolean;
    /** False for favorites referencing stations missing from the current schedule. */
    isAvailable: (pair: string) => boolean;
    getStationName: (id: string) => string;
    getStationAbbr: (id: string) => string;
    onSelectFavorite: (pair: string) => void;
    onRemoveFavorite: (pair: string) => void;
    onToggleFavorite: () => void;
  }

  let {
    favorites,
    origin,
    destination,
    isCurrentFavorite,
    canToggleFavorite,
    isAvailable,
    getStationName,
    getStationAbbr,
    onSelectFavorite,
    onRemoveFavorite,
    onToggleFavorite,
  }: Props = $props();
</script>

{#if favorites.length > 0 || canToggleFavorite}
  <div
    class="mt-3 pt-3 border-t border-border flex flex-wrap items-center gap-1.5"
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
        <Button
          variant="control"
          size="xs"
          class={isActive
            ? 'bg-transit-brand-soft-bg text-transit-brand-soft-text border-transit-brand/60 hover:bg-transit-brand-soft-bg hover:border-transit-brand ring-1 ring-transit-brand/40 shadow-[0_0_12px_-2px_var(--tw-shadow-color)] shadow-transit-brand/45'
            : 'text-transit-text-secondary hover:text-foreground'}
          aria-pressed={isActive}
          aria-label="{originName} to {destName}"
          title="{originName} → {destName}"
          onclick={() => onSelectFavorite(pair)}
        >
          <span>{originAbbr}</span>
          <ArrowRightIcon
            class="h-3 w-3 {isActive ? 'text-transit-brand' : 'text-muted-foreground'}"
            aria-hidden="true"
          />
          <span>{destAbbr}</span>
        </Button>
      {:else}
        <div
          class="inline-flex items-center rounded-full text-xs border border-border bg-transit-surface-input opacity-60"
        >
          <span
            class="inline-flex items-center gap-1 pl-2.5 pr-1.5 h-8 font-semibold text-muted-foreground cursor-not-allowed select-none"
            title="{originName} → {destName} (not in current schedule)"
          >
            <span>{originAbbr}</span>
            <ArrowRightIcon class="h-3 w-3 text-muted-foreground" aria-hidden="true" />
            <span>{destAbbr}</span>
          </span>
          <button
            type="button"
            class="inline-flex items-center justify-center pr-2 pl-1 h-8 rounded-r-full text-muted-foreground hover:text-transit-danger cursor-pointer bg-transparent border-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            aria-label="Remove unavailable favorite {originName} to {destName}"
            title="Remove favorite"
            onclick={() => onRemoveFavorite(pair)}
          >
            <XIcon class="h-3 w-3" aria-hidden="true" />
          </button>
        </div>
      {/if}
    {/each}

    {#if canToggleFavorite}
      <Button
        variant="outline"
        size="xs"
        class="ml-auto {isCurrentFavorite
          ? 'text-transit-favorite border-transit-favorite/45 bg-transit-favorite/10 hover:bg-transit-favorite/15 hover:border-transit-favorite/65'
          : 'text-muted-foreground hover:text-transit-favorite border-dashed border-transit-border-default/65 hover:border-transit-favorite/50 hover:bg-transit-favorite/5'}"
        onclick={onToggleFavorite}
        aria-label={isCurrentFavorite ? 'Remove favorite' : 'Add favorite'}
        title={isCurrentFavorite ? 'Remove favorite' : 'Add favorite'}
        aria-pressed={isCurrentFavorite}
      >
        <StarIcon
          class="h-3.5 w-3.5 {isCurrentFavorite ? 'fill-current' : ''}"
          aria-hidden="true"
        />
        <span>{favorites.length === 0 ? 'Save route' : 'Fav'}</span>
      </Button>
    {/if}
  </div>
{/if}
