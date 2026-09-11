## 2025-02-18 - Full Keyboard Support for Custom Buttons & Modals

**Learning:** Custom elements with `role="button"` in Svelte require explicit handling for the `Space` key (including `e.preventDefault()` to stop page scrolling), as keyboard users expect this standard behavior. Additionally, conditionally rendered modals in Svelte 5 need an `$effect` block to handle global `Escape` key events rather than `<svelte:window>`.
**Action:** When implementing custom interactive elements, always ensure `Enter` and `Space` are handled correctly, and use `$effect` blocks for cleanup-friendly keyboard event listeners in modals.
