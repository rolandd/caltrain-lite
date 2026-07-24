## 2024-05-24 - Tooltip Backdrop Tab Order Fix

**Learning:** Invisible backdrop buttons (like the one used for closing the tooltip) intercept the keyboard tab flow if not explicitly disabled.
**Action:** Add `tabindex="-1"` to native `<button>` elements used strictly as dismiss backdrops to ensure they don't unnecessarily intercept keyboard tab flow.
