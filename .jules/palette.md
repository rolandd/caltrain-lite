
## 2026-05-01 - Prevent Invisible Backdrop Elements from Breaking Tab Flow
**Learning:** Invisible `<button>` elements used strictly as full-screen dismiss backdrops for popups or tooltips intercept keyboard tab navigation, causing an awkward and confusing experience for keyboard users because focus seemingly disappears into an invisible element.
**Action:** Always add `tabindex="-1"` to such invisible backdrop buttons to intentionally remove them from the document's sequential focus navigation order.
