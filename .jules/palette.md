## 2025-02-12 - Add Escape key support to TripTooltipModal

**Learning:** Users expect to be able to close modals and tooltips using the Escape key for proper keyboard navigation and accessibility. In Svelte 5, window event listeners for conditionally rendered modals should be attached using an `$effect` block rather than `<svelte:window>` inside `{#if}`.
**Action:** Always implement an Escape key listener for custom modals and tooltips using an `$effect` block to improve keyboard accessibility.
