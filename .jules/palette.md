## 2026-05-22 - Invisible dismiss backdrops should not intercept keyboard flow

**Learning:** Native `<button>` elements used strictly as full-screen dismiss backdrops for tooltips or overlays will intercept the keyboard tab flow by default, even if they have no visual presence (`bg-transparent`, `opacity-0`, etc). This creates a confusing experience for keyboard-only and screen reader users who encounter an invisible, seemingly purpose-less focus stop.
**Action:** Always apply `tabindex="-1"` to full-screen invisible dismiss backdrops.
