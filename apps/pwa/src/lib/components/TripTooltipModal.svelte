<script lang="ts">
  // SPDX-License-Identifier: MIT
  // Copyright 2026 Roland Dreier <roland@rolandd.dev>

  export interface ActiveTooltip {
    id: string;
    text?: string;
    perfNote?: string;
    stops: Array<{
      stopId: string;
      name: string;
      estText?: string;
      delayClass?: string;
    }>;
    x: number;
    y: number;
  }

  interface Props {
    activeTooltip: ActiveTooltip | null;
    onClose: () => void;
  }

  let { activeTooltip, onClose }: Props = $props();

  $effect(() => {
    if (!activeTooltip) return;

    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  });

  // Clamp tooltip horizontal position within screen boundaries so it doesn't overflow
  let clampedX = $derived.by(() => {
    if (!activeTooltip) return 0;
    if (typeof window === 'undefined') return activeTooltip.x;
    const padding = 125; // Half width of tooltip bubble (235px) + padding
    return Math.max(padding, Math.min(activeTooltip.x, window.innerWidth - padding));
  });
</script>

{#if activeTooltip}
  <!-- Backdrop to close on click outside -->
  <button
    class="fixed inset-0 cursor-default bg-transparent border-none w-full h-full z-40"
    onclick={onClose}
    aria-label="Close tooltip"
    title="Close tooltip"
    tabindex="-1"
  ></button>

  <!-- Tooltip Bubble -->
  <div
    class="fixed z-[50] w-[235px] flex flex-col bg-transit-tooltip-bg text-transit-text-primary text-[0.75rem] rounded-xl shadow-2xl border border-transit-border-strong transform -translate-x-1/2 -translate-y-1/2 overflow-hidden pointer-events-auto"
    style="top: {activeTooltip.y}px; left: {clampedX}px;"
    role="dialog"
    aria-label="Trip Stops"
  >
    <!-- Optional Realtime Location Header -->
    {#if activeTooltip.text}
      <div
        class="bg-transit-brand-soft-bg text-transit-brand-soft-text px-3 py-2 border-b border-transit-border-subtle font-medium leading-tight shadow-sm text-center"
      >
        {activeTooltip.text}
      </div>
    {/if}
    {#if activeTooltip.perfNote}
      <div
        class="bg-transit-surface-elevated text-transit-text-tertiary px-3 py-1 border-b border-transit-border-subtle text-[0.65rem] text-center"
      >
        {activeTooltip.perfNote}
      </div>
    {/if}

    <!-- Stop List -->
    <div class="flex flex-col py-2 px-1 max-h-[320px] overflow-y-auto w-full box-border">
      {#each activeTooltip.stops as stop, i (stop.stopId)}
        <div class="flex items-stretch min-h-[1.75rem]">
          <div class="w-7 flex flex-col items-center flex-shrink-0">
            <div
              class="w-0.5 {i === 0
                ? 'bg-transparent h-1/2 mt-auto'
                : 'bg-transit-tooltip-line h-full'}"
            ></div>
            <div
              class="w-2 h-2 rounded-full {i === 0 || i === activeTooltip.stops.length - 1
                ? 'bg-transit-brand border border-transit-tooltip-bg'
                : 'bg-transit-tooltip-node'} absolute top-1/2 -translate-y-1/2"
            ></div>
            <div
              class="w-0.5 {i === activeTooltip.stops.length - 1
                ? 'bg-transparent h-1/2 mb-auto'
                : 'bg-transit-tooltip-line h-full'}"
            ></div>
          </div>
          <div class="flex-1 flex items-center justify-between py-1 pr-2.5 min-w-0">
            <span
              class="truncate text-[0.78rem] pr-1.5 {i === 0 || i === activeTooltip.stops.length - 1
                ? 'text-transit-text-primary font-medium'
                : 'text-transit-text-muted'}"
            >
              {stop.name}
            </span>
            {#if stop.estText}
              <span
                class="text-[0.65rem] px-1.5 py-0.5 rounded bg-transit-surface-elevated flex-shrink-0 {stop.delayClass ??
                  'text-transit-text-tertiary'}"
              >
                {stop.estText}
              </span>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  </div>
{/if}
