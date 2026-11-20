## 2026-09-27 - Keyboard Navigation and Modal Dismissal

**Learning:** Custom interactive elements with `role="button"` require explicit handling for both `Enter` and `Space` keys. Additionally, `Space` natively scrolls the page in browsers, so `e.preventDefault()` must be called when triggered via `Space`. In Svelte 5, `<svelte:window>` cannot be placed inside conditional `{#if}` blocks; window event listeners for `Escape` dismissal of conditionally rendered modals must be managed inside an `$effect` block that attaches when the modal is active and cleans up when dismissed or unmounted. Furthermore, handlers should check both `Escape` and legacy `Esc`, call `e.preventDefault()` and `e.stopPropagation()` to avoid bubbling, and the dialog container should specify `aria-modal="true"`.
**Action:** Use an `$effect` block with cleanup to handle `Escape`/`Esc` key dismissal for modal dialogs, set `aria-modal="true"` on modal containers, handle both `Enter` and `Space` (with `e.preventDefault()`) on custom `role="button"` elements, and enforce these behaviors via automated regression checks in `check-a11y-standards.mjs`.

## 2026-11-06 - Consolidating Context with Comprehensive ARIA Labels

**Learning:** When interactive elements visually separate their context (e.g., headers indicating train number/route above a clickable body), screen reader users lose crucial context if the interactive element only announces its direct children.
**Action:** Use comprehensive `aria-label` overrides on the interactive element to consolidate all surrounding visual context into a single, cohesive screen reader announcement.
