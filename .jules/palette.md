
## 2024-05-20 - Adding Escape Key to Svelte 5 Modals
**Learning:** Svelte 5 does not allow `<svelte:window>` tags inside elements or `{#if}` blocks. Adding window event listeners for Escape keys in conditionally rendered modals must be done using an `$effect` block that manually attaches and removes the event listener.
**Action:** When implementing Escape key dismissal for conditional UI elements in Svelte 5, prefer using a `$effect` block with manual window event listeners instead of `<svelte:window>`.
