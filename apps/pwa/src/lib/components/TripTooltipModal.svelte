<script lang="ts">
  // SPDX-License-Identifier: MIT
  // Copyright 2026 Roland Dreier <roland@rolandd.dev>

  import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
  import ClockIcon from '@lucide/svelte/icons/clock';
  import MapPinIcon from '@lucide/svelte/icons/map-pin';
  import * as Dialog from '#lib/components/ui/dialog/index.js';

  export interface ActiveTooltip {
    id: string;
    routeLabel: string;
    routeBadgeClass: string;
    departure: string;
    arrival: string;
    durationMinutes: number;
    text?: string;
    perfNote?: string;
    stops: Array<{
      stopId: string;
      name: string;
      estText?: string;
      delayClass?: string;
    }>;
  }

  interface Props {
    activeTooltip: ActiveTooltip | null;
    onClose: () => void;
  }

  let { activeTooltip, onClose }: Props = $props();

  // Keep the last non-null tooltip while the close animation plays so content
  // fades out smoothly instead of vanishing before the dialog unmounts.
  let lastTooltip = $state<ActiveTooltip | null>(null);
  $effect(() => {
    if (activeTooltip) {
      lastTooltip = activeTooltip;
    }
  });
  const displayedTooltip = $derived(activeTooltip ?? lastTooltip);
</script>

<Dialog.Root
  open={Boolean(activeTooltip)}
  onOpenChange={(open) => {
    if (!open) onClose();
  }}
  onOpenChangeComplete={(open) => {
    if (!open) lastTooltip = null;
  }}
>
  <Dialog.Content class="p-0 overflow-hidden" aria-label="Trip Stops">
    {#if displayedTooltip}
      <Dialog.Header class="pr-11 bg-card">
        <Dialog.Title class="flex items-center gap-2">
          <span class="font-mono text-foreground">#{displayedTooltip.id}</span>
          <span
            class="text-[0.65rem] font-bold px-2 py-0.5 rounded-full uppercase {displayedTooltip.routeBadgeClass}"
          >
            {displayedTooltip.routeLabel}
          </span>
        </Dialog.Title>
        <Dialog.Description class="flex items-center gap-1.5 tabular-nums">
          <span class="font-semibold text-foreground">{displayedTooltip.departure}</span>
          <ArrowRightIcon class="h-3 w-3 text-muted-foreground" aria-hidden="true" />
          <span class="font-semibold text-foreground">{displayedTooltip.arrival}</span>
          <span class="text-muted-foreground">· {displayedTooltip.durationMinutes} min</span>
        </Dialog.Description>
      </Dialog.Header>

      <!-- Optional Realtime Location Banner -->
      {#if displayedTooltip.text}
        <div
          class="bg-transit-brand-soft-bg text-transit-brand-soft-text px-3.5 py-2 border-b border-border text-xs font-medium leading-snug flex items-center justify-center gap-1.5 text-center"
        >
          <MapPinIcon class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{displayedTooltip.text}</span>
        </div>
      {/if}

      {#if displayedTooltip.perfNote}
        <div
          class="bg-muted text-transit-text-tertiary px-3.5 py-1.5 border-b border-border text-[0.7rem] flex items-center justify-center gap-1.5 text-center"
        >
          <ClockIcon class="h-3 w-3 shrink-0" aria-hidden="true" />
          <span>{displayedTooltip.perfNote}</span>
        </div>
      {/if}

      <!-- Stop Timeline -->
      <div class="flex flex-col py-2.5 px-2 max-h-[min(55vh,340px)] overflow-y-auto w-full">
        {#each displayedTooltip.stops as stop, i (stop.stopId)}
          {@const isEndpoint = i === 0 || i === displayedTooltip.stops.length - 1}
          <div class="flex items-stretch min-h-7">
            <div class="relative w-7 flex flex-col items-center shrink-0">
              <div
                class="w-0.5 {i === 0
                  ? 'bg-transparent h-1/2 mt-auto'
                  : 'bg-transit-tooltip-line h-1/2'}"
              ></div>
              <div
                class="w-0.5 {i === displayedTooltip.stops.length - 1
                  ? 'bg-transparent h-1/2 mb-auto'
                  : 'bg-transit-tooltip-line h-1/2'}"
              ></div>
              <div
                class="w-2.5 h-2.5 rounded-full absolute top-1/2 -translate-y-1/2 {isEndpoint
                  ? 'bg-transit-brand ring-2 ring-popover'
                  : 'bg-transit-tooltip-node'}"
              ></div>
            </div>
            <div class="flex-1 flex items-center justify-between py-1 pr-2.5 min-w-0">
              <span
                class="truncate text-[0.8125rem] pr-2 {isEndpoint
                  ? 'text-foreground font-semibold'
                  : 'text-muted-foreground'}"
              >
                {stop.name}
              </span>
              {#if stop.estText}
                <span
                  class="text-[0.68rem] px-1.5 py-0.5 rounded-md bg-muted shrink-0 tabular-nums {stop.delayClass ??
                    'text-transit-text-tertiary'}"
                >
                  {stop.estText}
                </span>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </Dialog.Content>
</Dialog.Root>
