## 2025-02-26 - Keyboard Navigation for Dismiss Backdrops

**Learning:** Native button elements used strictly as full-screen dismiss backdrops for tooltips/modals create "tab traps" and confuse screen reader users if they remain in the tab order without visual presence. Additionally, interactive custom elements (like trip cards with `role="button"`) or standard buttons without default focus styles must have explicit focus rings for keyboard users.
**Action:** Always apply `tabindex="-1"` to invisible dismiss backdrops to remove them from the tab flow, and consistently apply `focus-visible` utility classes to all interactive elements to ensure accessible keyboard focus states.
