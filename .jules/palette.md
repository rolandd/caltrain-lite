## 2024-09-04 - Escape key support for Tooltip Modals

**Learning:** Conditionally rendered modals lacking Escape key support negatively impact keyboard users. In Svelte 5, placing `<svelte:window>` inside conditionally rendered blocks causes compilation errors.
**Action:** Always use an `$effect` block inside the component to safely attach and clean up window event listeners (like 'keydown' for 'Escape') when the modal is active.
