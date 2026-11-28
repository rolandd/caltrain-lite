<script lang="ts">
  // SPDX-License-Identifier: MIT
  // Copyright 2026 Roland Dreier <roland@rolandd.dev>

  import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
  import type { ServiceAlert } from '@packages/types/schema';

  interface Props {
    alerts: ServiceAlert[];
  }

  let { alerts }: Props = $props();
</script>

{#if alerts.length > 0}
  <div
    class="mt-6 bg-transit-alert-bg text-foreground rounded-xl p-3.5 text-sm leading-[1.45] text-left border border-transit-border-danger"
    role="alert"
  >
    <h3
      class="text-transit-alert-heading font-bold text-xs uppercase mb-2 flex items-center gap-1.5"
    >
      <TriangleAlertIcon class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>Service Alerts</span>
    </h3>
    {#each alerts as alert (alert.h)}
      <div class="alert-item mb-2.5 last:mb-0">
        <strong class="text-foreground block mb-0.5">{alert.h}</strong>
        <span class="text-transit-text-secondary">{alert.d}</span>
      </div>
    {/each}
  </div>
{/if}
