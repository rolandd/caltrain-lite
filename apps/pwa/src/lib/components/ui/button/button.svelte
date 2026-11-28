<script lang="ts" module>
  // SPDX-License-Identifier: MIT
  // Copyright 2026 Roland Dreier <roland@rolandd.dev>

  import { tv, type VariantProps } from 'tailwind-variants';
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import type { WithElementRef } from '#lib/utils.js';

  export const buttonVariants = tv({
    base: 'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap font-semibold transition-all cursor-pointer select-none active:scale-95 disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0',
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-transit-brand-strong shadow-xs',
        control:
          'bg-transit-surface-input text-foreground border border-border hover:bg-accent hover:border-transit-border-default',
        outline:
          'bg-transparent text-foreground border border-border hover:bg-accent hover:border-transit-border-default',
        secondary:
          'bg-transit-surface-elevated text-foreground border border-border hover:bg-accent hover:border-transit-border-default',
        ghost: 'bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground',
      },
      size: {
        default: 'h-11 px-4 rounded-lg text-sm',
        sm: 'h-9 px-3 rounded-lg text-sm',
        xs: 'h-8 px-2.5 rounded-full text-xs',
        icon: 'h-11 w-11 rounded-lg',
        'icon-sm': 'h-9 w-9 rounded-lg',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  });

  export type ButtonVariant = VariantProps<typeof buttonVariants>['variant'];
  export type ButtonSize = VariantProps<typeof buttonVariants>['size'];

  export type ButtonProps = WithElementRef<HTMLButtonAttributes, HTMLButtonElement> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
  };
</script>

<script lang="ts">
  import { cn } from '#lib/utils.js';

  let {
    class: className,
    variant = 'default',
    size = 'default',
    ref = $bindable(null),
    type = 'button',
    children,
    ...restProps
  }: ButtonProps = $props();
</script>

<button
  bind:this={ref}
  {type}
  data-slot="button"
  class={cn(
    'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
    buttonVariants({ variant, size }),
    className,
  )}
  {...restProps}
>
  {@render children?.()}
</button>
