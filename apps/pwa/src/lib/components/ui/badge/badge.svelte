<script lang="ts" module>
  // SPDX-License-Identifier: MIT
  // Copyright 2026 Roland Dreier <roland@rolandd.dev>

  import { tv, type VariantProps } from 'tailwind-variants';
  import type { HTMLAttributes } from 'svelte/elements';
  import type { WithElementRef } from '#lib/utils.js';

  export const badgeVariants = tv({
    base: 'inline-flex items-center justify-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors',
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-border bg-secondary text-secondary-foreground',
        brand:
          'border-transit-border-brand bg-transit-brand-soft-bg/45 text-transit-brand-soft-text',
        muted: 'border-border bg-muted text-muted-foreground',
        warning: 'border-transit-warning/35 bg-transit-warning/15 text-transit-warning',
        outline: 'border-border bg-transparent text-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  });

  export type BadgeVariant = VariantProps<typeof badgeVariants>['variant'];

  export type BadgeProps = WithElementRef<HTMLAttributes<HTMLSpanElement>, HTMLSpanElement> & {
    variant?: BadgeVariant;
  };
</script>

<script lang="ts">
  import { cn } from '#lib/utils.js';

  let {
    ref = $bindable(null),
    class: className,
    variant = 'default',
    children,
    ...restProps
  }: BadgeProps = $props();
</script>

<span
  bind:this={ref}
  data-slot="badge"
  class={cn(badgeVariants({ variant }), className)}
  {...restProps}
>
  {@render children?.()}
</span>
