## 2025-02-12 - Icon Button Tooltips and Backdrop Overlays

**Learning:** Pointer users (mouse) depend on `title` attributes for tooltips on icon-only buttons, as `aria-label` only benefits screen readers. Furthermore, native `<button>` elements used simply as backdrop overlays intercept keyboard tab flow unnecessarily, leading to poor keyboard navigation.
**Action:** Always include a `title` matching the `aria-label` on icon-only buttons. Apply `tabindex="-1"` to any `<button>` used strictly as a dismiss backdrop without visual presence.
