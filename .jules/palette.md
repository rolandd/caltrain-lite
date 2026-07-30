## 2024-05-29 - Backdrop Buttons Need tabindex="-1"

**Learning:** Native `<button>` elements used strictly as dismiss backdrops (without visual presence) unnecessarily intercept keyboard tab flow, which confuses screen readers and keyboard-only users navigating the active foreground modal/tooltip.
**Action:** Always add `tabindex="-1"` to any full-screen, invisible backdrop button to prevent it from being focusable while still allowing mouse/touch click events to dismiss the overlay.
