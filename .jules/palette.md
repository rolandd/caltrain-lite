## 2024-05-24 - Escape Key Dismissal for Modals

**Learning:** Keyboard accessibility requires conditionally rendered modals to be dismissible via the 'Escape' key. In Svelte 5, `<svelte:window>` cannot be placed inside `{#if}` blocks, so this must be handled manually.
**Action:** Always use an `$effect` block that attaches and removes `window.addEventListener('keydown', ...)` to handle 'Escape' key presses for accessible conditionally-rendered modal dismissal.
