<script lang="ts">
  // SPDX-License-Identifier: MIT
  // Copyright 2026 Roland Dreier <roland@rolandd.dev>

  import { Dialog as DialogPrimitive } from 'bits-ui';
  import { cn } from '#lib/utils.js';

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: DialogPrimitive.TitleProps = $props();
</script>

<DialogPrimitive.Title
  bind:ref
  data-slot="dialog-title"
  class={cn('text-sm font-semibold leading-tight text-foreground', className)}
  {...restProps}
/>
