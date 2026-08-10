<script lang="ts">
  // SPDX-License-Identifier: MIT
  // Copyright 2026 Roland Dreier <roland@rolandd.dev>

  import type { ServiceAlert } from '@packages/types/schema';

  interface Props {
    alerts: ServiceAlert[];
  }

  let { alerts }: Props = $props();
</script>

{#if alerts.length > 0}
  <div
    class="mt-8 bg-transit-alert-bg text-transit-text-primary rounded-lg p-3 text-sm leading-[1.4] text-left border border-transit-border-danger"
    role="alert"
  >
    <h3 class="text-transit-alert-heading font-bold text-xs uppercase mb-2">Service Alerts</h3>
    {#each alerts as alert (alert.h)}
      <div class="alert-item mb-2 last:mb-0">
        <strong class="text-transit-text-primary block mb-0.5">{alert.h}</strong>
        <span class="text-transit-text-secondary">{alert.d}</span>
      </div>
    {/each}
  </div>
{/if}
